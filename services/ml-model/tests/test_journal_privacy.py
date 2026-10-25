"""Personal identifiers in free-form need must never reach the JSONL file."""
import copy
import importlib.util
import json
from pathlib import Path

import pytest


_spec = importlib.util.spec_from_file_location("privacy_journal", Path(__file__).parents[1] / "journal.py")
journal = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(journal)


@pytest.mark.parametrize("private", [
    "+7 (999) 123-45-67", "8 999 123 45 67", "9991234567",
    "alex.test+credit@example.org", "почта@пример.рф",
    "7701234567", "770123456789",  # company and sole trader INN
    "4111 1111 1111 1111", "4111-1111-1111-1111", "4000000000000000000",
    "40702810900000000001", "40702 810 9 0000 0000001",
    "+7\u00a0(999)\u00a0123-45-67", "+７ (９９９) １２３-４５-６７",
    "7701\u200b234567",
])
def test_need_identifiers_are_masked_before_write(tmp_path, monkeypatch, private):
    """Inspect persisted bytes, not just the redactor's return value."""
    monkeypatch.setattr(journal, "PATH", tmp_path / "journal/decisions.jsonl")
    entry = {"decision_id": "synthetic-decision", "input_sha256": "1" * 64,
             "limit_now_rub": 1_500_000,
             "need": {"purpose": "рост", "amount_rub": 1_500_000, "term_months": 12,
                      "repay_from": f"оплата клиента: {private}",
                      "extra": [{"contact": private}, private]}}
    original = copy.deepcopy(entry)
    journal.write(entry)
    saved = json.loads(journal.PATH.read_text(encoding="utf-8"))
    assert saved["need"]["repay_from"] == "оплата клиента: [REDACTED]"
    assert saved["need"]["extra"] == [{"contact": "[REDACTED]"}, "[REDACTED]"]
    assert saved["need"]["amount_rub"] == 1_500_000
    assert saved["need"]["term_months"] == 12
    assert saved["need"]["purpose"] == "рост"
    assert saved["input_sha256"] == "1" * 64
    assert saved["limit_now_rub"] == 1_500_000
    assert entry == original
    assert journal.verify()


def test_redaction_preserves_chain_and_benign_text(tmp_path, monkeypatch):
    """Hash the sanitized entry and keep normal financial context readable."""
    monkeypatch.setattr(journal, "PATH", tmp_path / "decisions.jsonl")
    safe_need = {"repay_from": "договор 42 от 2026-10-25, выручка 150 000 руб.",
                 "amount_rub": 150_000, "term_months": 12}
    first = journal.write({"need": safe_need})
    second = journal.write({"need": {"comment": "ИНН 770123456789, test@example.org"}})
    rows = [json.loads(line) for line in journal.PATH.read_text(encoding="utf-8").splitlines()]
    assert rows[0]["need"] == safe_need
    assert rows[1]["need"]["comment"] == "ИНН [REDACTED], [REDACTED]"
    assert rows[1]["prev_hash"] == first
    assert rows[1]["hash"] == second
    assert journal.verify()
