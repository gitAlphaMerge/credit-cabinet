import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dialog
import intake_rules
import llm


def test_side_question_answers_then_returns_to_slot():
    state = dialog.new_state({})
    dialog.turn(state, "")
    seen = []

    def speak(goal, ctx):
        seen.append((goal, ctx))
        return "Факторинг помогает получить оплату поставки раньше. На что нужны деньги?"

    reply = dialog.turn(state, "Что такое факторинг?", speak=speak)
    assert "Факторинг" in reply
    assert seen[0][0] == "answer"
    assert seen[0][1]["return_slot"] == "purpose"
    assert state["trace"][-1]["source"] == "llm"
    assert state["attempts"]["purpose"] == 1
    dialog.turn(state, "на оборудование")
    assert state["asking"] == "amount"


def test_identity_is_honest_even_if_llm_claims_to_be_human():
    state = dialog.new_state({})
    reply = dialog.turn(state, "Ты бот?", speak=lambda *_: "Я сотрудник банка.")
    assert "ИИ-помощник" in reply
    assert state["trace"][-1]["violations"]


def test_consecutive_turns_do_not_repeat_and_history_is_bounded():
    state = dialog.new_state({})
    speak = lambda *_: "На что нужны деньги?"
    first = dialog.turn(state, "", speak=speak)
    second = dialog.turn(state, "для бизнеса", speak=speak)
    assert first != second
    assert state["trace"][-1]["source"] == "template"
    for _ in range(5):
        dialog.turn(state, "Ты бот?")
    assert len(state["history"]) == 8
    assert all(set(h) == {"role", "text"} for h in state["history"])


def test_speak_exception_uses_same_goal_template():
    def broken(*_):
        raise RuntimeError("offline")
    state = dialog.new_state({})
    assert dialog.turn(state, "", speak=broken) in dialog.QUESTIONS["purpose"]
    assert state["trace"][-1]["goal"] == "ask:purpose"
    assert state["trace"][-1]["violations"] == ["speak_error:RuntimeError"]


def test_invented_number_uses_same_goal_template():
    state = dialog.new_state({})
    reply = dialog.turn(state, "", speak=lambda *_: "Вам нужно 987654 рублей?")
    assert reply in dialog.QUESTIONS["purpose"]
    assert state["trace"][-1]["violations"]
    assert state["trace"][-1]["source"] == "template"


def test_manager_request_and_third_attempt():
    state = dialog.new_state({})
    dialog.turn(state, "Позовите менеджера")
    assert state["trace"][-1]["goal"] == "manager"
    state = dialog.new_state({})
    for text in ("", "на бизнес", "для дела"):
        dialog.turn(state, text)
    assert state["trace"][-1]["goal"] == "manager"


def test_vague_purpose_eight_turns_then_specific_need():
    state = dialog.new_state({})
    goals = []
    for text in ("", "на бизнес", "для дела", "Нужна кофемашина",
                 "Около 1 млн", "из выручки", "на 12 месяцев", "А выписка обязательна?"):
        dialog.turn(state, text)
        goals.append(state["trace"][-1]["goal"])
    assert goals == ["ask:purpose", "ask:purpose", "manager", "ask:amount",
                     "ask:repay", "ask:term", "ask:statement", "answer"]
    assert state["need"]["purpose"] == "оборудование"
    assert state["need"]["amount_rub"] == 1000000
    assert state["asking"] == "statement"


def test_long_dialog_does_not_repeat_answered_questions_and_updates_parameters():
    state = dialog.new_state({})
    replies = []
    inputs = ("", "Нужна кофемашина", "1 млн", "из выручки", "12 месяцев",
              "Что такое факторинг?", "Хочу изменить сумму на 2 млн", "Теперь срок 18 месяцев",
              "Объясните, зачем выписка?", "Спасибо", "Когда можно загрузить?", "Хорошо")
    for text in inputs:
        replies.append(dialog.turn(state, text, speak=lambda *_: "На что нужны деньги?"))
    assert all(a != b for a, b in zip(replies, replies[1:]))
    assert all("На что нужны деньги?" not in reply for reply in replies[2:])
    assert state["need"]["amount_rub"] == 2000000
    assert state["need"]["term_months"] == 18
    assert "Сумму записал" in replies[6]
    assert "Срок записал" in replies[7]


