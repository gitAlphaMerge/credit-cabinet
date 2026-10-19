import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dialog
import llm
import memory
import server


def add(text="продаёт плитку", kind="business"):
    return {"op": "ADD", "kind": kind, "text": text}


def test_add_update_delete_noop_and_history():
    facts = memory.apply([], [add()])
    fact_id = facts[0]["id"]
    assert facts[0]["status"] == "active" and facts[0]["history"] == []
    assert memory.apply(facts, [{"op": "NOOP"}]) == facts
    changed = memory.apply(facts, [{"op": "UPDATE", "id": fact_id, "text": "продаёт кирпич"}])
    assert changed[0]["text"] == "продаёт кирпич"
    assert changed[0]["history"][0]["text"] == "продаёт плитку"
    assert "until" in changed[0]["history"][0]
    assert facts[0]["text"] == "продаёт плитку"
    deleted = memory.apply(changed, [{"op": "DELETE", "id": fact_id}])
    assert deleted[0]["status"] == "deleted"
    assert deleted[0]["history"][-1]["text"] == "продаёт кирпич"
    assert memory.active(deleted) == []


def test_unknown_ids_duplicate_and_invalid_operations():
    facts = memory.apply([], [add()])
    assert memory.apply(facts, [add(), {"op": "UPDATE", "id": "unknown", "text": "что-то"},
                                {"op": "DELETE", "id": "unknown"}, None, {"op": "BAD"},
                                add("а" * 201), add("", "need"), add("факт", "bad")]) == facts


@pytest.mark.parametrize("text", [
    "ИНН 771234567890", "паспорт 4509 123456", "телефон +7 (999) 123-45-67",
    "карта 1234 5678 9012 3456", "почта client@example.com", "пароль qwerty",
    "Иванов Иван Иванович платит позже", "иванов иван иванович платит позже", "Иван Петров платит позже",
    "заказчик ООО Ромашка",
    "СНИЛС 123-456-789 00", "строка выписки counterparty=ООО", "назначение платежа: заказ",
])
def test_private_facts_are_rejected(text):
    assert memory.apply([], [add(text)]) == []


@pytest.mark.parametrize("text", ["Лимит 1015000", "Лимит 1 015 000", "Лимит 1,015 млн", "Платёж 12345"])
def test_core_numbers_are_rejected(text):
    view = {"numbers": {"available_now": 1015000, "monthly_payment": 12345}}
    assert memory.apply([], [add(text)], view) == []


def test_statement_content_is_rejected():
    assert memory.apply([], [add("магазин,оплата за плитку")], statement="date,amount\nмагазин,оплата за плитку") == []


def test_limit_archives_old_progress_first():
    facts = memory.apply([], [add("обещал документ", "progress")])
    facts = memory.apply(facts, [add(f"занимается направлением {n}") for n in range(31)])
    assert len(memory.active(facts)) == 30
    assert facts[0]["status"] == "archived"
    assert facts[0]["text"] == "обещал документ"


def test_rules_mode_and_hashed_path():
    state = dialog.new_state({})
    state["need"].update(purpose="оборудование", amount_rub=800000, repay_from="из выручки")
    state["view"] = {"status": "ready", "numbers": {"available_now": 500000}}
    memory.update("../../client", "на станок", "Прикинем.", state)
    facts = memory.load("../../client")
    assert {f["kind"] for f in facts} == {"need", "progress"}
    texts = " ".join(f["text"] for f in facts)
    assert "800000" in texts and "оборудование" in texts and "из выручки" in texts
    assert "можно подавать заявку" in texts and "500000" not in texts
    assert memory.path_for("../../client").name == hashlib.sha256(b"../../client").hexdigest() + ".json"
    state["need"]["amount_rub"] = 900000
    memory.update("../../client", "нужно больше", "Записал.", state)
    updated = next(f for f in memory.active(memory.load("../../client")) if f["text"].startswith("amount_rub:"))
    assert updated["text"] == "amount_rub: 900000"
    assert updated["history"][0]["text"] == "amount_rub: 800000"


def test_llm_extracts_one_pair_and_operations_in_one_call(monkeypatch):
    calls = []
    def fake_chat(system, user, **kwargs):
        calls.append((system, json.loads(user), kwargs))
        return json.dumps({"operations": [add("предпочитает короткие ответы", "preference")]}, ensure_ascii=False)
    monkeypatch.setattr(llm, "chat", fake_chat)
    memory.update("client", "пишите коротко", "Хорошо.", dialog.new_state({}), use_llm=True)
    assert len(calls) == 1 and calls[0][2]["as_json"] is True
    assert calls[0][1]["pair"] == {"user": "пишите коротко", "assistant": "Хорошо."}
    assert memory.load("client")[0]["kind"] == "preference"


