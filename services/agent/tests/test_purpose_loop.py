"""Purpose intake must advance without a model, including unknown vocabulary."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import dialog
import intake_rules


@pytest.mark.parametrize("text,expected", [
    ("хочу купить кофемашину", "оборудование"),
    ("ремонт помещения под вторую кофейню с кофемашиной", "рост"),
    ("задержка оплаты от клиента, надо выдать зарплату", "кассовый разрыв"),
    ("берём морозильный аппарат для кухни", "оборудование"),
    ("на новую производственную линию", "оборудование"),
    ("покупка электрической плиты", "оборудование"),
    ("кофемошыну в офис", "оборудование"),
    ("новая точка, надо оплатить отделку", "рост"),
    ("подписан договор, ткань надо оплатить", "закупка под контракт"),
    ("арендуем помещение для филиала", "рост"),
    ("выходим в соседний город", "рост"),
    ("закупаем цветы перед праздниками", "сезон"),
    ("подпесан заказ, покупаем сырье", "закупка под контракт"),
    ("заказ подписан, нужны материалы и оборудование", "закупка под контракт"),
    ("клиент заплатит позже, пока оплатим аренду офиса", "кассовый разрыв"),
    ("задержали оплату, нужны деньги на аренду склада", "кассовый разрыв"),
])
def test_purpose_categories_and_priority(text, expected):
    assert intake_rules.parse(text, "purpose")["purpose"] == expected


def asked_state():
    state = dialog.new_state({})
    dialog.turn(state, "")
    assert state["asking"] == "purpose"
    return state


def test_unknown_purpose_advances_to_amount():
    state = asked_state()
    reply = dialog.turn(state, "на всякое разное")
    assert state["need"]["purpose"] == "другое"
    assert state["need"]["purpose_text"] == "на всякое разное"
    assert reply == "Цель записал. " + dialog.QUESTIONS["amount"][0]
    assert state["asking"] == "amount"
    assert sum(row.get("goal") == "ask:purpose" for row in state["trace"]) == 1
    dialog.turn(state, "2 млн")
    assert state["asking"] == "repay"
    assert sum(row.get("goal") == "ask:purpose" for row in state["trace"]) == 1


@pytest.mark.parametrize("text,field", [
    ("2 млн", "amount_rub"),
    ("12 месяцев", "term_months"),
])
def test_other_field_is_not_a_purpose(text, field):
    state = asked_state()
    reply = dialog.turn(state, text)
    assert field in state["need"]
    assert "purpose" not in state["need"]
    assert "purpose_text" not in state["need"]
    assert state["asking"] == "purpose"
    assert reply.endswith(dialog.RETRY_QUESTIONS["purpose"][0])
    assert sum(row.get("goal") == "ask:purpose" for row in state["trace"]) == 2


@pytest.mark.parametrize("fields", [{}, {"intent": "answer_slot"}])
def test_unknown_purpose_with_replaced_intake(fields):
    state = asked_state()
    text = "  на всякое разное " * 20
    reply = dialog.turn(state, text, intake=lambda *_: dict(fields))
    assert state["need"]["purpose"] == "другое"
    assert state["need"]["purpose_text"] == text[:200]
    assert reply.startswith("Цель записал.")
    assert state["asking"] == "amount"


@pytest.mark.parametrize("text", ["а какая ставка?", "ты бот?", "спасибо", "", "...", "123"])
def test_non_answers_do_not_become_purpose(text):
    state = asked_state()
    dialog.turn(state, text)
    assert "purpose" not in state["need"]
    assert "purpose_text" not in state["need"]
    assert state["asking"] == "purpose"


def test_llm_side_question_does_not_become_purpose():
    state = asked_state()
    dialog.turn(state, "на всякое разное", intake=lambda *_: {"intent": "side_question"})
    assert "purpose" not in state["need"]
    assert state["asking"] == "purpose"


def test_unprompted_text_does_not_become_purpose():
    state = dialog.new_state({})
    dialog.turn(state, "на всякое разное")
    assert "purpose" not in state["need"]
    assert state["asking"] == "purpose"
