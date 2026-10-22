"""Adapt v3 specs to the existing deterministic process model."""

from __future__ import annotations

import calendar
import copy
import csv
import datetime as dt
from decimal import Decimal
import io
import random
import re
import zlib

import build as process
import calibrate
import model
from validate_specs import statement_months

# Fixed dataset date: builds never depend on the computer's clock.
AS_OF = dt.date(2026, 10, 22)
LAST_MONTH = dt.date(2026, 9, 1)
TAX_RECIPIENT = 'Казначейство России (ФНС России)'
INDUSTRIES = dict(trade='розница', marketplace='селлер', manufacturing='производство',
                  construction='стройка', services='услуги', it='IT', logistics='перевозки',
                  horeca='общепит', wholesale='розница')
LEGAL_FORMS = dict(IP='ИП', OOO='ООО', SELF_EMPLOYED='самозанятый')


def core_inputs(spec):
    """Map observed request/business facts to golden.json inputs without using labels."""
    req, business = spec['request'], spec['business']
    code = req['purpose_code']
    purpose = ('рефинансирование' if code.startswith('do_') else
               'кассовый разрыв' if code.startswith('cg_') else
               'оборудование' if code.startswith('ap_') else
               'закупка под контракт' if code.startswith('ct_') else
               'сезон' if 'seasonal' in code else 'рост')
    # Null term means a default scenario horizon, not a catalogue term promise.
    need = dict(purpose=purpose, amount_rub=req['amount_rub'], term_months=req['term_months'] or 12,
                repay_from='текущая выручка', asked_for='кредит')
    age = business['age_months']
    years = 'не указан' if age is None else 'меньше года' if age < 12 else '1–3' if age <= 36 else 'больше 3'
    questionnaire = dict(form=LEGAL_FORMS[business['legal_form']], need=purpose,
                         sector=INDUSTRIES[business['industry']], years=years, trend='около нуля')
    return need, questionnaire


def cents(value):
    """Convert serialized money to exact kopecks for checks and balances."""
    return int(Decimal(str(value)).quantize(Decimal('0.01')) * 100)


def seed_for(case_id, number):
    """Use the specified crc32(case_id) + seed number, without hash()."""
    return zlib.crc32(case_id.encode('utf-8')) + number


def client_name(spec, number):
    """Choose a neutral identity from an independent seeded random stream."""
    rnd = random.Random(seed_for(spec['case_id'], number))
    if spec['business']['legal_form'] == 'IP':
        surname = rnd.choice(('Иванов', 'Петров', 'Соколов', 'Орлов', 'Волков', 'Морозов'))
        initials = rnd.choices(('А', 'В', 'Д', 'И', 'М', 'Н', 'П', 'С'), k=2)
        return f'ИП {surname} {initials[0]}. {initials[1]}.'
    if spec['business']['legal_form'] == 'SELF_EMPLOYED':
        return f'Самозанятый {rnd.choice(("Иванов", "Петров", "Соколов"))} А. В.'
    return f'ООО «{rnd.choice(("Вектор", "Горизонт", "Исток", "Маяк", "Спектр", "Контур"))}»'


def date_in_month(year, month, day):
    """Move payments backwards to a working day, staying inside their month."""
    date = model.ensure_workday(dt.date(year, month, min(day, calendar.monthrange(year, month)[1])))
    return date if date.month == month else model.workdays_in_month(year, month)[0]


def parameters(spec):
    """Translate a client description into the legacy process parameters."""
    cp = spec['cash_process']
    count = statement_months(spec)
    year, month = model.month_shift(LAST_MONTH, 1 - count)
    industry = INDUSTRIES[spec['business']['industry']]
    return dict(id=spec['case_id'], start=(year, month, 1), months=count,
                industry=industry, revenue_month_avg=cp['revenue_month_rub'],
                top_share=cp['top_customer_share'], acquiring_share=cp['acquiring_share'],
                marketplace_share=0, mandatory_ratio=model.industry_param(industry, 'mandatory_ratio'),
                operating_ratio=model.industry_param(industry, 'supplier_ratio'),
                supplier_ops_month=12, questionnaire={'form': LEGAL_FORMS[spec['business']['legal_form']]},
                has_loan=False)


