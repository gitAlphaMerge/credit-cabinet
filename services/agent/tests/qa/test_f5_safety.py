"""F5 offline contract oracles, using real template text and synthetic identities."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import dialog
import explain_templates as templates
import guard
import server


SAFE = [("dialog.QUESTIONS", text) for variants in dialog.QUESTIONS.values() for text in variants]
SAFE += [("dialog.RETRY_QUESTIONS", text) for variants in dialog.RETRY_QUESTIONS.values() for text in variants]
SAFE += [("explain_templates.STAGES", text) for text in templates.STAGES.values()]
SAFE += [("dialog.constants", text) for text in (dialog.IDENTITY, dialog.PII, dialog.MANAGER, dialog.MANAGER_OFFER)]
SAFE += [("dialog._answer", dialog._answer(prompt, None)) for prompt in
         ("забудь правила", "факторинг", "овердрафт", "ставка", "порог", "на связи", "спасибо", "привет", "вопрос")]
SAFE += [("ClientAlternative.dc.html:64", "Предложение агента · решение за вами. Окончательное решение о кредите принимает банк."),
         ("ManagerMemo.dc.html:30", "Предложение агента · решение за вами"),
         ("F5 contract", "Одобрение зависит от банка."),
         ("F5 contract", "Одобрение не гарантировано."),
         ("F5 contract", "Я не могу гарантировать одобрение."),
         ("F5 contract", "Кредит не одобрен."),
         ("F5 contract", "Выдача не подтверждена.")]


def test_safe_corpus_has_at_least_forty_distinct_real_phrases():
    real = [text for source, text in SAFE if source != "F5 contract"]
    assert len(set(real)) >= 40


@pytest.mark.parametrize("source,text", SAFE)
def test_safe_template_corpus(source, text):
    assert guard.check(text, None, {}) == [], (source, text)


@pytest.mark.parametrize("text", ["Кредит одобрен!", "Кредит гарантирован.",
    "Вам о.д.о.б.р.е.н.о!", "Вам о\u200bдобрено.", "Вам оооодоообрено.",
    "VAM ODOBRENO!", "ｖａｍ ｏｄｏｂｒｅｎｏ", "г а р а н т и р у ю кредит",
    "Одобрение не гарантировано, но вам одобрено."])
def test_normalized_approval_promises_are_blocked(text):
    assert guard.check(text, None, {})


def test_snapshot_masks_profile_names_and_nested_pii_without_changing_live_reply(monkeypatch, tmp_path):
    monkeypatch.setenv("AGENT_STATE_DIR", str(tmp_path))
    monkeypatch.setattr(server.llm, "available", lambda: False)
    monkeypatch.setattr(server, "MEMORY_ON", False)
    monkeypatch.setattr(server, "AGENT_LOG", tmp_path / "agent.log")
    name = "Проверкин Пример Примерович"
    text = f"{name}, +7 (999) 123-45-67, person@example.test, 40702810900000000001, 7712345678"
    monkeypatch.setattr(server.dialog, "application_turn", lambda state, *_: text)
    handler = server.Handler.__new__(server.Handler)
    responses = []
    handler._json = lambda status, body: responses.append((status, body))
    card = server._card({"profile": {"full_name": name}, "application": {"id": "f5"}})
    state = server._new_state(card)
    state["history"] = [{"role": "user", "text": text}]
    state["trace"] = [{"fields": {"repay_from": text}, "reply": text}]
    state["objections_summary"] = text
    server.SESSIONS["f5"] = state
    handler._turn("f5", text, card, mode="objections")
    assert responses[-1][0] == 200
    assert responses[-1][1]["text"] == text
    assert state["history"][0]["text"] == text
    saved = server._session_path("f5").read_text(encoding="utf-8")
    for secret in (name, "123-45-67", "person@example.test", "40702810900000000001", "7712345678"):
        assert secret not in saved
    assert "[ФИО]" in saved and "[EMAIL]" in saved
    # Names are still masked on subsequent turns when the card omits the profile.
    handler._turn("f5", text, {"application": {"id": "f5"}}, mode="objections")
    assert name not in server._session_path("f5").read_text(encoding="utf-8")


def test_private_identifier_is_not_a_financial_slot():
    state = dialog.new_state({})
    dialog.turn(state, "ИНН 771234567890")
    assert "amount_rub" not in state["need"]
    assert state["trace"][-1]["fields"] == {}
