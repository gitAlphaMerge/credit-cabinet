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


def test_manager_request_and_third_attempt():
    state = dialog.new_state({})
    dialog.turn(state, "Позовите менеджера")
    assert state["trace"][-1]["goal"] == "manager"
    state = dialog.new_state({})
    for text in ("", "на бизнес", "для дела"):
        dialog.turn(state, text)
    assert state["trace"][-1]["goal"] == "manager"


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
