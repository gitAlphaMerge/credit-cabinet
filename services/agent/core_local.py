"""Ядро тем же путём, что /score: guards → ядро → translate, только без HTTP. Для агента в eval и локально."""
import os
import sys
import tempfile
from pathlib import Path

ML = Path(__file__).resolve().parents[1] / "ml-model"
os.environ.setdefault("CORE_ID", "liza")
os.environ.setdefault("JOURNAL_PATH", str(Path(tempfile.gettempdir()) / "agent-eval-journal.jsonl"))
sys.path.insert(0, str(ML))

from app import decide as _decide  # noqa: E402


def decide(statement_csv: str, need: dict, questionnaire: dict, confirmed_fields: dict | None = None) -> dict:
    return _decide({
        "statement_csv": statement_csv,
        "need": need,
        "questionnaire": questionnaire,
        "confirmed_fields": confirmed_fields or {},
    })
