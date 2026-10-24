"""One command for candidate x dataset, actual Inspect logs, bounded shared budget."""
import argparse
import asyncio
from datetime import datetime, timezone
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import urllib.request

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from runtime import EVAL, ROOT, Budget, catalog, load_env
from reporting import aggregate, hashes, write_report
import tasks
from inspect_ai import Epochs, eval_async, task_with
from inspect_ai.log import read_eval_log
from inspect_ai.model import GenerateConfig, get_model
import yaml


def model_object(candidate):
    if candidate['mode'] == 'templates':
        return get_model('mockllm/model')
    key = os.getenv(candidate['key_env'], '')
    if candidate['mode'] == 'remote' and not key:
        raise ValueError('missing credential environment variable: ' + candidate['key_env'])
    return get_model('openai-api/' + ('ollama-eval' if candidate['mode'] == 'local' else 'openrouter') + '/' + candidate['model'],
                     base_url=candidate['base_url'], api_key=key or 'ollama',
                     config=GenerateConfig(max_retries=0, timeout=35))


def roles_for(candidate, models):
    # All learned roles have open weights <=120B; three distinct families.
    client_name = 'qwen30' if candidate['family'] == 'mistralai' else 'mistral24'
    grader_name = 'mistral24' if candidate['family'] == 'meta-llama' else 'llama70'
    if candidate['family'] == 'meta-llama':
        client_name = 'qwen30'
    client = next(m for m in models if m['name'] == client_name)
    grader = next(m for m in models if m['name'] == grader_name)
    if len({candidate['family'], client['family'], grader['family']}) != 3:
        raise ValueError('agent/user/grader families must differ')
    return {'user': model_object(client), 'grader': model_object(grader)}, {'user': client['model'], 'grader': grader['model']}


def ollama_cpu(models):
    """No silent multi-GB downloads. Probe under 10 sec, CPU-only when installed."""
    output = {'status': 'не замерено', 'models': []}
    try:
        started = time.perf_counter()
        with urllib.request.urlopen('http://localhost:11434/api/tags', timeout=10) as response:
            tags = json.load(response)
        output['probe_seconds'] = time.perf_counter() - started
        output['installed'] = [m['name'] for m in tags['models']]
        smallest = sorted([m for m in models if m.get('ollama')], key=lambda m: m['parameters_b'])[:2]
        for candidate in smallest:
            tag = candidate['ollama']
            if tag not in output['installed']:
                output['models'].append({'model': tag, 'status': 'не замерено', 'reason': 'weights not installed',
                                         'latency_s': None, 'ram_bytes': None})
                continue
            import psutil
            # Measure process working sets during one CPU-only completion, not file sizes.
            import threading
            peak, done = [0], threading.Event()
            def sample_ram():
                while not done.wait(.1):
                    total = 0
                    for process in psutil.process_iter(['name', 'memory_info']):
                        try:
                            if 'ollama' in (process.info['name'] or '').lower():
                                total += process.info['memory_info'].rss
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            continue
                    peak[0] = max(peak[0], total)
            sampler = threading.Thread(target=sample_ram, daemon=True)
            sampler.start()
            request = urllib.request.Request('http://localhost:11434/api/generate',
                json.dumps({'model': tag, 'prompt': 'Ответь одним словом: привет', 'stream': False,
                            'options': {'num_gpu': 0, 'num_predict': 32}}).encode(), {'Content-Type': 'application/json'})
            start = time.perf_counter()
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    value = json.load(response)
                output['models'].append({'model': tag, 'status': 'measured', 'latency_s': time.perf_counter() - start,
                    'ram_bytes': peak[0] or None, 'eval_count': value.get('eval_count'), 'num_gpu': 0,
                    'note': 'cold load included; peak RSS of all Ollama processes; one sample, not p95'})
            finally:
                done.set()
                sampler.join(1)
        output['status'] = 'measured' if any(r['status'] == 'measured' for r in output['models']) else 'не замерено'
    except Exception as error:
        output['reason'] = type(error).__name__
    return output


