"""Small stdlib HTTP adapter for the deterministic/template agent."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import dialog
import intake_rules

SESSIONS: dict[str, dict] = {}
MAX_BODY = 1_000_000


def _number(value, low=0, high=10**12):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and low <= value <= high else None


def _card(raw):
    """Copy only explicitly approved, non-identifying card fields."""
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    purpose = raw.get("purpose")
    if isinstance(purpose, str) and purpose in {"кассовый разрыв", "закупка под контракт", "оборудование", "сезон", "рост"}:
        out["purpose"] = purpose
    if (value := _number(raw.get("amount_rub"), 1, 10**12)) is not None:
        out["amount_rub"] = int(value)
    if (value := _number(raw.get("term_months"), 1, 120)) is not None:
        out["term_months"] = int(value)
    if isinstance(raw.get("instrument"), str):
        out["instrument"] = raw["instrument"][:100]
    out["documents"] = [
        {k: item[k][:100] for k in ("category", "period") if isinstance(item.get(k), str)}
        for item in raw.get("documents", [])[:20] if isinstance(item, dict)
    ] if isinstance(raw.get("documents"), list) else []
    out["obligations"] = [
        {"type": item["type"][:80], "amount_rub": int(_number(item.get("amount_rub"), 0, 10**9))}
        for item in raw.get("obligations", [])[:20]
        if isinstance(item, dict) and isinstance(item.get("type"), str)
        and _number(item.get("amount_rub"), 0, 10**9) is not None
    ] if isinstance(raw.get("obligations"), list) else []
    return out


def _new_state(card):
    state = dialog.new_state({"form": "ООО", "years": "больше 3"})
    state["need"].update({k: card[k] for k in ("purpose", "amount_rub", "term_months") if k in card})
    # Repayment source is verified against the statement later; this avoids asking for a
    # field the cabinet cannot supply before the first required upload.
    if all(k in state["need"] for k in ("purpose", "amount_rub", "term_months")):
        state["need"]["repay_from"] = "поступления бизнеса, уточнить по выписке"
    return state


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, value):
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/turn":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError
            session_id, text = payload.get("session_id"), payload.get("text")
            if not isinstance(session_id, str) or not session_id or len(session_id) > 200:
                raise ValueError
            if not isinstance(text, str) or not text.strip() or len(text) > 4000:
                raise ValueError
        except (ValueError, TypeError, json.JSONDecodeError):
            self._json(400, {"error": "invalid request"})
            return
        card = _card(payload.get("card"))
        state = SESSIONS.setdefault(session_id, _new_state(card))
        try:
            reply = dialog.turn(state, text, intake=intake_rules.parse)
            view = state.get("view")
            self._json(200, {
                "text": reply, "mode": "team-agent",
                "status": view.get("status") if view else ("collecting" if state.get("asking") else "ready"),
                "view": view,
            })
        except Exception:
            self._json(500, {"error": "agent unavailable"})

    def log_message(self, *_args):
        pass


def main():
    port = int(os.environ.get("AGENT_PORT", "8090"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
