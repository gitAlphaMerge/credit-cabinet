# services/ml-model/core.py
"""ядро ступенек 1 и 2: парсинг, скоринг, лимиты и подбор 6 продуктов (Толя)"""

import csv
import json
import statistics
from collections import defaultdict
from datetime import datetime
from pathlib import Path

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

# data/catalog/products.json is the source for product limits and public base rates.
_CATALOG = json.loads((Path(__file__).resolve().parents[2] / "data/catalog/products.json").read_text(encoding="utf-8"))["products"]
PRODUCTS_DB = {p["id"]: {**p, "rate": (p["bank_base_rate_from_pct"] / 100
                                     if p["bank_base_rate_from_pct"] is not None else None)}
               for p in _CATALOG}
# MANUAL still passes through the legacy payment calculator. This proxy is the
# catalogue ALFA_LUMP_UNSEC public base rate, never a bank offer for MANUAL.
PRODUCTS_DB["MANUAL"] = {"rate": PRODUCTS_DB["ALFA_LUMP_UNSEC"]["rate"]}

IN_LABELS = {"inflow"}
OUT_LABELS = {"mandatory", "loan", "operating", "cash", "enforcement"}

# Маркеры
GOV_MARKERS = ("уфк", "фнс", "фед", "казначейств", "налогов", "фссп", "гуфссп", "фсс", "сфр", "пфр", "росреестр", "таможн", "гибдд")
BANK_MARKERS = ("банк", "сбер", "втб", "альфа", "т-банк", "тинькофф", "открытие", "райффайзен", "росбанк", "газпромбанк", "псб", "совкомбанк")
AGGREGATED_MARKERS = ("эквайринг", "сбп", "торговый эквайринг", "ozon", "ozon банк", "wildberries", "яндекс", "яндекс.маркет")
OWNER_MARKERS = ("дивиденд", "распределение прибыли", "на личную карту", "собственные средства ип", "выплата участнику", "выплата собственнику", "доход участника")
# context/stop-rules.md: CASH_OUT counts operations classified as cash.
# data/realistic/from_spec.py special_events labels explicit person transfers in cash_out/transit as cash.
CASH_MARKERS = ("снятие наличн", "выдача наличн", "под отчёт", "подотчёт", "банкомат", "выдача под", "на хозяйственные нужды", "перевод физическому лицу")
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
    for enc in ("utf-8-sig", "cp1251"):
        try:
            with open(path, encoding=enc) as f: content = f.read()
            break
        except UnicodeDecodeError: continue
    if content is None: raise ValueError(f"не смог прочитать {path}")
    lines = content.splitlines()
    if not lines: return []
    if next((line.strip() for line in lines if line.strip()), "").startswith("1CClientBankExchange"): return _read_1c(lines)

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
    # 1CClientBankExchange 1.03: document fields span lines, while account sections
    # identify the customer's settlement accounts and document accounts set direction.
    rows = []
    accounts = set()
    section = None
    documents = []
    fields = None
    for line in lines:
        line = line.strip()
        if not line: continue
        if line.startswith("СекцияДокумент=") and "|" in line:
            # The older single-line exporter stores signed amounts and uses | fields.
            legacy = {}
            for part in line.split("|"):
                if "=" in part:
                    key, value = part.split("=", 1)
                    legacy[key.strip()] = value.strip()
            date_iso = _parse_date(legacy.get("Дата", ""))
            amt = _parse_amount(legacy.get("Сумма", ""))
            if date_iso is not None and amt is not None:
                rows.append({"date": date_iso, "amount": amt, "counterparty": legacy.get("Контрагент", ""), "purpose": legacy.get("Назначение", ""), "inn": None, "inn_client": None})
            continue
        if line.startswith("СекцияДокумент="):
            fields = {}
            section = "document"
            continue
        if line == "КонецДокумента":
            if fields is not None: documents.append(fields)
            fields = None
            section = None
            continue
        if line == "СекцияРасчСчет":
            section = "account"
            continue
        if line == "КонецРасчСчет":
            section = None
            continue
        if "=" not in line: continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if section == "document" and fields is not None:
            fields[key] = value
        elif key == "РасчСчет":
            accounts.add(value)

    for doc in documents:
        payer_account = doc.get("ПлательщикСчет", "")
        payee_account = doc.get("ПолучательСчет", "")
        outgoing = payer_account in accounts
        incoming = payee_account in accounts
        if not outgoing and not incoming: continue
        if outgoing and incoming:
            # Both accounts belong to the customer; date fields disambiguate postings.
            outgoing = bool(doc.get("ДатаСписано"))
            incoming = not outgoing and bool(doc.get("ДатаПоступило"))
            if not outgoing and not incoming: continue
        date_field = "ДатаСписано" if outgoing else "ДатаПоступило"
        date_iso = _parse_date(doc.get(date_field) or doc.get("Дата", ""))
        amt = _parse_amount(doc.get("Сумма", ""))
        if date_iso is None or amt is None: continue
        counterparty = (doc.get("Получатель") or doc.get("Получатель1") or "") if outgoing else (doc.get("Плательщик") or doc.get("Плательщик1") or "")
        rows.append({"date": date_iso, "amount": -abs(amt) if outgoing else abs(amt), "counterparty": counterparty, "purpose": doc.get("НазначениеПлатежа") or doc.get("Назначение", ""), "inn": None, "inn_client": None})
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
        if not (any(len(str(op.get("inn") or "")) == 12 for op in ops) or _is_individual(cp.lower())): continue
        ins = [o for o in ops if o["amount"] > 0]
        outs = [o for o in ops if o["amount"] < 0]
        candidates = []
        for i in ins:
            for j in outs:
                day_gap = abs((datetime.fromisoformat(i["date"]) - datetime.fromisoformat(j["date"])).days)
                amount_gap = abs(i["amount"] + j["amount"])
                big = max(abs(i["amount"]), abs(j["amount"]))
                if day_gap <= days and big and amount_gap / big <= tol:
                    candidates.append((day_gap, amount_gap, i["date"], j["date"], i["amount"], j["amount"], i, j))
        # Stable edge order makes the one-to-one match independent of statement order.
        candidates.sort(key=lambda edge: edge[:6])
        used_in, used_out = set(), set()
        for *_, i, j in candidates:
            if id(i) in used_in or id(j) in used_out: continue
            i["label"] = j["label"] = "financing"
            used_in.add(id(i)); used_out.add(id(j))

