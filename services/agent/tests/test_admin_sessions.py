import json
import threading
import urllib.error
import urllib.request
import sys
from pathlib import Path
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def test_admin_sessions(monkeypatch, tmp_path):
    monkeypatch.setenv("AGENT_STATE_DIR", str(tmp_path))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    worker = threading.Thread(target=httpd.serve_forever, daemon=True)
    worker.start()
    def get(ids="a", token=None):
        headers = {"Authorization": "Bearer " + token} if token else {}
        req = urllib.request.Request(f"http://127.0.0.1:{httpd.server_port}/admin/sessions?ids={ids}", headers=headers)
        try:
            with urllib.request.urlopen(req) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)
    try:
        monkeypatch.delenv("FEEDBACK_EXPORT_TOKEN", raising=False)
        assert get()[0] == 404
        monkeypatch.setenv("FEEDBACK_EXPORT_TOKEN", "test-secret")
        assert get()[0] == 401
        assert get(token="wrong")[0] == 401
        path = server._session_path("a")
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({"trace": [{"intent": "score", "statement_csv": "secret"}],
                                    "need": {"amount_rub": 100, "statement_csv": "secret"},
                                    "history": [{"role": "user", "text": "hello"}],
                                    "statement_csv": "secret"}), encoding="utf-8")
        code, result = get("a,missing", "test-secret")
        assert code == 200
        assert set(result["a"]) == {"trace", "need", "history"}
        assert result["a"]["need"] == {"amount_rub": 100}
        assert result["missing"] is None
        assert "statement_csv" not in json.dumps(result)
        assert get(",".join(str(i) for i in range(201)), "test-secret")[0] == 400
        assert get("", "test-secret")[0] == 400
    finally:
        httpd.shutdown()
        httpd.server_close()
        worker.join()
