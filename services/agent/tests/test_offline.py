import io
import json
import re
import socket
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dialog
import explain_templates
import guard
import llm
import server


@pytest.fixture
def offline(monkeypatch, tmp_path):
    monkeypatch.setenv("AGENT_LLM_URL", "")
    monkeypatch.delenv("AGENT_CORE_URL", raising=False)
    monkeypatch.setattr(server, "AGENT_LOG", tmp_path / "agent.log")
    attempts = []

    def no_socket(*args, **kwargs):
        attempts.append(args)
        raise AssertionError("network attempted")

    monkeypatch.setattr(socket, "socket", no_socket)
    yield attempts
    assert attempts == []


@pytest.mark.parametrize("status", ["ready", "need_manager"])
def test_full_dialog_without_network(offline, status):
    view = {"status": status, "status_text": status, "numbers": {
        "available_now": 500000, "monthly_payment": 45000},
        "reasons": [], "next_steps": [], "instrument": "кредит"}
    state = dialog.new_state({"form": "ООО"})
    for text, attachment in [("", None), ("на оборудование", None),
                             ("500 тысяч", None), ("из выручки", None),
                             ("12 месяцев", None), ("Загрузил выписку", {"statement_csv": "csv"})]:
        assert not llm.available()
        reply = dialog.turn(state, text, attachment, decide=lambda *args: {"view": view})
        assert reply and not guard.check(reply, state["view"], state["need"])
    assert state["view"]["status"] == status
    assert not any(row["violations"] for row in state["trace"])


def invoke(card, text="Помогите", mode=None):
    handler = object.__new__(server.Handler)
    results = []
    handler._json = lambda code, value: results.append((code, value))
    handler._turn("offline-test", text, server._card(card), mode=mode)
    assert results[0][0] == 200
    return results[0][1]


def test_nudge_names_missing_contract(offline):
    result = invoke({"application": {"id": "a", "status": "info_requested",
        "holes": ["contract_main_customer"], "n": 2, "m": 3}}, mode="nudge")
    assert "договор с главным заказчиком" in result["text"].lower()
    assert len(result["text"]) <= 450


def test_objections_quote_client_and_only_application_numbers(offline):
    app = {"id": "a", "status": "info_requested", "limit_now_rub": 500000,
           "alternatives": [{"product": "кредит", "amount_rub": 500000, "term_months": 12}]}
    result = invoke({"application": app}, "Срок слишком короткий", "objections")
    assert result["objections_summary"] == "Срок слишком короткий"
    assert "500" in result["text"]
    assert set(re.findall(r"\d+", result["text"])) <= {"500", "000", "12"}


def test_application_context_takes_precedence_over_intake(offline):
    result = invoke({"application": {"id": "a", "status": "info_requested",
        "holes": ["contract_main_customer"], "n": 2, "m": 3}})
    assert result["status"] == "info_requested"
    assert "договор с главным заказчиком" in result["text"].lower()
    assert "2 из 3" in result["text"]


def test_http_turn_accepts_empty_nudge_and_rejects_unknown_mode(offline):
    def request(payload):
        handler = object.__new__(server.Handler)
        handler.path = "/turn"
        body = json.dumps(payload).encode()
        handler.headers = {"Content-Length": str(len(body))}
        handler.rfile = io.BytesIO(body)
        results = []
        handler._json = lambda code, value: results.append((code, value))
        handler.do_POST()
        return results[0]

    payload = {"session_id": "http-nudge", "text": "", "mode": "nudge", "card": {
        "application": {"id": "a", "status": "info_requested", "holes": ["contract_main_customer"]}}}
    code, result = request(payload)
    assert code == 200 and "договор с главным заказчиком" in result["text"]
    payload["mode"] = "unknown"
    assert request(payload)[0] == 400


@pytest.mark.parametrize("status", list(explain_templates.STAGES))
def test_application_stages_are_guarded_and_do_not_score(offline, status):
    app = {"id": "a", "status": status, "n": 2, "m": 3, "limit_now_rub": 500000,
           "holes": ["contract_main_customer"], "reasons": [{"code": "SHORT_STATEMENT", "text": "Нужна выписка."}]}
    result = invoke({"application": app})
    assert result["status"] == status
    assert not server.SESSIONS["offline-test"]["view"]
    assert not server.SESSIONS["offline-test"]["trace"][-1]["violations"]


def test_summary_accumulates_client_only_and_resets_for_new_application(offline):
    card = {"application": {"id": "a", "status": "info_requested"}}
    for text in ["Срок короткий", "Нужен другой продукт", "Не подходит сумма", "Давайте менеджера"]:
        result = invoke(card, text, "objections")
    assert result["objections_summary"].splitlines() == [
        "Нужен другой продукт", "Не подходит сумма", "Давайте менеджера"]
    card["application"]["id"] = "b"
    assert invoke(card, "Другой вопрос", "objections")["objections_summary"] == "Другой вопрос"


def test_application_drops_private_fields_and_rejects_unsafe_offer_text(offline):
    card = {"application": {"id": "a", "status": "info_requested", "inn": "private",
        "alternatives": [{"product_name": "Гарантируем кредит", "amount_rub": 500000, "passport": "private"}]}}
    assert "private" not in json.dumps(server._card(card))
    result = invoke(card, "Не согласен", "objections")
    assert not guard.check(result["text"], None, {})
    assert server.SESSIONS["offline-test"]["trace"][-1]["violations"]
