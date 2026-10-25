"""Журнал решений: одна строка JSONL на решение, каждая хранит хэш предыдущей (подделку видно по разрыву цепочки).

Сырую выписку не пишем, только её sha256. По журналу банк потом разбирает споры и сверяет пилот с исходами кредитов.
"""
import hashlib
import json
import os
import re
import threading
import unicodedata
from pathlib import Path

PATH = Path(os.getenv("JOURNAL_PATH", Path(__file__).with_name("journal") / "decisions.jsonl"))
ZERO = "0" * 64
_lock = threading.Lock()
_EMAIL = re.compile(r"[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+")
_NUMBER = re.compile(r"\+?\d(?:[\d\s().-]*\d)?")
_INVISIBLE = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"))


def _redact_need(value):
    """Copy need recursively, masking emails and phone/tax/card/account digit runs."""
    if isinstance(value, str):
        value = unicodedata.normalize("NFKC", value).translate(_INVISIBLE)
        value = _EMAIL.sub("[REDACTED]", value)
        # Ten or more digits cover phones, INN, cards and accounts, including separators.
        return _NUMBER.sub(lambda m: "[REDACTED]" if sum(c.isdecimal() for c in m[0]) >= 10
                           else m[0], value)
    if isinstance(value, dict):
        return {_redact_need(k): _redact_need(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact_need(item) for item in value]
    return value


def _digest(entry: dict) -> str:
    return hashlib.sha256(json.dumps(entry, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def _last_hash() -> str:
    if not PATH.exists():
        return ZERO
    lines = PATH.read_text(encoding="utf-8").splitlines()
    return json.loads(lines[-1])["hash"] if lines else ZERO


def write(entry: dict) -> str:
    """Sanitize need before hashing and persisting; leave the caller's request intact."""
    with _lock:
        PATH.parent.mkdir(parents=True, exist_ok=True)
        entry = dict(entry, prev_hash=_last_hash())
        if "need" in entry:
            entry["need"] = _redact_need(entry["need"])
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
