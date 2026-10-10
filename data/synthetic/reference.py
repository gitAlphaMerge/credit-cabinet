"""Эталонный расчёт: исполняемая версия context/stop-rules.md.

Считает по колонке label, то есть знает правильный ответ на классификацию операций.
Ядро Лизы label не видит и должно прийти к тем же цифрам по назначению и контрагенту.
Отсюда считаются ожидания в data/golden.json; правишь правило в stop-rules.md, правь и здесь.
"""
from collections import defaultdict

PARAMS = {
    "rate": 0.24,            # допущение до таблицы Толи
    "dscr_min": 1.25,
    "stress": 0.30,
    "variable_share": 0.5,   # доля материалов в выручке по новому договору
    "concentration": 0.70,
    "cash_share": 0.30,
    "min_months": 6,
    "full_months": 12,
    "min_ops": 30,
}

INSTRUMENT = {  # черновик до hw/tolya/instruments.md
    "кассовый разрыв": "овердрафт",
    "закупка под контракт": "кредитная линия",
    "оборудование": "лизинг",
    "сезон": "кредитная линия",
    "рост": "кредит на развитие",
}

IN = {"inflow"}
OUT = {"mandatory", "operating", "cash", "enforcement"}


def annuity(rate, term):
    i = rate / 12
    return (1 - (1 + i) ** -term) / i


def reference(rows, need, q, p=PARAMS):
    """rows: dict(date 'YYYY-MM-DD', amount float, counterparty, purpose, label)."""
    by_month = defaultdict(lambda: defaultdict(float))
    for r in rows:
        by_month[r["date"][:7]][r["label"]] += r["amount"]
    months = sorted(by_month)
    n = len(months)
    m_flow = {m: sum(v for k, v in by_month[m].items() if k in IN | OUT) for m in months}
    avg = lambda lab: sum(by_month[m][lab] for m in months) / n
    flow = sum(m_flow.values()) / n
    inflow = avg("inflow")

    # стопы по порядку
    stops = []
    if q["form"] not in ("ИП", "ООО"):
        stops.append(("NOT_BUSINESS", "нужен менеджер"))
    if q["years"] == "меньше года" or n < p["min_months"]:
        stops.append(("TOO_YOUNG", "нужен менеджер"))
    if n < p["full_months"] or len(rows) < p["min_ops"]:
        stops.append(("SHORT_STATEMENT", "можно после шага"))
    if flow <= 0:
        stops.append(("NO_FREE_CASHFLOW", "нужен менеджер"))
    if any(r["label"] == "enforcement" for r in rows):
        stops.append(("ENFORCEMENT", "нужен менеджер"))
    cash = -sum(r["amount"] for r in rows if r["label"] == "cash")
    if inflow > 0 and cash / (inflow * n) > p["cash_share"]:
        stops.append(("CASH_OUT", "нужен менеджер"))

    # коды причин
    reasons, missing = [], []
    payers = defaultdict(float)
    for r in rows:
        if r["label"] == "inflow" and "эквайринг" not in r["counterparty"].lower():
            payers[r["counterparty"]] += r["amount"]
    total_in = sum(r["amount"] for r in rows if r["label"] == "inflow")
    top_share = max(payers.values()) / total_in if payers else 0
    if top_share > p["concentration"]:
        reasons.append("CONCENTRATION_ONE_CUSTOMER")
        missing += ["contract_main_customer", "reconciliation_act"]
    stress_flow = avg("inflow") * (1 - p["stress"]) + avg("mandatory") + avg("operating") * (1 - p["stress"]) \
        + avg("cash") + avg("enforcement")
    if stress_flow < 0 and flow > 0:
        reasons.append("STRESS_NEGATIVE_FLOW")
    if flow > 0 and any(v < 0 for v in m_flow.values()):
        reasons.append("CASH_GAP")
    if any(s == "SHORT_STATEMENT" for s, _ in stops):
        missing.insert(0, "statement_12m")

    # лимиты
    a = annuity(p["rate"], need["term_months"])
    limit_now = max(flow, 0) / p["dscr_min"] * a
    flow_after = flow
    contract = need.get("contract_with_main_customer")
    if contract and "contract_main_customer" in missing:
        flow_after += contract["sum_rub"] / contract["months"] * (1 - p["variable_share"])
    limit_after = max(flow_after, 0) / p["dscr_min"] * a

    instrument = INSTRUMENT[need["purpose"]]
    if stops:
        status = stops[0][1]
    elif need.get("asked_for", "кредит") == "кредит" and instrument in ("лизинг", "гарантия"):
        status = "лучше другой инструмент"
    elif need["amount_rub"] <= limit_now:
        status = "можно подавать"
    elif need["amount_rub"] <= limit_after:
        status = "можно после шага"
    else:
        status = "нужен менеджер"

    return {
        "status": status,
        "instrument": instrument,
        "stops_fired": [s for s, _ in stops],
        "reasons": reasons,
        "missing": missing,
        "flow_month_rub": flow,
        "limit_now_rub": limit_now,
        "limit_after_rub": limit_after,
        "evidence": {
            "months": n, "operations": len(rows),
            "avg_month_rub": {lab: round(avg(lab)) for lab in ("inflow", "mandatory", "operating", "cash", "enforcement")},
            "flow_by_month": {m: round(v) for m, v in m_flow.items()},
            "top_payer_share": round(top_share, 3),
            "cash_share": round(cash / (inflow * n), 3) if inflow > 0 else None,
            "stress_flow_month_rub": round(stress_flow),
        },
    }
