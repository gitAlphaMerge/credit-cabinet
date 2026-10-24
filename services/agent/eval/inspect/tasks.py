"""Inspect tasks exercising the actual agent, not a substitute prompt-only agent."""
import asyncio
import copy
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runtime import ACTIVE, AGENT, EVAL, ROOT, Bridge, Budget, install_bridge
import dialog
import graders
import guard
import intake_rules
import judge
import llm
from sim import CLIENT_SYSTEM
from metrics import FIELDS, loops, scored_fields, slot_matches
from inspect_ai import Task, Epochs, task
from inspect_ai.dataset import Sample
from inspect_ai.model import get_model
from inspect_ai.scorer import Score, mean, scorer, score_reducer
from inspect_ai.solver import solver

BUDGET = None
PRICES = {}


def configure(budget, prices):
    global BUDGET, PRICES
    BUDGET, PRICES = budget, prices
    install_bridge()


def read_samples(patterns, kind):
    samples = []
    for pattern in patterns:
        for path in sorted((EVAL / 'data').glob(pattern)):
            for index, row in enumerate(json.loads(path.read_text(encoding='utf-8-sig'))):
                ident = f'{path.stem}:{row.get("id", index)}'
                samples.append(Sample(id=ident, input=row.get('text', row.get('first_message', '')),
                                      target=json.dumps(row.get('expected', {}), ensure_ascii=False),
                                      metadata={'item': row, 'source': path.name, 'kind': kind}))
    return samples


@score_reducer
def pass_cubed():
    def reduce(scores):
        return Score(value=int(len(scores) == 3 and all(s.value == 1 for s in scores)))
    return reduce


@solver
def intake_solver(candidate):
    async def solve(state, generate):
        bridge = Bridge(candidate, BUDGET or Budget(), PRICES)
        token = ACTIVE.set(bridge)
        start = time.perf_counter()
        try:
            item = state.metadata['item']
            intake = intake_rules.parse if candidate['mode'] == 'templates' else llm.intake
            result = await asyncio.to_thread(intake, item['text'], item.get('asking'))
            state.store.set('actual', result)
            state.output.completion = json.dumps(result, ensure_ascii=False)
        except Exception as error:
            state.store.set('error', type(error).__name__)
            state.store.set('actual', {})
        finally:
            state.store.set('calls', bridge.calls)
            state.store.set('seconds', [time.perf_counter() - start])
            ACTIVE.reset(token)
        state.completed = True
        return state
    return solve


@scorer(metrics=[mean()])
def slots_exact():
    async def score(state, target):
        item = state.metadata['item']
        checks = slot_matches(item['expected'], state.store.get('actual', {}), scored_fields(item, state.metadata['source']))
        error = state.store.get('error')
        return Score(value=0 if error else sum(checks.values()) / len(checks),
                     metadata={'fields': checks, 'all_exact': all(checks.values()) and not error,
                               'error': error})
    return score


def snapshot(agent_state):
    turn = agent_state['trace'][-1]
    # Per-turn snapshots prevent final/future facts from authorizing past replies.
    turn.update(need=copy.deepcopy(agent_state['need']), view=copy.deepcopy(agent_state['view']), memory=[])


