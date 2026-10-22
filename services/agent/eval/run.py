"""Eval уровня 2: клиент по сценарию × агент × настоящее ядро, на каждом сценарии golden.json.

Клиент-сценарист без LLM: отвечает на вопрос агента полями из `need`. Проверяет трубы (роутер, ядро, объяснялку,
стража), а не понимание живой речи: живые фразы идут в уровень 0 (tests/test_intake_rules.py).

    python services/agent/eval/run.py            # таблица + трейсы в services/agent/eval/traces/
    python services/agent/eval/run.py --runs 3   # pass^3: сценарий засчитан, только если прошёл все прогоны
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

AGENT = Path(__file__).resolve().parents[1]
ROOT = AGENT.parents[1]
sys.path.insert(0, str(AGENT))

import dialog  # noqa: E402
from explain_templates import rub  # noqa: E402

OPENERS = {
    "кассовый разрыв": "Кассовый разрыв: заказчик платит позже, а зарплату платить сейчас",
    "оборудование": "Хочу купить станок для цеха",
    "сезон": "Нужны деньги на сезон, закупка к весне",
    "рост": "На развитие, хочу нанять двух разработчиков",
    "закупка под контракт": "На закупку под контракт",
}
MAX_TURNS = 10


def client_reply(slot: str | None, need: dict, statement: str) -> tuple[str, dict | None]:
    if slot == "purpose":
        return OPENERS[need["purpose"]], None
    if slot == "amount":
        return rub(need["amount_rub"]), None
    if slot == "repay":
        text = f"Через {need['term_months']} месяцев, из {need['repay_from']}"
        if deal := need.get("contract_with_main_customer"):
            text += f". Договор с заказчиком на {rub(deal['sum_rub'])} на {deal['months']} месяцев"
        return text, None
    if slot == "term":
        return f"{need['term_months']} месяцев", None
    if slot == "statement":
        return "Загрузил выписку", {"statement_csv": statement}
    return "", None


def run_scenario(s: dict) -> dict:
    statement = (ROOT / s["file"]).read_text(encoding="utf-8")
    state = dialog.new_state(s["questionnaire"])
    text, attachment = "", None  # агент начинает первым: пустое сообщение = открыли чат
    for _ in range(MAX_TURNS):
        dialog.turn(state, text, attachment)
        if state["view"] is not None:
            break
        text, attachment = client_reply(state["asking"], s["need"], statement)
    view, need, exp = state["view"], state["need"], s["expected"]
    checks = {
        "дошёл до ответа": view is not None,
        "статус = golden": bool(view) and view["status_text"] == exp["status"],
        "инструмент = golden": bool(view) and view["instrument"] == exp["instrument"],
        "поля = need": all(need.get(k) == s["need"][k] for k in ("purpose", "amount_rub", "term_months")),
        "страж чистый": not any(t["violations"] for t in state["trace"]),
    }
    return {"id": s["id"], "ok": all(checks.values()), "checks": checks, "need": need, "trace": state["trace"]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--golden", default=str(ROOT / "data" / "golden.json"))
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    scenarios = json.loads(Path(args.golden).read_text(encoding="utf-8"))["scenarios"]
    out = AGENT / "eval" / "traces" / f"{datetime.now():%Y%m%d-%H%M%S}.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    passed = 0
    with out.open("w", encoding="utf-8") as f:
        for s in scenarios:
            results = [run_scenario(s) for _ in range(args.runs)]
            for r in results:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
            ok = all(r["ok"] for r in results)
            passed += ok
            failed = sorted({k for r in results for k, v in r["checks"].items() if not v})
            print(f"{'✅' if ok else '❌'} {s['id']:18} {', '.join(failed)}")
    print(f"\n{passed}/{len(scenarios)} сценариев (pass^{args.runs}) · трейсы: {out.relative_to(ROOT)}")
    return 0 if passed == len(scenarios) else 1


if __name__ == "__main__":
    sys.exit(main())
