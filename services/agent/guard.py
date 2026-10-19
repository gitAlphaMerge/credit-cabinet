"""Страж ответа агента: всё, что проверяется кодом, проверяется кодом. Это и защита в проде, и метрика eval уровня 1.

Нарушение → в проде вместо текста LLM уходит шаблон, в eval тест краснеет.
"""
import re

from intake_rules import money

FORBIDDEN = ("одобрен", "одобрим", "гарантир", "точно дадут", "вам дадут", "кредит ваш")
JARGON = ("dscr", "ядр", "покрытия долга", "покрытие долга", "обслуживания долга")  # спека Саши, ситуация 6
STOP_REASON = ("исполнительн", "арест", "пристав")  # ситуация 13: при «нужен менеджер» причину в лоб не называем
_INN = re.compile(r"(?<!\d)(\d{10}|\d{12})(?!\d)")
_BARE = re.compile(r"(?<![\d.,])(-?\d+(?:[.,]\d+)?)(?![\d])")  # минус: у ядра бывает DSCR −0.38
TOLERANCE = 0.005  # «141 800» вместо 141 839: округление до сотен допустимо


def allowed_numbers(view: dict | None, need: dict) -> list[float]:
    nums = [need.get("amount_rub"), need.get("term_months")]
    if view:
        n = view["numbers"]
        nums += list(n.values()) + [n["rate_used"] * 100]
        nums += [x["flow"] for x in view.get("monthly_flow", [])]
        # пороги внутри текстов причин и шагов ядра («короче 6 месяцев», «больше 30% выручки»)
        texts = " ".join(x["text"] for x in view.get("reasons", []) + view.get("next_steps", []))
        nums += [float(m.replace(",", ".")) for m in _BARE.findall(texts)]
    return [float(x) for x in nums if isinstance(x, (int, float))]


def _match(x: float, allowed: list[float]) -> bool:
    return any(abs(x - a) <= max(TOLERANCE * abs(a), 0.01) for a in allowed)


def check(text: str, view: dict | None, need: dict, expect_question: bool = True) -> list[str]:
    """Список нарушений; пустой список = ответ можно показывать."""
    low = text.lower()
    bad = [f"запретное слово «{w}»" for w in FORBIDDEN if w in low]
    bad += [f"жаргон «{w}»" for w in JARGON if w in low]
    if view and view.get("status") == "need_manager":
        bad += [f"причина стопа в лоб «{w}»" for w in STOP_REASON if w in low]
    if _INN.search(text.replace(" ", "")):
        bad.append("похоже на ИНН")
    allowed = allowed_numbers(view, need)
    for rub in money(text):
        if not _match(rub, allowed):
            bad.append(f"сумма {rub:,.0f} не из ответа ядра".replace(",", " "))
    no_money = re.sub(r"\d+(?:[  ]\d{3})+", " ", text)
    for m in _BARE.finditer(no_money):
        x = float(m.group(1).replace(",", "."))
        if x < 1000 and not _match(x, allowed + [1.0]):  # от 1000 и выше уже проверил money()
            bad.append(f"число {m.group(1)} не из ответа ядра")
    questions = text.count("?")
    if expect_question and questions != 1:
        bad.append(f"вопросов {questions}, а нужен ровно один")
    return bad
