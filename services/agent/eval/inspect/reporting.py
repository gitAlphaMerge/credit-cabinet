"""Aggregate saved Inspect samples, preserving errors and missing observations."""
from collections import Counter
import hashlib
import json
from pathlib import Path

from metrics import FIELDS, beats_baseline, pass3, percentile, scored_fields, slot_matches


def aggregate(candidate, logs, include_hidden=False):
    hidden_logs = [log for log in logs if log.eval.task.startswith('hidden_')] if not include_hidden else []
    if not include_hidden:
        logs = [log for log in logs if not log.eval.task.startswith('hidden_')]
    intake, dialog, redteam = [], [], []
    calls, seconds, intake_seconds, slots = [], [], [], {k: [] for k in FIELDS}
    by_source = {}
    number_turns = guard_turns = turns = 0
    core_errors = []
    errors, judges = [], Counter()
    task_counts = {}
    for log in logs:
        task_counts[log.eval.task] = {'status': log.status, 'samples': len(log.samples or [])}
        expected_ids = set(map(str, log.eval.dataset.sample_ids or []))
        expected_epochs = set(range(1, (log.eval.config.epochs or 1) + 1))
        observed = {(str(s.id), s.epoch) for s in log.samples or []}
        missing = {(ident, epoch) for ident in expected_ids for epoch in expected_epochs} - observed
        if missing:
            errors.append({'task': log.eval.task, 'error': 'missing sample epochs', 'missing': sorted(missing)})
        if log.status != 'success':
            errors.append({'task': log.eval.task, 'error': log.error.message if log.error else log.status})
        for sample in log.samples or []:
            store = sample.store or {}
            calls.extend(store.get('calls', []))
            (intake_seconds if sample.metadata['kind'] == 'intake' else seconds).extend(store.get('seconds', []))
            for call in store.get('calls', []):
                if call.get('error') and call['role'] in ('agent', 'user'):
                    errors.append({'id': sample.id, 'error': call['error'], 'role': call['role'],
                                   'status_code': call.get('status_code'), 'cause': call.get('cause'),
                                   'detail': call.get('error_detail')})
            if sample.error or store.get('error'):
                errors.append({'id': sample.id, 'error': store.get('error') or sample.error.message})
            if sample.metadata['kind'] == 'intake':
                # Reconstruct exact matches from raw outputs, including when a
                # report is rebuilt after discovering an annotation-coverage issue.
                checks = slot_matches(sample.metadata['item']['expected'], store.get('actual', {}),
                                      scored_fields(sample.metadata['item'], sample.metadata['source']))
                metadata = {'fields': checks, 'all_exact': all(checks.values()) and not store.get('error') and not sample.error}
                for key in checks:
                    slots[key].append(checks[key] and not store.get('error') and not sample.error)
                source = by_source.setdefault(sample.metadata['source'], {'n': 0, 'fields': {k: [] for k in FIELDS}, 'all_exact': []})
                source['n'] += 1
                source['all_exact'].append(bool(metadata.get('all_exact')))
                for key in checks:
                    source['fields'][key].append(slots[key][-1])
                intake.append({'id': sample.id, 'epoch': sample.epoch, 'passed': bool(metadata.get('all_exact'))})
            else:
                code = store.get('code', {})
                trace = store.get('dialog', {}).get('trace', [])
                found = store.get('loops', {})
                record = {'id': sample.id, 'epoch': sample.epoch, 'passed': code.get('ok') is True and not found,
                          'loop': bool(found), 'failures': code.get('failures', [])}
                (redteam if sample.metadata['kind'] == 'redteam' else dialog).append(record)
                for n, turn in enumerate(trace, 1):
                    if turn.get('kind') == 'core_error':
                        core_errors.append({'id': sample.id, 'epoch': sample.epoch, 'turn': n})
                    failures = [f['rule'] for f in code.get('failures', []) if f.get('n') == n]
                    bad = list(turn.get('violations', [])) + failures
                    turns += 1
                    guard_turns += bool(bad)
                    number_turns += any('число ' in f or 'ставка не из' in f or 'срок не из' in f for f in bad)
                for result in store.get('judges', []):
                    judges[result['dimension'] + ':' + result['verdict']] += 1
    d3, r3 = pass3(dialog), pass3(redteam)
    all_slots = [v for values in slots.values() for v in values]
    def average(xs):
        return sum(xs) / len(xs) if xs else None
    row = dict(candidate, status='success' if logs and not errors else 'incomplete',
               slot_accuracy=average(all_slots), slot_by_field={k: average(v) for k, v in slots.items()},
               extraction_all_exact=average([r['passed'] for r in intake]), intake_n=len(intake),
               dialog_pass3=average(list(d3.values())), personas_pass3=d3,
               redteam_pass3=average(list(r3.values())), redteam_personas_pass3=r3,
               loop_rate=average([r['loop'] for r in dialog + redteam]),
               number_rate=number_turns / turns if turns else None, number_turns=number_turns,
               guard_rate=guard_turns / turns if turns else None, guard_turns=guard_turns, turns=turns,
               p50_s=percentile(seconds, .50), p95_s=percentile(seconds, .95),
               intake_p50_s=percentile(intake_seconds, .50), intake_p95_s=percentile(intake_seconds, .95),
               tokens=sum(c['input_tokens'] + c['output_tokens'] for c in calls),
               cost_usd=sum(c['usd'] for c in calls), calls=len(calls),
               errors=errors, judges=dict(judges), tasks=task_counts,
               core_errors=core_errors,
               rows={'intake': intake, 'dialog': dialog, 'redteam': redteam})
    row['intake_by_source'] = {source: {'n': item['n'], 'all_exact': average(item['all_exact']),
        'fields': {k: average(v) for k, v in item['fields'].items()}} for source, item in by_source.items()}
    row['hidden'] = aggregate(candidate, hidden_logs, True) if hidden_logs else {'status': 'not_measured'}
    agent_calls = [c for c in calls if c['role'] == 'agent']
    row['agent_tokens'] = sum(c['input_tokens'] + c['output_tokens'] for c in agent_calls)
    row['agent_cost_usd'] = sum(c['usd'] for c in agent_calls)
    row['unresolved_cost_reserve_usd'] = sum(c.get('usd_reserved', 0) for c in calls
        if c.get('error') and c.get('input_tokens', 0) == 0 and c.get('output_tokens', 0) == 0)
    # Demo cost is the agent only, per dialog. Excludes extraction probes, client and judges.
    dialog_samples = [s for log in logs for s in log.samples or [] if s.metadata['kind'] == 'dialog']
    demo_calls = [c for s in dialog_samples for c in (s.store or {}).get('calls', []) if c['role'] == 'agent']
    row['demo_cost_usd'] = sum(c['usd'] for c in demo_calls) / len(dialog_samples) if dialog_samples else None
    row['demo_tokens'] = sum(c['input_tokens'] + c['output_tokens'] for c in demo_calls) / len(dialog_samples) if dialog_samples else None
    row['observed_dialog_cost_usd'] = sum(c['usd'] for c in demo_calls)
    if candidate.get('mode') != 'templates' and any((s.store or {}).get('error') or s.error
            or any(c.get('error') and c['role'] in ('agent', 'user') for c in (s.store or {}).get('calls', []))
            for s in dialog_samples):
        row['demo_cost_usd'] = row['demo_tokens'] = None
    return row


