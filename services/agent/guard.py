"""Страж ответа агента: всё, что проверяется кодом, проверяется кодом. Это и защита в проде, и метрика eval уровня 1.

Нарушение → в проде вместо текста LLM уходит шаблон, в eval тест краснеет.
"""
import re

from intake_rules import money, PII_DIGITS, _MONEY, _to_rub

FORBIDDEN = ("одобрен", "одобрим", "гарантир", "точно дадут", "вам дадут", "кредит ваш")
JARGON = ("dscr", "cfads", "ковенант", "скоринг", "ядр", "систем", "модел", "покрытия долга", "покрытие долга", "обслуживания долга")
STOP_REASON = ("исполнительн", "арест", "пристав")  # ситуация 13: при «нужен менеджер» причину в лоб не называем
_INN = re.compile(r"(?<!\d)(\d{10}|\d{12})(?!\d)")
_BARE = re.compile(r"(?<![\d.,])(-?\d+(?:[.,]\d+)?)(?![\d])")  # минус: у ядра бывает DSCR −0.38
TOLERANCE = 0.005  # «141 800» вместо 141 839: округление до сотен допустимо


def numbers(text: str) -> list[float]:
    values = money(text)
    for match in _MONEY.finditer(text):
        value = _to_rub(match.group(1), match.group(2))
        if match.start() and text[match.start() - 1] in "-−":
            value = -value
        values.append(value)
    return values


def allowed_numbers(view: dict | None, need: dict, client_text: str = "") -> list[float]:
    # Canonical need values authorize every spelling recognized by numbers().
    nums = [need.get("amount_rub"), need.get("term_months")]
    if view:
        n = view.get("numbers", {})
        nums += list(n.values())
        if isinstance(n.get("rate_used"), (int, float)):
            nums.append(n["rate_used"] * 100)
        nums += [x["flow"] for x in view.get("monthly_flow", [])]
        # пороги внутри текстов причин и шагов ядра («короче 6 месяцев», «больше 30% выручки»)
        texts = " ".join(x["text"] for x in view.get("reasons", []) + view.get("next_steps", []))
        nums += [float(m.replace(",", ".")) for m in _BARE.findall(texts)]
    nums += numbers(client_text)
    return [float(x) for x in nums if isinstance(x, (int, float)) and not isinstance(x, bool)]


def _match(x: float, allowed: list[float]) -> bool:
    return any(abs(x - a) <= max(TOLERANCE * abs(a), 0.01) for a in allowed)


def pii_warning_safe(text: str, client_text: str) -> bool:
    """Accept a request to stop sharing private data without echoing their values."""
    low = text.lower()
    warning = re.search(
        r"(?:не\s+(?:присылайте|отправляйте|передавайте|публикуйте|сообщайте|пишите|нужно|надо)|"
        r"(?:присылать|отправлять|передавать|публиковать|сообщать|писать).{0,25}не\s+(?:нужно|надо))", low)
    subject = re.search(r"данн|парол|код|документ|в\s+чат", low)
    if not warning or not subject or PII_DIGITS.search(text):
        return False
    # Digit patterns are handled above; also protect nonnumeric passwords/logins.
    secrets = re.findall(r"(?:парол[а-яё]*|логин|cvv|cvc)\s*[:=]?\s*([^\s,;.!?]+)", client_text, re.I)
    return not any(secret.lower() in low for secret in secrets)


def check(text: str, view: dict | None, need: dict, expect_question: bool = True,
          client_text: str = "") -> list[str]:
    """Список нарушений; пустой список = ответ можно показывать."""
    low = text.lower()
    bad = [f"запретное слово «{w}»" for w in FORBIDDEN if w in low]
    bad += [f"жаргон «{w}»" for w in JARGON if w in low]
    if view and view.get("status") == "need_manager":
        bad += [f"причина стопа в лоб «{w}»" for w in STOP_REASON if w in low]
    if PII_DIGITS.search(text):
        bad.append("похоже на ИНН, паспорт, карту или СНИЛС")
    if len(text) > 450:
        bad.append("длина больше 450")
    if "—" in text or "–" in text:
        bad.append("длинное тире")
    if not text.strip():
        bad.append("пустой ответ")
    allowed = allowed_numbers(view, need, client_text)
    for number in numbers(text):
        if not _match(number, allowed):
            display = f"{number:,.0f}".replace(",", " ") if abs(number) >= 1000 else str(number)
            bad.append(f"число {display} не из ответа ядра или слов клиента")
    questions = text.count("?")
    if questions > 1:
        bad.append(f"вопросов {questions}, допустим не больше одного")
    return bad
