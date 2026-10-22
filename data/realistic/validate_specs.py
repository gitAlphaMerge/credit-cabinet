"""Validate Gemini/factory specs without modifying source JSON (stdlib only)."""

from __future__ import annotations

import argparse
from collections import Counter
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
OUTCOMES = ('approve', 'request_info', 'counteroffer', 'reject', 'clarify')
DOCS = ('bank_statement', 'balance_sheet', 'income_statement',
        'existing_debt_schedule', 'financial_model', 'business_plan')
REASONS = set('SHORT_STATEMENT TOO_YOUNG STRESS_NEGATIVE_FLOW NO_FREE_CASHFLOW '
              'NOT_BUSINESS ENFORCEMENT CONCENTRATION_ONE_CUSTOMER CASH_OUT CASH_GAP '
              'STALE_DOC MISSING_SCHEDULE MISSING_COLLATERAL_INFO DOCS_MISMATCH '
              'RESTRICTED_PURPOSE'.split())


def obj(properties, required=()):
    """Describe an object using the small subset of JSON Schema needed here."""
    return {'type': 'object', 'properties': properties, 'required': required}


def arr(items):
    """Describe a homogeneous array."""
    return {'type': 'array', 'items': items}


def enum(*values):
    """Describe an enumeration."""
    return {'enum': values}


STR, INT, NUM, BOOL = ({'type': t} for t in ('string', 'integer', 'number', 'boolean'))
NULL_INT = {'type': ['integer', 'null']}
NULL_STR = {'type': ['string', 'null']}
DEBT = obj(dict(lender=STR, balance_rub=INT, rate_pct=NUM,
                monthly_payment_rub=INT, months_left=INT),
           ('lender', 'balance_rub', 'rate_pct', 'monthly_payment_rub', 'months_left'))
EVENT = obj(dict(kind=enum('enforcement', 'cash_out', 'transit', 'self_transfer',
                          'one_off_big_inflow', 'revenue_drop', 'tax_arrears'),
                 month=INT, amount_rub=INT, purpose_text=STR),
            ('kind', 'month', 'amount_rub', 'purpose_text'))
DOCUMENT = obj(dict(present=BOOL, period=STR, consistent=BOOL, note=STR),
               ('present', 'period', 'consistent', 'note'))
SCHEMA = obj({
    'case_id': STR, 'split': enum('public', 'hidden'), 'twin_of': NULL_STR,
    'business': obj(dict(legal_form=enum('IP', 'OOO', 'SELF_EMPLOYED'), okved=STR,
                         industry=enum('trade', 'marketplace', 'manufacturing', 'construction',
                                       'services', 'it', 'logistics', 'horeca', 'wholesale'),
                         region=STR, age_months=NULL_INT, registered=BOOL,
                         tax_regime=enum('USN6', 'USN15', 'OSNO', 'AUSN', 'PSN'), headcount=INT),
                    ('legal_form', 'okved', 'industry', 'region', 'age_months', 'registered', 'tax_regime')),
    'request': obj(dict(product_asked=NULL_STR, amount_rub=INT, term_months=NULL_INT,
                        purpose_code=STR, purpose_text=STR),
                   ('product_asked', 'amount_rub', 'term_months', 'purpose_code', 'purpose_text')),
    'cash_process': obj(dict(months=INT, revenue_month_rub=INT, seasonality=arr(NUM),
                             acquiring_share=NUM, top_customer_share=NUM, payroll_days=arr(INT),
                             rent_rub=INT, existing_debts=arr(DEBT), special_events=arr(EVENT),
                             counterparties=arr(obj(dict(name=STR, role=enum('customer', 'supplier', 'landlord', 'service'),
                                                        share=NUM, purpose_templates=arr(STR)),
                                                   ('name', 'role', 'share', 'purpose_templates')))),
                        ('months', 'revenue_month_rub', 'seasonality', 'acquiring_share',
                         'top_customer_share', 'payroll_days', 'rent_rub', 'existing_debts', 'special_events')),
    'documents': obj({name: DOCUMENT for name in DOCS}, ('bank_statement',)),
    'collateral': {**obj(dict(type=STR, owner=STR, value_rub=NULL_INT)), 'type': ['object', 'null']},
    'narrative': STR,
    'expected': obj(dict(product=NULL_STR, outcome=enum(*OUTCOMES),
                         counteroffer={**obj(dict(product=STR, amount_rub=INT, term_months=INT)),
                                       'type': ['object', 'null']},
                         reasons=arr(STR), trap=NULL_STR, missing_docs=arr(STR), why=STR),
                    ('product', 'outcome', 'reasons', 'trap', 'why')),
}, ('case_id', 'split', 'twin_of', 'business', 'request', 'cash_process',
    'documents', 'collateral', 'narrative', 'expected'))