async def run(args):
    load_env()
    config = yaml.safe_load((HERE / 'models.yaml').read_text(encoding='utf-8'))
    models = config['models']
    selected = [m for m in models if not args.models or m['name'] in args.models.split(',')]
    if not selected:
        raise ValueError('no models selected')
    if args.offline and any(m['mode'] != 'templates' for m in selected):
        raise ValueError('--offline requires --models templates')
    phase = 'smoke' if args.smoke else 'matrix'
    stamp = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
    output = EVAL / 'reports' / (stamp + ('-offline' if args.offline else '') + ('-smoke-models.md' if args.smoke else '-models.md'))
    ledger = Budget(limit=args.budget)
    registry, registry_error = {}, None
    if not args.offline:
        try:
            registry = await asyncio.to_thread(catalog)
        except Exception as error:
            registry_error = type(error).__name__
    prices = {key: (float(m['pricing']['prompt']), float(m['pricing']['completion'])) for key, m in registry.items()}
    tasks.configure(ledger, prices)
    cpu = {'status': 'не замерено', 'reason': 'offline mode'} if args.offline else await asyncio.to_thread(ollama_cpu, models)
    source_files = list((EVAL / 'data').glob('*.json')) + list(HERE.glob('*.py')) + [HERE / 'models.yaml']
    revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, capture_output=True).stdout.strip()
    context = {'phase': phase, 'at': datetime.now(timezone.utc).isoformat(), 'inspect_version': importlib.metadata.version('inspect-ai'),
               'python': platform.python_version(), 'revision_before_commit': revision, 'budget_usd': ledger.spent,
               'cpu': cpu, 'offline': args.offline, 'epochs': 1 if args.smoke else 3,
               'sha256': hashes(source_files), 'price_snapshot': {m['model']: registry.get(m.get('model'), {}).get('pricing')
                    for m in models if m.get('model')}, 'registry_error': registry_error, 'log_files': []}
    rows = []
    if args.resume and output.with_suffix('.json').exists():
        previous = json.loads(output.with_suffix('.json').read_text(encoding='utf-8'))
        rows = previous['models']
        context['log_files'] = previous['log_files']
        context['previous_segments'] = previous.get('previous_segments', []) + [{
            'at': previous['at'], 'sha256': previous['sha256'], 'models': [r['name'] for r in rows]}]
    for candidate in selected:
        if any(row['name'] == candidate['name'] for row in rows):
            print('RESUME already recorded', candidate['name'], flush=True)
            continue
        print('START', phase, candidate['name'], flush=True)
        reasons = []
        if candidate['mode'] == 'local' and candidate['model'] not in cpu.get('installed', []):
            reasons.append({'error': 'Ollama model not installed or endpoint unavailable'})
        if candidate['mode'] == 'remote' and candidate['model'] not in registry:
            reasons.append({'error': 'model not found in current OpenRouter catalog'})
        if reasons:
            rows.append(dict(candidate, status='unavailable', errors=reasons))
        else:
            try:
                # The runtime already supports these env names. Bridge changes transport only.
                os.environ['AGENT_LLM_URL'] = '' if candidate['mode'] == 'templates' else candidate['base_url'] + '/chat/completions'
                os.environ['AGENT_LLM_MODEL'] = candidate.get('model', '')
                role_models, role_names = ({}, {}) if args.offline else roles_for(candidate, models)
                work = [tasks.intake_task(candidate), tasks.dialog_task(candidate, args.offline, not args.no_judges),
                        tasks.redteam_task(candidate, args.offline, not args.no_judges)]
                if args.hidden:
                    for hidden_task in (tasks.intake_task(candidate, True), tasks.dialog_task(candidate, args.offline, not args.no_judges, True)):
                        if len(hidden_task.dataset):
                            work.append(hidden_task)
                if args.smoke:
                    # Exactly three regular personas, one epoch; smoke cannot establish pass^3.
                    for task in work:
                        task.dataset = task.dataset[:3] if task.name != 'intake_task' else task.dataset[:12]
                    work = [task_with(task, epochs=Epochs(1, reducer='mean')) for task in work]
                log_dir = HERE / 'logs' / run_id / candidate['name'].replace(':', '-')
                logs = await eval_async(work, model=model_object(candidate), model_roles=role_models,
                    log_dir=str(log_dir), max_samples=args.workers, max_tasks=1,
                    fail_on_error=False, log_samples=True, log_realtime=False, log_buffer=1, ctl_server=False)
                # Read back the actual artifacts; report must be reconstructible from .eval.
                saved = [read_eval_log(log.location) for log in logs]
                context['log_files'].extend([str(log.location) for log in logs])
                row = aggregate(candidate, saved)
                row['roles'] = role_names
                if args.smoke:
                    row['dialog_pass3'] = row['redteam_pass3'] = None
                rows.append(row)
            except Exception as error:
                rows.append(dict(candidate, status='incomplete', errors=[{'error': type(error).__name__ + ': ' + str(error)}]))
        context['budget_usd'] = ledger.spent
        context['budget_ledger'] = ledger.entries
        write_report(output, rows, context)
        print('DONE', candidate['name'], rows[-1]['status'], f'ledger=${ledger.spent:.6f}', flush=True)
    print('REPORT', output.relative_to(ROOT), flush=True)
    print('QUALIFIED', ','.join(r['name'] for r in rows if r.get('beats_baseline')) or 'none', flush=True)
    return 0 if all(r['status'] in ('success', 'unavailable') for r in rows) else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--smoke', action='store_true')
    ap.add_argument('--models', help='comma separated names, default all six including templates and local')
    ap.add_argument('--workers', type=int, default=8)
    ap.add_argument('--budget', type=float, default=3.0)
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--hidden', action='store_true')
    ap.add_argument('--no-judges', action='store_true')
    ap.add_argument('--resume', action='store_true', help='keep recorded candidate attempts and continue missing rows')
    args = ap.parse_args()
    return asyncio.run(run(args))


if __name__ == '__main__':
    raise SystemExit(main())
