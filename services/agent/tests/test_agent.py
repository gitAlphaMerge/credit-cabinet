"""Уровни 0–1 eval агента: приёмщик и страж на правилах, без LLM и без сети.

    python -m pytest services/agent/tests -q
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import dialog  # noqa: E402
import guard  # noqa: E402
from explain_templates import explain  # noqa: E402
from intake_rules import parse  # noqa: E402

# уровень 0: фраза клиента → поля. Сюда идут живые фразы из интервью и генераций (hw/sasha/agent-spec.md)
INTAKE = [
    ("Нужно 1,5 млн на год", "purpose", {"amount_rub": 1500000, "term_months": 12}),
    ("полтора ляма", "amount", {"amount_rub": 1500000}),
    ("900 тыс", "amount", {"amount_rub": 900000}),
    ("1 500 000 ₽", "amount", {"amount_rub": 1500000}),
    ("400к на полгода", "amount", {"amount_rub": 400000, "term_months": 6}),
    ("Хочет миллион на найм", "purpose", {"amount_rub": 1000000, "purpose": "рост"}),
    ("Хочу купить станок для цеха", "purpose", {"purpose": "оборудование"}),
    ("заказчик платит через 60 дней, а зарплату платить сейчас", "purpose", {"purpose": "кассовый разрыв"}),
    ("Через 12 месяцев, из оплаты по договору", "repay", {"term_months": 12}),
    ("Из выручки. Договор с заказчиком на 1 440 000 ₽ на 12 месяцев", "repay",
     {"contract_with_main_customer": {"sum_rub": 1440000, "months": 12}}),
]


@pytest.mark.parametrize("text,asking,expected", INTAKE)
def test_intake(text, asking, expected):
    got = parse(text, asking)
    assert {k: got.get(k) for k in expected} == expected


def test_term_answer_is_not_amount():
    assert "amount_rub" not in parse("Через 12 месяцев, из оплаты по договору", "repay")


def test_contract_sum_is_not_requested_amount():
    got = parse("Нужно 1,5 млн. Договор с заказчиком на 1 440 000 на 12 месяцев", "purpose")
    assert got["amount_rub"] == 1500000


# уровень 1: страж
VIEW = {
    "status": "ready_after_step", "status_text": "можно после шага", "instrument": "овердрафт",
    "numbers": {"available_now": 1015000, "available_after": 1523000, "limit_delta": 508000,
                "monthly_payment": 141839, "dscr": 0.85, "dscr_required": 1.25, "rate_used": 0.24, "term_months": 12},
    "reasons": [{"code": "CASH_OUT", "text": "Больше 30% выручки снимается наличными"}],
    "next_steps": [{"code": "contract_main_customer", "text": "Загрузите договор с главным заказчиком",
                    "confirms": "что оплата по договору придёт"}],
    "monthly_flow": [],
}
NEED = {"amount_rub": 1500000, "term_months": 12}


def test_template_passes_guard():
    assert guard.check(explain(VIEW, NEED), VIEW, NEED) == []


@pytest.mark.parametrize("text,needle", [
    ("Можно взять 1 200 000 ₽. Подаём?", "1 200 000"),          # число, которого нет в ядре
    ("Кредит одобрен. Подаём?", "одобрен"),
    ("Ваш ИНН 7707083893 проверен. Дальше?", "ИНН"),
    ("Можно 1 015 000 ₽. Подаём? Или ждём?", "вопросов 2"),
    ("Ставка будет 19%. Подаём?", "19"),
])
def test_guard_catches(text, needle):
    assert any(needle in v for v in guard.check(text, VIEW, NEED))


def test_guard_allows_rounded_payment_and_reason_threshold():
    text = "Платёж около 141 800 ₽, запас 0,85 при пороге 1,25; больше 30% уходит наличными. Позвать менеджера?"
    assert guard.check(text, VIEW, NEED) == []


def test_bad_llm_text_replaced_by_template():
    state = dialog.new_state({"form": "ООО", "years": "больше 3"})
    state.update(need={"purpose": "кассовый разрыв", "amount_rub": 1500000, "term_months": 12,
                       "repay_from": "оплата по договору"}, statement_csv="x")
    reply = dialog.turn(state, "", explain=lambda v, n: "Одобрено на 2 млн!",
                        decide=lambda *a: {"view": VIEW})
    assert reply == explain(VIEW, state["need"])
    assert state["trace"][-1]["violations"]


def test_router_asks_purpose_first_then_repay():
    state = dialog.new_state({"form": "ООО", "years": "больше 3"})
    assert dialog.turn(state, "") == dialog.QUESTIONS["purpose"]
    assert dialog.turn(state, "Нужно 1,5 млн, заказчик платит позже") == dialog.QUESTIONS["repay"]


def test_guard_allows_negative_dscr_from_core():
    view = dict(VIEW, numbers=dict(VIEW["numbers"], dscr=-0.38))
    assert guard.check("Покрытие -0.38 при пороге 1,25. Позвать менеджера?", view, NEED) == []


def test_llm_intake_keeps_capitalized_purpose(monkeypatch):
    import llm
    monkeypatch.setattr(llm, "chat", lambda *a, **k: '{"purpose": "Кассовый разрыв", "amount_rub": 0}')
    assert llm.intake("нужен кредит на кассовый разрыв", "purpose") == {"purpose": "кассовый разрыв"}
