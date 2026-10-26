import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import llm


@pytest.mark.parametrize("key", ["", "test-key"])
def test_custom_endpoint_model_and_optional_key(monkeypatch, key):
    monkeypatch.setenv("AGENT_LLM_URL", "http://custom.local/v1/chat/completions")
    monkeypatch.setenv("AGENT_LLM_MODEL", "custom-model")
    monkeypatch.setenv("AGENT_LLM_API_KEY", key)
    requests = []

    class Opener:
        def open(self, request, timeout):
            requests.append(request)
            assert timeout >= 30
            return io.BytesIO(b'{"choices":[{"message":{"content":"ok"}}]}')

    monkeypatch.setattr(llm, "_opener", Opener)
    assert llm.chat("system", "user") == "ok"
    request = requests[0]
    assert request.full_url == "http://custom.local/v1/chat/completions"
    body = json.loads(request.data)
    assert body["model"] == "custom-model"
    assert "reasoning" not in body and "provider" not in body
    assert request.get_header("Authorization") == (f"Bearer {key}" if key else None)


def test_defaults_and_disabled_url(monkeypatch):
    monkeypatch.delenv("AGENT_LLM_URL", raising=False)
    monkeypatch.delenv("AGENT_LLM_MODEL", raising=False)
    assert llm.URL == ""
    assert llm.MODEL == "qwen3:8b"
    assert not llm.available()
    monkeypatch.setenv("AGENT_LLM_URL", "")
    monkeypatch.setattr(llm, "_opener", lambda: pytest.fail("network attempted"))
    assert not llm.available()
    with pytest.raises(RuntimeError, match="disabled"):
        llm.chat("system", "user")


def test_openrouter_extras_stay_opt_in(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_URL", "https://openrouter.ai/api/v1/chat/completions")
    monkeypatch.setenv("AGENT_LLM_API_KEY", "test")
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "provider")
    seen = []

    class Opener:
        def open(self, request, timeout):
            seen.append(json.loads(request.data))
            return io.BytesIO(b'{"choices":[{"message":{"content":"ok"}}]}')

    monkeypatch.setattr(llm, "_opener", Opener)
    llm.chat("system", "user")
    assert seen[0]["reasoning"] == {"enabled": False}
    assert seen[0]["provider"]["order"] == ["provider"]


def test_speak_dash_is_normalized_before_guard():
    import llm
    assert llm._no_long_dash("Лимит сейчас — 800 тысяч — после шага больше") == "Лимит сейчас, 800 тысяч, после шага больше"
    assert llm._no_long_dash("Срок 10–12 месяцев") == "Срок 10-12 месяцев"
