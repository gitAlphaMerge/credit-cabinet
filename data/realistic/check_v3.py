"""Run Lisa's unchanged core on seed_0 dirty CSV; statuses are diagnostic only."""

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
        rows.append(dict(case_id=cid, product=cid.rsplit('-', 1)[0], trap=expected['trap'] or 'none',
                         expected=expected, core=result, verdict=verdict, detail=detail))
    return rows


def summaries(rows, field):
    """Count combined traps under each individual T code and controls under none."""
    counts = {}
    for row in rows:
        keys = row[field].split('+') if field == 'trap' else [row[field]]
        for key in keys:
            counts.setdefault(key, Counter())[row['verdict']] += 1
    return counts


def summary_lines(rows, field):
    """Return stable printable summary tables for the CLI and generated README."""
    counts = summaries(rows, field)
    lines = [f'{field} | ok | fail | n/a', '--- | ---: | ---: | ---:']
    lines += [f'{key} | {c["ok"]} | {c["fail"]} | {c["n/a"]}' for key, c in sorted(counts.items())]
    total = Counter(r['verdict'] for r in rows)
    lines.append(f'TOTAL | {total["ok"]} | {total["fail"]} | {total["n/a"]}')
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
        'Ядро пока выдаёт другие status. check_v3 печатает их, но сравнивает только поддерживаемые коды причин.',
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
    parser.add_argument('--hidden', action='store_true', help='run Sasha\'s hidden clients instead of public')
    args = parser.parse_args()
    name = 'data/hidden/v3/golden_v3_hidden.json' if args.hidden else 'data/v3/golden_v3.json'
    manifest = json.loads((ROOT / name).read_text(encoding='utf-8'))
    rows = evaluate(manifest)
    print('case_id | продукт | ловушка | ждём исход и причины | ядро status, stops_fired; reasons | ok/fail')
    for row in rows:
        exp, core = row['expected'], row['core']
        verdict = 'n/a (досье)' if row['verdict'] == 'n/a' else row['verdict']
        print(f'{row["case_id"]} | {row["product"]} | {row["trap"]} | {exp["outcome"]}, {",".join(exp["reasons"]) or "-"} | '
              f'{core["status"]}, {core.get("stops_fired", [])}; {core.get("reasons", [])} | {verdict} {row["detail"]}'.rstrip())
    for field in ('trap', 'product'):
        print('\n' + '\n'.join(summary_lines(rows, field)))
    print('CORE CHECK COMPLETE: status не сравнивается; fail фиксирует результат ядра, exit=0.')


if __name__ == '__main__':
    main()
