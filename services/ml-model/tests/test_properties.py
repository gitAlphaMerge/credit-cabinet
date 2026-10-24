"""Свойства кредитного решения на воспроизводимых выписках."""

import csv
import random
import tempfile
import unittest
from pathlib import Path

import core


STATUS_RANK = {
    "можно подавать": 0,
    "можно после шага": 1,
    "лучше другой инструмент": 2,
    "нужен менеджер": 3,
}
FIELDS = ("date", "amount", "counterparty", "purpose")


def statement(seed):
    """Создаёт 12 месяцев продаж, расходов и платежей по долгу."""
    rng = random.Random(42 + seed)
    rows = []
    for month in range(1, 13):
        date = f"2026-{month:02d}-15"
        income = rng.randint(90_000, 150_000)
        rows.extend([
            (date, income, "ООО Покупатель", "Оплата по договору"),
            (date, -rng.randint(20_000, 45_000), "ООО Поставщик", "Материалы"),
            (date, -rng.randint(5_000, 12_000), "ООО Банк", "Погашение кредита"),
        ])
    return rows


class DecisionProperties(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "statement.csv"
        self.need = {"purpose": "кассовый разрыв", "amount_rub": 120_000,
                     "term_months": 12}
        self.questionnaire = {"form": "ООО", "years": "больше 3"}

    def evaluate(self, rows, need=None, delimiter=",", service_rows=False):
        """Записывает CSV и считает решение через публичную функцию score."""
        with self.path.open("w", encoding="utf-8", newline="") as file:
            if service_rows:
                file.write("Служебная строка банка\n\n")
            writer = csv.writer(file, delimiter=delimiter)
            writer.writerow(FIELDS)
            writer.writerows(rows)
            if service_rows:
                writer.writerow(("", "", "", ""))
        return core.score(str(self.path), need or self.need, self.questionnaire)

    def test_added_risk_never_improves_status(self):
        """200 портфелей, три вида дополнительного риска в каждом."""
        for seed in range(200):
            rows = statement(seed)
            before = self.evaluate(rows)
            extra = [
                ("Исполнительный лист", -40_000),
                ("Снятие наличных", -400_000),
                ("Погашение кредита", -60_000),
            ]
            for purpose, amount in extra:
                with self.subTest(seed=seed, purpose=purpose):
                    after = self.evaluate(rows + [("2026-06-15", amount, "ООО Банк", purpose)])
                    self.assertGreaterEqual(STATUS_RANK[after["status"]], STATUS_RANK[before["status"]])
        # context/stop-rules.md: исполнительный лист не скрывается короткой выпиской.
        short = statement(42)[:12]
        after = self.evaluate(short + [("2026-02-15", -1000, "ООО Банк", "Исполнительный лист")])
        self.assertEqual(after["status"], "нужен менеджер")

    def test_csv_representation_invariant(self):
        """200 перестановок, разделителей и служебных строк."""
        for seed in range(200):
            rows = statement(seed)
            before = self.evaluate(rows)
            random.Random(seed + 1000).shuffle(rows)
            after = self.evaluate(rows, delimiter=";", service_rows=True)
            with self.subTest(seed=seed):
                self.assertEqual(before["status"], after["status"])
                self.assertEqual(set(before["stops_fired"]), set(after["stops_fired"]))
                for key in ("cash_share", "dscr", "top_share", "months"):
                    self.assertEqual(before["evidence"][key], after["evidence"][key])

    def test_money_unit_scale_invariant(self):
        """Умножение каждой суммы и потребности на три для 200 портфелей."""
        compared = 0
        for seed in range(200):
            rows = statement(seed)
            # Сумма внутри границ ALFA_OVERDRAFT каталога и до, и после умножения.
            base = {**self.need, "amount_rub": 400_000}
            before = self.evaluate(rows, base)
            scaled = [(date, amount * 3, cp, purpose)
                      for date, amount, cp, purpose in rows]
            need = {**base, "amount_rub": base["amount_rub"] * 3}
            after = self.evaluate(scaled, need)
            # Лимиты каталога заданы в абсолютных рублях: при смене продукта масштаб не инвариант.
            if before["instrument"] != after["instrument"]:
                continue
            compared += 1
            with self.subTest(seed=seed):
                self.assertEqual(before["status"], after["status"])
                for key in ("cash_share", "dscr", "top_share", "months"):
                    self.assertAlmostEqual(before["evidence"][key], after["evidence"][key])
        self.assertGreaterEqual(compared, 100)

    def test_cash_boundary_and_independent_stops(self):
        """Ровно 30% не стоп, рубль сверх порога стоп даже при отрицательном потоке."""
        rows = [("2026-01-15", 1_000_000, "ООО Покупатель", "Оплата по договору")]
        rows += [("2026-01-15", -1, "ООО Поставщик", "Материалы")] * 28
        at = self.evaluate(rows + [("2026-01-15", -300_000, "ООО Банк", "Снятие наличных")])
        above = self.evaluate(rows + [("2026-01-15", -300_001, "ООО Банк", "Снятие наличных")])
        self.assertNotIn("CASH_OUT", at["stops_fired"])
        self.assertIn("CASH_OUT", above["stops_fired"])
        self.assertAlmostEqual(at["evidence"]["cash_share"], 0.30)
        self.assertGreater(above["evidence"]["cash_share"], 0.30)
        negative = self.evaluate(rows + [("2026-01-15", -1_000_001, "ООО Банк", "Снятие наличных")])
        self.assertTrue({"CASH_OUT", "NO_FREE_CASHFLOW"}.issubset(negative["stops_fired"]))

    def test_dscr_boundary_uses_unrounded_value(self):
        """1.246 ниже порога 1.25, хотя для экрана это 1.25."""
        self.assertIn("LOW_DSCR", core.calculate_scorecard(1.246, 0.1, 0.1, 0.2, 0)[1])
        rows = statement(42)
        instrument = self.evaluate(rows)["instrument"]
        payment = self.need["amount_rub"] / core.annuity_factor(core.PRODUCTS_DB[instrument]["rate"], 12)
        current_flow = sum(amount for _, amount, _, _ in rows) / 12
        delta = (payment * 1.246 - current_flow) * 12
        rows.append(("2026-06-15", delta, "ООО Поставщик", "Материалы"))
        result = self.evaluate(rows)
        self.assertIn("LOW_DSCR", result["reasons"])

    def test_explanation_on_generated_cases(self):
        """Каждый непрямой исход имеет код и числовые основания, 200 случаев."""
        for seed in range(200):
            rows = statement(seed)
            rows.append(("2026-06-15", -seed * 2500, "ООО Банк", "Снятие наличных"))
            result = self.evaluate(rows)
            with self.subTest(seed=seed):
                if result["status"] != "можно подавать":
                    self.assertTrue(result["stops_fired"] or result["reasons"])
                evidence = result["evidence"]
                for key in ("cash_share", "dscr", "top_share", "months"):
                    self.assertIsInstance(evidence[key], (int, float))

    def test_decision_precedence_and_dossier_inputs(self):
        """Прямой контракт с будущим досье и каталогом продуктов."""
        def decide(stops=(), missing=(), reasons=(), instrument="ALFA_RCL_UNSEC",
                   amount=100, now=100, after=150):
            return core.make_decision(50, list(stops), {"amount_rub": amount},
                                      now, after, instrument, list(missing), list(reasons))[0]
        self.assertEqual(decide(stops=("SHORT_STATEMENT", "ENFORCEMENT")), "нужен менеджер")
        self.assertEqual(decide(stops=("RESTRICTED_PURPOSE",)), "лучше другой инструмент")
        self.assertEqual(decide(stops=("TOO_YOUNG",)), "лучше другой инструмент")
        self.assertEqual(decide(missing=("balance",), reasons=("STALE_DOC",)), "можно после шага")
        self.assertEqual(decide(missing=("schedule",), reasons=("MISSING_SCHEDULE",)), "можно после шага")
        self.assertEqual(decide(missing=("statement",), reasons=("DOCS_MISMATCH",)), "можно после шага")
        self.assertEqual(decide(amount=120), "можно после шага")
        self.assertEqual(decide(amount=160), "нужен менеджер")
        self.assertEqual(decide(instrument="MANUAL"), "нужен менеджер")

    def test_short_statement_does_not_mean_young_business(self):
        rows = statement(5)[:12]
        result = self.evaluate(rows)
        self.assertIn("SHORT_STATEMENT", result["stops_fired"])
        self.assertNotIn("TOO_YOUNG", result["stops_fired"])


if __name__ == "__main__":
    unittest.main()
