"""LLM-слоты агента через OpenAI-совместимый API (OpenRouter для eval на ноуте; на сервере YC OpenRouter даёт 403,
там нужен прямой DeepSeek API — меняется AGENT_LLM_URL). Только стандартная библиотека.

Ключ: OPENROUTER_API_KEY в .env корня репо. Нет ключа → available() == False, агент работает на шаблонах.
"""
import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
URL = os.getenv("AGENT_LLM_URL", "https://openrouter.ai/api/v1/chat/completions")
MODEL = os.getenv("AGENT_LLM_MODEL", "deepseek/deepseek-v4.1-flash")


def _key() -> str | None:
    if os.getenv("OPENROUTER_API_KEY"):
        return os.environ["OPENROUTER_API_KEY"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                return line.split("=", 1)[1].strip()
    return None


def available() -> bool:
    return bool(_key())


def chat(system: str, user: str, model: str = MODEL, as_json: bool = False, temperature: float = 0.0) -> str:
    body = {"model": model, "temperature": temperature,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if as_json:
        body["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(URL, json.dumps(body).encode("utf-8"), {
        "Content-Type": "application/json", "Authorization": f"Bearer {_key()}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["choices"][0]["message"]["content"]


INTAKE_SYSTEM = """Ты разбираешь реплику предпринимателя в чате кредитного помощника. Верни JSON только с теми полями,
которые в реплике действительно есть. Не угадывай: нет суммы — нет amount_rub.
Поля: purpose — одно из "кассовый разрыв", "закупка под контракт", "оборудование", "сезон", "рост";
amount_rub — целое, рубли, сколько клиент ПРОСИТ (не сумма договора; при «не X, а Y» берётся Y);
term_months — целое, на сколько месяцев (дни переводи в месяцы);
repay_from — из чего вернёт, словами клиента;
contract_with_main_customer — {"sum_rub": целое, "months": целое}, только если назван договор с суммой и сроком.
Учитывай ошибки распознавания голоса («один и пять миллиона» = 1 500 000) и сленг («лям», «косарь» = 1000).
Помощник только что спросил: {asking}. Ответь только JSON."""

_TYPES = {"purpose": str, "amount_rub": int, "term_months": int, "repay_from": str, "contract_with_main_customer": dict}
_PURPOSES = {"кассовый разрыв", "закупка под контракт", "оборудование", "сезон", "рост"}


def intake(text: str, asking: str | None) -> dict:
    raw = json.loads(chat(INTAKE_SYSTEM.replace("{asking}", str(asking or "ничего, это первое сообщение")), text,
                          as_json=True))
    out = {k: v for k, v in raw.items() if k in _TYPES and isinstance(v, _TYPES[k]) and v not in ("", 0)}
    if isinstance(out.get("purpose"), str):
        out["purpose"] = out["purpose"].strip().lower()  # «Кассовый разрыв» с большой буквы терялся целиком
    if out.get("purpose") not in _PURPOSES:
        out.pop("purpose", None)
    deal = out.get("contract_with_main_customer")
    if deal and not (isinstance(deal.get("sum_rub"), int) and isinstance(deal.get("months"), int)):
        out.pop("contract_with_main_customer")
    return out


EXPLAIN_SYSTEM = """Ты кредитный помощник для ИП и ООО. Объясни клиенту ответ расчётного ядра (JSON ниже).
Правила: на «вы», 2–4 коротких предложения, как толковый клиентский менеджер; называй только числа из JSON,
ничего не считай сам; никогда не говори «одобрено» и не обещай кредит, решение принимает банк; в конце ровно один
вопрос — следующий шаг из next_steps, либо «позвать менеджера», если статус need_manager; без эмодзи."""


def explain(view: dict, need: dict) -> str:
    safe = {k: v for k, v in view.items() if k != "contract"}  # в contract имя плательщика из выписки: в LLM не уходит
    payload = {"view": safe, "client_asked": {"amount_rub": need.get("amount_rub"), "term_months": need.get("term_months"),
                                              "purpose": need.get("purpose")}}
    return chat(EXPLAIN_SYSTEM, json.dumps(payload, ensure_ascii=False)).strip()
