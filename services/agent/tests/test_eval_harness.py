"""Harness contracts use fake chat only; safe to invoke functions directly."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch

AGENT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AGENT))
from eval import graders, judge, run_all


def sample(reply="На что нужны деньги?"):
    return {"id": "test:1", "persona": "test", "run": 1,
            "trace": [{"reply": reply, "user": "", "need": {}, "view": None}], "need": {}}


def test_judge_json_and_cache():
    with tempfile.TemporaryDirectory(dir=run_all.EVAL) as tmp:
        evaluator = judge.Judge(cache=Path(tmp) / "cache.jsonl")
        raw = json.dumps({"verdict": "fail", "reasoning": "fact", "quote": " ".join(["word"] * 25)})
        with patch.object(judge.llm, "chat", return_value=raw) as chat:
            result = evaluator.evaluate(sample())
            assert len(result) == 6 and chat.call_count == 6
            assert all(len(r["quote"].split()) == 15 for r in result)
            assert all(call.kwargs["as_json"] and call.kwargs["temperature"] == 0 for call in chat.call_args_list)
            evaluator.evaluate(sample())
            assert chat.call_count == 6
        restored = judge.Judge(cache=Path(tmp) / "cache.jsonl")
        with patch.object(judge.llm, "chat", side_effect=AssertionError("cache miss")):
            assert restored.evaluate(sample()) == result


def test_malformed_judge_unknown():
    for raw in ("not json", "[]", "null", '{"verdict":"yes"}', '{"verdict":[]}'):
        assert judge.parse_response(raw)["verdict"] == "unknown"
    with tempfile.TemporaryDirectory(dir=run_all.EVAL) as tmp:
        evaluator = judge.Judge(cache=Path(tmp) / "cache.jsonl")
        with patch.object(judge.llm, "chat", return_value="bad json"):
            assert all(r["verdict"] == "unknown" for r in evaluator.evaluate(sample()))


def test_judge_family():
    for model in (judge.llm.MODEL, judge.sim.CLIENT_MODEL):
        try:
            judge.validate_model(model)
        except ValueError as error:
            assert "family" in str(error) and "matches" in str(error)
        else:
            raise AssertionError("same family accepted")
    with patch.dict("os.environ", {"JUDGE_MODEL": "third/model"}):
        assert judge.validate_model() == "third/model"


def test_prompts_and_m_scope():
    assert "Нельзя никогда" in judge.instructions("P")
    assert "Благодарю за предоставленную информацию" in judge.instructions("V")
    with tempfile.TemporaryDirectory(dir=run_all.EVAL) as tmp:
        evaluator = judge.Judge(cache=Path(tmp) / "cache.jsonl")
        row = sample()
        row["trace"] *= 2
        with patch.object(judge.llm, "chat", return_value='{"verdict":"pass"}') as chat:
            verdicts = evaluator.evaluate(row)
            assert len(verdicts) == 11 and chat.call_count == 11
            assert [r["n"] for r in verdicts if r["dimension"] == "M"] == [None]


def test_graders_number_repeat_approval():
    assert not graders.grade(sample("Лимит 987654 рублей. Подать?"), check_outcome=False)["ok"]
    assert not graders.grade(sample("Одобрено. Подать?"), check_outcome=False)["ok"]
    row = sample()
    row["trace"] *= 2
    assert any(f["rule"] == "verbatim repeat" for f in graders.grade(row, check_outcome=False)["failures"])
    row["trace"] *= 7
    assert any("12" in f["rule"] for f in graders.grade(row, check_outcome=False)["failures"])


def test_graders_temporal_evidence_and_memory():
    row = sample("Вы просили 700 тысяч. Это актуально?")
    row["memory"] = [{"status": "active", "text": "нужно 700 тысяч"}]
    assert graders.grade(row, check_outcome=False)["ok"]
    row["memory"] = []
    row["need"] = {"amount_rub": 700000}
    row["view"] = {"numbers": {"limit": 700000}}
    assert not graders.grade(row, check_outcome=False)["ok"]
    row["trace"][0]["need"] = {"amount_rub": 700000}
    assert graders.grade(row, check_outcome=False)["ok"]


def test_outcome_golden_and_unknown():
    row = sample()
    row["scenario"] = "s"
    row["need"] = {"purpose": "рост", "amount_rub": 100, "term_months": 6, "repay_from": "выручка"}
    row["view"] = {"status_text": "можно подавать"}
    golden = {"scenarios": [{"id": "s", "expected": {"status": "можно подавать"}}]}
    assert graders.grade(row, golden=golden)["outcome"] == "pass"
    row["view"]["status_text"] = "нужен менеджер"
    assert not graders.grade(row, golden=golden)["ok"]
    assert graders.grade(row, golden={"scenarios": []})["outcome"] == "unknown"


def test_code_failure_skips_judge():
    class Fake:
        def evaluate(self, row):
            raise AssertionError("must skip judge")
    row = run_all.evaluate(sample("Одобрено"), {}, {"scenarios": []}, Fake())
    assert not row["passed"] and not row["judgments"]
    with patch.object(Fake, "evaluate", return_value=[]) as mocked:
        run_all.evaluate(sample("Одобрено"), {}, {"scenarios": []}, Fake(), judge_all=True)
        assert mocked.call_count == 1


def test_ab_swapped_agreement_only():
    with tempfile.TemporaryDirectory(dir=run_all.EVAL) as tmp:
        evaluator = judge.Judge(cache=Path(tmp) / "cache.jsonl")
        for first, swapped, expected in (("pass", "fail", "A"), ("fail", "pass", "B"),
                                         ("pass", "pass", "tie"), ("unknown", "unknown", "tie")):
            with patch.object(judge.llm, "chat", side_effect=[json.dumps({"verdict": first}), json.dumps({"verdict": swapped})]):
                assert evaluator.compare({"history": [{"role": "agent", "text": first + swapped}]},
                                         {"history": [{"role": "agent", "text": "right"}]}, "L") == expected


def test_calibration_agreement():
    rows = {str(i): sample() for i in range(10)}
    labels = [{"dialog": str(i), "n": 1, "dimension": "L", "verdict": "pass", "note": "human"} for i in range(10)]
    class Fake:
        def request(self, system, payload):
            return {"verdict": "pass" if payload["dialog"]["need"]["index"] < 8 else "fail"}
    for i, row in enumerate(rows.values()):
        row["need"]["index"] = i
    counts = judge.calibrate(labels, Fake(), rows)
    assert counts["L"] == {"agree": 8, "total": 10, "admitted": True}
    assert not judge.calibrate(labels[:9], Fake(), rows)["L"]["admitted"]
    assert not counts["M"]["admitted"]


def test_pass_k_requires_every_run():
    assert run_all.pass_k([dict(sample(), passed=True)] * 2, 3) == {"test": False}
    assert run_all.pass_k([dict(sample(), passed=True)] * 3, 3) == {"test": True}
    assert run_all.pass_k([dict(sample(), passed=True), dict(sample(), passed=False)], 2) == {"test": False}


def test_live_uses_speak_and_snapshots():
    persona = {"id": "fake", "first_message": "Здравствуйте", "need": {}}
    scenario = run_all.load_json(run_all.ROOT / "data/golden.json")["scenarios"][0]
    with patch.object(run_all.llm, "intake", return_value={}), patch.object(run_all.llm, "speak", return_value="На что нужны деньги?") as speak:
        with patch.object(run_all.sim, "client_says", return_value="[СТОП]"):
            row = run_all.live_dialog(persona, scenario, 1)
    assert speak.call_count == 3 and len(row["trace"]) == 3
    assert not row["error"]
    assert all("view" in t and "memory" in t and "need" in t for t in row["trace"])
    assert row["trace"][0]["need"] is not row["trace"][1]["need"]


def test_unknown_not_pass_and_calibration_gate():
    class Fake:
        def evaluate(self, row):
            return [{"dimension": d, "verdict": "pass", "n": None if d == "M" else 1} for d in judge.DIMENSIONS]
    row = sample()
    row.update(scenario="s", need={"purpose": "рост", "amount_rub": 100, "term_months": 6, "repay_from": "выручка"},
               view={"status_text": "можно подавать"})
    golden = {"scenarios": [{"id": "s", "expected": {"status": "можно подавать"}}]}
    admitted = {d: {"admitted": True} for d in judge.DIMENSIONS}
    assert run_all.evaluate(row, {"scenario": "s"}, golden, Fake(), admitted=admitted)["passed"]
    assert not run_all.evaluate(row, {"scenario": "s"}, golden, Fake())["passed"]
    assert not run_all.evaluate(row, {}, {"scenarios": []}, Fake(), admitted=admitted)["provisional_pass"]


def test_offline_no_network():
    calls = []
    def process(command, **kwargs):
        calls.append(command)
        assert "socket.socket.connect=connect" in command[2]
        assert "socket.getaddrinfo=resolve" in command[2]
        assert "is_loopback" in command[2]
        return subprocess.CompletedProcess(command, 0, "fake pass\n", "")
    with patch.object(run_all.subprocess, "run", side_effect=process), patch.object(judge.llm, "chat", side_effect=AssertionError("LLM called")):
        levels, rows = run_all.offline()
    assert len(calls) == 4 and len(rows) == 80 and len(levels) == 5
    assert all("code" in r for r in rows)


def test_offline_subprocess_preserves_argv():
    result = run_all.offline_subprocess("help", ["eval.run", "--help"], AGENT)
    assert result["ok"], result["output"]
    assert "--runs" in result["output"]


def test_report_and_exit():
    with tempfile.TemporaryDirectory(dir=run_all.EVAL) as tmp:
        with patch.object(run_all, "TRACES", Path(tmp)), patch.object(run_all, "offline", return_value=([
                {"level": "fake", "ok": False, "output": "failure log"}], [])):
            assert run_all.main([]) == 1
            text = next(Path(tmp).glob("report-*.md")).read_text(encoding="utf-8")
            assert "failure log" in text and "unknown" in text and "Стоимость" in text


if __name__ == "__main__":
    run_all.TRACES.mkdir(parents=True, exist_ok=True)
    tests = [f for name, f in list(globals().items()) if name.startswith("test_") and callable(f)]
    for function in tests:
        function()
        print(function.__name__ + " PASS")
    print(f"{len(tests)} tests passed (direct, fake LLM)")
