"""Create seven deterministic, catalogue-driven batches using only the stdlib."""

from collections import Counter
import copy
import json
import random
import zlib

from validate_specs import ROOT, DOCS, catalog, differences, validate

SEASONS = ([1.0] * 12,
           [0.7, 0.7, 0.8, 0.9, 1.1, 1.4, 1.5, 1.4, 1.1, 0.9, 0.8, 0.7],
           [1.5, 1.4, 1.1, 0.9, 0.8, 0.7, 0.7, 0.7, 0.8, 0.9, 1.1, 1.4])
PURPOSES = dict(cg_supplier_due='оплатить поставщику', cg_payroll_due='выплатить зарплату',
                cg_rent_utilities='оплатить аренду и коммунальные услуги', cg_taxes='уплатить налоги',
                cg_customer_delay='покрыть задержку оплаты покупателя', cg_seasonal_gap='покрыть сезонный разрыв',
                wc_goods_restock='закупить товары',
                wc_raw_materials='закупить сырьё', wc_regular_expenses='оплатить текущие расходы',
                wc_marketplace_inventory='пополнить склад маркетплейса', wc_seasonal_stock='закупить сезонный запас',
                ap_machinery='купить станок', ap_vehicle='купить автомобиль', ap_premises='купить помещение',
                ap_software_it='купить программное обеспечение', ex_new_outlet='открыть торговую точку',
                ex_capacity='расширить производство', ex_new_market='выйти на новый рынок',
                ex_modernization='обновить производство', ct_materials='купить материалы по контракту',
                ct_supplier_advance='внести аванс поставщику', ct_milestone_expenses='оплатить этап работ',
                do_refinance='рефинансировать текущий кредит', do_consolidate='объединить бизнес-кредиты',
                do_reduce_installment='снизить кредитный платёж')


def narrative(spec, style):
    """Render two factual sentences in one of three client voices."""
    purpose = spec['request']['purpose_text']
    return (f'Нужно {purpose}, сумма в заявке. Верну из выручки по договорам.',
            f'хачу {purpose}, сумма в заявке. выручка есть, выпеску приложил.',
            f'Просим рассмотреть финансирование в заявленном объёме, чтобы {purpose}. '
            'Источником погашения выступают поступления от основной деятельности.')[style % 3]


def base_case(product, pair, rnd):
    """Build a healthy baseline with industry, purpose and terms from the catalogue."""
    pid = product['id']
    industries = product['mvp_priority_industry_examples'].split(';')
    industry = industries[pair % len(industries)]
    purposes = sorted(k[4:] for k, value in product.items() if k.startswith('fit_') and value == 2)
    purpose = purposes[rnd.randrange(len(purposes))]
    amount = max(product['bank_min_amount_rub'], min(1_000_000, product['bank_max_amount_rub']))
    term = product['bank_min_term_months'] or product['bank_tranche_max_months'] or 24
    term = min(term, product['bank_max_term_months'] or term)
    revenue = rnd.randrange(3_000_000, 5_000_001, 100_000)
    debts = []
    if pid == 'ALFA_REFI':
        debts = [dict(lender='Тестовый банк Север', balance_rub=amount, rate_pct=28,
                      monthly_payment_rub=round(amount / 18), months_left=24)]
    result = dict(case_id='', split='public', twin_of=None,
                  business=dict(legal_form=('IP', 'OOO')[pair % 2], okved='62.01' if industry == 'it' else '46.90',
                                industry=industry, region=rnd.choice(('Казань', 'Самара', 'Томск', 'Пермь')),
                                age_months=36, registered=True, tax_regime='USN6', headcount=0),
                  request=dict(product_asked=pid, amount_rub=amount, term_months=term,
                               purpose_code=purpose, purpose_text=PURPOSES[purpose]),
                  cash_process=dict(months=12, revenue_month_rub=revenue, seasonality=list(SEASONS[pair % 3]),
                                    acquiring_share=0.1, top_customer_share=0.2, payroll_days=[10, 25],
                                    rent_rub=round(revenue * 0.03), existing_debts=debts,
                                    special_events=[], counterparties=[]),
                  documents={name: dict(present=True, period='12m' if name == 'bank_statement' else '2026',
                                        consistent=True, note='') for name in DOCS},
                  collateral=(dict(type='real_estate', owner='business', value_rub=amount * 3)
                              if product['bank_collateral'] == 'required' else None),
                  narrative='', expected={})
    return result


