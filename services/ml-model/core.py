# services/ml-model/core.py
"""ядро ступеньки 1: классификация операций и расчёт статуса

контракт задаёт data/check_golden.py:
    score(statement_csv, need, questionnaire) -> dict

csv приходит без колонки label. 
метку ядро определяет по структурным признакам:
тип контрагента, ИНН (если есть в выписке или анкете), 
структура назначения, знак и размер суммы, пары операций

эталон для сверки: data/synthetic/reference.py
"""

import csv
from collections import defaultdict
from datetime import datetime


PARAMS = {
    "rate": 0.24,             # годовая ставка; ДО ТАБЛИЦЫ ТОЛИ
    "dscr_min": 1.25,         # минимальный DSCR: поток / платёж
    "stress": 0.30,           # падение выручки в стрессе
    "variable_share": 0.5,    # доля материалов в выручке по новому договору
    "concentration": 0.70,    # доля одного заказчика, выше которой - концентрация
    "cash_share": 0.30,       # доля наличных, выше которой - стоп CASH_OUT
    "min_months": 6,          # меньше - TOO_YOUNG
    "full_months": 12,        # меньше - SHORT_STATEMENT
    "min_ops": 30,            # меньше - SHORT_STATEMENT
    "pair_amount_tol": 0.15,  # допустимое расхождение сумм в паре «пришло - вернулось»
    "pair_days": 180,         # окно между операциями пары
}

# ЧЕРНОВИК ДО ИНСТРУМЕНТОВ ТОЛИ
INSTRUMENT = {
    "кассовый разрыв": "овердрафт",
    "закупка под контракт": "кредитная линия",
    "оборудование": "лизинг",
    "сезон": "кредитная линия",
    "рост": "кредит на развитие",
}

# метки, идущие в свободный поток
IN_LABELS = {"inflow"}
OUT_LABELS = {"mandatory", "operating", "cash", "enforcement"}
# метки, не идущие в поток вообще
NON_FLOW_LABELS = {"financing", "transfer", "owner"}

# структурные маркеры (проверяются на подстроку в нижнем регистре)
# для грязных данных
GOV_MARKERS = (
    "уфк", "фнс", "фед", "казначейств", "налогов", "фссп", "гуфссп",
    "фсс", "сфр", "пфр", "росреестр", "таможн", "гибдд",
)
BANK_MARKERS = (
    "банк", "сбер", "втб", "альфа", "т-банк", "тинькофф", "открытие",
    "райффайзен", "росбанк", "газпромбанк", "псб", "совкомбанк",
)
AGGREGATED_MARKERS = (
    "эквайринг", "сбп", "торговый эквайринг",
    "ozon", "ozon банк", "wildberries", "яндекс", "яндекс.маркет",
)
OWNER_MARKERS = (
    "дивиденд", "распределение прибыли", "на личную карту",
    "собственные средства ип", "выплата участнику", "выплата собственнику",
    "доход участника",
)
CASH_MARKERS = (
    "снятие наличн", "выдача наличн", "под отчёт", "подотчёт",
    "банкомат", "выдача под", "на хозяйственные нужды",
)
SELF_TRANSFER_MARKERS = (
    "собственных средств", "между своими", "между счетами", "на свой счёт",
    "на счёт в другом", "своего счёта", "в другой банк",
)
LOAN_MARKERS = ("займ", "заём", "loan", "финансовая помощь")
ENFORCE_MARKERS = ("инкассов", "исполнительн", "взыскан", "арест")
SALARY_MARKERS = (
    "заработн", "оплата труда", "выплата зп", "аванс по заработ",
    "зп за", "перечисление зп",
)
TAX_MARKERS = (
    "налог", "енп", "енс ", "енс,", "ндфл", "усн",
    "взнос", "страховые", "единый налоговый",
)
CREDIT_MARKERS = (
    "погашение кредита", "платёж по кредиту", "платеж по кредиту",
    "проценты по кредиту", "кредитн", "кредит №",
)
# организационные формы юрлиц: если их нет в имени, вероятно это физлицо
LEGAL_FORMS = ("ооо", "оао", "зао", "пао", "ао ", "ип ",
               "фгбу", "фгбоу", "фгуп", "мбу", "гуп")


# помощники: структурные проверки контрагента 
def _has_any(text, keys):
    """есть ли в тексте хотя бы одно из ключевых слов"""
    return any(k in text for k in keys)


