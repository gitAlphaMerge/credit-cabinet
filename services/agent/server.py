"""Small stdlib HTTP adapter for the deterministic/template agent."""
import hmac
from urllib.parse import urlsplit, parse_qs
import hashlib
import json
import os
import threading
import tempfile
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import dialog
import core_http
import explain_templates
import intake_rules
import llm
import guard
import memory

SESSIONS: dict[str, dict] = {}
MAX_BODY = 1_000_000
# в репо это корень проекта, в контейнере файлы лежат в /app и глубже некуда
_HERE = Path(__file__).resolve().parent
ROOT = _HERE.parents[1] if len(_HERE.parents) > 1 else _HERE
# память клиента: лишний LLM-вызов на каждый ход, по умолчанию выключена (AGENT_MEMORY=1 включает)
MEMORY_ON = os.getenv("AGENT_MEMORY", "0") == "1"


def _usage():
    calls = list(llm.USAGE)
    if not calls:
        return {}
    cached = sum((u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0 for u in calls)
    return {"calls": len(calls), "tok_in": sum(u.get("prompt_tokens") or 0 for u in calls),
            "tok_cached": cached, "tok_out": sum(u.get("completion_tokens") or 0 for u in calls),
            "cost": round(sum(u.get("cost") or 0 for u in calls), 6)}


AGENT_LOG = Path(os.getenv("AGENT_LOG", str(ROOT / "var" / "log" / "team-agent.log")))
STARTED_AT = datetime.now(timezone.utc).isoformat()
TURNS = 0
_LOG_LOCK = threading.Lock()
_TURN_LOCK = threading.Lock()
_SESSION_LOCKS = {}


def _session_path(session_id):
    root = Path(os.getenv("AGENT_STATE_DIR", str(Path(__file__).resolve().parent / "var")))
    return root / "sessions" / (hashlib.sha256(session_id.encode("utf-8")).hexdigest() + ".json")


def _load_session(session_id, card):
    path = _session_path(session_id)
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(state, dict):
            raise ValueError("invalid state")
        for key in ("questionnaire", "need", "confirmed_fields", "attempts"):
            if not isinstance(state.get(key), dict):
                raise ValueError("invalid slots")
        if ("asking" not in state or "view" not in state
                or not isinstance(state.get("trace"), list)
                or any(not isinstance(turn, dict) for turn in state["trace"])
                or state["asking"] not in (None, *dialog.QUESTIONS)):
            raise ValueError("invalid conversation")
        if state["view"] is not None and (not isinstance(state["view"], dict)
                                          or not isinstance(state["view"].get("status_text"), str)):
            raise ValueError("invalid view")
        if any(not isinstance(value, int) or value < 0 for value in state["attempts"].values()):
            raise ValueError("invalid attempts")
        history = state.get("history", [])
        if not isinstance(history, list) or any(
            not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}
            or not isinstance(item.get("text"), str) for item in history
        ):
            raise ValueError("invalid history")
        state["history"] = history[-8:]
        # A hash cannot be used for recalculation. Ask for the statement again.
        state["statement_csv"] = None
        return state
    except FileNotFoundError:
        pass
    except (OSError, ValueError, UnicodeError):
        _log({"event": "session_load_error", "session_sha256": path.stem})
    return _new_state(card)


def _save_session(session_id, state):
    path = _session_path(session_id)
    saved = dict(state)
    saved.pop("client_memory", None)
    statement = saved.pop("statement_csv", None)
    saved["has_statement"] = bool(statement) or bool(state.get("has_statement"))
    if statement:
        saved["statement_sha256"] = hashlib.sha256(statement.encode("utf-8")).hexdigest()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Unique temporary names and per-session locks keep concurrent turns atomic.
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     suffix=".tmp", delete=False) as output:
        json.dump(saved, output, ensure_ascii=False)
        output.flush()
        os.fsync(output.fileno())
    os.replace(output.name, path)


def _log(event):
    try:
        AGENT_LOG.parent.mkdir(parents=True, exist_ok=True)
        with _LOG_LOCK, AGENT_LOG.open("a", encoding="utf-8") as output:
            output.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError:
        # Logging must never prevent the chat adapter from serving a request.
        pass


def _llm_name():
    return os.getenv("AGENT_LLM_MODEL", llm.MODEL) if llm.available() else "templates"


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
    if isinstance(raw.get("application"), dict):
        out["application"] = _application(raw["application"])
    return out


