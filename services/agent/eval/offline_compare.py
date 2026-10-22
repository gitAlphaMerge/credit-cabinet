"""Offline baseline: original persona opener, then deterministic slot answers.

This measures reachability and guard failures, not a live customer's language quality.
Run the same scripted inputs against Qwen separately before comparing language quality.
"""
import json
import os
import socket
import statistics
import sys
import time
from pathlib import Path

AGENT = Path(__file__).resolve().parents[1]
ROOT = AGENT.parents[1]
sys.path.insert(0, str(AGENT))
sys.path.insert(0, str(AGENT / "eval"))
os.environ["AGENT_LLM_URL"] = ""
os.environ.setdefault("JOURNAL_PATH", str(AGENT / "eval" / "traces" / "offline-journal.jsonl"))

import data_io
import dialog
import guard
from run import client_reply


def main():
    scenarios = {s["id"]: s for s in json.loads((ROOT / "data" / "golden.json").read_text(encoding="utf-8"))["scenarios"]}
    elapsed, results = [], []
    original_socket = socket.socket
    attempts = []

    class NoNetwork(original_socket):
        def __init__(self, *args, **kwargs):
            attempts.append(args)
            raise RuntimeError("network disabled by offline baseline")

    socket.socket = NoNetwork
    try:
        for persona in data_io.personas():
            scenario = scenarios[persona["scenario"]]
            statement = (ROOT / scenario["file"]).read_text(encoding="utf-8")
            state = dialog.new_state(scenario["questionnaire"])
            text, attachment, clean = persona["first_message"], None, True
            for _ in range(12):
                started = time.perf_counter()
                reply = dialog.turn(state, text, attachment)
                elapsed.append((time.perf_counter() - started) * 1000)
                clean = clean and not guard.check(reply, state["view"], state["need"], client_text=text)
                if state["view"] is not None:
                    break
                if state["trace"][-1]["kind"] == "core_error":
                    break
                text, attachment = client_reply(state["asking"], persona["need"], statement)
            reached = state["view"] is not None
            results.append((reached, clean))
            print(f"{persona['id']}: explained={reached}, guard_clean={clean}")
    finally:
        socket.socket = original_socket
    ordered = sorted(elapsed)
    print(f"explained={sum(r[0] for r in results)}/{len(results)}, guard_clean={sum(r[1] for r in results)}/{len(results)}, network_attempts={len(attempts)}")
    print(f"turn_ms: median={statistics.median(elapsed):.2f}, p95={ordered[int(.95 * (len(ordered) - 1))]:.2f}, max={max(elapsed):.2f}")
    return 0 if all(r[0] and r[1] for r in results) and not attempts else 1


if __name__ == "__main__":
    raise SystemExit(main())
