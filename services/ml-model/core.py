# services/ml-model/core.py
"""Ядро ступенек 1 и 2: парсинг, скоринг, лимиты и подбор 8 продуктов Альфа-Банка."""

import csv
import statistics
from collections import defaultdict
from datetime import datetime

PARAMS = {
    "dscr_min": 1.25,
    "stress": 0.30,
    "variable_share": 0.5,
    "concentration": 0.70,
    "cash_share": 0.30,
    "min_months": 6,
    "full_months": 12,
    "min_ops": 30,
    "pair_amount_tol": 0.15,
    "pair_days": 180,
}

# 8 продуктов из таблицы Толи
PRODUCTS_DB = {
    "ALFA_LUMP_UNSEC": {"rate": 0.235},
    "ALFA_LUMP_SEC": {"rate": 0.215},
    "ALFA_RCL_UNSEC": {"rate": 0.235},
    "ALFA_NCL_SEC": {"rate": 0.220},
    "ALFA_OVERDRAFT": {"rate": 0.260},
    "ALFA_START": {"rate": 1.095}, # 0.3% в день * 365
    "ALFA_DELO": {"rate": 0.155},
    "ALFA_REFI": {"rate": 0.140},
}

IN_LABELS = {"inflow"}
OUT_LABELS = {"mandatory", "loan", "operating", "cash", "enforcement"}

# Маркеры
GOV_MARKERS = ("уфк", "фнс", "фед", "казначейств", "налогов", "фссп", "гуфссп", "фсс", "сфр", "пфр", "росреестр", "таможн", "гибдд")
BANK_MARKERS = ("банк", "сбер", "втб", "альфа", "т-банк", "тинькофф", "открытие", "райффайзен", "росбанк", "газпромбанк", "псб", "совкомбанк")
AGGREGATED_MARKERS = ("эквайринг", "сбп", "торговый эквайринг", "ozon", "ozon банк", "wildberries", "яндекс", "яндекс.маркет")
OWNER_MARKERS = ("дивиденд", "распределение прибыли", "на личную карту", "собственные средства ип", "выплата участнику", "выплата собственнику", "доход участника")
CASH_MARKERS = ("снятие наличн", "выдача наличн", "под отчёт", "подотчёт", "банкомат", "выдача под", "на хозяйственные нужды")
SELF_TRANSFER_MARKERS = ("собственных средств", "между своими", "между счетами", "на свой счёт", "на счёт в другом", "своего счёта", "в другой банк")
LOAN_MARKERS = ("займ", "заём", "loan", "финансовая помощь")
ENFORCE_MARKERS = ("инкассов", "исполнительн", "взыскан", "арест")
SALARY_MARKERS = ("заработн", "оплата труда", "выплата зп", "аванс по заработ", "зп за", "перечисление зп")
TAX_MARKERS = ("налог", "енп", "енс ", "енс,", "ндфл", "усн", "взнос", "страховые", "единый налоговый")
CREDIT_MARKERS = ("погашение кредита", "платёж по кредиту", "платеж по кредиту", "проценты по кредиту", "кредитн", "кредит №")
LEGAL_FORMS = ("ооо", "оао", "зао", "пао", "ао ", "ип ", "фгбу", "фгбоу", "фгуп", "мбу", "гуп")

def _has_any(text, keys): return any(k in text for k in keys)
def _is_government(cp): return _has_any(cp, GOV_MARKERS)
def _is_aggregated(cp): return _has_any(cp, AGGREGATED_MARKERS)
def _is_individual(cp): return not any(f in cp for f in LEGAL_FORMS)

def classify(amount, counterparty, purpose, client_inn=None, cp_inn=None):
    p = (purpose or "").lower()
    cp = (counterparty or "").lower()

    if _has_any(p, ENFORCE_MARKERS) or "фссп" in cp or "гуфссп" in cp: return "enforcement"
    if client_inn and cp_inn and str(client_inn).strip() == str(cp_inn).strip(): return "transfer"
    if _has_any(p, SELF_TRANSFER_MARKERS): return "transfer"
    if _has_any(p, CASH_MARKERS): return "cash"
    if _has_any(p, OWNER_MARKERS): return "owner"
    if _has_any(p, LOAN_MARKERS): return "financing"
    
    if _is_government(cp) or "зарплатн" in cp or ("реестр" in p and "зарплат" in p): return "mandatory"
    if _has_any(p, SALARY_MARKERS): return "mandatory"
    if _has_any(p, TAX_MARKERS): return "mandatory"
    if "аренд" in p: return "mandatory"
    if "лизинг" in p: return "mandatory"
    if _has_any(p, CREDIT_MARKERS): return "loan" 
    
    if amount > 0: return "inflow"
    return "operating"

