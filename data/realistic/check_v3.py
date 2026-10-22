"""Run the unchanged core on seed_0: reasons, catalogue products and outcomes."""

import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path
import sys

from validate_specs import ROOT

CORE_CODES = set('SHORT_STATEMENT TOO_YOUNG STRESS_NEGATIVE_FLOW NO_FREE_CASHFLOW NOT_BUSINESS '
                 'ENFORCEMENT CONCENTRATION_ONE_CUSTOMER CASH_OUT CASH_GAP'.split())
STOP_CODES = {'SHORT_STATEMENT', 'TOO_YOUNG', 'NO_FREE_CASHFLOW', 'NOT_BUSINESS', 'ENFORCEMENT', 'CASH_OUT'}

# core.make_decision: amount <= limit_now maps to golden_v3 / README approve.
# SHORT_STATEMENT and amount <= limit_after share a status, while labels distinguish
# request_info (documents) from counteroffer (changed terms): keep ambiguous.
# Manager merges stops (reject) and amount > both limits (counteroffer).
# Legacy context/stop-rules.md: another instrument means counteroffer.
STATUS_OUTCOMES = {
    'можно подавать': 'approve',
    'можно после шага': None,
    'нужен менеджер': None,
    'лучше другой инструмент': 'counteroffer',
}


def compare_result(expected, result):
    """Compare public output only; the expected labels remain independent."""
    wanted = expected.get('product')
    product = ('n/a' if wanted is None else
               'ok' if result.get('instrument') == wanted else 'fail')
    status = result.get('status')
    outcome = STATUS_OUTCOMES.get(status)
    verdict = ('n/a' if expected.get('outcome') is None else
               'ambiguous' if outcome is None else
               'ok' if outcome == expected['outcome'] else 'fail')
    if str(status).startswith('ERROR '):
        return 'fail', 'fail'
    return product, verdict


def self_test():
    """Mutate copied responses, and check ambiguity and mismatched outcomes."""
    expected = dict(product='ALFA_OVERDRAFT', outcome='approve')
    response = dict(instrument='ALFA_OVERDRAFT', status='можно подавать')
    assert compare_result(expected, response) == ('ok', 'ok')
    assert compare_result(expected, dict(response, instrument='ALFA_REFI')) == ('fail', 'ok')
    assert response['instrument'] == 'ALFA_OVERDRAFT'
    for status in ('нужен менеджер', 'можно после шага', 'unknown'):
        assert compare_result(expected, dict(response, status=status))[1] == 'ambiguous'
    assert compare_result(dict(expected, outcome='reject'), response)[1] == 'fail'
    print('SELF TEST PASS: mutated product caught; outcome mismatch caught; ambiguous never ok')


