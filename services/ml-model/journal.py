"""Журнал решений: одна строка JSONL на решение, каждая хранит хэш предыдущей (подделку видно по разрыву цепочки).

Сырую выписку не пишем, только её sha256. По журналу банк потом разбирает споры и сверяет пилот с исходами кредитов.
"""
import hashlib
import json
import os
import threading
from pathlib import Path

PATH = Path(os.getenv("JOURNAL_PATH", Path(__file__).with_name("journal") / "decisions.jsonl"))
ZERO = "0" * 64
_lock = threading.Lock()


def _digest(entry: dict) -> str:
    return hashlib.sha256(json.dumps(entry, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def _last_hash() -> str:
    if not PATH.exists():
        return ZERO
    lines = PATH.read_text(encoding="utf-8").splitlines()
    return json.loads(lines[-1])["hash"] if lines else ZERO


def write(entry: dict) -> str:
    with _lock:
        PATH.parent.mkdir(parents=True, exist_ok=True)
        entry = dict(entry, prev_hash=_last_hash())
        entry["hash"] = _digest(entry)
        with open(PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
        return entry["hash"]


def verify() -> bool:
    if not PATH.exists():
        return True
    prev = ZERO
    for line in PATH.read_text(encoding="utf-8").splitlines():
        e = json.loads(line)
        h = e.pop("hash")
        if e["prev_hash"] != prev or _digest(e) != h:
            return False
        prev = h
    return True
