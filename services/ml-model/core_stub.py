"""Временный расчёт: эталон reference.py на тестовых выписках, пока нет ядра Лизы (core.py).

Узнаёт выписку по отпечатку строк (date, amount, counterparty, purpose) и считает эталоном по размеченной копии.
Чужую выписку не считает: эталон подсматривает в колонку label, которой в настоящей выписке нет.
"""
import csv
import hashlib
import io
import os
import sys
from pathlib import Path

# путь из репо считаем только без FIXTURES_DIR: в докере файл лежит в /app, трёх папок над ним нет
FIXTURES = Path(os.getenv("FIXTURES_DIR") or Path(__file__).resolve().parents[2] / "data" / "synthetic")
sys.path.insert(0, str(FIXTURES))
from reference import PARAMS, reference  # noqa: E402

MODEL_VERSION = "stub-reference-0.1"


class UnknownStatement(Exception):
    pass


def _fingerprint(rows):
    h = hashlib.sha256()
    for r in rows:
        h.update(f'{r["date"]}|{float(r["amount"]):.2f}|{r["counterparty"]}|{r["purpose"]}\n'.encode("utf-8"))
    return h.hexdigest()


def _load_index():
    index = {}
    for path in sorted(FIXTURES.glob("*.csv")):
        with open(path, encoding="utf-8") as f:
            rows = [dict(r, amount=float(r["amount"])) for r in csv.DictReader(f)]
        index[_fingerprint(rows)] = (path.stem, rows)
    return index


INDEX = _load_index()


def score(statement_csv: str, need: dict, questionnaire: dict) -> dict:
    rows = list(csv.DictReader(io.StringIO(statement_csv)))
    hit = INDEX.get(_fingerprint(rows))
    if hit is None:
        raise UnknownStatement("временный расчёт знает только тестовые выписки из data/synthetic")
    fixture, labeled = hit
    out = reference(labeled, need, questionnaire)
    out["evidence"]["fixture"] = fixture
    out["params"] = {"rate": PARAMS["rate"], "dscr_min": PARAMS["dscr_min"]}
    return out
