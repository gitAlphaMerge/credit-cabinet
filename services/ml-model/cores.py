"""Реестр ядер. Ядро выбирает сервер, а не клиент: из запроса здесь ничего не читается (угроза «подмена ядра»).

Когда появится core.py Лизы, оно регистрируется само; включается переменной CORE_ID=liza.
Сегрегация по сегментам (ИП / ООО / отрасль) будет в route(): сейчас одно ядро на всех.
"""
import importlib.util
import os
import tempfile
from pathlib import Path

import core_stub

REGISTRY = {"stub": (core_stub.score, core_stub.MODEL_VERSION)}


def _from_path(score):
    """Ядро по контракту check_golden.py читает выписку из файла, окошко держит её текстом: кладём во временный файл."""
    def run(statement_csv, need, questionnaire):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", encoding="utf-8", newline="", delete=False) as f:
            f.write(statement_csv)
        try:
            return score(f.name, need, questionnaire)
        finally:
            os.unlink(f.name)
    return run


_liza = Path(__file__).with_name("core.py")
if _liza.exists():
    _spec = importlib.util.spec_from_file_location("core", _liza)
    _mod = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_mod)
    REGISTRY["liza"] = (_from_path(_mod.score), getattr(_mod, "MODEL_VERSION", "liza-0.1"))

DEFAULT = os.getenv("CORE_ID", "stub")


def route(questionnaire: dict) -> str:
    """Какое ядро считает этого клиента. Задел под сегменты: пока всегда DEFAULT."""
    return DEFAULT
