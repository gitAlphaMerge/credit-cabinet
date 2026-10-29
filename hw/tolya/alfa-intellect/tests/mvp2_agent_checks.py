"""Approved agent integration checks; no live provider or personal data."""
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "services" / "agent"))
import server


class ApplicationModelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mvp2-agent-")
        self.env = patch.dict("os.environ", {"AGENT_STATE_DIR": self.temp.name})
        self.env.start()
        self.log = patch.object(server, "AGENT_LOG", Path(self.temp.name) / "agent.log")
        self.log.start()
        self.memory = patch.object(server, "MEMORY_ON", False)
        self.memory.start()
        server.SESSIONS.clear()
        self.httpd = HTTPServer(("127.0.0.1", 0), server.Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.thread.join()
        self.httpd.server_close()
        self.memory.stop()
        self.log.stop()
        self.env.stop()
        self.temp.cleanup()

    def request(self, status="APPROVED", text="Почему такой платёж?", session="mvp2-test"):
        data = {"session_id": session, "text": text, "card": {
            "amount_rub": 1000000, "term_months": 12,
            "application": {"id": "test-application", "status": status,
                            "limit_now_rub": 1000000, "reasons": ["Платёж укладывается в поток"]}}}
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.httpd.server_port}/turn",
            data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            with error:
                return error.code, json.load(error)

    def test_all_decisions_call_model_and_preserve_history(self):
        with patch.object(server.llm, "available", return_value=True), patch.object(
            server.llm, "chat", return_value="Платёж сопоставлен с поступлениями бизнеса. Обсудим условия?"
        ) as model:
            for status in ("APPROVED", "MANAGER_REVIEW_REQUIRED", "ADDITIONAL_DATA_REQUIRED", "DECLINED", "ACTIVE"):
                code, result = self.request(status)
                self.assertEqual(code, 200)
                self.assertEqual(result["source"], "llm")
                self.assertIn(status, model.call_args.args[0])
            self.assertEqual(model.call_count, 5)
            self.assertIn("Последние реплики", model.call_args.args[0])
            self.assertEqual(len(server.SESSIONS["mvp2-test"]["history"]), 8)

    def test_model_disabled_is_unavailable_not_template(self):
        with patch.object(server.llm, "available", return_value=False):
            self.assertEqual(self.request()[0], 503)

    def test_model_failure_is_unavailable(self):
        with patch.object(server.llm, "available", return_value=True), patch.object(
            server.llm, "chat", side_effect=TimeoutError):
            self.assertEqual(self.request()[0], 503)

    def test_invented_numbers_and_promises_are_rejected(self):
        for unsafe in ("Платёж 77777 рублей.", "Гарантирую, кредит одобрен."):
            with self.subTest(unsafe=unsafe), patch.object(server.llm, "available", return_value=True), patch.object(
                server.llm, "chat", return_value=unsafe):
                self.assertEqual(self.request()[0], 503)

    def test_legacy_mode_is_unchanged(self):
        with patch.object(server.llm, "available", return_value=True), patch.object(server.llm, "chat") as model:
            code, result = self.request("closed")  # info_requested теперь свободный чат через модель; шаблон держат неизвестные статусы
            self.assertEqual(code, 200)
            self.assertEqual(result["source"], "template")
            model.assert_not_called()


if __name__ == "__main__":
    unittest.main()