def expensive(spec, product):
    """Give a control a documented reason for a smaller counteroffer."""
    spec['request']['amount_rub'] = product['bank_max_amount_rub'] * 2


def make_pair(product, pair, trap, outcomes, rnd):
    """Change one trap; T07 also keeps statement history consistent with age."""
    control = base_case(product, pair, rnd)
    cp = control['cash_process']
    reasons, missing, offer = [], [], None
    # Baseline issues remain real when removal of the primary trap is not approval.
    if outcomes[1] == 'request_info':
        control['documents']['financial_model']['present'] = False
    if outcomes[1] == 'counteroffer':
        expensive(control, product)
    if outcomes[1] == 'clarify':
        control['business']['age_months'] = None
    if trap == 'T18':
        cp['special_events'] = [dict(kind='self_transfer', month=m, amount_rub=cp['revenue_month_rub'],
                                     purpose_text='Пополнение с личного счёта') for m in range(1, 13)]
    if trap == 'T10':
        # Both twins are affordable approvals; only the customer's rate claim differs.
        control['request']['amount_rub'] = product['bank_min_amount_rub']
    original = copy.deepcopy(control)
    if trap == 'T01':
        original['cash_process']['special_events'] = [
            dict(kind='enforcement', month=m, amount_rub=25000,
                 purpose_text=f'Инкассовое поручение ФССП № {10000 + m}') for m in (9, 11)]
        reasons = ['ENFORCEMENT']
    elif trap == 'T02':
        original['cash_process']['special_events'] = [
            dict(kind='enforcement', month=10, amount_rub=1300,
                 purpose_text='Частичное взыскание по исполнительному производству № 77110')]
        reasons = ['ENFORCEMENT']
    elif trap == 'T03':
        original['cash_process']['special_events'] = [
            dict(kind='cash_out', month=m, amount_rub=cp['revenue_month_rub'] * 2,
                 purpose_text='Снятие наличных и перевод физическому лицу') for m in range(1, 13)]
        reasons = ['CASH_OUT']
    elif trap == 'T18':
        original['cash_process']['revenue_month_rub'] = 0
        reasons = ['NO_FREE_CASHFLOW']
    elif trap == 'T18b':
        original['business']['legal_form'] = 'SELF_EMPLOYED'
        reasons = ['NOT_BUSINESS']
    elif trap == 'T06':
        original['documents']['bank_statement']['period'] = '4m'
        reasons, missing = ['SHORT_STATEMENT'], ['bank_statement']
    elif trap == 'T07':
        original['business']['age_months'] = 6
        original['cash_process']['months'] = 6
        original['documents']['bank_statement']['period'] = '6m'
        reasons = ['TOO_YOUNG']
        offer = dict(product='ALFA_START', amount_rub=min(1_000_000, control['request']['amount_rub']), term_months=6)
    elif trap == 'T08':
        original['request']['purpose_code'] = 'ap_machinery'
        # purpose_text is deliberately generic in both twins, only purpose_code changes.
        control['request']['purpose_text'] = original['request']['purpose_text'] = 'оплатить приобретение по договору'
        reasons = ['RESTRICTED_PURPOSE']
        offer = dict(product='ALFA_LUMP_UNSEC', amount_rub=1_000_000, term_months=12)
    elif trap == 'T10':
        original['narrative'] = 'Нужны деньги на закупку. Считаю 0,3% в день дешевле 20% годовых.'
    elif trap == 'T11':
        original['request']['amount_rub'] = 55_000_000
    elif trap == 'T12':
        original['documents']['existing_debt_schedule']['present'] = False
        reasons, missing = ['MISSING_SCHEDULE'], ['existing_debt_schedule']
    elif trap == 'T13':
        original['collateral'] = None
        reasons = ['MISSING_COLLATERAL_INFO']
    elif trap == 'T17':
        # Fixed rent consumes margin under stress; variable suppliers still fall by 30%.
        import from_spec
        rows, _ = from_spec.generate(control, 0)
        inflow = sum(r['amount'] for r in rows if r['label'] == 'inflow') / 12
        expenses = -sum(r['amount'] for r in rows if r['amount'] < 0) / 12
        variable = -sum(r['amount'] for r in rows if r['label'] == 'operating') / 12
        stress = 0.7 * inflow - expenses + 0.3 * variable
        original['cash_process']['rent_rub'] += round(max(0, stress) + inflow * 0.08)
        reasons = ['STRESS_NEGATIVE_FLOW']
    elif trap == 'T19':
        original['request']['purpose_code'] = 'dividends'
        control['request']['purpose_text'] = original['request']['purpose_text'] = 'перечислить деньги по назначению'
        reasons = ['RESTRICTED_PURPOSE']
    elif trap == 'T20':
        original['narrative'] = 'нужна закупка таваров по догавору. Возраст бизнеса щас не помню.'
    elif trap == 'T05':
        original['cash_process']['top_customer_share'] = 0.9
        reasons = ['CONCENTRATION_ONE_CUSTOMER']
    for offset, (spec, outcome) in enumerate(zip((original, control), outcomes)):
        spec['case_id'] = f'{product["id"]}-{pair * 2 + offset + 1:03d}'
        spec['twin_of'] = original['case_id'] if offset else None
        if not spec['narrative']:
            spec['narrative'] = narrative(spec, pair)
        baseline_reasons = []
        baseline_missing = ['financial_model'] if outcome == 'request_info' and offset else []
        spec['expected'] = dict(product=product['id'], outcome=outcome,
                                counteroffer=offer if not offset else None,
                                reasons=baseline_reasons if offset else reasons,
                                trap=None if offset else trap, missing_docs=baseline_missing if offset else missing,
                                why=(f'{trap}: проверка признака; условия bank_min_business_age_months, '
                                     'bank_max_amount_rub, bank_collateral и fit_* взяты из каталога.' if not offset else
                                     f'Контроль без {trap}; ' + {
                                         'approve': 'сумма, срок и цель допустимы, поток положительный.',
                                         'counteroffer': 'запрошенная сумма требует уменьшения до доступного лимита.',
                                         'request_info': 'нужна отсутствующая финансовая модель.',
                                         'clarify': 'не указан возраст бизнеса.'}[outcome]))
        if outcome == 'counteroffer' and spec['expected']['counteroffer'] is None:
            spec['expected']['counteroffer'] = dict(product=product['id'],
                                                     amount_rub=product['bank_min_amount_rub'],
                                                     term_months=spec['request']['term_months'])
    diff = differences(original, control)
    assert len(diff) == (0 if trap in {'T10', 'T20'} else 3 if trap == 'T07' else 1), (trap, diff)
    return [original, control]