def annuity_factor(rate, term):
    i = rate / 12
    if i == 0: return term
    return (1 - (1 + i) ** -term) / i

def _purpose_facts(need, purpose_code=None):
    """Map stated use to catalogue goal/fit columns without reading client identity."""
    code = str(purpose_code or need.get("purpose_code") or "").strip().lower()
    purpose = str(need.get("purpose") or "").strip().lower()
    if code.startswith("do_") or "рефинанс" in purpose:
        return "debt_optimization", code or "do_refinance", "refinance_existing_business_loans"
    if code.startswith("cg_") or "разрыв" in purpose:
        return "cash_gap", code or "cg_customer_delay", "short_term_working_capital"
    if code.startswith("ap_") or "оборудован" in purpose:
        return "asset_purchase", code or "ap_machinery", "business_development"
    if code.startswith("ct_") or "контракт" in purpose:
        return "contract_financing", code or "ct_materials", "working_capital"
    if code.startswith("wc_") or "сезон" in purpose or "закуп" in purpose:
        return "working_capital", code or "wc_seasonal_stock", "working_capital"
    if code.startswith("ex_") or "рост" in purpose:
        return "business_expansion", code or "ex_capacity", "business_development"
    return "unknown", code, "unknown"


def check_restrictions(instrument_id, need, purpose_code=None):
    """Check bank_restricted_uses and bank_allowed_purposes in products.json."""
    goal, code, use = _purpose_facts(need, purpose_code)
    if code in {"dividends", "securities", "equity_contributions", "personal_withdrawals"}:
        return "RESTRICTED_PURPOSE"
    if instrument_id == "MANUAL":
        return None
    product = PRODUCTS_DB[instrument_id]
    allowed = {x.strip() for x in product["bank_allowed_purposes"].split(";")}
    forbidden = {x.strip() for x in product["bank_restricted_uses"].split(";")}
    # products.json: refinancing_as_per_offer is conditional, not a public
    # permission to refinance with a general-purpose lump-sum loan.
    if use == "refinance_existing_business_loans" and "refinancing_as_per_offer" in allowed and not need.get("personal_offer_confirmed"):
        return "RESTRICTED_PURPOSE"
    if code in forbidden or (use == "business_development" and "fixed_asset_investments" in forbidden):
        return "RESTRICTED_PURPOSE"
    # products.json: ALFA_LUMP_* allows refinancing_as_per_offer. A generic
    # request has no documented personal offer, so eligibility is unproven.
    if use == "refinance_existing_business_loans" and "refinancing_as_per_offer" in allowed:
        return "RESTRICTED_PURPOSE"
    compatible = {
        "short_term_working_capital": {"short_term_working_capital", "working_capital", "working_capital_only",
                                       "business_purchase_of_goods_equipment_services"},
        "working_capital": {"working_capital", "working_capital_only", "short_term_working_capital",
                            "business_purchase_of_goods_equipment_services"},
        "business_development": {"business_development", "business_purchase_of_goods_equipment_services"},
        "refinance_existing_business_loans": {"refinance_existing_business_loans", "refinancing_as_per_offer"},
    }
    if goal == "unknown" or not allowed.intersection(compatible.get(use, set()) | {"registered_business_general_purpose_per_contract"}):
        return "RESTRICTED_PURPOSE"
    return None


