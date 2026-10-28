import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import guard


@pytest.mark.parametrize("text", [
    "Одобрено.", "Гарантирую.", "Точно дадут.",
    "DSCR", "CFADS", "Ковенанты", "Скоринг", "Ядро", "Система", "Модель", "Покрытие долга",
    "Что? Когда?", "а" * 451, "Деньги — на закупку.",
    "ИНН 771234567890", "4509 123456", "45 09 123456", "1234 5678 9012 3456", "123-456-789 00",
    "Можно взять 987654 рублей.", "Ставка 19%.", "Через 1 день.", "Два миллиона.", "",
])
def test_rejects_voice_and_safety_violations(text):
    assert guard.check(text, None, {})


@pytest.mark.parametrize("text", ["Проверю.", "На что нужны деньги?", "Можно взять 800 тысяч.", "800 000 ₽."])
def test_allows_short_answers_and_known_amounts(text):
    assert guard.check(text, None, {"amount_rub": 800000}) == []


def test_numbers_from_client_and_view():
    assert guard.check("Оплата на 60-й день?", None, {}, client_text="Платят на 60-й день") == []
    assert guard.check("Ставка 24%.", {"numbers": {"rate_used": .24}}, {}) == []
    assert guard.check("800 тысяч?", None, {}, client_text="Нужно 800 тысяч") == []


def test_client_request_is_not_an_authorized_loan_limit():
    view = {"numbers": {"available_now": 600000}}
    need = {"amount_rub": 1000000}
    assert guard.check("Вам доступен лимит 1 млн рублей.", view, need,
                       client_text="Мне нужен 1 млн")
    assert guard.check("Вы запросили 1 млн рублей.", view, need,
                       client_text="Мне нужен 1 млн") == []


def test_pii_is_forbidden_even_if_client_provided_it():
    assert guard.check("4509 123456", None, {}, client_text="паспорт 4509 123456")


def test_stop_reason_is_hidden():
    assert guard.check("Есть арест.", {"status": "need_manager"}, {})