def remap_counterparties(ops, spec, rnd):
    """Use supplied counterparties and templates while preserving acquiring labels."""
    parties = spec['cash_process'].get('counterparties', [])
    customers = sorted((p for p in parties if p['role'] == 'customer' and p['share'] > 0),
                       key=lambda p: -p['share'])
    total = sum(r['amount'] for r in ops if r['label'] == 'inflow')
    remainder = sum(r['amount'] for r in ops if r['label'] == 'inflow'
                    and r['counterparty'] != 'ООО «Основной покупатель»'
                    and 'эквайринг' not in r['purpose'].lower())
    secondary = customers[1:]
    secondary_total = sum(p['share'] * total for p in secondary)
    scale = min(1.0, remainder / secondary_total) if secondary_total else 1.0
    result = []

    def assign(row, party):
        """Assign a known party and expand its optional payment template."""
        row['counterparty'] = party['name']
        if party['purpose_templates']:
            row['purpose'] = rnd.choice(party['purpose_templates']).replace('{n}', str(rnd.randint(100, 9999))).replace(
                '{date}', row['date'].strftime('%d.%m.%Y'))

    for op in ops:
        if op['label'] == 'inflow' and customers:
            if op['counterparty'] == 'ООО «Основной покупатель»':
                assign(op, customers[0])
            elif 'эквайринг' not in op['purpose'].lower() and remainder:
                original = op['amount']
                assigned = 0
                for party in secondary:
                    part = copy.copy(op)
                    part['amount'] = original * party['share'] * total * scale / remainder
                    assigned += part['amount']
                    assign(part, party)
                    result.append(part)
                op['amount'] -= assigned
            if op['amount'] > 0:
                result.append(op)
            continue
        role = 'customer' if op['label'] == 'inflow' else 'supplier'
        choices = [p for p in parties if p['role'] == role and p['share'] > 0]
        if choices and 'эквайринг' not in op['purpose'].lower():
            assign(op, rnd.choices(choices, weights=[p['share'] for p in choices])[0])
        result.append(op)
    ops[:] = result


def mandatory_rows(spec, params, months, rnd):
    """Reuse mandatory processes, setting exact rent/payroll/debt dates from the spec."""
    raw = []
    process._add_mandatory(raw, params, months, rnd)
    result = []
    cp = spec['cash_process']
    for year, month in months:
        current = [r for r in raw if (r['date'].year, r['date'].month) == (year, month)]
        wages = sum(-r['amount'] for r in current if 'заработной платы' in r['purpose'])
        # A missing headcount is estimated by the existing process; explicit zero means no payroll.
        if spec['business'].get('headcount') == 0:
            wages = 0
        for day in cp['payroll_days']:
            if wages:
                result.append(dict(date=date_in_month(year, month, day), amount=-wages / len(cp['payroll_days']),
                                   counterparty='Зарплатный проект, реестр',
                                   purpose=f'Заработная плата за {month:02d}.{year} по реестру', label='mandatory'))
        if wages and cp['payroll_days']:
            tax_day = min(28, max(cp['payroll_days']) + 1)
            for text, ratio in (('ЕНП: НДФЛ с заработной платы', 0.13), ('ЕНП: страховые взносы', 0.30)):
                result.append(dict(date=date_in_month(year, month, tax_day), amount=-wages * ratio,
                                   counterparty=TAX_RECIPIENT, purpose=text, label='mandatory'))
        # Retain the model's business tax, with the v3 recipient and deadline.
        for row in current:
            if row.get('inn') == '7727406020':
                row['counterparty'] = TAX_RECIPIENT
                row['date'] = date_in_month(year, month, 28)
                result.append(row)
        if cp['rent_rub']:
            landlords = [p for p in cp.get('counterparties', []) if p['role'] == 'landlord']
            result.append(dict(date=date_in_month(year, month, 5), amount=-cp['rent_rub'],
                               counterparty=landlords[0]['name'] if landlords else 'ООО «АрендаПлюс»',
                               purpose=f'Арендная плата за {month:02d}.{year}', label='mandatory'))
    # Debt schedules begin at the first statement month, using precisely the same amortization.
    for row in debt_schedule(spec, months[0]):
        date = dt.date.fromisoformat(row['date'])
        if (date.year, date.month) in months:
            result.append(dict(date=date, amount=-row['payment_rub'], counterparty=row['lender'],
                               purpose='Погашение кредита: основной долг и проценты', label='mandatory'))
    return result


