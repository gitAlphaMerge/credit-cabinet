import hashlib
import json
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from http.server import HTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dialog
import server
import core_http


class SessionStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.patches = [
            patch.dict(server.os.environ, {"AGENT_STATE_DIR": str(self.root)}),
            patch.object(server, "AGENT_LOG", self.root / "agent.log"),
            patch.object(server.llm, "available", return_value=False),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)
        server.SESSIONS.clear()
        self.addCleanup(server.SESSIONS.clear)
        self.httpd = HTTPServer(("127.0.0.1", 0), server.Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)

    def close_server(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join()

    def post(self, text, session_id="../../client", card=None):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.httpd.server_port}/turn",
            data=json.dumps({"session_id": session_id, "text": text, "card": card or {}}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.load(response)

    def state_path(self, session_id="../../client"):
        return self.root / "sessions" / (hashlib.sha256(session_id.encode()).hexdigest() + ".json")

    def test_two_turns_restart_third_turn_remembers_slots(self):
        self.post("оборудование")
        self.post("500 тысяч")
        before = dict(server.SESSIONS["../../client"]["need"])
        server.SESSIONS.clear()
        self.post("из выручки")
        need = server.SESSIONS["../../client"]["need"]
        self.assertEqual(need["purpose"], before["purpose"])
        self.assertEqual(need["amount_rub"], before["amount_rub"])
        self.assertIn("repay_from", need)
        self.assertTrue(self.state_path().is_file())
        self.assertEqual(list(self.state_path().parent.glob("*.tmp")), [])

    def test_core_failure_returns_reply_and_preserves_session(self):
        state = dialog.new_state({"form": "ООО", "years": "больше 3"})
        state["need"].update(purpose="оборудование", amount_rub=500000,
                             term_months=12, repay_from="выручка")
        state["statement_csv"] = "private statement"
        server.SESSIONS["core-error"] = state
        with patch.dict(server.os.environ, {"AGENT_CORE_URL": "http://api:8080"}), \
                patch("core_http.decide", side_effect=RuntimeError("ядро недоступно")):
            result = self.post("привет", session_id="core-error")
        self.assertIn("посчитать сейчас не получилось", result["text"])
        self.assertEqual(state["need"]["amount_rub"], 500000)
        self.assertIs(server.SESSIONS["core-error"], state)

    def test_statement_is_hashed_and_view_survives_restart(self):
        state = dialog.new_state({"form": "ООО", "years": "больше 3"})
        state["need"].update(purpose="оборудование", amount_rub=500000,
                             term_months=12, repay_from="выручка")
        state["statement_csv"] = "date,amount,counterparty,purpose\nprivate-customer-statement"
        state["view"] = {"status": "ready", "status_text": "можно подавать"}
        server.SESSIONS["../../client"] = state
        self.post("привет")
        raw = self.state_path().read_text(encoding="utf-8")
        saved = json.loads(raw)
        self.assertNotIn("statement_csv", saved)
        self.assertNotIn(state["statement_csv"], raw)
        self.assertTrue(saved["has_statement"])
        checksum = hashlib.sha256(state["statement_csv"].encode()).hexdigest()
        self.assertEqual(saved["statement_sha256"], checksum)
        server.SESSIONS.clear()
        result = self.post("привет")
        self.assertEqual(result["view"], state["view"])
        self.assertIn("выписк", result["text"].lower())
        self.assertIsNone(server.SESSIONS["../../client"]["statement_csv"])
        self.assertEqual(json.loads(self.state_path().read_text(encoding="utf-8"))["statement_sha256"], checksum)

    def test_corrupt_file_is_logged_and_replaced_by_new_session(self):
        self.state_path().parent.mkdir(parents=True)
        for content in ("{broken", "[]", '{"need": {}}'):
            with self.subTest(content=content):
                server.SESSIONS.clear()
                self.state_path().write_text(content, encoding="utf-8")
                result = self.post("привет")
                self.assertIn("на что", result["text"].lower())
        events = [json.loads(line) for line in (self.root / "agent.log").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(sum(e["event"] == "session_load_error" for e in events), 3)


class CoreHttpTests(unittest.TestCase):
    def test_request_contract_timeout_and_decision_shape(self):
        decision = {"core": {"status": "можно подавать"}, "view": {"status": "ready"}}
        with patch.dict(server.os.environ, {"AGENT_CORE_URL": "http://api:8080/"}), \
                patch.object(core_http.urllib.request, "urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = json.dumps(decision).encode()
            result = core_http.decide("csv", {"amount_rub": 100}, {"form": "ООО"})
        self.assertEqual(result, decision)
        args, kwargs = urlopen.call_args
        self.assertEqual(args[0].full_url, "http://api:8080/score")
        self.assertEqual(args[0].method, "POST")
        self.assertEqual(kwargs["timeout"], 30)
        self.assertEqual(json.loads(args[0].data), {"statement_csv": "csv", "need": {"amount_rub": 100},
                                                  "questionnaire": {"form": "ООО"}, "confirmed_fields": {}})

    def test_network_and_server_errors_are_readable(self):
        for error in (urllib.error.URLError("offline"), TimeoutError(),
                      urllib.error.HTTPError("http://api/score", 503, "down", {}, None)):
            with self.subTest(error=type(error).__name__), \
                    patch.object(core_http.urllib.request, "urlopen", side_effect=error):
                with self.assertRaisesRegex(RuntimeError, "Ядро"):
                    core_http.decide("csv", {}, {})


if __name__ == "__main__":
    unittest.main()