def test_llm_input_redacts_private_data(monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "chat", lambda s, u, **k: calls.append(u) or '{"operations": []}')
    memory.update("client", "паспорт 4509 123456", "В чат это не нужно.", dialog.new_state({}), use_llm=True)
    assert "4509" not in calls[0]


def test_atomic_replace(monkeypatch):
    memory._save("client", memory.apply([], [add()]))
    path = memory.path_for("client")
    before = path.read_bytes()
    original = memory.os.replace
    calls = []
    def replace(source, target):
        assert path.read_bytes() == before
        assert Path(source).parent == path.parent and Path(source).suffix == ".tmp"
        assert json.loads(Path(source).read_text(encoding="utf-8"))[0]["text"] == "новый факт"
        calls.append(True)
        original(source, target)
    monkeypatch.setattr(memory.os, "replace", replace)
    memory._save("client", memory.apply([], [add("новый факт")]))
    assert calls and not list(path.parent.glob("*.tmp"))


def test_failed_atomic_replace_preserves_previous_file(monkeypatch, caplog):
    state = dialog.new_state({})
    state["need"]["purpose"] = "оборудование"
    memory.update("client", "станок", "Записал", state)
    before = memory.path_for("client").read_bytes()
    def fail(*_):
        raise OSError("disk unavailable")
    monkeypatch.setattr(memory.os, "replace", fail)
    state["need"]["purpose"] = "рост"
    memory.update("client", "развитие", "Записал", state)
    assert memory.path_for("client").read_bytes() == before
    assert "memory update failed" in caplog.text


@pytest.mark.parametrize("utterance", ["забудь меня", "Удалите мои данные"])
def test_forget_scrubs_text_and_history(utterance):
    facts = memory.apply([], [add()])
    facts = memory.apply(facts, [{"op": "UPDATE", "id": facts[0]["id"], "text": "продаёт кирпич"}])
    memory._save("client", facts)
    memory.update("client", utterance, "Хорошо", dialog.new_state({}), use_llm=True)
    deleted = memory.load("client")
    assert all(f["status"] == "deleted" and "text" not in f and "history" not in f for f in deleted)
    assert "плитку" not in memory.path_for("client").read_text(encoding="utf-8")


def test_missing_client_id_does_not_write():
    memory.update(None, "на станок", "Прикинем", dialog.new_state({}))
    assert memory.load(None) == []


def test_updates_for_same_client_are_serialized(monkeypatch):
    def fake_chat(system, user, **kwargs):
        count = len(json.loads(user)["facts"])
        return json.dumps({"operations": [add(f"направление бизнеса {count}")]}, ensure_ascii=False)
    monkeypatch.setattr(llm, "chat", fake_chat)
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(memory.update, "client", "о бизнесе", "Записал", dialog.new_state({}), True)
                   for _ in range(8)]
        for future in futures:
            future.result()
    assert len(memory.active(memory.load("client"))) == 8


def test_server_sends_reply_before_memory_and_survives_memory_failure(monkeypatch):
    events = []
    monkeypatch.setattr(llm, "available", lambda: False)
    monkeypatch.setattr(server, "_save_session", lambda *_: None)
    monkeypatch.setattr(server, "_log", lambda event: events.append(event["event"]))
    def fail(*args, **kwargs):
        assert events[1] == "response"
        raise OSError("disk unavailable")
    monkeypatch.setattr(memory, "update", fail)
    handler = object.__new__(server.Handler)
    handler._json = lambda code, body: events.append("response" if code == 200 else "error")
    handler._turn("memory-error", "привет", {}, "client")
    assert events == ["agent_turn", "response", "memory_update_error"]


def test_new_session_receives_client_memory(monkeypatch):
    memory._save("client", memory.apply([], [add("purpose: оборудование", "need")]))
    seen = []
    monkeypatch.setattr(llm, "available", lambda: True)
    monkeypatch.setattr(llm, "intake", lambda *_: {})
    monkeypatch.setattr(llm, "speak", lambda goal, ctx: seen.append(ctx) or "Оборудование ещё нужно?")
    monkeypatch.setattr(server, "_save_session", lambda *_: None)
    monkeypatch.setattr(server, "_log", lambda *_: None)
    monkeypatch.setattr(memory, "update", lambda *_a, **_k: None)
    handler = object.__new__(server.Handler)
    handler._json = lambda *_: None
    handler._turn("new-conversation", "Здравствуйте", {}, "client")
    assert seen[0]["memory"][0]["text"] == "purpose: оборудование"
