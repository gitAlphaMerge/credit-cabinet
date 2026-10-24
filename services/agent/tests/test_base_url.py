import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import llm


@pytest.mark.parametrize("base,expected", [
    ("https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1/chat/completions"),
    ("https://openrouter.ai/api/v1/", "https://openrouter.ai/api/v1/chat/completions"),
    ("http://host.docker.internal:11434/v1", "http://host.docker.internal:11434/v1/chat/completions"),
    ("http://127.0.0.1:11434/v1/chat/completions", "http://127.0.0.1:11434/v1/chat/completions"),
    ("https://foundation-models.api.cloud.ru/v1", "https://foundation-models.api.cloud.ru/v1/chat/completions"),
    ("  https://openrouter.ai/api/v1/chat/completions/  ", "https://openrouter.ai/api/v1/chat/completions"),
    ("", ""),
    ("   ", ""),
])
def test_normalized_url(monkeypatch, base, expected):
    monkeypatch.setenv("AGENT_LLM_URL", base)
    assert llm.base_url() == expected


def test_chat_posts_to_normalized_url(monkeypatch):
    paths = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            self.rfile.read(int(self.headers["Content-Length"]))
            paths.append(self.path)
            body = json.dumps({"choices": [{"message": {"content": "ok"}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("AGENT_LLM_URL", f"http://127.0.0.1:{httpd.server_port}/v1")
    monkeypatch.setenv("AGENT_LLM_API_KEY", "")
    monkeypatch.setenv("AGENT_LLM_PROXY", "")
    try:
        assert llm.chat("system", "user") == "ok"
        assert paths == ["/v1/chat/completions"]
    finally:
        httpd.shutdown()
        thread.join()
        httpd.server_close()


@pytest.mark.parametrize("value", [None, "", "   "])
def test_disabled_url_never_opens_network(monkeypatch, value):
    if value is None:
        monkeypatch.delenv("AGENT_LLM_URL", raising=False)
    else:
        monkeypatch.setenv("AGENT_LLM_URL", value)
    monkeypatch.setattr(llm, "_opener", lambda: pytest.fail("network attempted"))
    assert not llm.available()
    with pytest.raises(RuntimeError, match="disabled"):
        llm.chat("system", "user")
