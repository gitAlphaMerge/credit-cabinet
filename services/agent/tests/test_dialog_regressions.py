"""Живые реплики из eval: проверки без сети и внешних зависимостей."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import dialog  # noqa: E402


class DialogRegressions(unittest.TestCase):
    def test_repeated_slot_changes_question_then_offers_manager(self):
        state = dialog.new_state({"form": "ИП"})
        first = dialog.turn(state, "")
        second = dialog.turn(state, "на бизнес")
        third = dialog.turn(state, "для дела")
        self.assertNotEqual(first, second)
        self.assertIn("кассов", second.lower())
        self.assertIn("менеджер", third.lower())
        self.assertEqual(state["attempts"]["purpose"], 3)
        self.assertEqual([row["kind"] for row in state["trace"]], ["question", "question", "fallback"])

    def test_early_statement_and_amount_term_are_acknowledged(self):
        state = dialog.new_state({"form": "ИП"})
        reply = dialog.turn(state, "Загрузил выписку", {"statement_csv": "csv"})
        self.assertTrue(reply.startswith("Выписку получил."), reply)
        self.assertIn("?", reply)
        reply = dialog.turn(state, "Нужно 1,5 млн на год")
        self.assertIn("Сумму", reply)
        self.assertIn("срок", reply)
        self.assertEqual(state["need"]["amount_rub"], 1500000)
        self.assertEqual(state["need"]["term_months"], 12)
