"""Проверка запроса до ядра. Базовый слой; полная защита по hw/sasha/security-task-qwen.md (THREAT_MODEL.md, когда будет).

Каждая проверка кидает Reject: код ответа + текст для клиента без внутренностей сервера.
"""
import csv
import datetime
import io
import json
import os

MAX_BODY = int(os.getenv("MAX_BODY_BYTES", 5 * 1024 * 1024))
MAX_ROWS = int(os.getenv("MAX_ROWS", 50_000))
MAX_FIELD = 1000      # контрагент и назначение платежа; в банке назначение до 210 символов
MAX_TEXT = 500        # свободные строки в need и анкете: они уходят в журнал
COLUMNS = {"date", "amount", "counterparty", "purpose"}
NEED_PURPOSES = {"кассовый разрыв", "закупка под контракт", "оборудование", "сезон", "рост"}
ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍⁠﻿"))


class Reject(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


def check_headers(content_type, content_length):
    if not (content_type or "").startswith("application/json"):
        raise Reject(415, "нужен JSON")
    if content_length is None:
        raise Reject(411, "нет длины запроса")
    if content_length < 0:  # read(-1) ждал бы конца соединения и держал поток
        raise Reject(400, "кривая длина запроса")
    if content_length > MAX_BODY:
        raise Reject(413, f"запрос больше {MAX_BODY // 1024 // 1024} МБ")


def _amount(raw: str) -> float:
    """«-1 234,56» из выгрузки банка → -1234.56. Не число → ValueError."""
    s = raw.strip().replace(" ", "").replace(" ", "")
    if "," in s and "." not in s:
        s = s.replace(",", ".")
    v = float(s)
    if v != v or abs(v) > 1e12:  # NaN и бесконечности тоже float
        raise ValueError(raw)
    return v


def clean_statement(csv_text: str) -> str:
    """Проверяет выписку построчно и пересобирает её в чистый CSV из четырёх колонок.

    Ядро получает только то, что прошло проверку: дата ГГГГ-ММ-ДД, сумма числом, текстовые поля до MAX_FIELD.
    """
    try:
        reader = csv.DictReader(io.StringIO(csv_text, newline=""))
        if not COLUMNS <= set(reader.fieldnames or []):
            raise Reject(422, "в выписке нужны колонки: date, amount, counterparty, purpose")
        out = io.StringIO()
        w = csv.writer(out, lineterminator="\n")
        w.writerow(["date", "amount", "counterparty", "purpose"])
        n = 0
        for n, r in enumerate(reader, start=2):
            if n > MAX_ROWS:
                raise Reject(413, f"в выписке больше {MAX_ROWS} строк")
            date = (r["date"] or "").strip()
            try:
                datetime.date.fromisoformat(date)
            except ValueError:
                raise Reject(422, f"строка {n}: дата «{date[:20]}» не в формате ГГГГ-ММ-ДД")
            try:
                amount = _amount(r["amount"] or "")
            except ValueError:
                raise Reject(422, f"строка {n}: сумма «{(r['amount'] or '')[:20]}» не число")
            text = [(r[k] or "").strip() for k in ("counterparty", "purpose")]
            if any(len(t) > MAX_FIELD for t in text):
                raise Reject(422, f"строка {n}: текст длиннее {MAX_FIELD} символов")
            w.writerow([date, f"{amount:.2f}", *text])
    except csv.Error:
        raise Reject(422, "выписка не читается как CSV")
    if n < 2:
        raise Reject(422, "в выписке нет операций")
    return out.getvalue()


def parse(body: bytes) -> dict:
    try:
        req = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise Reject(400, "запрос не читается как JSON")
    if not isinstance(req, dict):
        raise Reject(400, "ждём объект JSON")

    csv_text = req.get("statement_csv")
    if not isinstance(csv_text, str) or not csv_text.strip():
        raise Reject(422, "нет выписки")
    if csv_text.count("\n") > MAX_ROWS:
        raise Reject(413, f"в выписке больше {MAX_ROWS} строк")
    req["statement_csv"] = clean_statement(csv_text.translate(ZERO_WIDTH))
    # TODO(THREAT_MODEL): омоглифы, нормализация Unicode, CSV-инъекция формул

    need = req.get("need")
    if not isinstance(need, dict):
        raise Reject(422, "нет блока need")
    if need.get("purpose") not in NEED_PURPOSES:
        raise Reject(422, "непонятно, на что нужны деньги")
    for key in ("amount_rub", "term_months"):
        v = need.get(key)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or v <= 0:
            raise Reject(422, f"поле need.{key} должно быть положительным числом")
    if not 1 <= need["term_months"] <= 120:
        raise Reject(422, "срок от 1 до 120 месяцев")

    q = req.get("questionnaire")
    if not isinstance(q, dict) or not {"form", "years"} <= set(q):
        raise Reject(422, "нет анкеты: form и years обязательны")

    for block in (need, q):
        if any(isinstance(v, str) and len(v) > MAX_TEXT for v in block.values()):
            raise Reject(422, f"текстовые поля анкеты до {MAX_TEXT} символов")

    if not isinstance(req.setdefault("confirmed_fields", {}), dict):
        raise Reject(422, "confirmed_fields должен быть объектом")
    if not isinstance(req.setdefault("history", []), list):
        raise Reject(422, "history должен быть списком")
    for where, contract in (("need", need.get("contract_with_main_customer")),
                            ("confirmed_fields", req["confirmed_fields"].get("contract_main_customer"))):
        if contract is not None:
            check_contract(contract, where)
    return req


def check_contract(c, where):
    if not isinstance(c, dict):
        raise Reject(422, f"{where}: договор должен быть объектом")
    s, m = c.get("sum_rub"), c.get("months")
    if not isinstance(s, (int, float)) or isinstance(s, bool) or not 0 < s < 1e11:
        raise Reject(422, f"{where}: сумма договора должна быть положительным числом")
    if not isinstance(m, int) or isinstance(m, bool) or not 1 <= m <= 120:
        raise Reject(422, f"{where}: срок договора от 1 до 120 месяцев целым числом")
