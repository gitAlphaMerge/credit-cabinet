"""Eval-бот без телеги: сессия на шаблонах и настоящем ядре пишет по строке на каждую оценку."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))

import explain_templates  # noqa: E402
import intake_rules  # noqa: E402
import tgbot  # noqa: E402


def _session(tmp_path, pid="cash_gap_a"):
    p = next(p for p in tgbot.personas() if p["id"] == pid)
    return tgbot.Session(p, tgbot.scenarios()[p["scenario"]], "tester", intake_rules.parse,
                         explain_templates.explain, traces=tmp_path)


def test_redteam_not_for_team():
    assert tgbot.personas() and all(p["source"] == "deepseek" for p in tgbot.personas())


def test_rate_ok_writes_row(tmp_path):
    s = _session(tmp_path)
    s.say("Нужны деньги закрыть кассовый разрыв")
    assert s.phase == "rate"
    s.rate(True)
    rows = [json.loads(x) for x in s.out.read_text(encoding="utf-8").splitlines()]
    assert s.phase == "client" and len(rows) == 1 and rows[0]["ok"] and rows[0]["who"] == "tester"


def test_agent_opens_with_greeting_and_first_question(tmp_path):
    s = _session(tmp_path)
    reply = s.opening()
    assert reply.startswith("Здравствуйте!")
    assert "?" in reply
    assert s.phase == "rate" and s.turns == 1
    assert s.state["trace"][0]["slot"] == "purpose"


def test_bad_waits_for_comment(tmp_path):
    s = _session(tmp_path)
    s.say("кассовый разрыв")
    s.rate(False)
    assert s.phase == "comment" and not s.out.exists()  # без коммента 👎 бесполезна, строку не пишем
    s.comment("сухо")
    row = json.loads(s.out.read_text(encoding="utf-8"))
    assert row["ok"] is False and row["comment"] == "сухо" and s.phase == "client"


def test_statement_button_reaches_core(tmp_path):
    s = _session(tmp_path)
    for text in ("кассовый разрыв", "1,5 млн", "из оплаты заказчика", "на 6 месяцев", tgbot.STATEMENT):
        s.say(text)
        s.rate(True)
    assert s.state["view"] is not None and s.state["trace"][-1]["kind"] == "explain"


def test_branches_split_evenly():
    pool = tgbot.personas()
    branches = tgbot.assign(pool)
    ids = [pid for b in branches.values() for pid in b]
    assert sorted(ids) == sorted(p["id"] for p in pool)  # каждая персона ровно у одного
    scen = {p["id"]: p["scenario"] for p in pool}
    for b in branches.values():
        assert len(b) == 4 and len({scen[pid] for pid in b}) == 4  # 4 разных сценария на человека


def test_pick_own_branch_then_rest(tmp_path):
    pool = tgbot.personas()
    branches = tgbot.assign(pool)
    mine = branches["lovuhoney"]
    for pid in mine[:3]:
        (tmp_path / f"tg-20261018-000000-lovuhoney-{pid}.jsonl").write_text("", encoding="utf-8")
    assert tgbot.pick("lovuhoney", pool, branches, tmp_path)["id"] == mine[3]
    (tmp_path / f"tg-20261018-000000-lovuhoney-{mine[3]}.jsonl").write_text("", encoding="utf-8")
    assert tgbot.pick("lovuhoney", pool, branches, tmp_path)["id"] not in mine  # ветка сыграна → чужие несыгранные