def _is_government(cp):
    """контрагент - госорган: ФНС, УФК, ФССП, СФР и тд
    нужно, чтобы ловить налоги и взносы по контрагенту, а не по формулировке"""
    return _has_any(cp, GOV_MARKERS)


def _is_bank(cp):
    """контрагент - банк (свой или чужой). Банк = комиссии, а не выручка"""
    return _has_any(cp, BANK_MARKERS)


def _is_aggregated(cp):
    """эквайринг, СБП, маркетплейсы: много покупателей, не один заказчик.
    такие поступления не считаем концентрацией на одном клиенте"""
    return _has_any(cp, AGGREGATED_MARKERS)


def _is_individual(cp):
    """контрагент - физлицо: в имени нет организационной формы (ООО/ИП/АО).
    нужно, чтобы отличать займы от физлиц от обычных коммерческих операций"""
    return not any(f in cp for f in LEGAL_FORMS)


# классификация одной строки -> метка кажой строки
def classify(amount, counterparty, purpose, client_inn=None, cp_inn=None):
    """метка одной операции. порядок проверок:
    1. Инкассо и приставы - enforcement
    2. Совпадение ИНН контрагента с ИНН клиента - transfer
    3. Структура назначения перевода между счетами - transfer
    4. Наличные - cash
    5. Вывод собственнику - owner
    6. Займы - financing
    7. Обязательные по контрагенту (госорган, зарплатный проект)
    8. Обязательные по назначению (зарплата, налоги, аренда, лизинг, кредит)
    9. Знак суммы: плюс - inflow, минус - operating

    Возвращает одну из меток: enforcement, cash, owner, financing, transfer,
    mandatory, inflow, operating
    """
    p = (purpose or "").lower()
    cp = (counterparty or "").lower()

    # 1. инкассо, приставы, взыскание
    if _has_any(p, ENFORCE_MARKERS):
        return "enforcement"
    if "фссп" in cp or "гуфссп" in cp:
        return "enforcement"

    # 2. перевод самому себе: если ИНН контрагента совпадает с ИНН клиента
    if client_inn and cp_inn and str(client_inn).strip() == str(cp_inn).strip():
        return "transfer"

    # 3. перевод между своими счетами по структуре назначения
    if _has_any(p, SELF_TRANSFER_MARKERS):
        return "transfer"

    # 4. снятие наличных
    if _has_any(p, CASH_MARKERS):
        return "cash"

    # 5. вывод собственнику
    if _has_any(p, OWNER_MARKERS):
        return "owner"

    # 6. займы в обе стороны
    if _has_any(p, LOAN_MARKERS):
        return "financing"

    # 7. обязательные по контрагенту
    if _is_government(cp):
        return "mandatory"
    if "зарплатн" in cp or ("реестр" in p and "зарплат" in p):
        return "mandatory"

    # 8. обязательные по назначению
    if _has_any(p, SALARY_MARKERS):
        return "mandatory"
    if _has_any(p, TAX_MARKERS):
        return "mandatory"
    if "аренд" in p:
        return "mandatory"
    if "лизинг" in p:
        return "mandatory"
    if _has_any(p, CREDIT_MARKERS):
        return "mandatory"

    # 9. по знаку суммы
    if amount > 0:
        return "inflow"
    return "operating"


# def read_csv(path):
#     """читает CSV-выписку. обяз колонки: date, amount, counterparty,
#     purpose. необязательные: inn (ИНН контрагента), inn_client (ИНН клиента)
#     кКолонка label, если есть, игнорируется"""
#     rows = []
#     with open(path, encoding="utf-8") as f:
#         for r in csv.DictReader(f):
#             rows.append({
#                 "date": r["date"],
#                 "amount": float(r["amount"]),
#                 "counterparty": r.get("counterparty", ""),
#                 "purpose": r.get("purpose", ""),
#                 "inn": (r.get("inn") or r.get("counterparty_inn") or "").strip() or None,
#                 "inn_client": (r.get("inn_client") or "").strip() or None,
#             })
#     return rows

