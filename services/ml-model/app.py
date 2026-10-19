"""Окошко ml-model: GET /health, POST /score. Только стандартная библиотека, чтобы жюри поднимало без pip.

Путь запроса: security (проверки) → guards (договор не выше истории платежей) → cores (какое ядро) → ядро
→ translate (язык сайта) → journal (запись решения).
Контракт полей: context/api-contract.md (черновик).
"""
import hashlib
import logging
import json
import os
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cores
import guards
import journal
import security
from core_stub import UnknownStatement
from translate import to_view

PORT = int(os.getenv("PORT", 5000))


class Handler(BaseHTTPRequestHandler):
    timeout = 15  # медленный клиент не держит поток вечно

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            score_fn, version = cores.REGISTRY[cores.DEFAULT]
            self._send(200, {"status": "ok", "core_id": cores.DEFAULT, "model_version": version})
        else:
            self._send(404, {"error": "нет такого окна"})

    def do_POST(self):
        if self.path != "/score":
            return self._send(404, {"error": "нет такого окна"})
        try:
            length = self.headers.get("Content-Length")
            security.check_headers(self.headers.get("Content-Type"), int(length) if length else None)
            req = security.parse(self.rfile.read(int(length)))
        except security.Reject as e:
            return self._send(e.code, {"error": e.message})
        except ValueError:
            return self._send(400, {"error": "кривая длина запроса"})

        try:
            decision = decide(req)
        except UnknownStatement as e:
            return self._send(422, {"error": str(e)})
        except Exception:
            self.log_error("ядро упало")
            return self._send(500, {"error": "не получилось посчитать, попробуйте ещё раз или позовите менеджера"})
        self._send(200, decision)


def decide(req: dict) -> dict:
    """Запрос уже прошёл security.parse → решение. Отдельно от HTTP: агент на ноуте и eval зовут его напрямую (services/agent/core_local.py)."""
    core_id = cores.route(req["questionnaire"])
    score_fn, version = cores.REGISTRY[core_id]
    need = dict(req["need"])
    confirmed = req["confirmed_fields"].get("contract_main_customer")
    claimed = need.pop("contract_with_main_customer", None)
    contract, basis = (confirmed, "confirmed") if confirmed else (claimed, "client_said") if claimed else (None, None)
    contract_note = None
    if contract:
        need["contract_with_main_customer"], contract_note = guards.cap_contract(req["statement_csv"], contract)
        contract_note["basis"] = basis

    core = score_fn(req["statement_csv"], need, req["questionnaire"])
    params = core.get("params", {"rate": 0.24, "dscr_min": 1.25})
    decision = {
        "decision_id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "core_id": core_id,
        "model_version": version,
        "core": core,
        "view": to_view(core, need, params["rate"], params["dscr_min"]),
    }
    # откуда «после шага»: подтверждено документом / со слов клиента; урезано ли до истории платежей
    decision["view"]["contract"] = contract_note
    try:
        journal.write({
            "decision_id": decision["decision_id"],
            "created_at": decision["created_at"],
            "core_id": core_id,
            "model_version": version,
            "input_sha256": hashlib.sha256(req["statement_csv"].encode("utf-8")).hexdigest(),
            "need": req["need"],
            "status": core["status"],
            "limit_now_rub": round(core["limit_now_rub"]),
            "limit_after_rub": round(core["limit_after_rub"]),
        })
    except Exception:
        logging.getLogger(__name__).exception("journal write failed")  # журнал не валит ответ
    return decision

if __name__ == "__main__":
    print(f"ml-model: ядро {cores.DEFAULT}, порт {PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