def test_changed_parameters_recalculate_existing_view():
    state = dialog.new_state({})
    state.update(need={"purpose": "оборудование", "amount_rub": 1000000,
                       "repay_from": "выручка", "term_months": 12},
                 statement_csv="csv", view={"status_text": "старый расчёт"})
    calls = []

    def decide(_statement, need, _questionnaire, _confirmed):
        calls.append(dict(need))
        return {"view": {"status_text": "новый расчёт"}}

    dialog.turn(state, "А если изменить сумму на 2 млн?", decide=decide,
                explain=lambda *_: "Расчёт обновлён.")
    dialog.turn(state, "Теперь срок 18 месяцев", decide=decide,
                explain=lambda *_: "Расчёт обновлён.")
    assert [(row["amount_rub"], row["term_months"]) for row in calls] == [
        (2000000, 12), (2000000, 18)]


def test_prompt_has_voice_permissions_history_memory_and_goal(monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "chat", lambda *a, **k: calls.append((a, k)) or "На что нужны деньги?")
    facts = [{"status": "active", "text": "старый факт", "updated_at": "2025"},
             {"status": "active", "text": "новый факт", "updated_at": "2026"},
             {"status": "deleted", "text": "удалённый факт"}]
    llm.speak("ask:purpose", {"memory": facts, "history": [{"role": "user", "text": "Здравствуйте"}],
                              "text": "Здравствуйте", "need": {}, "view": None, "return_slot": "purpose"})
    system = calls[0][0][0]
    assert system.startswith(llm.AGENT_VOICE)
    assert llm.PERMISSIONS in system
    assert "Цель хода: ask:purpose" in system
    assert system.index("новый факт") < system.index("старый факт")
    assert "удалённый факт" not in system
    assert "Последние реплики" in system and "Можно называть числа только эти" in system
    assert calls[0][1]["temperature"] == .7


def test_new_conversation_uses_memory_without_copying_slots():
    state = dialog.new_state({})
    reply = dialog.turn(state, "привет", client_memory=[{"status": "active", "kind": "need",
                                                          "text": "purpose: закупка плитки"}])
    assert "закупка плитки" in reply
    assert "purpose" not in state["need"]


UTTERANCES = json.loads((Path(__file__).parent / "fixtures" / "client_utterances.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", UTTERANCES, ids=[f"{i}-{c['category']}" for i, c in enumerate(UTTERANCES)])
def test_client_utterances_on_templates(case):
    state = dialog.new_state({})
    state["asking"] = case["agent_asked"]
    reply = dialog.turn(state, case["text"])
    assert len(reply) <= 450
    assert reply.count("?") <= 1
    assert "одобрено" not in reply.lower()
    assert not intake_rules.PII_DIGITS.search(reply)
    if case["category"] == "identity":
        assert "ии-помощник" in reply.lower()
    if case["category"] == "pii":
        assert "в чат это не нужно" in reply.lower()


def test_frustration_gets_recap_not_the_same_question():
    state = dialog.new_state({})
    for text in ("Нужна кофемашина", "1 млн"):
        dialog.turn(state, text)
    reply = dialog.turn(state, "ну сколько можно, я же сказал", speak=lambda *_: "Какая сумма нужна?")
    assert "Записано" in reply and "1 000 000" in reply
    assert "Какая сумма нужна?" not in reply


def test_same_slot_is_not_asked_three_times_in_a_row():
    state = dialog.new_state({})
    state["need"].update(purpose="оборудование", amount_rub=500000, repay_from="выручка", term_months=12)
    ask = lambda *_: "Загрузите выписку по счёту, получится выгрузить?"
    replies = [dialog.turn(state, text, speak=ask) for text in ("ага", "хм", "ок", "ну да")]
    assert "менеджер" in replies[-1].lower()