def read_csv(path):
    content = None
    for enc in ("utf-8", "cp1251"):
        try:
            with open(path, encoding=enc) as f: content = f.read()
            break
        except UnicodeDecodeError: continue
    if content is None: raise ValueError(f"не смог прочитать {path}")
    lines = content.splitlines()
    if not lines: return []
    if lines[0].strip().startswith("1CClientBankExchange"): return _read_1c(lines)

    header_idx = 0
    for i, line in enumerate(lines[:20]):
        if "дата" in line.lower() or "date" in line.lower(): header_idx = i; break

    import io
    delimiter = _detect_delimiter(lines[header_idx])
    reader = csv.DictReader(io.StringIO("\n".join(lines[header_idx:])), delimiter=delimiter)
    rows = []
    for r in reader:
        date_key = next((k for k in r if k and ("дата" in k.lower() or "date" in k.lower())), None)
        cp_key = next((k for k in r if k and ("контрагент" in k.lower() or "counterparty" in k.lower())), None)
        purpose_key = next((k for k in r if k and ("назначен" in k.lower() or "purpose" in k.lower())), None)
        amount_key = next((k for k in r if k and ("сумм" in k.lower() or "amount" in k.lower())), None)
        debit_key = next((k for k in r if k and "дебет" in k.lower()), None)
        credit_key = next((k for k in r if k and "кредит" in k.lower()), None)
        prihod_key = next((k for k in r if k and "приход" in k.lower()), None)
        rashod_key = next((k for k in r if k and "расход" in k.lower()), None)
        
        if not (date_key and purpose_key): continue
        date_iso = _parse_date((r.get(date_key) or "").strip())
        if date_iso is None: continue
        purpose = (r.get(purpose_key) or "").strip()
        cp = (r.get(cp_key) or "").strip() if cp_key else ""
        
        amt = None
        if amount_key and r.get(amount_key): amt = _parse_amount(r[amount_key])
        elif debit_key or credit_key:
            d = _parse_amount(r.get(debit_key) or "") if debit_key else None
            c = _parse_amount(r.get(credit_key) or "") if credit_key else None
            if d and abs(d) > 0: amt = -abs(d)
            elif c and abs(c) > 0: amt = abs(c)
        elif prihod_key or rashod_key:
            pr = _parse_amount(r.get(prihod_key) or "") if prihod_key else None
            ra = _parse_amount(r.get(rashod_key) or "") if rashod_key else None
            raw = None; in_income_col = False
            if ra and abs(ra) > 0: raw = abs(ra); in_income_col = False
            elif pr and abs(pr) > 0: raw = abs(pr); in_income_col = True
            if raw is not None:
                lp = purpose.lower()
                is_mandatory = any(w in lp for w in ("аренд", "налог", "енп", "енс ", "ндфл", "усн", "взнос", "страхов", "зарплат", "заработн", "оплата труда", "лизинг", "кредит", "пени", "штраф"))
                if is_mandatory or not in_income_col: amt = -raw
                else: amt = raw
        if amt is None: continue
        rows.append({"date": date_iso, "amount": amt, "counterparty": cp, "purpose": purpose, "inn": None, "inn_client": None})
    return rows

def _read_1c(lines):
    rows = []
    for line in lines:
        line = line.strip()
        if not line or "=" not in line or line.startswith("1CClientBankExchange"): continue
        fields = {}
        for part in line.split("|"):
            if "=" in part: k, v = part.split("=", 1); fields[k.strip()] = v.strip()
        if "Дата" not in fields or "Сумма" not in fields: continue
        date_iso = _parse_date(fields.get("Дата", ""))
        amt = _parse_amount(fields.get("Сумма", ""))
        if date_iso is None or amt is None: continue
        rows.append({"date": date_iso, "amount": amt, "counterparty": fields.get("Контрагент", "").strip(), "purpose": fields.get("Назначение", "").strip(), "inn": None, "inn_client": None})
    return rows

def _detect_delimiter(header):
    counts = {";": header.count(";"), ",": header.count(","), "\t": header.count("\t")}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ","

def _parse_date(s):
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try: return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError: continue
    return None

def _parse_amount(s):
    if not s: return None
    s = str(s).strip().strip('"').replace("\u00a0", "").replace(" ", "").replace("\u2009", "").replace(",", ".")
    s = "".join(c for c in s if c.isdigit() or c in ".-")
    if not s or s in (".", "-", "-."): return None
    try: return float(s)
    except ValueError: return None

