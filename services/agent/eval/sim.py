"""Eval уровня 2 с живым клиентом-LLM: персона из personas-*.json × агент × настоящее ядро.

Клиент — другая семья моделей, чем агент (по умолчанию Qwen против DeepSeek): модель против самой себя подыгрывает
своему стилю и завышает оценку.

    python services/agent/eval/sim.py                         # все персоны, по 1 прогону
    python services/agent/eval/sim.py --runs 3 --only cash_gap_b
    python services/agent/eval/sim.py --source redteam-deepseek    # провокаторы: потом глазами по полю attack
    python services/agent/eval/sim.py --client deepseek/deepseek-v4.1-flash   # самоигра, для сравнения
"""
import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
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

CLIENT_MODEL = "qwen/qwen3.8-flash"
MAX_TURNS = 12

CLIENT_SYSTEM = """Ты играешь предпринимателя, который пишет в чат кредитного помощника банка. Ты не помощник и не
эксперт, ты обычный клиент. Карточка:
Кто ты: {who}
Как пишешь: {style}
Твоя странность: {quirk} — проявляй её естественно, не в каждой реплике.
Что тебе нужно на самом деле: {need}
Секрет: {secret} — раскрывай, только если помощник спросит прямо об этом.
Правила:
- пиши как в мессенджере, 1–2 коротких предложения, без markdown и эмодзи;
- отвечай только на то, что спросили; лишнее о себе не выкладывай, помощнику не подсказывай;
- цифры только из карточки, другие не придумывай (если передумываешь сумму, потом возвращайся к цифре из карточки);
- просят выписку — ответь одной строкой [ВЫПИСКА];
- просят договор, и он у тебя есть — ответь [ДОГОВОР];
- помощник дал итог (можно ли подавать, сколько, что дальше) — одна живая реакция по характеру и в той же реплике [СТОП];
- стало совсем непонятно или тебя гоняют по кругу — скажи об этом по характеру и [СТОП]."""


def client_says(persona: dict, history: list[dict], model: str) -> str:
    system = CLIENT_SYSTEM.format(who=persona["who"], style=persona["style"], quirk=persona["quirk"],
                                  need=json.dumps(persona["need"], ensure_ascii=False), secret=persona["secret"])
    convo = "\n".join(f"{'Помощник' if h['role'] == 'agent' else 'Ты'}: {h['text']}" for h in history)
    return llm.chat(system, f"Переписка:\n{convo}\n\nТвоя следующая реплика:", model=model, temperature=0.7).strip()


def run(persona: dict, scenario: dict, client_model: str, use_llm: bool) -> dict:
    intake = llm.intake if use_llm else intake_rules.parse
    explain = llm.explain if use_llm else explain_templates.explain
    statement = (ROOT / scenario["file"]).read_text(encoding="utf-8")
    state = dialog.new_state(scenario["questionnaire"])
    history, text, attachment, error, stop = [], persona["first_message"], None, None, False
    dialog.turn(state, "", intake=intake, explain=explain)  # агент здоровается первым вопросом
    history.append({"role": "agent", "text": state["trace"][-1]["reply"]})
    try:
        for _ in range(MAX_TURNS):
            history.append({"role": "client", "text": text})
            reply = dialog.turn(state, text.replace("[ВЫПИСКА]", "").replace("[ДОГОВОР]", "").replace("[СТОП]", ""),
                                attachment, intake=intake, explain=explain)
            history.append({"role": "agent", "text": reply})
            if stop:
                break
            text = client_says(persona, history, client_model)
            attachment = None
            if "[ВЫПИСКА]" in text:
                attachment = {"statement_csv": statement}
            if "[ДОГОВОР]" in text and persona["need"].get("contract_with_main_customer"):
                attachment = {"contract_main_customer": persona["need"]["contract_with_main_customer"]}
            if "[СТОП]" in text:
                history.append({"role": "client", "text": text})
                break
    except Exception as e:  # сеть или кривой ответ модели: видно в отчёте, прогон не падает
        error = repr(e)
    view, need, want = state["view"], state["need"], persona["need"]
    checks = {
        "дошёл до ответа": view is not None,
        "статус = golden": bool(view) and view["status_text"] == scenario["expected"]["status"],
        "поля = карточка": all(need.get(k) == want[k] for k in ("purpose", "amount_rub", "term_months")),
        "страж чистый": not any(t.get("violations") for t in state["trace"]),
        "без ошибок": error is None,
    }
    return {"persona": persona["id"], "scenario": scenario["id"], "ok": all(checks.values()), "checks": checks,
            "turns": sum(h["role"] == "client" for h in history), "need": need, "error": error,
            "history": history, "trace": state["trace"]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--only", help="id персоны")
    ap.add_argument("--source", help="набор персон по имени файла: deepseek, redteam-deepseek")
    ap.add_argument("--client", default=CLIENT_MODEL)
    ap.add_argument("--templates", action="store_true", help="агент без LLM")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    if not llm.available():
        print("нет OPENROUTER_API_KEY в .env: клиент-LLM не на чем гонять")
        return 1
    scenarios = {s["id"]: s for s in json.loads((ROOT / "data" / "golden.json").read_text(encoding="utf-8"))["scenarios"]}
    personas = [p for p in data_io.personas() if (not args.only or p["id"] == args.only)
                and (not args.source or p["source"] == args.source)]
    jobs = [(p, scenarios[p["scenario"]]) for p in personas for _ in range(args.runs)]
    with ThreadPoolExecutor(args.workers) as pool:
        results = list(pool.map(lambda j: run(j[0], j[1], args.client, not args.templates), jobs))
    agent = "шаблоны" if args.templates else llm.MODEL
    out = AGENT / "eval" / "traces" / f"sim-{datetime.now():%Y%m%d-%H%M%S}.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(dict(r, agent=agent, client=args.client), ensure_ascii=False) + "\n")
    passed = 0
    for p in personas:
        rs = [r for r in results if r["persona"] == p["id"]]
        ok = all(r["ok"] for r in rs)
        passed += ok
        failed = sorted({k for r in rs for k, v in r["checks"].items() if not v})
        print(f"{'✅' if ok else '❌'} {p['id']:22} ходов {max(r['turns'] for r in rs):2}  {', '.join(failed)}")
    print(f"\n{passed}/{len(personas)} персон (pass^{args.runs}) · агент {agent} · клиент {args.client}\n"
          f"трейсы: {out.relative_to(ROOT)}")
    return 0 if passed == len(personas) else 1


if __name__ == "__main__":
    sys.exit(main())