def select_instrument(need, questionnaire, purpose_code=None, product_match=None):
    """Filter catalogue restrictions, then rank explicit fit before broad goal fit."""
    goal, code, use = _purpose_facts(need, purpose_code)
    amount, term = need.get("amount_rub"), need.get("term_months")
    years = questionnaire.get("years")
    # questionnaire.years gives a range. Under one year cannot prove the 9-month
    # minimum, so only zero-minimum products pass without a precise age.
    age = (None if years in (None, "не указан", "") else 0 if years == "меньше года"
           else 12 if years == "1–3" else 37 if years == "больше 3" else
           round(float(years) * 12) if isinstance(years, (int, float)) else None)
    collateral = questionnaire.get("collateral")
    if isinstance(collateral, dict):
        collateral = bool(collateral.get("type"))
    rejected, candidates = {}, []
    for product in _CATALOG:
        pid = product["id"]
        failures = []
        if check_restrictions(pid, need, code): failures.append("purpose")
        if amount is not None and not product["bank_min_amount_rub"] <= amount <= product["bank_max_amount_rub"]:
            failures.append("amount_rub")
        if term is not None and ((product["bank_min_term_months"] is not None and term < product["bank_min_term_months"])
                                 or (product["bank_max_term_months"] is not None and term > product["bank_max_term_months"])):
            failures.append("term_months")
        if age is not None and age < product["bank_min_business_age_months"]:
            failures.append("business_age_months")
        if collateral is False and product["bank_collateral"] == "required":
            failures.append("collateral")
        if product["bank_base_rate_from_pct"] is None:
            failures.append("public_base_rate_missing")
        # products.json: ALFA_START bank_rate_unit=daily_pct. The existing
        # annuity calculator accepts annual rates, so it cannot price Start.
        if product["bank_rate_unit"] != "annual_pct":
            failures.append("rate_unit_not_annual")
        if failures:
            rejected[pid] = failures
            continue
        fit = product.get("fit_" + code, 0)
        goal_fit = product.get("goal_" + goal + "_score", 0)
        # Priority: exact catalogue fit, then goal score, no obligatory pledge
        # when pledge is unknown, then lower public base rate and stable id.
        candidates.append(((-fit, -goal_fit, age is not None and age >= 9 and product["bank_min_business_age_months"] == 0,
                            product["bank_collateral"] == "required" and collateral is None,
                            product["bank_base_rate_from_pct"], pid), pid))
    candidates.sort()
    chosen = candidates[0][1] if candidates else "MANUAL"
    if product_match is not None:
        product_match.update({"goal": goal, "purpose_code": code, "use": use,
                              "selected": chosen, "rejected": rejected,
                              "eligible": [pid for _, pid in candidates]})
    return chosen


# A 20% annual-revenue gap is material enough to request reconciliation, while
# normal collection timing and other-bank receipts can explain smaller gaps.
# Compare only an overlapping 12-month statement and report, never metadata's
# consistent flag. Source fields: from_spec.py lines.2110 and revenue_rub.
DOSSIER_REVENUE_MISMATCH = 0.20