def debt_schedule(spec, first_month):
    """Amortize each existing debt for months_left, capping the final payment."""
    result = []
    for number, debt in enumerate(spec['cash_process']['existing_debts'], 1):
        balance = cents(debt['balance_rub'])
        for index in range(debt['months_left']):
            year, month = model.month_shift(dt.date(*first_month, 1), index)
            interest = round(balance * debt['rate_pct'] / 1200)
            due = balance + interest
            payment = due if index == debt['months_left'] - 1 else min(cents(debt['monthly_payment_rub']), due)
            principal = payment - interest
            closing = balance - principal
            result.append(dict(debt_id=number, lender=debt['lender'], month=index + 1,
                               date=date_in_month(year, month, 15).isoformat(),
                               opening_balance_rub=balance / 100, principal_rub=principal / 100,
                               interest_rub=interest / 100, payment_rub=payment / 100,
                               closing_balance_rub=closing / 100))
            balance = closing
    return result


def special_events(ops, spec, months, rnd):
    """Apply supplied events, preserving their amounts rather than inventing expected stops."""
    for index, event in enumerate(spec['cash_process']['special_events']):
        if event['month'] > len(months):
            continue
        year, month = months[event['month'] - 1]
        date = date_in_month(year, month, 18)
        amount, kind, purpose = event['amount_rub'], event['kind'], event['purpose_text']
        def add(value, cp, text, label):
            ops.append(dict(date=date, amount=value, counterparty=cp, purpose=text, label=label))
        if kind == 'revenue_drop':
            inflows = [r for r in ops if r['label'] == 'inflow' and (r['date'].year, r['date'].month) == (year, month)]
            balances = [cents(round(r['amount'], 2)) for r in inflows]
            total = sum(balances)
            reduction = cents(amount)
            if reduction > total:
                raise ValueError(f'{spec["case_id"]}: revenue_drop exceeds revenue in month {event["month"]}')
            if total:
                # Largest-remainder allocation preserves the exact stated drop after CSV rounding.
                allocated = [value * reduction // total for value in balances]
                remainder = reduction - sum(allocated)
                order = sorted(range(len(balances)), key=lambda i: (-(balances[i] * reduction % total), i))
                for i in order[:remainder]:
                    allocated[i] += 1
                for row, balance, cut in zip(inflows, balances, allocated):
                    row['amount'] = (balance - cut) / 100
                    row['purpose'] += '; ' + purpose
        elif kind == 'enforcement':
            match = re.search(r'№\s*([\d/-]+)', purpose)
            number = match[1] if match else str(100000 + rnd.randrange(900000))
            add(-amount, 'Банк: взыскание по исполнительному листу ФССП',
                f'Инкассовое поручение банка по исполнительному листу ФССП; ИП № {number}/{year}/77001-ИП; {purpose}', 'enforcement')
        elif kind == 'cash_out':
            half = cents(amount) // 2 / 100
            add(-half, 'Банк', f'Снятие наличных через кассу; {purpose}', 'cash')
            add(-(amount - half), 'Иванов Иван Иванович', f'Перевод физическому лицу; {purpose}', 'cash')
        elif kind == 'transit':
            add(amount, 'ООО «Транзит входящий»', purpose, 'inflow')
            add(-amount, 'Иванов Иван Иванович', 'Перевод физическому лицу; ' + purpose, 'cash')
        elif kind == 'self_transfer':
            add(amount, 'Собственник, личная карта', 'Перевод собственных средств; ' + purpose, 'transfer')
        elif kind == 'one_off_big_inflow':
            add(amount, 'ООО «Разовый заказчик»', purpose, 'inflow')
        elif kind == 'tax_arrears':
            add(-amount, TAX_RECIPIENT, 'ЕНП: погашение налоговой задолженности; ' + purpose, 'mandatory')


def generate(spec, number):
    """Generate processes, calibrate supplier costs and calculate exact balances."""
    params = parameters(spec)
    months = process._month_list(params)
    rnd = random.Random(seed_for(spec['case_id'], number))
    ops, suppliers = [], []
    for year, month in months:
        monthly = dict(params, months=1)
        monthly['revenue_month_avg'] *= spec['cash_process']['seasonality'][month - 1]
        if monthly['revenue_month_avg'] > 0:
            process._add_inflows(ops, monthly, [(year, month)], rnd)
            # Generate supplier processes one month at a time with the same seasonal scale.
            monthly['start'] = (year, month, 1)
            batch = []
            new_suppliers = process._add_suppliers(batch, monthly, [(year, month)], rnd)
            ops.extend(batch)
            suppliers.extend(new_suppliers)
    # The model chooses a top customer per call; v3 retains one identity across months.
    for row in ops:
        if row['counterparty'].startswith('ООО «ГлавЗаказчик-'):
            row['counterparty'] = 'ООО «Основной покупатель»'
    remap_counterparties(ops, spec, rnd)
    ops.extend(mandatory_rows(spec, params, months, rnd))
    special_events(ops, spec, months, rnd)
    outgoing, commissions = process._add_commissions(ops, rnd)
    # Calibrate variable costs to seasonal sales after revenue drops; never target an expected outcome.
    sales = sum(params['revenue_month_avg'] * spec['cash_process']['seasonality'][m - 1] for _, m in months)
    sales -= sum(e['amount_rub'] for e in spec['cash_process']['special_events']
                 if e['kind'] == 'revenue_drop' and e['month'] <= len(months))
    supplier_target = max(0, sales) * params['operating_ratio']
    target = calibrate.flow_sum(ops) - sum(r['amount'] for r in suppliers) - supplier_target
    if suppliers:
        if supplier_target:
            calibrate.calibrate_tunable(ops, target, suppliers)
        else:
            for row in suppliers:
                row['amount'] = 0
    calibrate.round_amounts(ops, target_total=round(target, 2), anchor_filter=lambda r: r in suppliers)
    for row in ops:
        row['inn'] = process.inn_for(spec['case_id'] if row['label'] == 'transfer' else row['counterparty'])
        row['date'] = date_in_month(row['date'].year, row['date'].month, row['date'].day)
    ops.sort(key=lambda r: (r['date'], -r['amount']))
    running, lowest = 0, 0
    for row in ops:
        running += cents(row['amount'])
        lowest = min(lowest, running)
    opening = -lowest + 3_500_000
    if ops:
        meta = process.make_meta(params, ops, {'opening': opening / 100, 'closing': (opening + running) / 100})
    else:
        meta = dict(owner=client_name(spec, number),
                    opening=opening / 100, closing=opening / 100, credit_total=0, debit_total=0, turnover=0)
    meta['owner'] = client_name(spec, number)
    meta['account'] = '40702810' + f'{zlib.crc32(spec["case_id"].encode("utf-8")):012d}'
    meta['outgoing_orders'], meta['commission_count'] = outgoing, commissions
    meta['start'] = dt.date(*months[0], 1).isoformat()
    meta['end'] = dt.date(*months[-1], calendar.monthrange(*months[-1])[1]).isoformat()
    meta['period'] = f'{meta["start"]} - {meta["end"]}'
    return ops, meta


def document_metadata(config):
    """Classify old reporting years relative to the fixed dataset date."""
    year = re.match(r'^(\d{4})$', config['period'])
    return {**config, 'stale': bool(year and int(year[1]) < AS_OF.year - 1),
            'as_of': AS_OF.isoformat(), 'currency': 'RUB'}


def mismatch_values(values, config):
    """Apply a stated percentage mismatch; stale notes do not invent numerical errors."""
    if config['consistent']:
        return values
    note = config['note'].lower()
    percent = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:%|процент)', note)
    if not percent:
        if any(word in note for word in ('год', 'устар', 'стар', 'период')):
            return values
        raise ValueError(f'Cannot realize consistent=false without a numerical rule: {config["note"]}')
    factor = float(percent[1].replace(',', '.')) / 100
    if any(word in note for word in ('выше', 'больше', 'завыш', 'увелич')):
        factor = 1 + factor
    elif any(word in note for word in ('ниже', 'меньше', 'заниж', 'уменьш')):
        factor = 1 - factor
    else:
        raise ValueError(f'Mismatch direction is unspecified: {config["note"]}')
    targets = ('2110', 'revenue_rub')
    if any(word in note for word in ('себестоим', 'расход')):
        targets = ('2120', 'cost_rub')
    elif 'прибыл' in note:
        targets = ('2400', 'profit_rub')
    elif 'баланс' in note or 'актив' in note:
        targets = ('1600', 'assets_rub')
    changed = False
    for key in targets:
        if key in values:
            values[key] = round(values[key] * factor, 2)
            changed = True
    if not changed:
        raise ValueError(f'Mismatch note does not match document fields: {config["note"]}')
    return values


