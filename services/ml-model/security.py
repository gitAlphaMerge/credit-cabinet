"""Проверка запроса до ядра. Базовый слой; полная защита по hw/sasha/security-task-qwen.md (THREAT_MODEL.md, когда будет).

Каждая проверка кидает Reject: код ответа + текст для клиента без внутренностей сервера.
"""
import csv
import io
import json
import os

MAX_BODY = int(os.getenv("MAX_BODY_BYTES", 5 * 1024 * 1024))
MAX_ROWS = int(os.getenv("MAX_ROWS", 50_000))
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
    csv_text = csv_text.translate(ZERO_WIDTH)
    if not COLUMNS <= set(csv.DictReader(io.StringIO(csv_text)).fieldnames or []):
        raise Reject(422, "в выписке нужны колонки: date, amount, counterparty, purpose")
    # TODO(THREAT_MODEL): омоглифы, нормализация Unicode, CSV-инъекция формул, проверка дат и сумм построчно
    req["statement_csv"] = csv_text

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

    if not isinstance(req.setdefault("confirmed_fields", {}), dict):
        raise Reject(422, "confirmed_fields должен быть объектом")
    if not isinstance(req.setdefault("history", []), list):
        raise Reject(422, "history должен быть списком")
    return req