def make_specs(product):
    """Allocate exact outcome totals and three hidden examples for one product."""
    rnd = random.Random(zlib.crc32(product['id'].encode('ascii')))
    plan = [('T01', ('reject', 'approve')), ('T03', ('reject', 'approve')),
            ('T18', ('reject', 'request_info')), ('T06', ('request_info', 'approve'))]
    pid = product['id']
    if pid == 'ALFA_START':
        # Offset the second approval in the rate pair with a smaller-limit control.
        plan[0] = ('T01', ('reject', 'counteroffer'))
        extras = [('T10', ('approve', 'approve')), ('T17', ('counteroffer', 'counteroffer')),
                  ('T19', ('reject', 'request_info')), ('T20', ('clarify', 'clarify'))]
    elif pid == 'ALFA_DELO':
        extras = [('T17', ('counteroffer', 'approve')), ('T05', ('counteroffer', 'counteroffer')),
                  ('T02', ('reject', 'request_info')), ('T13', ('clarify', 'clarify'))]
    elif pid == 'ALFA_NCL_SEC':
        extras = [('T07', ('counteroffer', 'counteroffer')), ('T13', ('clarify', 'counteroffer')),
                  ('T19', ('reject', 'request_info')), ('T11', ('clarify', 'request_info'))]
        # The extra clarification pair shifts approval onto the self-transfer control.
        plan[2] = ('T18', ('reject', 'approve'))
    else:
        middle = ('T08' if pid == 'ALFA_RCL_UNSEC' else 'T12' if pid == 'ALFA_REFI' else 'T17')
        extras = [('T07', ('counteroffer', 'approve')),
                  (middle, ('request_info' if middle == 'T12' else 'counteroffer', 'counteroffer')),
                  ('T19', ('reject', 'request_info')),
                  ('T13' if product['bank_collateral'] == 'required' else 'T20', ('clarify', 'clarify'))]
        if middle == 'T12':
            extras[2] = ('T19', ('reject', 'counteroffer'))
    specs = [s for pair, (trap, outcomes) in enumerate(plan + extras)
             for s in make_pair(product, pair, trap, outcomes, rnd)]
    for outcome in ('approve', 'reject', 'counteroffer'):
        next(s for s in specs if s['expected']['outcome'] == outcome)['split'] = 'hidden'
    assert max(Counter(s['business']['industry'] for s in specs).values()) <= 4
    if pid in {'ALFA_LUMP_SEC', 'ALFA_LUMP_UNSEC', 'ALFA_RCL_UNSEC', 'ALFA_REFI'}:
        specs.extend(make_pair(product, 8, 'T18b', ('reject', 'approve'), rnd))
    errors = [f for f in validate(specs) if f['severity'] == 'error']
    if errors:
        raise ValueError(json.dumps(errors, ensure_ascii=False))
    return specs


