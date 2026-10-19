import importlib.util
import json
import threading
import unittest
import io
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit, parse_qs

spec = importlib.util.spec_from_file_location("pull_history", Path(__file__).resolve().parents[1] / "pull_history.py")
pull_history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pull_history)


class PullHistoryTest(unittest.TestCase):
    def test_incremental_and_failed_download(self):
        output = io.StringIO()
        redirect = redirect_stdout(output)
        redirect.__enter__()
        self.addCleanup(redirect.__exit__, None, None, None)
        requests = []
        fail = False
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.assert_token = self.headers.get("Authorization")
                if self.assert_token != "Bearer secret":
                    self.send_error(401)
                    return
                parsed = urlsplit(self.path)
                requests.append((parsed.path, parse_qs(parsed.query)))
                if fail and "feedback" in parsed.path:
                    self.send_error(503)
                    return
                history = "history" in parsed.path
                rows = [] if parsed.query else [{"chat_id": "a", "messages": []}] if history else [{"id": "f", "rating": "up"}]
                self.send_response(200)
                self.end_headers()
                self.wfile.write("".join(json.dumps(r) + "\n" for r in rows).encode())
            def log_message(self, *_args):
                pass
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        worker = threading.Thread(target=httpd.serve_forever, daemon=True)
        worker.start()
        try:
            with TemporaryDirectory() as directory:
                base = f"http://127.0.0.1:{httpd.server_port}"
                self.assertEqual(pull_history.download(base, directory, "secret"), (1, 1))
                state = json.loads((Path(directory) / "state.json").read_text())
                self.assertEqual(pull_history.download(base, directory, "secret"), (0, 0))
                self.assertEqual(requests[2][1]["since"], [state["since"]])
                self.assertEqual(requests[3][1]["since"], [state["since"]])
                self.assertEqual(len(next(Path(directory).glob("history-*.jsonl")).read_text().splitlines()), 1)
                saved = (Path(directory) / "state.json").read_text()
                fail = True
                with self.assertRaises(Exception):
                    pull_history.download(base, directory, "secret")
                self.assertEqual((Path(directory) / "state.json").read_text(), saved)
        finally:
            httpd.shutdown()
            httpd.server_close()
            worker.join()


if __name__ == "__main__":
    unittest.main()