def resolve_financing_pairs(rows, params=None):
    p = params or PARAMS; tol = p["pair_amount_tol"]; days = p["pair_days"]
    by_cp = defaultdict(list)
    for r in rows:
        if r["label"] in ("inflow", "operating"): by_cp[r["counterparty"]].append(r)
    for cp, ops in by_cp.items():
        if not (len(str(ops[0].get("inn") or "")) == 12 or _is_individual(cp.lower())): continue
        ins = [o for o in ops if o["amount"] > 0]; outs = [o for o in ops if o["amount"] < 0]; used = set()
        for i in ins:
            d_i = datetime.fromisoformat(i["date"])
            for j in outs:
                if id(j) in used: continue
                d_j = datetime.fromisoformat(j["date"])
                if abs((d_j - d_i).days) > days: continue
                big = max(abs(i["amount"]), abs(j["amount"]))
                if big == 0: continue
                if abs(abs(i["amount"]) - abs(j["amount"])) / big <= tol:
                    i["label"] = "financing"; j["label"] = "financing"; used.add(id(j)); break

def annuity_factor(rate, term):
    i = rate / 12
    if i == 0: return term
    return (1 - (1 + i) ** -term) / i

def select_instrument(need, questionnaire):
    purpose = need.get("purpose", "")
    years = questionnaire.get("years", "")
    amount = need.get("amount_rub", 0)
    
    if years in ("меньше года", "1–3"):
        if amount <= 1000000: return "ALFA_START"
        return "ALFA_DELO"

    if purpose == "кассовый разрыв": return "ALFA_OVERDRAFT"
    elif purpose == "оборудование":
        if amount > 3000000: return "ALFA_NCL_SEC" 
        return "ALFA_LUMP_SEC"
    elif purpose in ("сезон", "закупка под контракт"): return "ALFA_RCL_UNSEC"
    elif purpose == "рост":
        if amount > 3000000: return "ALFA_NCL_SEC"
        return "ALFA_LUMP_UNSEC"
    elif purpose == "рефинансирование": return "ALFA_REFI"
    return "ALFA_LUMP_UNSEC"

def check_restrictions(instrument_id, need):
    purpose = need.get("purpose", "")
    if instrument_id == "ALFA_RCL_UNSEC" and purpose in ("оборудование", "рост"):
        return "RESTRICTED_PURPOSE"
    if instrument_id == "ALFA_OVERDRAFT" and purpose != "кассовый разрыв":
        return "RESTRICTED_PURPOSE"
    return None

def calculate_scorecard(dscr, cv, debt_load, top_share, cash_gaps_count):
    score = 0
    reasons = []
    if dscr >= 2.0: score += 30
    elif dscr >= 1.5: score += 25
    elif dscr >= 1.25: score += 15
    else: reasons.append("LOW_DSCR")

    if cv < 0.4: score += 20
    elif cv <= 0.8: score += 10
    else: reasons.append("HIGH_VOLATILITY")

    if debt_load < 0.20: score += 20
    elif debt_load <= 0.40: score += 10
    else: reasons.append("HIGH_DEBT_LOAD")

    if top_share < 0.30: score += 15
    elif top_share <= 0.70: score += 7
    else: reasons.append("CONCENTRATION_ONE_CUSTOMER")

    if cash_gaps_count == 0: score += 15
    elif cash_gaps_count <= 4: score += 7
    else: reasons.append("CASH_GAP")
    return score, reasons

def make_decision(score, stops, need, limit_now, limit_after, instrument, missing, reasons):
    if stops:
        if "SHORT_STATEMENT" in stops:
            return "можно после шага", missing, reasons
        return "нужен менеджер", missing, reasons

    if need["amount_rub"] <= limit_now:
        return "можно подавать", missing, reasons
    if need["amount_rub"] <= limit_after:
        return "можно после шага", missing, reasons

    return "нужен менеджер", missing, reasons