def _application(raw):
    """Allowlisted process snapshot, never a whole dossier or customer record."""
    out = {key: raw[key][:100] for key in ("id", "status", "red_reason")
           if isinstance(raw.get(key), str)}
    for key in ("n", "m", "limit_now_rub"):
        if (value := _number(raw.get(key))) is not None:
            out[key] = int(value)
    for key in ("holes", "reasons", "stops_fired"):
        values = raw.get(key)
        out[key] = []
        for item in values[:20] if isinstance(values, list) else []:
            if isinstance(item, str):
                out[key].append(item[:200])
            elif isinstance(item, dict):
                out[key].append({k: item[k][:200] for k in ("code", "text") if isinstance(item.get(k), str)})
    out["alternatives"] = []
    options = raw.get("alternatives")
    for item in options[:10] if isinstance(options, list) else []:
        if not isinstance(item, dict):
            continue
        option = {k: item[k][:100] for k in ("option_id", "kind", "product_id", "product_name", "product", "reason")
                  if isinstance(item.get(k), str)}
        for key in ("amount_rub", "term_months", "rate_annual_pct", "monthly_payment_rub"):
            if (value := _number(item.get(key))) is not None:
                option[key] = value
        out["alternatives"].append(option)
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
        self.wfile.flush()

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/admin/sessions":
            expected = os.getenv("FEEDBACK_EXPORT_TOKEN", "")
            if not expected:
                self._json(404, {"error": "not found"})
                return
            if not hmac.compare_digest(self.headers.get("Authorization", "").encode(),
                                       ("Bearer " + expected).encode()):
                self._json(401, {"error": "unauthorized"})
                return
            ids = parse_qs(parsed.query).get("ids", [""])[0].split(",")
            if not 1 <= len(ids) <= 200 or any(not i or len(i) > 200 for i in ids):
                self._json(400, {"error": "invalid ids"})
                return
            result = {}
            for session_id in ids:
                # Read the atomic on-disk snapshot; never initialize or mutate sessions.
                try:
                    state = json.loads(_session_path(session_id).read_text(encoding="utf-8"))
                    def clean(value):
                        if isinstance(value, dict):
                            return {k: clean(v) for k, v in value.items() if k != "statement_csv"}
                        if isinstance(value, list):
                            return [clean(v) for v in value]
                        return value
                    result[session_id] = clean({k: state.get(k) for k in ("trace", "need", "history")})
                except (OSError, ValueError, TypeError, AttributeError):
                    result[session_id] = None
            self._json(200, result)
            return
        if self.path == "/health":
            self._json(200, {"ok": True, "llm": _llm_name(), "memory": MEMORY_ON, "started_at": STARTED_AT, "turns": TURNS})
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
            client_id = payload.get("client_id")
            if client_id is not None and (not isinstance(client_id, str) or len(client_id) > 200):
                raise ValueError
            if not isinstance(session_id, str) or not session_id or len(session_id) > 200:
                raise ValueError
            mode = payload.get("mode")
            if mode not in (None, "nudge", "objections"):
                raise ValueError
            if not isinstance(text, str) or (not text.strip() and mode != "nudge") or len(text) > 4000:
                raise ValueError
        except (ValueError, TypeError, json.JSONDecodeError):
            self._json(400, {"error": "invalid request"})
            return
        with _TURN_LOCK:
            lock = _SESSION_LOCKS.setdefault(session_id, threading.Lock())
        with lock:
            if client_id:
                with memory.client_lock(client_id):
                    self._turn(session_id, text, _card(payload.get("card")), client_id, mode=mode)
            else:
                self._turn(session_id, text, _card(payload.get("card")), mode=mode)

    def _turn(self, session_id, text, card, client_id=None, mode=None):
        if session_id not in SESSIONS:
            SESSIONS[session_id] = _load_session(session_id, card)
        state = SESSIONS[session_id]
        try:
            client_memory = memory.active(memory.load(client_id)) if MEMORY_ON else []
            llm.USAGE.clear()
            if memory.forget_requested(text):
                client_memory = []
            use_llm = llm.available()
            fallback = False
            stage_ms = {"intake": 0, "core": 0, "speak": 0}

            def intake_slot(value, asking):
                nonlocal fallback
                stage_started = time.monotonic()
                try:
                    if not use_llm:
                        return intake_rules.parse(value, asking)
                    try:
                        return llm.intake(value, asking)
                    except Exception:
                        fallback = True
                        return intake_rules.parse(value, asking)
                finally:
                    stage_ms["intake"] += round((time.monotonic() - stage_started) * 1000)

            def decide_slot(*args):
                stage_started = time.monotonic()
                try:
                    return core_http.decide(*args)
                finally:
                    stage_ms["core"] += round((time.monotonic() - stage_started) * 1000)

            def speak_slot(*args):
                stage_started = time.monotonic()
                try:
                    return llm.speak(*args)
                finally:
                    stage_ms["speak"] += round((time.monotonic() - stage_started) * 1000)

            started = time.monotonic()
            decide = decide_slot if os.getenv("AGENT_CORE_URL") else None
            application = card.get("application")
            if application is not None or mode is not None:
                reply = dialog.application_turn(state, text, application or {}, mode)
            else:
                reply = dialog.turn(state, text, intake=intake_slot, decide=decide,
                                    speak=speak_slot if use_llm else None, client_memory=client_memory)
            _save_session(session_id, state)
            elapsed_ms = round((time.monotonic() - started) * 1000)
            view = state.get("view")
            llm_name = _llm_name()
            if state.get("trace"):
                fallback = fallback or bool(state["trace"][-1].get("violations"))
            with _TURN_LOCK:
                global TURNS
                TURNS += 1
            status = view.get("status") if view else ("collecting" if state.get("asking") else "ready")
            if application is not None:
                status = application.get("status", status)
            _log({"event": "agent_turn", "ts": datetime.now(timezone.utc).isoformat(),
                  "session_id": session_id, "status": status, "llm": llm_name,
                  "ms": elapsed_ms, "stage_ms": stage_ms,
                  **({"fallback": True} if fallback else {}), **_usage()})
            self._json(200, {
                "text": reply, "mode": "team-agent",
                "status": status, "llm": llm_name,
                "view": view,
                **({"objections_summary": state.get("objections_summary", "")} if mode == "objections" else {}),
            })
            try:
                if MEMORY_ON:
                    memory.update(client_id, text, reply, state, use_llm=use_llm)
            except Exception as error:
                _log({"event": "memory_update_error", "error_type": type(error).__name__})
        except Exception as error:
            _log({"event": "agent_turn_error", "error_type": type(error).__name__})
            self._json(500, {"error": "agent unavailable"})

    def log_message(self, *_args):
        pass


def main():
    port = int(os.environ.get("AGENT_PORT", "8090"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