def fmt(value, percent=False):
    if value is None:
        return 'не замерено'
    return f'{value:.1%}' if percent else f'{value:.3f}'


def write_report(output, rows, context):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    baseline = next((r for r in rows if r['mode'] == 'templates'), {})
    for row in rows:
        row['beats_baseline'] = row['mode'] != 'templates' and beats_baseline(row, baseline)
    winners = [r['name'] for r in rows if r['beats_baseline']]
    payload = dict(context, models=rows, qualified_candidates=winners)
    output.with_suffix('.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    text = [f'# Матрица моделей: {context["phase"]}', '',
            f'Дата UTC: {context["at"]}. Inspect {context["inspect_version"]}.', '',
            f'Суммарный бюджетный ledger (включает smoke и неизвестные списания): ${context["budget_usd"]:.6f} / $3.', '',
            f'Эпох на персону: {context["epochs"]}; offline client: {context["offline"]}.', '',
            '| Кандидат | Статус | Слоты | Петли | Числа | Страж | pass^3 | redteam^3 | p50/p95 с | Токены | USD usage | USD демо | B / лицензия |',
            '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|']
    for row in rows:
        text.append('| ' + ' | '.join([row['name'], row['status'],
            *[fmt(row.get(k), True) for k in ('slot_accuracy', 'loop_rate', 'number_rate', 'guard_rate', 'dialog_pass3', 'redteam_pass3')],
            f'{fmt(row.get("p50_s"))}/{fmt(row.get("p95_s"))}', str(row.get('tokens', 'не замерено')),
            f'{row["cost_usd"]:.6f}' if row.get('cost_usd') is not None else 'не замерено',
            f'{row["demo_cost_usd"]:.6f}' if row.get('demo_cost_usd') is not None else 'не замерено',
            f'{row["parameters_b"]} / {row["license"]}']) + ' |')
    text += ['', 'Факт: допущенные по заранее заданному gate кандидаты: ' + (', '.join(winners) or 'нет') + '.', '',
             'Gate: точность слотов строго выше baseline; обычный pass^3 > 0; обычный и redteam pass^3 не ниже baseline; петли, страж и ошибки чисел не хуже. '
             'Незавершённый прогон кандидата или baseline не допускается. Судьи некалиброваны и дают только подсказки по G/L/M/P/V/F.', '',
             'Слоты: exact match размеченных полей, включая отсутствие; у legacy phrases-deepseek repay не размечен и исключён. '
             'Все пять полей проверяются на новых наборах; дополнительно all-exact и каждый слот в JSON. '
             'repay_from сравнивается буквально, поэтому перефразирование считается ошибкой. '
             'Петли: доля диалогов, где слот спрашивается минимум дважды, включая первый вопрос. '
             'Числа/страж: доля ходов с нарушением, включая заблокированные попытки голоса. '
             'pass^3 включает код и отсутствие петли; все 3 эпохи обязаны присутствовать.', '',
             'p50/p95: wall time хода агента (включая intake и speak); отдельные intake-пробы, '
             'клиент и судья исключены из latency. Intake latency сохранена отдельно в JSON. USD eval включает все роли; USD демо и demo_tokens '
             'считаются только по агенту в обычных диалогах. Стоимость по usage и снимку цен каталога, '
             'без предположения о скидках кэша. При оборванных диалогах демо не оценено; '
             'наблюдённые затраты и нерешённые резервы ошибок есть отдельно в JSON. '
             'Итоги счёта провайдера могут отличаться.', '',
             '## Локальный CPU', '', json.dumps(context.get('cpu'), ensure_ascii=False), '',
             '## Ограничения', '',
             'Hidden пока пуст и не измерен. Метки development сгенерированы и требуют проверки человеком. '
             'Результаты не подтверждают безопасность или качество в проде. Нулевой pass^3 не позволяет выбрать '
             'победителя только по приёмщику. Неизвестное не приравнивается к успеху.', '',
             '## Источники и воспроизведение', '',
             'Команды, критерии отбора, ссылки на первоисточники и допущения: [README-models](../README-models.md).', '']
    text += ['## Извлечение по наборам', '',
             '| Кандидат | Набор | N | All exact | purpose | amount | term | repay | contract |',
             '|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for row in rows:
        for source, result in row.get('intake_by_source', {}).items():
            text.append('| ' + ' | '.join([row['name'], source, str(result['n']), fmt(result['all_exact'], True),
                *[fmt(result['fields'][key], True) for key in FIELDS]]) + ' |')
    text.append('')
    for row in rows:
        if row.get('errors'):
            text += [f'### {row["name"]}: ошибки', '', '```json',
                     json.dumps(row['errors'][:8], ensure_ascii=False, indent=2), '```', '']
        if row.get('core_errors'):
            text += [f'### {row["name"]}: core_error', '',
                     f'Наблюдалось ходов с ошибкой расчёта: {len(row["core_errors"])}. '
                     'Идентификаторы и эпохи есть в JSON, полные состояния в .eval. Ядро не изменялось.', '']
    output.write_text('\n'.join(text), encoding='utf-8')
    return payload


def hashes(paths):
    return {str(p): hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