def score(statement_csv, need, questionnaire, confirmed_fields=None, params=None):
    p = params or PARAMS
    confirmed_fields = confirmed_fields or {}
    
    rows = read_csv(statement_csv)
    client_inn = questionnaire.get("inn") or None
    for r in rows:
        r["label"] = classify(r["amount"], r["counterparty"], r["purpose"], client_inn=client_inn, cp_inn=r.get("inn"))
    resolve_financing_pairs(rows, params=p)

    by_month = defaultdict(lambda: defaultdict(float))
    for r in rows: by_month[r["date"][:7]][r["label"]] += r["amount"]
    months = sorted(by_month); n = len(months) if months else 0

    def avg(lab):
        if n == 0: return 0.0
        return sum(by_month[m].get(lab, 0.0) for m in months) / n

    m_flow = {m: sum(v for k, v in by_month[m].items() if k in IN_LABELS | OUT_LABELS) for m in months}
    flow = sum(m_flow.values()) / n if n else 0.0
    inflow_total = sum(r["amount"] for r in rows if r["label"] == "inflow")

    # Стопы
    stops = []
    if questionnaire.get("form") not in ("ИП", "ООО"): stops.append("NOT_BUSINESS")
    if questionnaire.get("years") == "меньше года" or n < p["min_months"]: stops.append("TOO_YOUNG")
    if n < p["full_months"] or len(rows) < p["min_ops"]: stops.append("SHORT_STATEMENT")
    if flow <= 0: stops.append("NO_FREE_CASHFLOW")
    if any(r["label"] == "enforcement" for r in rows): stops.append("ENFORCEMENT")
    cash_total = -sum(r["amount"] for r in rows if r["label"] == "cash")
    if inflow_total > 0 and cash_total / inflow_total > p["cash_share"]: stops.append("CASH_OUT")

    # Причины
    reasons = []
    missing = []
    
    payers = defaultdict(float)
    for r in rows:
        if r["label"] == "inflow" and not _is_aggregated(r["counterparty"].lower()): 
            payers[r["counterparty"]] += r["amount"]
    top_share = (max(payers.values()) / inflow_total if payers and inflow_total > 0 else 0.0)

    if top_share > p["concentration"]:
        reasons.append("CONCENTRATION_ONE_CUSTOMER")
        missing += ["contract_main_customer", "reconciliation_act"]
        
    stress_flow = (avg("inflow") * (1 - p["stress"]) + avg("mandatory") + avg("loan") + avg("operating") * (1 - p["stress"]) + avg("cash") + avg("enforcement"))
    if stress_flow < 0 and flow > 0:
        reasons.append("STRESS_NEGATIVE_FLOW")

    if flow > 0 and any(v < 0 for v in m_flow.values()):
        reasons.append("CASH_GAP")

    if "SHORT_STATEMENT" in stops:
        missing.insert(0, "statement_12m")

    # Выбор продукта
    instrument = select_instrument(need, questionnaire)
    restriction = check_restrictions(instrument, need)
    if restriction:
        stops.append(restriction)

    rate = PRODUCTS_DB[instrument]["rate"]
    term = need["term_months"]
    a = annuity_factor(rate, term)

    max_payment = max(flow, 0.0) / p["dscr_min"]
    dscr = round(flow / max_payment, 2) if max_payment > 0 else 0

    limit_now = max_payment * a
    contract = confirmed_fields.get("contract_main_customer") or need.get("contract_with_main_customer")
    flow_after = flow
    if contract:
        flow_after += contract["sum_rub"] / contract["months"] * (1 - p["variable_share"])
    limit_after = (max(flow_after, 0.0) / p["dscr_min"]) * a

    inflows_list = [by_month[m].get("inflow", 0.0) for m in months]
    cv = (statistics.stdev(inflows_list) / statistics.mean(inflows_list)) if len(inflows_list) > 1 and statistics.mean(inflows_list) > 0 else 0.0
    debt_load = abs(avg("loan")) / avg("inflow") if avg("inflow") > 0 else 0.0
    cash_gaps_count = sum(1 for v in m_flow.values() if v < 0)

    score_val, score_reasons = calculate_scorecard(dscr, cv, debt_load, top_share, cash_gaps_count)
    reasons.extend(score_reasons)
    final_reasons = list(set(reasons))

    status, final_missing, _ = make_decision(
        score=score_val, stops=stops, need=need, limit_now=limit_now, 
        limit_after=limit_after, instrument=instrument, missing=missing, reasons=final_reasons
    )

    return {
        "stage": 2,
        "status": status,
        "instrument": instrument,
        "stops_fired": stops,
        "reasons": final_reasons,
        "missing": final_missing,
        "flow_month_rub": round(flow),
        "limit_now_rub": round(limit_now),
        "limit_after_rub": round(limit_after),
        "score": score_val,
        "evidence": {
            "months": n,
            "operations": len(rows),
            "flow_by_month": {m: round(v) for m, v in m_flow.items()},
        },
    }