def catalog():
    """Read the locally supplied catalogue, never a network source."""
    data = json.loads((ROOT / 'data/catalog/products.json').read_text(encoding='utf-8-sig'))
    return {p['id']: p for p in data['products']}


def load_specs(path):
    """Read a spec array; invalid JSON stays an explicit validation error."""
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def schema_issues(value, schema, path=''):
    """Recursively check types, required keys and unexpected keys."""
    issues = []
    types = schema.get('type', [])
    types = [types] if isinstance(types, str) else types
    matches = {'object': isinstance(value, dict), 'array': isinstance(value, list),
               'string': isinstance(value, str), 'integer': type(value) is int,
               'number': type(value) in (int, float) and math.isfinite(value),
               'boolean': type(value) is bool, 'null': value is None}
    if types and not any(matches[t] for t in types):
        return [('error', 'schema', f'{path or "$"}: expected {types}')]
    if 'enum' in schema and value not in schema['enum']:
        issues.append(('error', 'schema', f'{path}: unknown value {value!r}'))
    if isinstance(value, dict):
        props = schema.get('properties', {})
        for key in schema.get('required', ()):
            if key not in value:
                issues.append(('error', 'schema', f'{path}.{key}: missing required field'))
        for key, item in value.items():
            field = f'{path}.{key}'.lstrip('.')
            if key not in props:
                issues.append(('warn', 'extra_key', field))
            else:
                issues.extend(schema_issues(item, props[key], field))
    elif isinstance(value, list):
        for i, item in enumerate(value):
            issues.extend(schema_issues(item, schema['items'], f'{path}[{i}]'))
    return issues


def differences(a, b, path=''):
    """Count changed semantic fields; arrays are one field, not twelve indices."""
    if isinstance(a, dict) and isinstance(b, dict):
        result = []
        for key in sorted(a.keys() | b.keys()):
            if not path and key in {'narrative', 'case_id', 'split', 'twin_of', 'expected'}:
                continue
            field = f'{path}.{key}'.lstrip('.')
            if key not in a or key not in b:
                result.append(field)
            else:
                result.extend(differences(a[key], b[key], field))
        return result
    return [] if a == b else [path]


def statement_months(spec):
    """The statement period takes priority over cash_process.months."""
    period = spec['documents']['bank_statement']['period']
    match = re.fullmatch(r'(\d+)m', period)
    return int(match[1]) if match else spec['cash_process']['months']


def weak_traps(spec, product):
    """Measure trap strength from cash processes, never from expected reason codes."""
    traps = set((spec['expected']['trap'] or '').split('+'))
    cp = spec['cash_process']
    problems = []
    if traps & {'T05', 'T16'} and cp['top_customer_share'] < 0.75:
        problems.append('top_customer_share must be >= 0.75')
    if 'T06' in traps and statement_months(spec) >= 6:
        problems.append('statement period must be < 6m')
    if 'T07' in traps and (not product or spec['business']['age_months'] is None
                           or spec['business']['age_months'] >= (product['bank_min_business_age_months'] or 0)):
        problems.append('age_months must be below bank_min_business_age_months')
    if traps & {'T03', 'T04', 'T17'}:
        # Lazy import avoids the adapter/validator import cycle. Both seeds must work.
        import from_spec
        for seed in range(2):
            rows, _ = from_spec.generate(spec, seed)
            expenses = -sum(r['amount'] for r in rows if r['amount'] < 0)
            cash = sum(e['amount_rub'] for e in cp['special_events']
                       if e['kind'] in {'cash_out', 'transit'} and e['month'] <= statement_months(spec))
            if traps & {'T03', 'T04'} and (expenses <= 0 or cash < 0.35 * expenses):
                problems.append(f'seed_{seed}: cash_out/transit / expenses={cash / expenses if expenses else 0:.4f} < 0.35')
            if 'T17' in traps:
                stress = sum(r['amount'] * (0.7 if r['label'] in {'inflow', 'operating'} else 1)
                             for r in rows if r['label'] in {'inflow', 'operating', 'mandatory', 'cash', 'enforcement'})
                if stress >= 0:
                    problems.append(f'seed_{seed}: stress flow={stress:.2f} must be negative')
    return problems


