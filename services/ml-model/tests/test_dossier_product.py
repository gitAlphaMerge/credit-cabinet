"""Catalogue selection and observed dossier facts, independent of folder labels."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

import core


NEED = {"purpose": "кассовый разрыв", "amount_rub": 1_000_000, "term_months": 12}
QUESTIONNAIRE = {"form": "ООО", "years": "больше 3"}


class DossierProductTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.client = self.root / "client"
        self.client.mkdir()
        self.statement = self.client / "statement.csv"
        lines = ["date,amount,counterparty,purpose"]
        for month in range(1, 13):
            lines.extend((f"2025-{month:02d}-01,500000,ООО Покупатель,Оплата товара",
                          f"2025-{month:02d}-10,-100000,ООО Поставщик,Оплата товара",
                          f"2025-{month:02d}-20,-50000,ООО Аренда,Аренда"))
        self.statement.write_text("\n".join(lines), encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.root)

    def score(self, need=None):
        return core.score(str(self.statement), need or NEED, QUESTIONNAIRE)

    def test_live_statement_without_neighbours_keeps_reasons_missing(self):
        result = self.score()
        self.assertEqual("ALFA_OVERDRAFT", result["instrument"])
        self.assertNotIn("STALE_DOC", result["reasons"])
        self.assertNotIn("DOCS_MISMATCH", result["reasons"])
        self.assertNotIn("MISSING_SCHEDULE", result["reasons"])
        self.assertNotIn("financial_model", result["missing"])
        self.assertNotIn("debt_schedule", result["missing"])

    def test_neutral_folder_same_product(self):
        first = self.score()["instrument"]
        renamed = self.root / "another_client"
        shutil.copytree(self.client, renamed)
        second = core.score(str(renamed / "statement.csv"), NEED, QUESTIONNAIRE)
        self.assertEqual(first, second["instrument"])
        self.assertEqual("ALFA_OVERDRAFT", first)

    def test_amount_above_catalogue_max_changes_choice(self):
        need = {**NEED, "amount_rub": 20_000_001}
        result = self.score(need)
        self.assertTrue(result["instrument"] != "ALFA_OVERDRAFT" or
                        "RESTRICTED_PURPOSE" in result["stops_fired"])
        self.assertIn("product_match", result["evidence"])

    def test_old_financials_flagged(self):
        balance = {"period": "2023", "as_of": "2026-10-22", "stale": True,
                   "lines": {"1600": 100000}}
        (self.client / "balance_sheet.json").write_text(json.dumps(balance), encoding="utf-8")
        result = self.score()
        self.assertIn("STALE_DOC", result["reasons"])
        self.assertIn("fresh_financials", result["missing"])
        self.assertEqual("2023", result["evidence"]["dossier"]["balance_sheet"]["period"])

    def test_period_shift_alone_flags_stale_document(self):
        balance = {"period": "2025", "as_of": "2026-10-22", "stale": False,
                   "lines": {"1600": 100000}}
        path = self.client / "balance_sheet.json"
        path.write_text(json.dumps(balance), encoding="utf-8")
        self.assertNotIn("STALE_DOC", self.score()["reasons"])
        balance["period"] = "2023"
        path.write_text(json.dumps(balance), encoding="utf-8")
        self.assertIn("STALE_DOC", self.score()["reasons"])

    def test_removing_neighbours_restores_base_reasons_and_missing(self):
        baseline = self.score()
        sidecar = self.client / "balance_sheet.json"
        sidecar.write_text(json.dumps({"period": "2023", "as_of": "2026-10-22",
                                      "stale": True}), encoding="utf-8")
        self.assertIn("STALE_DOC", self.score()["reasons"])
        sidecar.unlink()
        restored = self.score()
        self.assertEqual(set(baseline["reasons"]), set(restored["reasons"]))
        self.assertEqual(baseline["missing"], restored["missing"])

    def test_income_reconciliation_is_numerical(self):
        income = {"period": "2025", "as_of": "2026-10-22", "stale": False,
                  "lines": {"2110": 9_000_000}}
        (self.client / "income_statement.json").write_text(json.dumps(income), encoding="utf-8")
        result = self.score()
        self.assertIn("DOCS_MISMATCH", result["reasons"])
        self.assertEqual(9_000_000, result["evidence"]["dossier"]["income_statement"]["revenue_2110_rub"])

    def test_refinancing_needs_debt_schedule_only_with_dossier(self):
        (self.client / "business_plan.json").write_text(
            json.dumps({"purpose_code": "do_refinance"}), encoding="utf-8")
        result = self.score({**NEED, "purpose": "рефинансирование"})
        self.assertIn("MISSING_SCHEDULE", result["reasons"])
        self.assertIn("debt_schedule", result["missing"])

    def test_removing_neighbours_restores_live_reasons_missing(self):
        baseline = self.score()
        plan = self.client / "business_plan.json"
        plan.write_text(json.dumps({"purpose_code": "do_refinance"}), encoding="utf-8")
        self.assertIn("MISSING_SCHEDULE", self.score()["reasons"])
        plan.unlink()
        restored = self.score()
        self.assertEqual(baseline["reasons"], restored["reasons"])
        self.assertEqual(baseline["missing"], restored["missing"])


if __name__ == "__main__":
    unittest.main()
