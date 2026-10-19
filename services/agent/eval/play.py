"""Живой прогон: ты играешь клиента по карточке и после каждого ответа агента ставишь оценку и коммент.

    python services/agent/eval/play.py --persona cash_gap_b          # агент на LLM, если есть ключ, иначе шаблоны
    python services/agent/eval/play.py --persona cash_gap_b --templates

Команды клиента: /выписка (загрузить выписку сценария), /договор (загрузить договор), /стоп.
Оценка после ответа агента: Enter = ок, «-» = плохо; после оценки можно дописать коммент.
Трейсы: services/agent/eval/traces/human-<время>-<персона>.jsonl → разбор и новые тесты.
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

AGENT = Path(__file__).resolve().parents[1]
ROOT = AGENT.parents[1]
sys.path.insert(0, str(AGENT))
sys.path.insert(0, str(AGENT / "eval"))

import data_io  # noqa: E402
import dialog  # noqa: E402
import explain_templates  # noqa: E402
import intake_rules  # noqa: E402
import llm  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--persona", help="id из personas-*.json; без него список")
    ap.add_argument("--templates", action="store_true", help="без LLM, только шаблоны")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    personas = {p["id"]: p for p in data_io.personas()}
    if args.persona not in personas:
        print("персоны:", ", ".join(personas))
        return 1
    p = personas[args.persona]
    scenario = next(s for s in json.loads((ROOT / "data" / "golden.json").read_text(encoding="utf-8"))["scenarios"]
                    if s["id"] == p["scenario"])
    use_llm = llm.available() and not args.templates
    intake = llm.intake if use_llm else intake_rules.parse
    explain = llm.explain if use_llm else explain_templates.explain

    print(f"\n── карточка: {p['id']} · {p['who']}\n   характер: {p['style']} · странность: {p['quirk']}")
    print(f"   нужда: {p['need']}\n   секрет: {p['secret']}\n   первая реплика: {p['first_message']}")
    print(f"── агент: {'LLM ' + llm.MODEL if use_llm else 'шаблоны'} · ядро считает правильно: {scenario['expected']['status']}\n")

    out = AGENT / "eval" / "traces" / f"human-{datetime.now():%Y%m%d-%H%M%S}-{p['id']}.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    state = dialog.new_state(scenario["questionnaire"])
    statement = (ROOT / scenario["file"]).read_text(encoding="utf-8")
    text, attachment = "", None
    with out.open("w", encoding="utf-8") as f:
        while True:
            try:
                reply = dialog.turn(state, text, attachment, intake=intake, explain=explain)
            except Exception as e:  # сеть, ключ, кривой JSON модели: видно в трейсе, прогон не падает молча
                reply = f"[ошибка агента: {e}]"
                state["trace"].append({"user": text, "kind": "error", "reply": reply})
            print(f"агент> {reply}")
            mark = input("   оценка (Enter ок / - плохо)> ").strip()
            comment = input("   коммент> ").strip() if mark == "-" else input("   коммент (можно пусто)> ").strip()
            row = dict(state["trace"][-1], persona=p["id"], ok=mark != "-", comment=comment,
                       need_now=dict(state["need"]))
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            text = input("клиент> ").strip()
            attachment = None
            if text == "/стоп":
                break
            if text == "/выписка":
                text, attachment = "Загрузил выписку", {"statement_csv": statement}
            elif text == "/договор":
                deal = p["need"].get("contract_with_main_customer") or {"sum_rub": 0, "months": 12}
                text, attachment = "Загрузил договор", {"contract_main_customer": deal}
    print(f"\nтрейс: {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
