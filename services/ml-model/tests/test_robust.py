import importlib
import json
import os
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

os.environ['CORE_ID'] = 'liza'
import app
import cores

DEMO = Path(__file__).resolve().parents[2] / 'frontend' / 'demo'


def payload(csv_text):
    return {'statement_csv': csv_text,
            'need': {'purpose': 'кассовый разрыв', 'amount_rub': 1500000, 'term_months': 12},
            'questionnaire': {'form': 'ООО', 'years': 'больше 3'}}


class RobustTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:' + str(cls.server.server_port)
        cls.csv = (DEMO / 'cash_gap.csv').read_text(encoding='utf-8')

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, body=None):
        req = Request(self.base + ('/health' if body is None else '/score'), data=body,
                      headers={'Content-Type': 'application/json'})
        try:
            response = urlopen(req, timeout=10)
        except HTTPError as exc:
            response = exc
        with response:
            return response.code, json.load(response)

    def post(self, req):
        return self.request(json.dumps(req).encode('utf-8'))

    def tearDown(self):
        self.assertEqual(self.request()[0], 200, 'server must remain alive')

    def test_demo_csv(self):
        files = sorted(DEMO.glob('*.csv'))
        self.assertTrue(files)
        with patch.object(app.journal, 'write'):
            for file in files:
                with self.subTest(csv=file.name):
                    status, result = self.post(payload(file.read_text(encoding='utf-8')))
                    self.assertTrue(status == 200 or 400 <= status < 500, (status, result))
                    self.assertTrue(result.get('error') if status != 200 else result.get('view'))

    def test_invalid_bodies(self):
        for body in (b'garbage', b'', b'{}', b'[]'):
            with self.subTest(body=body):
                status, result = self.request(body)
                self.assertTrue(400 <= status < 500)
                self.assertTrue(result.get('error'))

    def test_unknown_core(self):
        try:
            with patch.dict(os.environ, {'CORE_ID': 'missing-core'}):
                importlib.reload(cores)
                status, health = self.request()
                self.assertEqual(status, 200)
                self.assertEqual(health['core_id'], 'liza' if 'liza' in cores.REGISTRY else 'stub')
                self.assertTrue(health['model_version'])
                with patch.object(app.journal, 'write'):
                    self.assertEqual(self.post(payload(self.csv))[0], 200)
        finally:
            importlib.reload(cores)

    def test_guard_failure(self):
        req = payload(self.csv)
        req['confirmed_fields'] = {'contract_main_customer': {'sum_rub': 1440000, 'months': 12}}
        with patch.object(app.guards, 'cap_contract', side_effect=RuntimeError('guard test')):
            status, result = self.post(req)
        self.assertEqual(status, 500)
        self.assertTrue(result.get('error'))

    def test_view_failure(self):
        with patch.object(app, 'to_view', side_effect=RuntimeError('view test')):
            status, result = self.post(payload(self.csv))
        self.assertEqual(status, 500)
        self.assertTrue(result.get('error'))

    def test_journal_failure(self):
        with patch.object(app.journal, 'write', side_effect=OSError('journal test')):
            status, result = self.post(payload(self.csv))
        self.assertEqual(status, 200)
        self.assertIn('view', result)