def read_csv(path):
    """Читает выписку. Поддерживает разные форматы банковских выгрузок:

    1. Чистый (data/synthetic): UTF-8, запятая, колонки date, amount, counterparty, purpose.
    2. CSV с одной колонкой «Сумма» (st_01, st_03, ...): CP1251, разделитель ;, сумма со знаком.
    3. CSV с колонками «Дебет»/«Кредит» (st_02): CP1251, запятая, суммы в кавычках.
    4. CSV с колонками «Приход»/«Расход» без контрагента (st_04): CP1251, разделитель ;
       знак определяется по назначению: «зачисление / поступление» → плюс, иначе минус.
    5. Формат 1С (st_05): CP1251, строки вида
       «СекцияДокумент=...|Дата=...|Сумма=...|Контрагент=...|Назначение=...».
    """
    # 1. Кодировка
    content = None
    for enc in ("utf-8", "cp1251"):
        try:
            with open(path, encoding=enc) as f:
                content = f.read()
            break
        except UnicodeDecodeError:
            continue
    if content is None:
        raise ValueError(f"не смог прочитать {path}: ни UTF-8, ни CP1251")

    lines = content.splitlines()
    if not lines:
        return []

    # 2. 1С-формат
    if lines[0].strip().startswith("1CClientBankExchange"):
        return _read_1c(lines)

    # 3. Ищем строку с заголовками: где есть «Дата» (или date) и упоминание суммы
    header_idx = 0
    for i, line in enumerate(lines[:20]):
        low = line.lower()
        if "дата" in low or "date" in low:
            header_idx = i
            break

    # 4. Читаем как CSV
    import io
    delimiter = _detect_delimiter(lines[header_idx])
    reader = csv.DictReader(io.StringIO("\n".join(lines[header_idx:])), delimiter=delimiter)

    rows = []
    for r in reader:
        # Ищем колонки по подстроке в имени
        date_key = next((k for k in r if k and "дата" in k.lower()), None)
        cp_key = next((k for k in r if k and "контрагент" in k.lower()), None)
        purpose_key = next((k for k in r if k and "назначен" in k.lower()), None)
        amount_key = next((k for k in r if k and "сумм" in k.lower()), None)
        debit_key = next((k for k in r if k and "дебет" in k.lower()), None)
        credit_key = next((k for k in r if k and "кредит" in k.lower()), None)
        prihod_key = next((k for k in r if k and "приход" in k.lower()), None)
        rashod_key = next((k for k in r if k and "расход" in k.lower()), None)

        if not (date_key and purpose_key):
            continue

        date_iso = _parse_date((r.get(date_key) or "").strip())
        if date_iso is None:
            continue

        purpose = (r.get(purpose_key) or "").strip()
        cp = (r.get(cp_key) or "").strip() if cp_key else ""

        # Сумма: одна колонка / пара Дебет+Кредит / пара Приход+Расход
        amt = None
        if amount_key and r.get(amount_key):
            amt = _parse_amount(r[amount_key])
        elif debit_key or credit_key:
            d = _parse_amount(r.get(debit_key) or "") if debit_key else None
            c = _parse_amount(r.get(credit_key) or "") if credit_key else None
            if d and abs(d) > 0:
                amt = -abs(d)
            elif c and abs(c) > 0:
                amt = abs(c)
        elif prihod_key or rashod_key:
            pr = _parse_amount(r.get(prihod_key) or "") if prihod_key else None
            ra = _parse_amount(r.get(rashod_key) or "") if rashod_key else None
            raw = None
            in_income_col = False
            if ra and abs(ra) > 0:
                raw = abs(ra)
                in_income_col = False
            elif pr and abs(pr) > 0:
                raw = abs(pr)
                in_income_col = True
            if raw is not None:
                lp = purpose.lower()
                is_mandatory = any(w in lp for w in (
                    "аренд", "налог", "енп", "енс ", "ндфл", "усн",
                    "взнос", "страхов", "зарплат", "заработн",
                    "оплата труда", "лизинг", "кредит", "пени", "штраф",
                ))
                if is_mandatory or not in_income_col:
                    amt = -raw
                else:
                    amt = raw

        if amt is None:
            continue

        rows.append({
            "date": date_iso,
            "amount": amt,
            "counterparty": cp,
            "purpose": purpose,
            "inn": None,
            "inn_client": None,
        })
    return rows


