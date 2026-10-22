"""Layer 1: deterministic final outcome and guard checks with per-turn evidence."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import guard

ROOT = Path(__file__).resolve().parents[3]
SLOTS = ("purpose", "amount_rub", "term_months", "repay_from")


def expected_status(persona, golden=None):
    if golden is None:
        golden = json.loads((ROOT / "data/golden.json").read_text(encoding="utf-8"))
    scenario = next((s for s in golden["scenarios"] if s["id"] == persona.get("scenario")), {})
    return scenario.get("expected", {}).get("status")


def grade(dialog, persona=None, golden=None, check_outcome=True):
    trace = dialog.get("trace", [])
    failures = []
    def fail(rule, quote="", n=None):
        failures.append({"rule": rule, "quote": " ".join(quote.split()[:15]), "n": n})
    if not trace:
        fail("empty dialogue")
    # A turn is an agent reply, including the opening reply.
    if len(trace) > 12:
        fail("more than 12 turns")
    seen, users, need = set(), [], {}
    memory = dialog.get("memory", [])
    for n, turn in enumerate(trace, 1):
        reply = turn.get("reply", "")
        users.append(turn.get("user", ""))
        need.update(turn.get("fields", {}))
        evidence_need = turn.get("need", turn.get("need_now", need))
        facts = turn.get("memory", memory)
        memory_text = " ".join(f.get("text", "") for f in facts if f.get("status") == "active")
        # Never authorize an earlier reply with final view or future customer words.
        view = turn.get("view")
        for violation in guard.check(reply, view, evidence_need, client_text=" ".join(users) + " " + memory_text):
            fail(violation, reply, n)
        for violation in turn.get("violations", []):
            fail("trace: " + violation, reply, n)
        if reply in seen:
            fail("verbatim repeat", reply, n)
        seen.add(reply)
    if dialog.get("error"):
        fail("runtime error: " + str(dialog["error"]))
    outcome = "unknown"
    if check_outcome:
        persona = persona or dialog
        expected = expected_status(persona, golden)
        final_need = dialog.get("need", need)
        view = dialog.get("view") or (trace[-1].get("view") if trace else None)
        if persona.get("expected_escalation") is True:
            escalated = any(t.get("goal") == "manager" and "менеджер" in t.get("reply", "").lower() for t in trace)
            outcome = "pass" if escalated else "fail"
        elif expected is not None:
            slots = all(final_need.get(k) is not None and final_need.get(k) != "" for k in SLOTS)
            status = (view or {}).get("status_text")
            outcome = "pass" if slots and status == expected else "fail"
        if outcome == "fail":
            fail("outcome: slots/status/escalation mismatch")
    return {"ok": not failures, "outcome": outcome, "failures": failures}
