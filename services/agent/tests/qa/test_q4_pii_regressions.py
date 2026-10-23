"""Exercise production handler without sockets, providers, or external services."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import server

SECRETS = ("771234567890", "79991234567", "Синтетиков Тест Тестович")
CLIENT_TEXT = "ИНН " + SECRETS[0] + ", телефон " + SECRETS[1] + ", ФИО " + SECRETS[2]


def persisted_turn(monkeypatch, tmp_path, application=False):
    monkeypatch.setenv("AGENT_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setattr(server, "AGENT_LOG", tmp_path / "agent.log")
    monkeypatch.setattr(server, "MEMORY_ON", False)
    monkeypatch.setattr(server.llm, "available", lambda: False)
    server.SESSIONS.clear()
    responses = []
    handler = server.Handler.__new__(server.Handler)
    handler._json = lambda code, data: responses.append((code, data))
    card = {"application": {"id": "q4-application", "status": "info_requested",
                            "holes": ["statement"], "alternatives": []}} if application else {}
    handler._turn("q4-private", CLIENT_TEXT, card,
                  mode="objections" if application else None)
    assert responses and responses[-1][0] == 200, responses
    session_path = server._session_path("q4-private")
    saved = json.loads(session_path.read_text(encoding="utf-8"))
    return saved, (tmp_path / "agent.log").read_text(encoding="utf-8"), responses[-1][1]


def test_metadata_log_and_customer_warning_do_not_echo_private_values(monkeypatch, tmp_path):
    for application in (False, True):
        saved, log, response = persisted_turn(monkeypatch, tmp_path, application)
        assert saved["history"] and saved["trace"], "exercise the persisted path"
        scans = {field: [label for label, secret in zip(("inn", "phone", "fio"), SECRETS)
                         if secret in json.dumps(saved[field], ensure_ascii=False)]
                 for field in ("history", "trace")}
        scans["agent.log"] = [label for label, secret in zip(("inn", "phone", "fio"), SECRETS)
                              if secret in log]
        print("Q4_PII_SCAN=" + json.dumps({"application": application,
              "file": str(server._session_path("q4-private")), "matches": scans}, ensure_ascii=False))
        assert "не присылайте" in response["text"].lower()
        for secret in SECRETS:
            assert secret not in log
            assert secret not in response["text"]
        assert json.loads(log.splitlines()[-1])["event"] == "agent_turn"