def documents(spec, ops, meta):
    """Produce only present documents, deriving financial figures from this seed's rows."""
    revenue = sum(cents(r['amount']) for r in ops if r['label'] == 'inflow' and r['amount'] > 0) / 100
    costs = sum(-cents(r['amount']) for r in ops if r['amount'] < 0 and r['label'] in calibrate.FLOW_LABELS) / 100
    profit = round(revenue - costs, 2)
    debt = sum(d['balance_rub'] for d in spec['cash_process']['existing_debts'])
    cash = meta['closing']
    # All amounts are rubles, explicitly recorded instead of implicitly using thousands.
    assets = round(max(cash, debt) + revenue * 0.3, 2)
    base = dict(revenue_rub=round(revenue, 2), cost_rub=round(costs, 2), profit_rub=profit)
    payloads = {
        'balance_sheet': {'form': '0710001', 'unit': 'RUB',
                          'lines': {'1150': round(assets - cash, 2), '1250': cash,
                                    '1200': cash, '1600': assets, '1300': round(assets - debt, 2),
                                    '1510': debt, '1500': debt, '1700': assets}},
        'income_statement': {'form': '0710002', 'unit': 'RUB',
                             'lines': {'2110': round(revenue, 2), '2120': round(-costs, 2),
                                       '2100': profit, '2300': profit, '2400': profit}},
        'financial_model': {**base, 'period_months': statement_months(spec),
                            'monthly_free_cashflow_rub': round(profit / statement_months(spec), 2),
                            'requested_amount_rub': spec['request']['amount_rub']},
        'business_plan': {**base, 'purpose_code': spec['request']['purpose_code'],
                          'purpose_text': spec['request']['purpose_text'],
                          'requested_amount_rub': spec['request']['amount_rub'],
                          'term_months': spec['request']['term_months']},
    }
    result = {}
    for name, config in spec['documents'].items():
        if name == 'bank_statement' or not config['present']:
            continue
        metadata = document_metadata(config)
        if name == 'existing_debt_schedule':
            if not config['consistent']:
                raise ValueError('Inconsistent debt schedule needs a supported numeric rule')
            first = dt.date.fromisoformat(meta['start'])
            schedule = debt_schedule(spec, (first.year, first.month))
            buffer = io.StringIO(newline='')
            fields = ['debt_id', 'lender', 'month', 'date', 'opening_balance_rub', 'principal_rub',
                      'interest_rub', 'payment_rub', 'closing_balance_rub', 'period', 'stale', 'note']
            writer = csv.DictWriter(buffer, fields, lineterminator='\n')
            writer.writeheader()
            for row in schedule:
                writer.writerow({**row, **{key: metadata[key] for key in ('period', 'stale', 'note')}})
            result[name + '.csv'] = buffer.getvalue().encode('utf-8')
        else:
            payload = copy.deepcopy(payloads[name])
            mismatch_values(payload.get('lines', payload), config)
            result[name + '.json'] = {**metadata, **payload}
    return result