def load_core():
    """Import only the checked-in core, without writing into Lisa's service directory."""
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('liza_core_v3', ROOT / 'services/ml-model/core.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def evaluate(manifest):
    """Feed only dirty CSV and public sidecars; catch/report individual core exceptions."""
    core = load_core()
    rows = []
    for cid, case in sorted(manifest.items()):
        expected = case['expected']
        variant = next(v for v in case['variants'] if v['seed_number'] == 0)
        dirty = ROOT / variant['statements']['dirty']
        need = json.loads((dirty.parent / 'need.json').read_text(encoding='utf-8'))
        questionnaire = json.loads((dirty.parent / 'questionnaire.json').read_text(encoding='utf-8'))
        required = CORE_CODES.intersection(expected['reasons'])
        detail = ''
        try:
            result = core.score(str(dirty), need, questionnaire)
            actual = set(result.get('stops_fired', [])) | set(result.get('reasons', []))
            absent = sorted(required - actual)
            unexpected = sorted(STOP_CODES.intersection(result.get('stops_fired', []))) if expected['outcome'] == 'approve' else []
            verdict = 'fail' if absent or unexpected else 'ok' if required or expected['outcome'] == 'approve' else 'n/a'
            detail = '; '.join(filter(None, ('missing=' + ','.join(absent) if absent else '',
                                            'approve stops=' + ','.join(unexpected) if unexpected else '')))
        except Exception as exc:
            result = dict(status=f'ERROR {type(exc).__name__}: {exc}', stops_fired=[], reasons=[])
            verdict, detail = 'fail', 'core exception'
        product_verdict, outcome_verdict = compare_result(expected, result)
        rows.append(dict(product_verdict=product_verdict, outcome_verdict=outcome_verdict,
                         case_id=cid, product=cid.rsplit('-', 1)[0], trap=expected['trap'] or 'none',
                         expected=expected, core=result, verdict=verdict, detail=detail))
    return rows


def summaries(rows, field, metric='verdict'):
    """Count combined traps under each individual T code and controls under none."""
    counts = {}
    for row in rows:
        keys = row[field].split('+') if field == 'trap' else [row[field]]
        for key in keys:
            counts.setdefault(key, Counter())[row[metric]] += 1
    return counts


def summary_lines(rows, field, metric='verdict'):
    """Return stable printable summary tables for the CLI and generated README."""
    counts = summaries(rows, field, metric)
    lines = [f'{field} ({metric}) | ok | fail | n/a | ambiguous', '--- | ---: | ---: | ---: | ---:']
    lines += [f'{key} | {c["ok"]} | {c["fail"]} | {c["n/a"]} | {c["ambiguous"]}' for key, c in sorted(counts.items())]
    total = Counter(r[metric] for r in rows)
    lines.append(f'TOTAL | {total["ok"]} | {total["fail"]} | {total["n/a"]} | {total["ambiguous"]}')
    return lines


def readme(rows):
    """Create the 30-50 line handoff with actual public-run results."""
    lines = [
        '# Лиза, это синтетика v3 для проверки ядра',
        'Набор покрывает 8 продуктов из таблицы Толи: разовые кредиты, линии, овердрафт, Старт, Дело и рефинансирование.',
        'Это экзамен правил и разбора выписок, а не данные для обучения и не реальные клиенты.',
        'В каждой папке клиента два варианта seed_0 и seed_1: бизнес один, операции немного различаются.',
        'statement_dirty.csv: UTF-8, разделитель ;, даты ДД.ММ.ГГГГ, суммы с пробелами и запятой, служебные строки.',
        'statement_1c.txt: CP1251, 1CClientBankExchange 1.03, поле на строку, направления по счетам.',
        'need.json: цель, сумма в рублях, срок в месяцах, источник возврата; questionnaire.json: форма, отрасль, возраст и тренд.',
        'balance_sheet.json: форма 0710001; income_statement.json: форма 0710002; денежные поля в рублях.',
        'existing_debt_schedule.csv: UTF-8, запятая, даты ISO, остаток, проценты, платёж и основной долг.',
        'financial_model.json и business_plan.json: короткие финансовые показатели и параметры запроса.',
        'Документ с present=false отсутствует. consistent=false означает расхождение, stale=true означает старый период.',
        'golden_v3.json хранит ожидаемые исходы, причины, пути и SHA256; label в банковские файлы не попадает.',
        'need и questionnaire построены из фактов spec, причины эталона в них не подмешиваются.',
        'T-код | Что спрятано | Ожидаемый код',
        '--- | --- | ---',
        'T01 / T02 | Два инкассо / частичное взыскание | ENFORCEMENT',
        'T03 / T04 | Снятие наличных / транзит, минимум 35% расходов | CASH_OUT',
        'T05 / T16 | Один / связанный покупатель, минимум 75% поступлений | CONCENTRATION_ONE_CUSTOMER',
        'T06 | Выписка короче 6 месяцев | SHORT_STATEMENT',
        'T07 | Возраст ниже минимума продукта | TOO_YOUNG',
        'T08 | Возобновляемая линия на станок | RESTRICTED_PURPOSE, досье',
        'T09 | Постоянный отрицательный поток | NO_FREE_CASHFLOW',
        'T10 | 0,3% в день сравнивают с годовой ставкой | Агент объясняет ставку, кода ядра нет',
        'T11 | НКЛ на 55 млн, спорный лимит | Ручная проверка досье',
        'T12 | Нет графика действующих долгов | MISSING_SCHEDULE, досье',
        'T13 | Не описан обязательный залог | MISSING_COLLATERAL_INFO, досье',
        'T14 / T15 | ОФР завышен / старый баланс | DOCS_MISMATCH / STALE_DOC, досье',
        'T17 | После падения выручки на 30% поток отрицательный | STRESS_NEGATIVE_FLOW',
        'T18 | Вместо продаж только переводы с личного счёта | NO_FREE_CASHFLOW',
        'T18b | В анкете самозанятый, форма не ИП и не ООО | NOT_BUSINESS',
        'T19 / T20 | Дивиденды / опечатки в понятной цели | RESTRICTED_PURPOSE, досье / проверка агента',
        'Таблица описывает все T-коды схемы; наличие каждого в текущем наборе показывает coverage_v3.py.',
        'approve: подходит; request_info: нужен документ; counteroffer: меньше сумма или другой продукт; reject: стоп; clarify: уточнить факт.',
        'check_v3 сравнивает причины, продукт и исход; неоднозначный status помечается ambiguous.',
        'ok: все ожидаемые коды найдены; approve дополнительно без стопов. fail: пропуск кода, лишний стоп approve или исключение.',
        'n/a (досье): только документные, продуктовые или анкетные проверки вне текущего ядра.',
        'Запуск из корня: python data/realistic/check_v3.py. Вручную: score(путь_к_statement_dirty.csv, need, questionnaire).',
        'Текущий результат seed_0 на неизменённом services/ml-model/core.py:',
        '',
    ]
    lines += summary_lines(rows, 'product')
    lines += ['Hidden остаётся у Саши. Там скрытые клиенты, чистые CSV и labels с ответами, смотреть их не надо.']
    assert 30 <= len(lines) <= 51, len(lines)
    return '\n'.join(lines) + '\n'


def main():
    """Print diagnostics; red core results are a deliverable, not a runner failure."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--strict', action='store_true', help='fail on mismatch or ambiguous outcome')
    parser.add_argument('--self-test', action='store_true', help='check comparison and mutation guards')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    name = 'data/v3/golden_v3.json'
    manifest = json.loads((ROOT / name).read_text(encoding='utf-8'))
    rows = evaluate(manifest)
    print('case_id | группа | ловушка | ожидаемый продукт | ядро продукт | продукт | ожидаемый исход | ядро status | исход | ожидаемые причины | stops_fired; reasons | причины | детали')
    for row in rows:
        exp, core = row['expected'], row['core']
        print(f'{row["case_id"]} | {row["product"]} | {row["trap"]} | {exp.get("product")} | '
              f'{core.get("instrument")} | {row["product_verdict"]} | {exp["outcome"]} | '
              f'{core["status"]} | {row["outcome_verdict"]} | {exp["reasons"]} | '
              f'{core.get("stops_fired", [])}; {core.get("reasons", [])} | {row["verdict"]} | {row["detail"]}')
    for metric in ('verdict', 'product_verdict', 'outcome_verdict'):
        for field in ('trap', 'product'):
            print('\n' + '\n'.join(summary_lines(rows, field, metric)))
    print('\nFAILURE EVIDENCE: case | dimension | expected | actual | label/source')
    for row in rows:
        exp, core = row['expected'], row['core']
        for dimension, verdict, expected, actual in (
            ('product', row['product_verdict'], exp.get('product'), core.get('instrument')),
            ('outcome', row['outcome_verdict'], exp['outcome'], core.get('status')),
        ):
            if verdict in ('fail', 'ambiguous'):
                print(f'{row["case_id"]} | {dimension} ({verdict}) | {expected} | {actual} | '
                      f'golden_v3.expected.{dimension}; {exp["why"]}')
    print('CORE CHECK COMPLETE: reasons/product/outcome checked; ambiguous is not ok.')
    failed = any(r[k] in ('fail', 'ambiguous') for r in rows
                 for k in ('verdict', 'product_verdict', 'outcome_verdict'))
    if args.strict and failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
