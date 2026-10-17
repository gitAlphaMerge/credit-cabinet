"""Eval уровня 0 на живых фразах: точность приёмщика по тегам и источникам, плюс список промахов для разбора.

    python services/agent/eval/intake_report.py              # приёмщик на правилах
    python services/agent/eval/intake_report.py --misses     # и каждый промах: фраза, что ждали, что вышло
    python services/agent/eval/intake_report.py --intake llm # LLM-приёмщик на тех же фразах
"""
import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import data_io  # noqa: E402
import llm  # noqa: E402
from intake_rules import parse  # noqa: E402

INTAKES = {"rules": parse, "llm": llm.intake}  # llm = AGENT_LLM_MODEL через OpenRouter, нужен ключ в .env


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--intake", default="rules", choices=sorted(INTAKES))
    ap.add_argument("--misses", action="store_true")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    items = data_io.phrases()
    if not items:
        print(f"нет фраз: положи phrases-<источник>.json в {data_io.DATA}")
        return 1
    intake = INTAKES[args.intake]
    by = defaultdict(lambda: [0, 0])
    misses = []
    for item in items:
        errors = data_io.intake_errors(item, intake(item["text"], item.get("asking")))
        for key in ["все", f"источник:{item['source']}", f"вопрос:{item.get('asking')}"] + item.get("tags", []):
            by[key][0] += not errors
            by[key][1] += 1
        if errors:
            misses.append((item, errors))
    for key, (ok, n) in sorted(by.items(), key=lambda kv: (kv[0] != "все", kv[0])):
        print(f"{key:28} {ok:3}/{n:<3} {ok / n:6.0%}")
    if args.misses:
        for item, errors in misses:
            print(f"\n[{item['ref']}] asking={item.get('asking')} «{item['text']}»")
            for e in errors:
                print(f"   ✗ {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