def _read_1c(lines):
    """Парсер 1С-выгрузки: строки вида
    «СекцияДокумент=Платёжное поручение|Номер=...|Дата=...|Сумма=...|Контрагент=...|Назначение=...»."""
    rows = []
    for line in lines:
        line = line.strip()
        if not line or "=" not in line:
            continue
        if line.startswith("1CClientBankExchange"):
            continue
        fields = {}
        for part in line.split("|"):
            if "=" in part:
                k, v = part.split("=", 1)
                fields[k.strip()] = v.strip()
        if "Дата" not in fields or "Сумма" not in fields:
            continue
        date_iso = _parse_date(fields.get("Дата", ""))
        amt = _parse_amount(fields.get("Сумма", ""))
        if date_iso is None or amt is None:
            continue
        rows.append({
            "date": date_iso,
            "amount": amt,
            "counterparty": fields.get("Контрагент", "").strip(),
            "purpose": fields.get("Назначение", "").strip(),
            "inn": None,
            "inn_client": None,
        })
    return rows


def _detect_delimiter(header):
    """Определяет разделитель по строке-заголовку: побеждает тот,
    которого в строке больше."""
    counts = {";": header.count(";"), ",": header.count(","), "\t": header.count("\t")}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ","


def _parse_date(s):
    """01.10.2025 -> 2025-10-01. Понимает разные форматы."""
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _parse_amount(s):
    """-2 072,77 -> -2072.77. Убирает кавычки, пробелы, меняет запятую на точку."""
    if not s:
        return None
    s = str(s).strip().strip('"').replace("\u00a0", "").replace(" ", "").replace("\u2009", "")
    s = s.replace(",", ".")
    s = "".join(c for c in s if c.isdigit() or c in ".-")
    if not s or s in (".", "-", "-."):
        return None
    try:
        return float(s)
    except ValueError:
        return None

# разрешение пар операций
def resolve_financing_pairs(rows, params=None):
    """ищет пары входящей и исходящей операций от одного контрагента с близкими
    суммами в пределах окна (6 мес) и помечает обе как financing

    ловит займы и возвраты, даже если в назначении нет слова "займ":
    одинаковый контрагент + близкие суммы + короткое окно - классическая пара.
    работает только для физлиц (12-значный ИНН или имя без ООО/ИП/АО):
    у юрлиц похожие пары часто означают обычную коммерческую операцию,
    их не трогаем, чтобы не сломать поток
    """
    p = params or PARAMS
    tol = p["pair_amount_tol"]
    days = p["pair_days"]

    by_cp = defaultdict(list)
    for r in rows:
        if r["label"] in ("inflow", "operating"):
            by_cp[r["counterparty"]].append(r)

    for cp, ops in by_cp.items():
        cp_low = cp.lower()
        first_inn = str(ops[0].get("inn") or "")
        is_individual = len(first_inn) == 12 or _is_individual(cp_low)
        if not is_individual:
            continue

        ins = [o for o in ops if o["amount"] > 0]
        outs = [o for o in ops if o["amount"] < 0]
        used = set()
        for i in ins:
            d_i = datetime.fromisoformat(i["date"])
            for j in outs:
                if id(j) in used:
                    continue
                d_j = datetime.fromisoformat(j["date"])
                if abs((d_j - d_i).days) > days:
                    continue
                big = max(abs(i["amount"]), abs(j["amount"]))
                if big == 0:
                    continue
                if abs(abs(i["amount"]) - abs(j["amount"])) / big <= tol:
                    i["label"] = "financing"
                    j["label"] = "financing"
                    used.add(id(j))
                    break


# аннуитет
def annuity_factor(rate, term):
    """Множитель аннуитета: платёж × factor = сумма кредита.
    При нулевой ставке возвращает просто срок, чтобы не делить на ноль."""
    i = rate / 12
    if i == 0:
        return term
    return (1 - (1 + i) ** -term) / i


