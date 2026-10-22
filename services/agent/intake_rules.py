"""Приёмщик без LLM (baseline): текст клиента → поля нужды по правилам.

LLM-приёмщик обязан обыграть его на тех же фразах, иначе LLM здесь не нужен.
Разбор знает, о чём агент спросил (`asking`): «12 месяцев» в ответе про срок не станет суммой.
"""
import re

INTENTS = {"answer_slot", "side_question", "identity", "manager_request", "pii", "smalltalk"}
PII_DIGITS = re.compile(r"(?<!\d)(?:\d[ \u00a0-]*){10,19}(?!\d)")


def has_pii(text: str) -> bool:
    return bool(PII_DIGITS.search(text) or re.search(
        r"паспорт|\bинн\b|снилс|карт[ауы]|парол|\bcvv\b|\bcvc\b|логин|код.{0,20}смс|смс.{0,20}код", text, re.I))


def intent(text: str, asking: str | None = None) -> str:
    """Safety intents take priority over slot extraction, including repayment free text."""
    low = text.lower()
    if has_pii(text):
        return "pii"
    if re.search(r"забудь\s+правила|скажи.{0,20}одобрен", low):
        return "side_question"
    if re.search(r"(?<![а-яё])(?:бот|робот|ты человек|вы человек|живой человек\?|сотрудник[а-яё]*|кредитный отдел|службы безопасности|"
                 r"ты теперь|теперь ты|ты будешь|ты мой|инструкци[а-яё]*|внутренние правила|промпт[а-яё]*|его заявк[а-яё]*|меня одобрили)(?![а-яё])", low):
        return "identity"
    if re.search(r"(?<![а-яё])(?:менеджер[а-яё]*|манагер[а-яё]*|живого|жалоб[а-яё]*|грабеж[а-яё]*|отказ(?:а|е|ом|ы|ов)?|пристав[а-яё]*|арест[а-яё]*|суд(?:а|е|у|ом|ы|ов|ебн[а-яё]*)?|юрид[а-яё]*|"
                 r"налог.{0,45}(совет|оптимиз|провести|платить|платит|прикоп|лимит)[а-яё]*|"
                 r"(перенес|перенос|сдвин|измен|пониже).{0,35}(плат|график|ставк|услов)[а-яё]*|"
                 r"(ставк|график).{0,35}(пониже|сдвин|измен)[а-яё]*|как физик)(?![а-яё])", low):
        return "manager_request"
    if "?" in text or re.search(r"(?<![а-яё])(?:что такое|чем .+отлич[а-яё]*|какая ставк[а-яё]*|какие порог[а-яё]*|сколько ждать|факторинг)(?![а-яё])", low):
        return "side_question"
    if re.search(r"(?<![а-яё])(?:привет|здравств[а-яё]*|спасибо|на связи|я подумаю|не до кредит[а-яё]*|ты спишь)(?![а-яё])", low):
        return "smalltalk"
    return "answer_slot"

PURPOSES = {
    "оборудование": ("оборудован", "станок", "станк", "техник", "печь", "грузовик", "фургон"),
    "закупка под контракт": ("под контракт", "под заказ", "госконтракт", "тендер", "закуп", "под объект"),
    "сезон": ("сезон", "весн", "к лету", "новому году", "к зиме"),
    "рост": ("развит", "рост", "расшир", "открыть", "найм", "нанять", "маркетинг"),
    "кассовый разрыв": ("разрыв", "зарплат", "до оплаты", "платит позже", "платит через", "оборотк", "налог"),
}

_NUM = r"(\d+(?:[  ]\d{3})*(?:[.,]\d+)?)"
_UNIT = r"\s*(млн|миллион\w*|лям\w*|тыс\w*|т\.р\.|к)?(?![а-яё])"
_MONEY = re.compile(_NUM + _UNIT, re.I)
_SCALE = {"млн": 1e6, "мил": 1e6, "лям": 1e6, "тыс": 1e3, "т.р": 1e3, "к": 1e3}
_WORD_MONEY = re.compile(r"(?<![а-яё])(?:(полтора|пол|один|два|три|четыре|пять)[\s-]+)?(млн|миллион[а-яё]*|лям[а-яё]*)(?![а-яё])", re.I)
_WORD = {"полтора": 1.5, "пол": 0.5, "один": 1, "два": 2, "три": 3, "четыре": 4, "пять": 5}
_CONTRACT = re.compile(r"договор\w*[^.?!]*?на\s+" + _NUM + _UNIT + r"[^.?!]*?(?:на\s+)?(\d+)\s*мес", re.I)


def _to_rub(num: str, unit: str | None) -> float:
    value = float(num.replace(" ", "").replace(" ", "").replace(",", "."))
    if unit:
        for key, mult in _SCALE.items():
            if unit.lower().startswith(key):
                return value * mult
    return value


def money(text: str) -> list[float]:
    """Все суммы в рублях по порядку. Голое число меньше 1000 без единицы суммой не считаем (это месяцы, проценты)."""
    numeric = list(_MONEY.finditer(text))
    found = [(m.start(), _WORD.get((m.group(1) or "один").lower(), 1) * 1e6)
             for m in _WORD_MONEY.finditer(text)
             if not any(n.start() <= m.start() < n.end() for n in numeric)]
    for m in numeric:
        rub = _to_rub(m.group(1), m.group(2))
        if rub >= 1000:
            found.append((m.start(), rub))
    return [rub for _, rub in sorted(found)]


def term_months(text: str) -> int | None:
    low = text.lower()
    if m := re.search(r"(?<![а-яё])месяц[а-яё]*\s+(?:на\s+)?(\d+)", low):
        return int(m.group(1))
    if m := re.search(r"(\d+)\s*(?:мес|месяц)", low):
        return int(m.group(1))
    if m := re.search(r"(\d+)\s*(?:год|года|лет)\b", low):
        return 12 * int(m.group(1))
    for words, months in (("полтора года", 18), ("полгода", 6), ("два года", 24), ("три года", 36), ("год", 12)):
        if words in low:
            return months
    return None


def purpose(text: str) -> str | None:
    low = text.lower()
    for name, keys in PURPOSES.items():
        if any(k in low for k in keys):
            return name
    return None


def contract(text: str) -> dict | None:
    """«договор с заказчиком на 1 440 000 на 12 месяцев» → то, что клиент сказал про договор."""
    if m := _CONTRACT.search(text):
        return {"sum_rub": round(_to_rub(m.group(1), m.group(2))), "months": int(m.group(3))}
    return None


def parse(text: str, asking: str | None) -> dict:
    """Поля, которые удалось достать. Чего нет в тексте, того нет в ответе."""
    out = {}
    if p := purpose(text):
        out["purpose"] = p
    deal = contract(text)
    if deal:
        out["contract_with_main_customer"] = deal
    if asking in (None, "purpose", "amount"):
        sums = money(_CONTRACT.sub("", text) if deal else text)
        if sums:
            out["amount_rub"] = round(sums[0])
    if (t := term_months(_CONTRACT.sub("", text) if deal else text)) is not None:
        out["term_months"] = t
    if asking == "repay" or re.search(r"\bиз\s+(оплат|выручк|договор|контракт)", text, re.I):
        source = re.split(r"[.!?]", text)[0].strip()
        if source:
            out["repay_from"] = source
    return out
