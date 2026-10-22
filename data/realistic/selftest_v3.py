"""Check actual serialized v3 artifacts, independent of the producer's totals."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import copy
import csv
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import build_v3
import from_spec
import model
from validate_specs import ROOT, OUTCOMES, catalog, validate, statement_months, differences


def answer_path(path):
    """Find labels in the hidden answer tree, preserving case and seed folders."""
    return build_v3.HIDDEN / 'answers' / path.parent.parent.name / path.parent.name / path.with_suffix('.labels.csv').name


def check_trap_strength(path, spec):
    """Measure actual clean rows independently of source parameters and manifest totals."""
    with path.open(encoding='utf-8', newline='') as stream:
        rows = list(csv.DictReader(stream))
    traps = set((spec['expected']['trap'] or '').split('+'))
    expenses = -sum(amount(r['amount']) for r in rows if amount(r['amount']) < 0)
    cash = -sum(amount(r['amount']) for r in rows if r['label'] == 'cash')
    inflow = sum(amount(r['amount']) for r in rows if r['label'] == 'inflow')
    payers = defaultdict(int)
    for row in rows:
        if row['label'] == 'inflow':
            payers[row['counterparty']] += amount(row['amount'])
    if traps & {'T03', 'T04'}:
        assert expenses > 0 and cash >= 0.35 * expenses, f'{path}: weak_trap cash/expenses={cash / expenses if expenses else 0}'
    if traps & {'T05', 'T16'}:
        assert inflow > 0 and max(payers.values(), default=0) >= 0.75 * inflow, f'{path}: weak_trap concentration'
    if 'T06' in traps:
        assert 0 < len({r['date'][:7] for r in rows}) < 6, f'{path}: weak_trap period'
    if 'T07' in traps:
        p = catalog()[spec['request']['product_asked']]
        assert spec['business']['age_months'] < p['bank_min_business_age_months'], f'{path}: weak_trap age'
    if 'T17' in traps:
        stress = sum(amount(r['amount']) * (0.7 if r['label'] in {'inflow', 'operating'} else 1)
                     for r in rows if r['label'] in {'inflow', 'operating', 'mandatory', 'cash', 'enforcement'})
        assert stress < 0, f'{path}: weak_trap stress={stress}'


def amount(value):
    """Read both bank decimal commas and normal decimal dots exactly."""
    return from_spec.cents(value.replace('\xa0', '').replace(' ', '').replace(',', '.'))


def read_clean(path):
    """Read actual clean CSV operations, not totals stored in a manifest."""
    with path.open(encoding='utf-8', newline='') as stream:
        return [(dt.date.fromisoformat(r['date']), amount(r['amount']), r['label']) for r in csv.DictReader(stream)]


def read_dirty(path):
    """Parse the existing semicolon dirt format, excluding its service footer."""
    lines = path.read_text(encoding='utf-8').splitlines()
    labels_path = answer_path(path)
    with labels_path.open(encoding='utf-8', newline='') as stream:
        labels = list(csv.DictReader(stream))
    assert len(labels) == len(lines), f'{path}: line labels'
    result = []
    for index, row in enumerate(csv.reader(lines[2:-1], delimiter=';'), 3):
        assert len(row) == 5, f'{path}:{index}: bad dirty CSV'
        label = labels[index - 1]['label']
        assert label not in {'service', 'duplicate'}, f'{path}:{index}: mislabeled transaction'
        result.append((dt.datetime.strptime(row[0], '%d.%m.%Y').date(), amount(row[4]), label))
    return result


def read_exchange(path):
    """Parse multiline 1C documents and their independent account balance section."""
    lines = path.read_text(encoding='cp1251').splitlines()
    assert lines[0] == '1CClientBankExchange' and lines[-1] == 'КонецФайла', str(path)
    with answer_path(path).open(encoding='utf-8', newline='') as stream:
        labels = list(csv.DictReader(stream))
    assert len(labels) == len(lines), f'{path}: 1C labels'
    account = next(line.split('=', 1)[1] for line in lines if line.startswith('РасчСчет='))
    balances = {}
    result, block, block_line = [], None, None
    for index, line in enumerate(lines):
        if line.startswith('СекцияДокумент='):
            assert block is None and line == 'СекцияДокумент=Платёжное поручение', str(path)
            block, block_line = {}, index
        elif line == 'КонецДокумента':
            assert block is not None, f'{path}: unexpected end'
            value = amount(block['Сумма'])
            assert value >= 0, f'{path}: 1C amount must be unsigned'
            incoming = block['ПолучательСчет'] == account
            assert incoming != (block['ПлательщикСчет'] == account), f'{path}: ambiguous account direction'
            result.append((dt.datetime.strptime(block['Дата'], '%d.%m.%Y').date(), value if incoming else -value,
                           labels[block_line]['label']))
            block = None
        elif '=' in line:
            key, value = line.split('=', 1)
            if block is not None:
                block[key] = value
            elif key in {'НачальныйОстаток', 'КонечныйОстаток', 'ВсегоПоступило', 'ВсегоСписано'}:
                balances[key] = amount(value)
    assert block is None, f'{path}: unterminated document'
    assert balances['КонечныйОстаток'] == balances['НачальныйОстаток'] + sum(r[1] for r in result), str(path)
    assert balances['ВсегоПоступило'] == sum(r[1] for r in result if r[1] > 0), str(path)
    assert balances['ВсегоСписано'] == -sum(r[1] for r in result if r[1] < 0), str(path)
    return result


def check_artifacts(manifests, specs):
    """Check balance/date/hash/document invariants against every output file."""
    products = catalog()
    cases = 0
    for manifest in manifests.values():
        for cid, case in manifest.items():
            spec = specs[cid]
            assert case['expected'] == spec['expected'], f'{cid}: expected changed'
            if case['expected']['outcome'] == 'approve':
                p = products[case['expected']['product'] or spec['request']['product_asked']]
                assert p['bank_min_amount_rub'] <= spec['request']['amount_rub'] <= p['bank_max_amount_rub'], cid
            for name, expected_sha in case['files'].items():
                assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected_sha, f'{name}: sha256'
            for variant in case['variants']:
                parsed = []
                for kind, name in variant['statements'].items():
                    rows = {'clean': read_clean, 'dirty': read_dirty, '1c': read_exchange}[kind](ROOT / name)
                    parsed.append(rows)
                    assert len(rows) == variant['operation_count'], f'{cid}: row count'
                    total = sum(r[1] for r in rows)
                    assert total == from_spec.cents(variant['operation_total_rub']), f'{cid}: operations'
                    assert from_spec.cents(variant['closing_balance_rub']) == from_spec.cents(variant['opening_balance_rub']) + total, f'{cid}: balance'
                    for date, _, label in rows:
                        assert model.is_workday(date), f'{cid}: weekend/holiday {date}'
                        assert variant['period_start'] <= date.isoformat() <= variant['period_end'], f'{cid}: period'
                        assert label in {'inflow', 'mandatory', 'operating', 'cash', 'enforcement', 'transfer'}, f'{cid}: label'
                assert all(p == parsed[0] for p in parsed), f'{cid}: packaging changed operations'
                if 'clean' in variant['statements']:
                    check_trap_strength(ROOT / variant['statements']['clean'], spec)
                dirty = ROOT / variant['statements']['dirty']
                need, questionnaire = from_spec.core_inputs(spec)
                for name, wanted in (('need.json', need), ('questionnaire.json', questionnaire)):
                    assert json.loads((dirty.parent / name).read_text(encoding='utf-8')) == wanted, f'{cid}: {name}'
                actual_docs = {Path(p).stem for p in variant['documents']}
                wanted_docs = {name for name, config in spec['documents'].items() if name != 'bank_statement' and config['present']}
                assert actual_docs == wanted_docs, f'{cid}: missing/unrequested document'
                assert bool(variant['statements']) == spec['documents']['bank_statement']['present'], cid
                for name in variant['documents']:
                    path = ROOT / name
                    config = spec['documents'][path.stem]
                    if path.suffix == '.json':
                        doc = json.loads(path.read_text(encoding='utf-8'))
                        assert doc['period'] == config['period'] and doc['consistent'] == config['consistent'], str(path)
                        assert doc['stale'] == from_spec.document_metadata(config)['stale'], str(path)
                        if path.stem == 'income_statement' and config['consistent'] and parsed:
                            assert from_spec.cents(doc['lines']['2110']) == sum(r[1] for r in parsed[0] if r[2] == 'inflow' and r[1] > 0), str(path)
                    else:
                        with path.open(encoding='utf-8', newline='') as stream:
                            schedule = list(csv.DictReader(stream))
                        for row in schedule:
                            assert model.is_workday(dt.date.fromisoformat(row['date'])), str(path)
                            assert amount(row['opening_balance_rub']) - amount(row['principal_rub']) == amount(row['closing_balance_rub']), str(path)
                            assert amount(row['payment_rub']) == amount(row['principal_rub']) + amount(row['interest_rub']), str(path)
            cases += 1
    return cases


def check_no_leaks(specs):
    """Scan all emitted bytes, including unmanifested files and CP1251 statements."""
    forbidden = sorted(set(specs) | set(catalog()))
    checked = 0
    for root, golden in ((build_v3.PUBLIC, 'golden_v3.json'),
                         (build_v3.HIDDEN, 'golden_v3_hidden.json')):
        for path in sorted(root.rglob('*')):
            if not path.is_file() or path == root / golden or path == root / 'README.md':
                continue
            if root == build_v3.PUBLIC:
                assert path.name != 'statement_clean.csv' and not path.name.endswith('.labels.csv'), f'{path}: public answer leak'
            payload = path.read_bytes()
            for token in forbidden:
                assert token.encode('ascii') not in payload, f'{path}: leaked {token}'
            checked += 1
    print(f'leaks OK files={checked}: no case_id or catalogue product IDs outside golden')


def check_weak_rejections(spec):
    """Regression: every weakened trap rejects both link directions, including the control."""
    for trap in ('T03', 'T04', 'T05', 'T16', 'T06', 'T07', 'T17'):
        bad = copy.deepcopy(spec)
        bad.update(case_id='WEAK_TEST-001', twin_of=None)
        bad['request']['product_asked'] = bad['expected']['product'] = 'ALFA_LUMP_UNSEC'
        bad['expected'].update(trap=trap, outcome='request_info')
        bad['business'].update(age_months=36, headcount=0)
        bad['cash_process'].update(months=12, seasonality=[1.0] * 12, rent_rub=0,
                                   top_customer_share=0.1, special_events=[], existing_debts=[])
        bad['documents']['bank_statement']['period'] = '12m'
        control = copy.deepcopy(bad)
        control.update(case_id='WEAK_TEST-002', twin_of=bad['case_id'])
        control['expected']['trap'] = None
        for reverse in (False, True):
            if reverse:
                bad['twin_of'], control['twin_of'] = control['case_id'], None
            findings = validate([bad, control])
            rejected = {f['case_id'] for f in findings if f['rule'] == 'weak_trap' and f['severity'] == 'error'}
            assert rejected == {bad['case_id'], control['case_id']}, (trap, findings)
    print('weak_trap OK: T03/T04/T05/T16/T06/T07/T17, both twins and both seeds')


def check_factory_batches(batches):
    """Audit batch distribution, hidden splits, applicability and coupled T07 history."""
    products = catalog()
    for path, specs in batches:
        if not path.name.endswith('.factory.json'):
            continue
        by_id = {s['case_id']: s for s in specs}
        if len(specs) in (16, 18):
            base = specs[:16]
            assert Counter(s['expected']['outcome'] for s in base) == Counter(dict(zip(OUTCOMES, (4, 3, 3, 4, 2)))), str(path)
            assert Counter(s['expected']['outcome'] for s in specs if s['split'] == 'hidden') == Counter(
                {'approve': 1, 'reject': 1, 'counteroffer': 1}), str(path)
            assert max(Counter(s['business']['industry'] for s in base).values()) <= 4, str(path)
            assert len({tuple(s['cash_process']['seasonality']) for s in specs}) >= 3, str(path)
        for spec in specs:
            pid = spec['request']['product_asked']
            product = products[pid]
            assert spec['business']['industry'] in product['mvp_priority_industry_examples'].split(';'), spec['case_id']
            trap = spec['expected']['trap']
            if trap == 'T18':
                assert spec['expected']['reasons'] == ['NO_FREE_CASHFLOW'], spec['case_id']
                assert spec['cash_process']['revenue_month_rub'] == 0, spec['case_id']
                assert from_spec.core_inputs(spec)[1]['form'] in ('ИП', 'ООО'), spec['case_id']
            if trap == 'T18b':
                assert spec['expected']['outcome'] == 'reject', spec['case_id']
                assert spec['expected']['reasons'] == ['NOT_BUSINESS'], spec['case_id']
                assert from_spec.core_inputs(spec)[1]['form'] not in ('ИП', 'ООО'), spec['case_id']
                assert spec['cash_process']['revenue_month_rub'] > 0, spec['case_id']
            if trap == 'T13':
                assert product['bank_collateral'] == 'required'
            if trap in {'T08', 'T10', 'T11'}:
                assert pid == {'T08': 'ALFA_RCL_UNSEC', 'T10': 'ALFA_START', 'T11': 'ALFA_NCL_SEC'}[trap]
            if spec['expected']['outcome'] == 'approve':
                assert product['fit_' + spec['request']['purpose_code']] == 2, spec['case_id']
                term = spec['request']['term_months']
                assert term >= (product['bank_min_term_months'] or 1), spec['case_id']
                maximum = product['bank_max_term_months'] or product['bank_tranche_max_months']
                assert maximum is None or term <= maximum, spec['case_id']
            assert '\u2014' not in spec['narrative'], spec['case_id']
            if spec['twin_of']:
                twin = by_id[spec['twin_of']]
                changes = differences(spec, twin)
                prose_trap = twin['expected']['trap'] in {'T10', 'T20'}
                t07 = twin['expected']['trap'] == 'T07'
                assert len(changes) == (0 if prose_trap else 3 if t07 else 1), (spec['case_id'], changes)
                if t07:
                    assert set(changes) == {'business.age_months', 'cash_process.months', 'documents.bank_statement.period'}
                    assert spec['cash_process']['months'] == statement_months(spec) == 12
                    assert not any(f['rule'] == 'twin_diff' and f['case_id'] == spec['case_id'] for f in validate(specs))
                    short = copy.deepcopy(specs)
                    short_control = next(s for s in short if s['case_id'] == spec['case_id'])
                    short_control['cash_process']['months'] = 6
                    short_control['documents']['bank_statement']['period'] = '6m'
                    if spec['expected']['outcome'] == 'approve':
                        assert any(f['rule'] == 'approve_statement' and f['severity'] == 'warn'
                                   and f['case_id'] == spec['case_id'] for f in validate(short))
                assert (spec['narrative'] != twin['narrative']) == prose_trap, spec['case_id']
    t18b = [s for path, batch in batches if path.name.endswith('.factory.json')
            for s in batch if s['expected']['trap'] == 'T18b']
    assert Counter(s['request']['product_asked'] for s in t18b) == Counter(
        dict.fromkeys(('ALFA_LUMP_SEC', 'ALFA_LUMP_UNSEC', 'ALFA_RCL_UNSEC', 'ALFA_REFI'), 1))
    print('factory OK: exact outcomes/hidden, priority industries, seasons, catalogue bounds, T07 history, T18/T18b')


def check_pairs(spec):
    """Reject either link direction for any error, including schema failures."""
    original = copy.deepcopy(spec)
    original.update(case_id='TEST_PAIR-001', twin_of=None)
    original['expected']['trap'] = None
    original['cash_process']['seasonality'] = [-1.0] + [1.0] * 11
    control = copy.deepcopy(spec)
    control.update(case_id='TEST_PAIR-002', twin_of=original['case_id'])
    control['expected']['trap'] = None
    for reverse in (False, True):
        if reverse:
            original['twin_of'], control['twin_of'] = control['case_id'], None
        findings = validate([original, control])
        assert any(f['case_id'] == control['case_id'] and f['severity'] == 'error'
                   and f['rule'] == 'twin_pair' for f in findings), 'invalid pair survived'
    original['cash_process']['months'] = True
    assert any(f['case_id'] == control['case_id'] and f['rule'] == 'twin_pair'
               for f in validate([control, original])), 'schema-invalid pair survived'
    for _, batch in build_v3.discover_specs():
        bad = {f['case_id'] for f in validate(batch) if f['severity'] == 'error'}
        for source in batch:
            if source['twin_of'] in bad:
                assert source['case_id'] in bad, 'orphan control survived'
    print('pairs OK: generic errors, reverse links, schema errors')


def check_contracts(spec):
    """Exercise absent source branches with in-memory fixtures, without adding source specs."""
    fixture = copy.deepcopy(spec)
    fixture['cash_process']['months'] = 12
    fixture['documents']['bank_statement']['period'] = '12m'
    fixture['cash_process']['seasonality'] = [1.0] * 12
    fixture['cash_process']['existing_debts'] = [dict(lender='Тестовый банк', balance_rub=500000,
                                                    rate_pct=24, monthly_payment_rub=50000, months_left=13)]
    fixture['cash_process']['special_events'] = [dict(kind=k, month=i + 1, amount_rub=10000, purpose_text='тест')
                                                for i, k in enumerate(('enforcement', 'cash_out', 'transit', 'self_transfer',
                                                                       'one_off_big_inflow', 'revenue_drop', 'tax_arrears'))]
    for name in ('balance_sheet', 'income_statement', 'existing_debt_schedule', 'financial_model', 'business_plan'):
        fixture['documents'][name] = dict(present=True, period='current', consistent=True, note='')
    fixture['documents']['balance_sheet']['period'] = '2022'
    fixture['documents']['income_statement'].update(consistent=False, note='выручка на 40% выше поступлений')
    ops, meta = from_spec.generate(fixture, 0)
    docs = from_spec.documents(fixture, ops, meta)
    assert len(docs) == 5 and docs['balance_sheet.json']['stale']
    revenue = sum(from_spec.cents(r['amount']) for r in ops if r['label'] == 'inflow' and r['amount'] > 0) / 100
    assert abs(docs['income_statement.json']['lines']['2110'] - round(revenue * 1.4, 2)) < 0.005
    enforcement = [r for r in ops if r['label'] == 'enforcement']
    assert enforcement and all('ИП №' in r['purpose'] and 'инкассовое' in r['purpose'].lower() for r in enforcement)
    assert any('Снятие наличных' in r['purpose'] for r in ops if r['label'] == 'cash')
    assert any('физическому лицу' in r['purpose'] for r in ops if r['label'] == 'cash')
    for row in ops:
        if row['counterparty'] == from_spec.TAX_RECIPIENT:
            assert row['date'].day <= 28
        if row['counterparty'] == 'Зарплатный проект, реестр':
            allowed = [from_spec.date_in_month(row['date'].year, row['date'].month, d) for d in fixture['cash_process']['payroll_days']]
            assert row['date'] in allowed
    assert len(list(csv.DictReader(io.StringIO(docs['existing_debt_schedule.csv'].decode('utf-8'))))) == 13
    # Reductions affect actual receipts in the chosen month, not a fabricated debit.
    control = copy.deepcopy(fixture)
    control['cash_process']['special_events'] = [e for e in control['cash_process']['special_events'] if e['kind'] != 'revenue_drop']
    before, _ = from_spec.generate(control, 0)
    revenue_in = lambda rows: sum(from_spec.cents(r['amount']) for r in rows if r['date'].month == 3 and r['label'] == 'inflow')
    assert revenue_in(before) - revenue_in(ops) == 1_000_000, 'revenue_drop did not reduce March receipts exactly'
    malformed = copy.deepcopy(fixture)
    malformed['cash_process']['months'] = True
    malformed['expected']['reasons'] = ['INVENTED_REASON']
    findings = validate([malformed])
    assert any(f['rule'] == 'schema' and f['severity'] == 'error' for f in findings)
    malformed['cash_process']['months'] = 12
    assert any(f['rule'] == 'reason_code' for f in validate([malformed]))
    assert len(meta['account']) == 20, 'bank account length'
    empty = copy.deepcopy(spec)
    empty['cash_process'].update(revenue_month_rub=0, rent_rub=0, existing_debts=[], special_events=[])
    empty['business']['headcount'] = 0
    empty_rows, empty_meta = from_spec.generate(empty, 0)
    assert empty_rows == [] and empty_meta['closing'] == empty_meta['opening'], 'empty statement'
    assert empty_meta['owner'] == from_spec.client_name(empty, 0)
    for form in ('IP', 'OOO'):
        identity = copy.deepcopy(spec)
        identity['business']['legal_form'] = form
        for number in range(2):
            _, metadata = from_spec.generate(identity, number)
            owner = from_spec.client_name(identity, number)
            assert metadata['owner'] == owner == from_spec.client_name(identity, number)
            assert owner.startswith('ИП ' if form == 'IP' else 'ООО «')
            assert identity['case_id'] not in owner
            exchange, _ = build_v3.exchange_bytes(ops, metadata)
            assert owner in exchange.decode('cp1251'), '1C client identity differs'
    concentration = copy.deepcopy(fixture)
    concentration['cash_process'].update(acquiring_share=0, top_customer_share=0.2, special_events=[],
                                          counterparties=[dict(name=name, role='customer', share=0.2,
                                                               purpose_templates=['Оплата по договору'])
                                                          for name in ('ООО «Первый»', 'ООО «Второй»')])
    concentrated_rows, _ = from_spec.generate(concentration, 0)
    receipts = sum(r['amount'] for r in concentrated_rows if r['label'] == 'inflow')
    for customer in concentration['cash_process']['counterparties']:
        actual = sum(r['amount'] for r in concentrated_rows if r['label'] == 'inflow' and r['counterparty'] == customer['name'])
        assert abs(actual - receipts * 0.2) < 1, 'counterparty remapping changed concentration'
    print('contracts OK: all documents, events, mismatch, stale, payroll/taxes, schema')


def check_legacy():
    """Run unchanged legacy selftest in a disposable tree, protecting data/dirty and old hidden files."""
    build_v3.HIDDEN.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='legacy_selftest_', dir=build_v3.HIDDEN) as directory:
        root = Path(directory)
        dest = root / 'data/realistic'
        dest.mkdir(parents=True)
        for path in (ROOT / 'data/realistic').glob('*.py'):
            shutil.copyfile(path, dest / path.name)
        synthetic = root / 'data/synthetic'
        synthetic.mkdir()
        shutil.copyfile(ROOT / 'data/synthetic/reference.py', synthetic / 'reference.py')
        shutil.copyfile(ROOT / 'data/golden.json', root / 'data/golden.json')
        result = subprocess.run([sys.executable, 'data/realistic/selftest.py'], cwd=root,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8')
        print('legacy command: python data/realistic/selftest.py (isolated copy)')
        print(result.stdout.rstrip())
        assert result.returncode == 0, 'legacy selftest failed'


def main():
    """Check existing artifacts first, then two independent builds and their complete hashes."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--legacy', action='store_true', help='also run original selftest in isolation')
    args = parser.parse_args()
    batches = build_v3.discover_specs()
    check_factory_batches(batches)
    specs = {s['case_id']: s for _, batch in batches for s in batch}
    for spec in specs.values():
        if spec['expected']['trap']:
            twin = specs.get(spec['twin_of'])
            reverse = [s for s in specs.values() if s['twin_of'] == spec['case_id']]
            assert twin is not None or reverse, f'{spec["case_id"]}: trap without twin'
            assert any(s['expected']['trap'] is None for s in ([twin] if twin else []) + reverse), f'{spec["case_id"]}: no control twin'
    existing = dict(public=json.loads((build_v3.PUBLIC / 'golden_v3.json').read_text(encoding='utf-8')),
                    hidden=json.loads((build_v3.HIDDEN / 'golden_v3_hidden.json').read_text(encoding='utf-8')))
    count = check_artifacts(existing, specs)
    check_no_leaks(specs)
    check_pairs(next(iter(specs.values())))
    check_weak_rejections(next(iter(specs.values())))
    check_contracts(next(iter(specs.values())))
    manifests, first = build_v3.build_all(verbose=False)
    _, second = build_v3.build_all(verbose=False)
    assert first == second, 'two consecutive builds changed sha256'
    check_artifacts(manifests, specs)
    check_no_leaks(specs)
    bad = {f['case_id'] for _, batch in batches for f in validate(batch) if f['severity'] == 'error'}
    assert not bad.intersection(cid for manifest in manifests.values() for cid in manifest), 'invalid case built'
    print(f'selftest_v3 OK cases={count} files={len(second)}: balances, workdays, twins, approve bounds, clean=dirty=1C, sha256, no leaks')
    if args.legacy:
        check_legacy()


if __name__ == '__main__':
    main()