def _inspect_dossier(statement_csv, inflow_total):
    """Read only existing sibling documents; an isolated live CSV adds no findings."""
    folder = Path(statement_csv).parent
    names = ("balance_sheet", "income_statement", "financial_model", "business_plan")
    docs = {}
    for name in names:
        path = folder / (name + ".json")
        if path.is_file():
            try:
                docs[name] = json.loads(path.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                docs[name] = {"unreadable": True}
    schedule = folder / "existing_debt_schedule.csv"
    if not docs and not schedule.is_file():
        return {"reasons": [], "missing": [], "evidence": {}, "business_plan": {}}
    reasons, missing, evidence = [], [], {}
    for name, doc in docs.items():
        period = str(doc.get("period", ""))
        as_of = str(doc.get("as_of", ""))
        stale = bool(doc.get("stale"))
        # Annual reporting older than the preceding complete year is stale.
        # A year shift must work even if stale metadata was not recomputed.
        if period.isdigit() and len(period) == 4 and as_of[:4].isdigit():
            stale = stale or int(period) < int(as_of[:4]) - 1
        evidence[name] = {"period": period, "stale": stale}
        if stale:
            reasons.append("STALE_DOC")
            if "fresh_financials" not in missing: missing.append("fresh_financials")
    if "financial_model" not in docs:
        missing.append("financial_model")
    income = docs.get("income_statement", {})
    revenue = income.get("lines", {}).get("2110")
    if isinstance(revenue, (int, float)) and inflow_total > 0:
        gap = abs(revenue - inflow_total) / inflow_total
        evidence["income_statement"].update({"revenue_2110_rub": revenue,
                                              "statement_inflow_rub": round(inflow_total, 2),
                                              "difference_pct": round(gap * 100, 2)})
        if gap > DOSSIER_REVENUE_MISMATCH:
            reasons.append("DOCS_MISMATCH")
    plan = docs.get("business_plan", {})
    if str(plan.get("purpose_code", "")).startswith("do_") and not schedule.is_file():
        reasons.append("MISSING_SCHEDULE")
        missing.append("debt_schedule")
    return {"reasons": list(dict.fromkeys(reasons)), "missing": missing,
            "evidence": evidence, "business_plan": plan}

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
    # context/stop-rules.md: поведенческий стоп имеет приоритет над документным.
    behavioral = {"ENFORCEMENT", "CASH_OUT", "NOT_BUSINESS", "NO_FREE_CASHFLOW", "OVERDUE_DEBT", "TOO_YOUNG"}
    if behavioral.intersection(stops):
        return "нужен менеджер", missing, reasons
    # context/stop-rules.md: неподходящая цель или возраст ведут к другому продукту.
    if "RESTRICTED_PURPOSE" in stops:
        return "лучше другой инструмент", missing, reasons
    if instrument == "MANUAL":
        if not stops and not reasons:
            reasons.append("MANUAL_REVIEW")
        return "нужен менеджер", missing, reasons
    # context/stop-rules.md: короткая выписка и недостающие документы требуют шага.
    if "SHORT_STATEMENT" in stops or missing:
        if not stops and not reasons:
            reasons.append("MISSING_DOCUMENTS")
        return "можно после шага", missing, reasons
    if need["amount_rub"] <= limit_now:
        return "можно подавать", missing, reasons
    if need["amount_rub"] <= limit_after:
        if not reasons:
            reasons.append("LIMIT_AFTER_STEP")
        return "можно после шага", missing, reasons
    # context/stop-rules.md, «Статус, если стопов нет»: выше обоих лимитов нужен менеджер.
    if not reasons:
        reasons.append("AMOUNT_EXCEEDS_LIMIT")
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
    # context/stop-rules.md: возраст бизнеса берём из анкеты, длину выписки отмечаем отдельно.
    if questionnaire.get("years") == "меньше года": stops.append("TOO_YOUNG")
    if n < p["full_months"] or len(rows) < p["min_ops"]: stops.append("SHORT_STATEMENT")
    if flow <= 0: stops.append("NO_FREE_CASHFLOW")
    if any(r["label"] == "enforcement" for r in rows): stops.append("ENFORCEMENT")
    cash_total = -sum(r["amount"] for r in rows if r["label"] == "cash")
    # context/stop-rules.md: CASH_OUT считаем независимо от свободного потока.
    cash_share = cash_total / inflow_total if inflow_total > 0 else 0.0
    if cash_share > p["cash_share"]: stops.append("CASH_OUT")

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

    dossier = _inspect_dossier(statement_csv, inflow_total)
    # Выбор продукта
    reasons.extend(dossier["reasons"])
    missing.extend(dossier["missing"])
    purpose_code = dossier["business_plan"].get("purpose_code")
    product_match = {}
    instrument = select_instrument(need, questionnaire, purpose_code, product_match)
    restriction = check_restrictions(instrument, need, purpose_code)
    if restriction:
        stops.append(restriction)

    rate = PRODUCTS_DB[instrument]["rate"]
    term = need["term_months"]
    a = annuity_factor(rate, term)
    
    # ИСПРАВЛЕННЫЙ DSCR (баг от Толи)
    # Считаем платеж по запрашиваемому кредиту
    requested_payment = need["amount_rub"] / a if a > 0 else 0
    # DSCR = Свободный поток (уже с вычетом старых кредитов) / Платеж по новому кредиту
    # context/core.md: порог 1.25 применяется до округления показателя для экрана.
    dscr = flow / requested_payment if requested_payment > 0 else 0

    # Лимит (сколько МОЖЕМ выдать безопасно при DSCR 1.25)
    safe_payment = max(flow, 0.0) / p["dscr_min"]
    limit_now = safe_payment * a
    
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
            "dossier": dossier["evidence"],
            "product_match": product_match,
            "cash_share": cash_share,
            "dscr": dscr,
            "top_share": top_share,
            "limit_now_rub": round(limit_now),
            "limit_after_rub": round(limit_after),
        },
    }