def main():
    """Write factory JSON only after every generated batch passes validation."""
    batches = {pid: make_specs(p) for pid, p in sorted(catalog().items()) if pid != 'ALFA_OVERDRAFT'}
    # Gemini's weak cash traps are rejected, and its batch has no T18 at all.
    # Preserve that source verbatim; add only the missing strong pairs under new IDs.
    product = catalog()['ALFA_OVERDRAFT']
    rnd = random.Random(zlib.crc32(product['id'].encode('ascii')))
    supplement = [s for pair, trap, outcomes in ((50, 'T03', ('reject', 'approve')),
                                                (51, 'T18', ('reject', 'request_info')))
                  for s in make_pair(product, pair, trap, outcomes, rnd)]
    errors = [f for f in validate(supplement) if f['severity'] == 'error']
    assert not errors, errors
    batches['ALFA_OVERDRAFT'] = supplement
    directory = ROOT / 'data/hidden/specs'
    directory.mkdir(parents=True, exist_ok=True)
    for pid, specs in batches.items():
        (directory / f'{pid}.factory.json').write_text(json.dumps(specs, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{pid}: specs={len(specs)} hidden={sum(s["split"] == "hidden" for s in specs)} '
              + ('outcomes=4/3/3/4/2' if len(specs) == 16 else
                 'outcomes=5/3/3/5/2 includes=T18b' if len(specs) == 18 else 'supplement=T03/T18'))
    print(f'FACTORY OK products={len(batches)} specs={sum(map(len, batches.values()))}')


if __name__ == '__main__':
    main()