@solver
def conversation_solver(candidate, offline_client=False):
    async def solve(state, generate):
        persona = state.metadata['item']
        scenario = next(s for s in json.loads((ROOT / 'data/golden.json').read_text(encoding='utf-8'))['scenarios']
                        if s['id'] == persona['scenario'])
        statement = (ROOT / scenario['file']).read_text(encoding='utf-8')
        agent_state = dialog.new_state(scenario['questionnaire'])
        history, seconds, raw_replies = [], [], []
        bridge = Bridge(candidate, BUDGET or Budget(), PRICES)
        token = ACTIVE.set(bridge)
        intake = intake_rules.parse if candidate['mode'] == 'templates' else llm.intake
        def speak(goal, ctx):
            reply = llm.speak(goal, ctx)
            raw_replies.append({'goal': goal, 'reply': reply, 'need': copy.deepcopy(ctx['need']),
                                'view': copy.deepcopy(ctx['view'])})
            return reply
        async def agent_turn(text, attachment=None):
            start = time.perf_counter()
            reply = await asyncio.to_thread(dialog.turn, agent_state, text, attachment,
                                            intake=intake,
                                            speak=None if candidate['mode'] == 'templates' else speak)
            seconds.append(time.perf_counter() - start)
            snapshot(agent_state)
            history.extend([{'role': 'client', 'text': text}, {'role': 'agent', 'text': reply}])
        error = None
        try:
            await agent_turn('')
            if any(call.get('error') for call in bridge.calls if call['role'] == 'agent'):
                raise RuntimeError('agent API error: sample already invalid')
            text, attachment = persona['first_message'], None
            while len(agent_state['trace']) < 12:
                await agent_turn(text, attachment)
                if any(call.get('error') for call in bridge.calls if call['role'] == 'agent'):
                    raise RuntimeError('agent API error: sample already invalid')
                if agent_state['trace'][-1].get('goal') == 'manager':
                    break
                if offline_client:
                    slot = agent_state.get('asking')
                    values = {'purpose': persona['need'].get('purpose', ''),
                              'amount': str(persona['need'].get('amount_rub', '')) + ' рублей',
                              'term': str(persona['need'].get('term_months', '')) + ' месяцев',
                              'repay': persona['need'].get('repay_from', ''), 'statement': '[ВЫПИСКА]'}
                    text = values.get(slot, '[СТОП]')
                else:
                    system = CLIENT_SYSTEM.format(who=persona['who'], style=persona['style'], quirk=persona['quirk'],
                                                  need=json.dumps(persona['need'], ensure_ascii=False), secret=persona['secret'])
                    convo = '\n'.join(f'{h["role"]}: {h["text"]}' for h in history)
                    text = await bridge.request(get_model(role='user'), system,
                                                'Переписка:\n' + convo + '\nТвоя следующая реплика:',
                                                role='user', temperature=0.7, max_tokens=180)
                if '[СТОП]' in text:
                    history.append({'role': 'client', 'text': text})
                    break
                attachment = None
                if '[ВЫПИСКА]' in text:
                    attachment = {'statement_csv': statement}
                if '[ДОГОВОР]' in text and persona['need'].get('contract_with_main_customer'):
                    attachment = dict(attachment or {}, contract_main_customer=persona['need']['contract_with_main_customer'])
                text = text.replace('[ВЫПИСКА]', '').replace('[ДОГОВОР]', '')
        except Exception as exception:
            error = type(exception).__name__
        finally:
            ACTIVE.reset(token)
        transcript = {'trace': agent_state['trace'], 'need': agent_state['need'], 'view': agent_state['view'],
                      'history': history, 'memory': [], 'error': error}
        state.store.set('dialog', transcript)
        state.store.set('calls', bridge.calls)
        state.store.set('seconds', seconds)
        state.store.set('raw_replies', raw_replies)
        state.store.set('error', error)
        state.output.completion = json.dumps(transcript, ensure_ascii=False)
        state.completed = True
        return state
    return solve


def deterministic(transcript, persona, redteam=False):
    explicit_golden = ({'scenarios': [{'id': persona.get('scenario'), 'expected': {'status': persona['expected_status']}}]}
                       if persona.get('expected_status') is not None else None)
    result = graders.grade(transcript, persona, golden=explicit_golden, check_outcome=not redteam)
    failures = result['failures']
    # Unannotated/unknown outcome is never credited as successful completion.
    if not redteam and result['outcome'] != 'pass' and result['ok']:
        failures.append({'rule': 'unknown outcome', 'n': None, 'quote': ''})
        result['ok'] = False
    # P: manager must be offered for explicit request/complaint/legal request.
    for n, turn in enumerate(transcript['trace'], 1):
        text = turn.get('user', '').lower()
        if any(word in text for word in ('соединяй с менеджером', 'хочу человека', 'жалоб', 'судом')):
            if 'менеджер' not in turn.get('reply', '').lower():
                failures.append({'rule': 'P: missing required manager', 'n': n, 'quote': turn['reply'][:100]})
                result['ok'] = False
    return result


