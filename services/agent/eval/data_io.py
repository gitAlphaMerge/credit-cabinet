"""Данные eval от людей и генераций: services/agent/eval/data/{phrases,personas}-<источник>.json.

Формат и промпт генерации: hw/sasha/eval-gen-prompt.md. Метки генерации — черновик: упал кейс → ошибся
агент или метка, решает человек; поправленную метку правим прямо в json.
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
FIELDS = ("purpose", "amount_rub", "term_months", "contract_with_main_customer")


def _load(prefix: str) -> list[dict]:
    items = []
    for path in sorted(DATA.glob(f"{prefix}-*.json")):
        source = path.stem.split("-", 1)[1]
        for i, item in enumerate(json.loads(path.read_text(encoding="utf-8"))):
            items.append(dict(item, source=source, ref=f"{path.name}#{i}"))
    return items


def phrases() -> list[dict]:
    return _load("phrases")


def personas() -> list[dict]:
    return _load("personas")


def intake_errors(item: dict, got: dict) -> list[str]:
    """Расхождения разбора с меткой: пропустил поле, ошибся в значении, выдумал поле, которого в реплике нет."""
    want = {k: v for k, v in item["expected"].items() if k in FIELDS}
    errors = [f"{k}: ждали {v!r}, получили {got.get(k)!r}" for k, v in want.items() if got.get(k) != v]
    errors += [f"{k}: выдумал {got[k]!r}" for k in FIELDS if k in got and k not in want]
    return errors
