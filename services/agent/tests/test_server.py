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


def test_health_and_turn_uses_known_card_fields(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "AGENT_LOG", tmp_path / "team-agent.log")
    monkeypatch.setattr(server.llm, "available", lambda: False)
    httpd = run_server()
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{httpd.server_port}/health") as r:
            health = json.load(r)
            assert health["ok"] is True
            assert health["llm"] == "templates"
            assert "started_at" in health and "turns" in health
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


def test_sessions_are_isolated(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "AGENT_LOG", tmp_path / "team-agent.log")
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


def test_card_allowlist_drops_personal_data(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "AGENT_LOG", tmp_path / "team-agent.log")
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


def test_turn_uses_llm_slots_when_available_and_logs_no_reply(monkeypatch, tmp_path):
    server.SESSIONS.clear()
    server.TURNS = 0
    log_path = tmp_path / "team-agent.log"
    monkeypatch.setattr(server, "AGENT_LOG", log_path)
    monkeypatch.setattr(server.llm, "available", lambda: True)
    monkeypatch.setattr(server.llm, "intake", lambda text, asking: {})
    monkeypatch.setattr(server.llm, "explain", lambda view, need: "LLM reply with private text")
    monkeypatch.setattr(server.guard, "check", lambda *_args: [])
    httpd = run_server()
    try:
        result = post(httpd, {"session_id": "llm-session", "text": "Здравствуйте"})
        assert result["llm"] == server.llm.MODEL
        assert "на что нужны деньги" in result["text"].lower()
        events = [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines()]
        assert len(events) == 1
        assert events[0]["event"] == "agent_turn"
        assert events[0]["session_id"] == "llm-session"
        assert "reply" not in events[0] and "text" not in events[0]
        with urllib.request.urlopen(f"http://127.0.0.1:{httpd.server_port}/health") as response:
            health = json.load(response)
        assert health["llm"] == server.llm.MODEL
        assert health["turns"] == 1
        assert health["started_at"]
    finally:
        httpd.shutdown()


def test_llm_slots_fall_back_to_templates_on_llm_error(monkeypatch, tmp_path):
    server.SESSIONS.clear()
    monkeypatch.setattr(server, "AGENT_LOG", tmp_path / "team-agent.log")
    monkeypatch.setattr(server.llm, "available", lambda: True)
    monkeypatch.setattr(server.llm, "intake", lambda *_args: (_ for _ in ()).throw(RuntimeError("offline")))
    httpd = run_server()
    try:
        result = post(httpd, {"session_id": "fallback-session", "text": "Здравствуйте"})
        assert result["text"]
        event = json.loads((tmp_path / "team-agent.log").read_text(encoding="utf-8"))
        assert event["fallback"] is True
        assert result["llm"] == server.llm.MODEL
    finally:
        httpd.shutdown()


def test_key_uses_direct_key_only_for_deepseek_url(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_URL", "https://api.deepseek.com/chat/completions")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "direct-key")
    monkeypatch.setenv("OPENROUTER_API_KEY", "router-key")
    assert server.llm._key() == "direct-key"
    monkeypatch.delenv("DEEPSEEK_API_KEY")
    assert server.llm._key() is None
    monkeypatch.setenv("AGENT_LLM_URL", "https://openrouter.ai/api/v1/chat/completions")
    assert server.llm._key() == "router-key"
    # на сервере ключ OpenRouter лежит в секрете DEEPSEEK_API_KEY
    monkeypatch.delenv("OPENROUTER_API_KEY")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "router-key-in-deepseek-secret")
    assert server.llm._key() == "router-key-in-deepseek-secret"


def test_llm_proxy_is_used_when_set(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROXY", "http://egress:7890")
    handlers = [h for h in server.llm._opener().handlers if isinstance(h, server.llm.urllib.request.ProxyHandler)]
    assert handlers and handlers[0].proxies["https"] == "http://egress:7890"