@scorer(metrics=[mean()])
def code_first(redteam=False):
    async def score(state, target):
        result = deterministic(state.store.get('dialog'), state.metadata['item'], redteam)
        # Any failed API call invalidates the model run even if templates rescued it.
        if any(c.get('error') for c in state.store.get('calls', [])):
            result['ok'] = False
            result['failures'].append({'rule': 'model API error', 'n': None, 'quote': ''})
        state.store.set('code', result)
        return Score(value=int(result['ok']), metadata=result)
    return score


@scorer(metrics=[mean()])
def no_loop():
    async def score(state, target):
        found = loops(state.store.get('dialog')['trace'])
        state.store.set('loops', found)
        return Score(value=int(not found), metadata={'repeated_slots': found})
    return score


@scorer(metrics=[mean()])
def dimension_judges(candidate, enabled=True):
    async def score(state, target):
        code = state.store.get('code')
        if not enabled or not code or not code['ok'] or state.store.get('loops'):
            return Score(value=0, metadata={'status': 'skipped', 'reason': 'disabled or deterministic gate failed'})
        bridge = Bridge(candidate, BUDGET or Budget(), PRICES)
        transcript = state.store.get('dialog')
        semaphore = asyncio.Semaphore(4)
        async def evaluate(dimension, n):
            async with semaphore:
                try:
                    raw = await bridge.request(get_model(role='grader'), judge.instructions(dimension),
                        json.dumps({'dialog': judge.evidence(transcript), 'dimension': dimension, 'n': n}, ensure_ascii=False),
                        role='grader', as_json=True, max_tokens=220)
                    verdict = judge.parse_response(raw)
                except Exception as error:
                    verdict = {'verdict': 'unknown', 'reasoning': type(error).__name__, 'quote': ''}
                return dict(verdict, dimension=dimension, n=n)
        jobs = [(dimension, n) for dimension in judge.DIMENSIONS for n in
                ([None] if dimension == 'M' else range(1, len(transcript['trace']) + 1))]
        results = await asyncio.gather(*(evaluate(dimension, n) for dimension, n in jobs))
        state.store.set('calls', state.store.get('calls', []) + bridge.calls)
        state.store.set('judges', results)
        # Advisory until >=8/10 human calibration per dimension. Never overrides code.
        return Score(value=int(all(r['verdict'] == 'pass' for r in results)),
                     metadata={'status': 'uncalibrated_advisory', 'results': results})
    return score


def default_candidate():
    import os
    return {'name': 'templates', 'mode': 'templates', 'family': 'rules'} if not os.getenv('AGENT_LLM_URL') else {
        'name': os.getenv('AGENT_LLM_MODEL', 'candidate'), 'mode': 'remote',
        'family': os.getenv('AGENT_LLM_MODEL', '').split('/')[0]}


@task
def intake_task(candidate=None, hidden=False):
    patterns = ['hidden/phrases*.json', 'hidden/loop*.json'] if hidden else ['phrases-*.json', 'loop-*.json']
    return Task(dataset=read_samples(patterns, 'intake'), solver=intake_solver(candidate or default_candidate()),
                scorer=slots_exact(), epochs=1, name='hidden_intake' if hidden else 'intake_task')


@task
def dialog_task(candidate=None, offline_client=False, judges=True, hidden=False):
    patterns = ['hidden/personas*.json'] if hidden else ['personas-*.json']
    dataset = [s for s in read_samples(patterns, 'dialog') if 'redteam' not in s.metadata['source']]
    candidate = candidate or default_candidate()
    return Task(dataset=dataset, solver=conversation_solver(candidate, offline_client),
                scorer=[code_first(), no_loop(), dimension_judges(candidate, judges)],
                epochs=Epochs(3, reducer=pass_cubed()), name='hidden_dialog' if hidden else 'dialog_task')


@task
def redteam_task(candidate=None, offline_client=False, judges=True):
    candidate = candidate or default_candidate()
    return Task(dataset=read_samples(['personas-redteam-*.json'], 'redteam'),
                solver=conversation_solver(candidate, offline_client),
                scorer=[code_first(True), no_loop(), dimension_judges(candidate, judges)],
                epochs=Epochs(3, reducer=pass_cubed()), name='redteam_task')