def validate(specs, products=None):
    """Return all findings, with errors scoped to individual cases."""
    products = catalog() if products is None else products
    findings = []
    def emit(cid, severity, rule, detail):
        findings.append(dict(case_id=cid, severity=severity, rule=rule, detail=detail))

    if not isinstance(specs, list):
        emit('FILE', 'error', 'schema', 'top-level value must be an array')
        return findings
    by_id = {}
    structurally_valid = []
    for index, spec in enumerate(specs):
        cid = str(spec.get('case_id', f'row-{index}')) if isinstance(spec, dict) else f'row-{index}'
        issues = schema_issues(spec, SCHEMA)
        for issue in issues:
            emit(cid, *issue)
        if any(i[0] == 'error' for i in issues):
            continue
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*-\d{3}', cid):
            emit(cid, 'error', 'case_id', 'expected PRODUCT-NNN; paths must be safe')
        if cid in by_id:
            emit(cid, 'error', 'case_id', 'duplicate case_id')
        by_id[cid] = spec
        structurally_valid.append(spec)
        cp, req, exp = spec['cash_process'], spec['request'], spec['expected']
        season = cp['seasonality']
        if len(season) != 12 or abs(sum(season) - 12) > 0.010000001:
            emit(cid, 'error', 'seasonality', f'length={len(season)}, sum={sum(season):g}; expected 12 +/- 0.01')
        if any(s < 0 for s in season):
            emit(cid, 'error', 'seasonality', 'negative multiplier')
        for key in ('acquiring_share', 'top_customer_share'):
            if not 0 <= cp[key] <= 1:
                emit(cid, 'error', 'range', f'{key} outside [0,1]')
        if cp['months'] <= 0 or cp['revenue_month_rub'] < 0 or cp['rent_rub'] < 0 or req['amount_rub'] <= 0:
            emit(cid, 'error', 'range', 'months/amount must be positive; revenue/rent nonnegative')
        if spec['business'].get('headcount', 0) < 0 or any(not 1 <= d <= 28 for d in cp['payroll_days']):
            emit(cid, 'error', 'range', 'headcount must be nonnegative; payroll_days must be 1..28')
        doc = spec['documents']['bank_statement']
        if doc['present'] and (not re.fullmatch(r'[1-9]\d*m', doc['period'])):
            emit(cid, 'error', 'statement_period', 'present statement needs a positive Nm period')
        if statement_months(spec) != cp['months']:
            emit(cid, 'warn', 'statement_period', f'{doc["period"]} overrides cash_process.months={cp["months"]}')
        for debt in cp['existing_debts']:
            if any(debt[k] < 0 for k in ('balance_rub', 'rate_pct', 'monthly_payment_rub', 'months_left')):
                emit(cid, 'error', 'debt', 'negative balance/rate/payment/months_left')
        for event in cp['special_events']:
            if not 1 <= event['month'] <= cp['months'] or event['amount_rub'] < 0:
                emit(cid, 'error', 'special_event', 'month outside cash_process or negative amount')
            elif event['month'] > statement_months(spec):
                emit(cid, 'warn', 'special_event', 'event outside statement period, omitted from statement')
        for code in exp['reasons']:
            if code not in REASONS:
                emit(cid, 'error', 'reason_code', f'unknown reason {code}')
        for pid in (req['product_asked'], exp['product'], (exp.get('counteroffer') or {}).get('product')):
            if pid is not None and pid not in products:
                emit(cid, 'error', 'product', f'unknown catalogue product {pid}')
        product = products.get(exp['product'] or req['product_asked'])
        if not any(f['case_id'] == cid and f['severity'] == 'error' for f in findings):
            for problem in weak_traps(spec, products.get(req['product_asked']) or product):
                emit(cid, 'error', 'weak_trap', problem)
        if product:
            if exp['outcome'] == 'approve':
                if statement_months(spec) < 12:
                    emit(cid, 'warn', 'approve_statement', 'approve control has less than 12m; core will fire SHORT_STATEMENT')
                if not product['bank_min_amount_rub'] <= req['amount_rub'] <= product['bank_max_amount_rub']:
                    emit(cid, 'error', 'approve_amount', 'requested amount outside catalogue bounds')
                age = spec['business']['age_months']
                if age is None or age < (product['bank_min_business_age_months'] or 0):
                    emit(cid, 'error', 'approve_age', 'business age below catalogue minimum or unknown')
                restricted = set(re.split(r'[;,]\s*', product.get('bank_restricted_uses') or ''))
                if req['purpose_code'] in restricted:
                    emit(cid, 'error', 'approve_purpose', 'restricted purpose')
            if product['bank_collateral'] != 'required' and (
                    'T13' in (exp['trap'] or '').split('+') or 'MISSING_COLLATERAL_INFO' in exp['reasons']):
                emit(cid, 'error', 'collateral_trap', 'T13 requires collateral; this product does not')
        offer = exp.get('counteroffer') or {}
        offered = products.get(offer.get('product'))
        if offered and offer.get('term_months') is not None and not (
                offered.get('bank_min_term_months') or offered.get('bank_max_term_months')):
            emit(cid, 'warn', 'counteroffer_term', 'term_months supplied for a product without a fixed term')

    for spec in structurally_valid:
        cid, twin = spec['case_id'], spec['twin_of']
        peers = [s for s in structurally_valid if s['twin_of'] == cid]
        partner = by_id.get(twin)
        if twin and partner is None:
            emit(cid, 'error', 'twin', f'missing twin {twin}')
        if spec['expected']['trap'] and partner is None and not peers:
            emit(cid, 'error', 'twin', 'trap has no twin (direct or reverse link)')
        if partner:
            diff = differences(spec, partner)
            age_history = {'business.age_months', 'cash_process.months', 'documents.bank_statement.period'}
            t07_history = 'T07' in {spec['expected']['trap'], partner['expected']['trap']} and set(diff) == age_history
            if len(diff) > 2 and not t07_history:
                emit(cid, 'warn', 'twin_diff', f'{twin}: {len(diff)} differing fields: {", ".join(diff)}')

    # A pair is indivisible, including reverse links and structurally invalid sources.
    links = {}
    for spec in specs:
        if not isinstance(spec, dict):
            continue
        cid, twin = spec.get('case_id'), spec.get('twin_of')
        if isinstance(cid, str) and isinstance(twin, str):
            links.setdefault(cid, set()).add(twin)
            links.setdefault(twin, set()).add(cid)
    bad = {f['case_id'] for f in findings if f['severity'] == 'error'}
    pending = sorted(bad)
    while pending:
        cid = pending.pop()
        for peer in sorted(links.get(cid, ())):
            if peer not in bad:
                rule = 'weak_trap' if any(f['case_id'] == cid and f['rule'] == 'weak_trap' for f in findings) else 'collateral_trap_pair' if any(
                    f['case_id'] == cid and f['rule'].startswith('collateral_trap')
                    for f in findings) else 'twin_pair'
                emit(peer, 'error', rule, f'paired case {cid} has validation errors')
                bad.add(peer)
                pending.append(peer)

    counts = Counter(s['expected']['outcome'] for s in structurally_valid)
    combos = [s for s in structurally_valid if '+' in (s['expected']['trap'] or '')]
    base = Counter(s['expected']['outcome'] for s in structurally_valid if s not in combos)
    hidden = sum(s['split'] == 'hidden' for s in structurally_valid)
    summary = ', '.join(f'{k}={counts[k]}' for k in OUTCOMES) + f', combo={len(combos)}, hidden={hidden}'
    factory = len(specs) in (16, 18)
    target = (5, 3, 3, 5, 2) if len(specs) == 18 else (4, 3, 3, 4, 2)
    if factory and (counts != Counter(dict(zip(OUTCOMES, target))) or hidden != 3):
        emit('FILE', 'error', 'outcome_balance', summary + f'; factory target={target}, hidden=3')
    elif len(specs) == 20 and (base != Counter(dict(zip(OUTCOMES, (4, 3, 4, 4, 2)))) or len(combos) != 3 or hidden != 4):
        emit('FILE', 'warn', 'outcome_balance', summary + '; target base=4/3/4/4/2 + 3 combo, hidden=4')
    return findings


def print_report(specs, findings):
    """Print a readable report, including input distribution even when valid."""
    print('case_id | severity | rule | detail')
    for f in findings:
        print(' | '.join(str(f[k]) for k in ('case_id', 'severity', 'rule', 'detail')))
    safe = [s for s in specs if isinstance(s, dict)] if isinstance(specs, list) else []
    counts = Counter(s.get('expected', {}).get('outcome') for s in safe)
    print('SUMMARY ' + ' '.join(f'{k}={counts[k]}' for k in OUTCOMES)
          + f' hidden={sum(s.get("split") == "hidden" for s in safe)}'
          + f' errors={sum(f["severity"] == "error" for f in findings)}'
          + f' warnings={sum(f["severity"] == "warn" for f in findings)}')


def main():
    """CLI returns nonzero when the source contains invalid cases."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    args = parser.parse_args()
    try:
        specs = load_specs(args.file)
    except (ValueError, OSError) as exc:
        print(f'FILE | error | json | {exc}')
        return 1
    findings = validate(specs)
    print_report(specs, findings)
    return int(any(f['severity'] == 'error' for f in findings))


if __name__ == '__main__':
    raise SystemExit(main())
