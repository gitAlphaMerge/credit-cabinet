import json
import threading
import urllib.request
from http.server import HTTPServer
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def run_server():
    httpd = HTTPServer(("127.0.0.1", 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def post(httpd, payload):
    request = urllib.request.Request(
        f"http://127.0.0.1:{httpd.server_port}/turn",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def test_health_and_turn_uses_known_card_fields(monkeypatch):
    httpd = run_server()
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{httpd.server_port}/health") as r:
            assert json.load(r) == {"ok": True}
        result = post(httpd, {
            "session_id": "known-card",
            "text": "Здравствуйте",
            "card": {"purpose": "оборудование", "amount_rub": 500000,
                     "term_months": 12, "instrument": "лизинг", "documents": [], "obligations": []},
        })
        assert result["mode"] == "team-agent"
        assert "выписк" in result["text"].lower()
        assert "сумм" not in result["text"].lower()
        assert "срок" not in result["text"].lower()
    finally:
        httpd.shutdown()


def test_sessions_are_isolated(monkeypatch):
    server.SESSIONS.clear()
    httpd = run_server()
    try:
        card = {"purpose": "оборудование", "amount_rub": 500000, "term_months": 12}
        post(httpd, {"session_id": "one", "text": "привет", "card": card})
        post(httpd, {"session_id": "two", "text": "привет", "card": {}})
        assert server.SESSIONS["one"]["need"]["purpose"] == "оборудование"
        assert "purpose" not in server.SESSIONS["two"]["need"]
    finally:
        httpd.shutdown()


def test_card_allowlist_drops_personal_data(monkeypatch):
    httpd = run_server()
    try:
        post(httpd, {"session_id": "private", "text": "привет", "card": {
            "purpose": "оборудование", "amount_rub": 500000, "term_months": 12,
            "inn": "123456789012", "name": "Иван Иванов", "phone": "+79990000000",
            "email": "x@example.com", "company": "ООО Ромашка", "account": "407028...",
        }})
        state = server.SESSIONS["private"]
        serialized = json.dumps(state, ensure_ascii=False)
        for secret in ("123456789012", "Иван Иванов", "+79990000000", "x@example.com", "ООО Ромашка", "407028"):
            assert secret not in serialized
    finally:
        httpd.shutdown()