# главная функция
def score(statement_csv, need, questionnaire, params=None):
    """Ядро ступеньки 1.

    Вход:  путь к CSV без label, словарь нужды, словарь анкеты
           (в анкете может быть ИНН клиента под ключом "inn")
    Выход: dict по контракту check_golden.py: status, instrument, stops_fired,
           reasons, missing, flow_month_rub, limit_now_rub, limit_after_rub
    """
    p = params or PARAMS

    # 1. читаем и размечаем операции
    rows = read_csv(statement_csv)
    client_inn = questionnaire.get("inn") or None
    for r in rows:
        r["label"] = classify(
            r["amount"], r["counterparty"], r["purpose"],
            client_inn=client_inn,
            cp_inn=r.get("inn"),
        )
    # 1б. помечаем пары "пришло - вернулось" как займы
    resolve_financing_pairs(rows, params=p)

    # 2. агрегаты по месяцам
    by_month = defaultdict(lambda: defaultdict(float))
    for r in rows:
        by_month[r["date"][:7]][r["label"]] += r["amount"]
    months = sorted(by_month)
    n = len(months) if months else 0

    def avg(lab):
        """Среднее по месяцам для одной метки; ноль, если месяцев нет."""
        if n == 0:
            return 0.0
        return sum(by_month[m].get(lab, 0.0) for m in months) / n

    # свободный поток за месяц. суммы в csv уже со знаком.
    flow_labels = IN_LABELS | OUT_LABELS
    m_flow = {m: sum(v for k, v in by_month[m].items() if k in flow_labels)
              for m in months}
    flow = sum(m_flow.values()) / n if n else 0.0

    # 3. стопы в порядке stop-rules.md
    stops = []
    if questionnaire.get("form") not in ("ИП", "ООО"):
        stops.append("NOT_BUSINESS")
    if questionnaire.get("years") == "меньше года" or n < p["min_months"]:
        stops.append("TOO_YOUNG")
    if n < p["full_months"] or len(rows) < p["min_ops"]:
        stops.append("SHORT_STATEMENT")
    if flow <= 0:
        stops.append("NO_FREE_CASHFLOW")
    if any(r["label"] == "enforcement" for r in rows):
        stops.append("ENFORCEMENT")

    inflow_total = sum(r["amount"] for r in rows if r["label"] == "inflow")
    cash_total = -sum(r["amount"] for r in rows if r["label"] == "cash")
    if inflow_total > 0 and cash_total / inflow_total > p["cash_share"]:
        stops.append("CASH_OUT")

    # 4. коды причин и missing
    reasons, missing = [], []

    # концентрация на одном заказчике
    payers = defaultdict(float)
    for r in rows:
        if r["label"] == "inflow" and not _is_aggregated(r["counterparty"].lower()):
            payers[r["counterparty"]] += r["amount"]
    top_share = (max(payers.values()) / inflow_total
                 if payers and inflow_total > 0 else 0.0)
    if top_share > p["concentration"]:
        reasons.append("CONCENTRATION_ONE_CUSTOMER")
        missing += ["contract_main_customer", "reconciliation_act"]

    # стресс: выручка −30%, переменные −30%, остальное как есть
    stress_flow = (avg("inflow") * (1 - p["stress"])
                   + avg("mandatory")
                   + avg("operating") * (1 - p["stress"])
                   + avg("cash")
                   + avg("enforcement"))
    if stress_flow < 0 and flow > 0:
        reasons.append("STRESS_NEGATIVE_FLOW")

    # кассовый разрыв: средний поток плюс, но есть месяцы с минусом
    if flow > 0 and any(v < 0 for v in m_flow.values()):
        reasons.append("CASH_GAP")

    if "SHORT_STATEMENT" in stops:
        missing.insert(0, "statement_12m")

    # 5. лимиты
    a = annuity_factor(p["rate"], need["term_months"])
    limit_now = max(flow, 0.0) / p["dscr_min"] * a

    flow_after = flow
    contract = need.get("contract_with_main_customer")
    if contract and "contract_main_customer" in missing:
        flow_after += contract["sum_rub"] / contract["months"] * (1 - p["variable_share"])
    limit_after = max(flow_after, 0.0) / p["dscr_min"] * a

    # 6. инструмент и статус
    instrument = INSTRUMENT.get(need["purpose"], "кредит")

    if stops:
        status = "можно после шага" if stops[0] == "SHORT_STATEMENT" else "нужен менеджер"
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
        "stops_fired": stops,
        "reasons": reasons,
        "missing": missing,
        "flow_month_rub": round(flow),
        "limit_now_rub": round(limit_now),
        "limit_after_rub": round(limit_after),
    }


if __name__ == "__main__":
    import json
    import sys
    out = score(
        statement_csv=sys.argv[1] if len(sys.argv) > 1 else "data/synthetic/cash_gap.csv",
        need={
            "purpose": "кассовый разрыв", "amount_rub": 1_500_000, "term_months": 12,
            "repay_from": "оплата по договору", "asked_for": "кредит",
            "contract_with_main_customer": {"sum_rub": 1_440_000, "months": 12},
        },
        questionnaire={
            "form": "ООО", "need": "кассовый разрыв", "sector": "стройка",
            "years": "больше 3", "trend": "в плюс",
        },
    )
    print(json.dumps(out, ensure_ascii=False, indent=2))