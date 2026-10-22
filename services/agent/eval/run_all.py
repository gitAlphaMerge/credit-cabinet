"""One harness, offline by default (no network).

    python eval/run_all.py
    python eval/run_all.py --live --k 3
    python eval/run_all.py --ab eval/traces/live-reference.jsonl --trace eval/traces/live-current.jsonl

--ab ref is a JSONL trace file, not a git checkout. No repository mutation.
"""
import argparse
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

EVAL = Path(__file__).resolve().parent
AGENT = EVAL.parent
ROOT = AGENT.parents[1]
sys.path.insert(0, str(AGENT))
sys.path.insert(0, str(EVAL))
import dialog
import explain_templates
import intake_rules
import llm
try:
    from . import graders, judge, sim
except ImportError:
    import graders
    import judge
    import sim

TRACES = EVAL / "traces"
NOTES = [
    "unknown не считается pass; отсутствие expected.status в golden по scenario даёт исход unknown.",
    "Ход = ответ агента, включая приветствие; максимум 12. Проверки используют снимки фактов на этом ходе.",
    "Фикстуры отдельных реплик проверяют guard, но не завершённость диалога (исход unknown).",
    "Capability и regression берутся только из явного поля suite персоны; без него набор unclassified.",
    "Калибровка: не менее 10 меток и согласие >=80% по измерению; без допуска судья даёт только подсказку.",
    "pass^k требует k успешных запусков; дополнительно показан provisional pass^k до допуска судей.",
    "A/B: ref — путь JSONL; сравниваются одинаковые persona/run; расхождение перестановок = равно.",
    "Стоимость недоступна: llm.chat возвращает только текст без usage/cost.",
    "Offline запрещает внешнюю сеть в дочерних процессах; loopback оставлен для HTTP-тестов. Таймаут проверки 90 секунд.",
]


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def read_trace(path):
    """Read complete dialog rows, or a single play.py per-turn trace."""
    path = Path(path)
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if rows and "trace" not in rows[0] and "reply" in rows[0]:
        rows = [{"id": path.stem, "persona": rows[0].get("persona", path.stem), "trace": rows,
                 "need": rows[-1].get("need_now", {}), "memory": []}]
    return rows


def save_trace(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def offline_subprocess(name, args, cwd=ROOT):
    print(f"offline: {name}", flush=True)
    # Block external connections even with keys in .env; HTTP unit tests use loopback.
    bootstrap = """import socket, runpy, sys, ipaddress
def local(host):
    if host == 'localhost':
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False
original_connect = socket.socket.connect
original_connect_ex = socket.socket.connect_ex
original_resolve = socket.getaddrinfo
def connect(sock, address):
    if isinstance(address, tuple) and local(address[0]):
        return original_connect(sock, address)
    raise RuntimeError('offline: external network disabled')
def connect_ex(sock, address):
    if isinstance(address, tuple) and local(address[0]):
        return original_connect_ex(sock, address)
    raise RuntimeError('offline: external network disabled')
def resolve(host, *args, **kwargs):
    if local(host):
        return original_resolve(host, *args, **kwargs)
    raise RuntimeError('offline: external DNS disabled')
socket.socket.connect=connect
socket.socket.connect_ex=connect_ex
socket.getaddrinfo=resolve
sys.argv=sys.argv[1:]
runpy.run_module(sys.argv[0], run_name='__main__')
"""
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    try:
        result = subprocess.run([sys.executable, "-c", bootstrap, *args], cwd=cwd, env=env,
                                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90)
        return {"level": name, "ok": result.returncode == 0, "output": (result.stdout + result.stderr)[-6000:]}
    except subprocess.TimeoutExpired as error:
        output = (error.stdout or b"") + (error.stderr or b"")
        if isinstance(output, bytes):
            output = output.decode("utf-8", errors="replace")
        return {"level": name, "ok": False, "output": "Timeout after 90 seconds\n" + output[-6000:]}
    except (OSError, subprocess.SubprocessError) as error:
        return {"level": name, "ok": False, "output": repr(error)}


def fixture_dialogs():
    items = load_json(AGENT / "tests/fixtures/client_utterances.json")
    scenarios = load_json(ROOT / "data/golden.json")["scenarios"]
    scenario = scenarios[0]
    results = []
    for i, item in enumerate(items):
        state = dialog.new_state(scenario["questionnaire"])
        slot = item.get("agent_asked", "purpose")
        values = scenario["need"]
        order = ("purpose", "amount", "repay", "term", "statement")
        keys = {"purpose": "purpose", "amount": "amount_rub", "repay": "repay_from", "term": "term_months"}
        for before in order:
            if before == slot:
                break
            if before in keys and keys[before] in values:
                state["need"][keys[before]] = values[keys[before]]
        state["asking"] = slot
        # Explicit template functions; never availability-dependent.
        try:
            dialog.turn(state, item["text"], intake=intake_rules.parse, explain=explain_templates.explain)
            state["trace"][-1].update(need=deepcopy(state["need"]), view=deepcopy(state["view"]), memory=[])
            row = {"id": f"fixture-{i + 1}", "trace": state["trace"], "need": state["need"], "view": state["view"]}
        except Exception as error:
            row = {"id": f"fixture-{i + 1}", "trace": state["trace"], "error": repr(error)}
        row["code"] = graders.grade(row, check_outcome=False)
        results.append(row)
    return results


def offline():
    files = [str(p) for p in AGENT.rglob("*.py")]
    levels = [offline_subprocess("py_compile (all agent Python)", ["py_compile", *files]),
              offline_subprocess("pytest services/agent/tests", ["pytest", "services/agent/tests", "-q", "--tb=short", "-p", "no:cacheprovider"]),
              offline_subprocess("golden", ["data.check_golden"]),
              offline_subprocess("run.py", ["eval.run"], AGENT)]
    with patch.object(llm, "chat", side_effect=RuntimeError("offline: LLM disabled")):
        rows = fixture_dialogs()
    passed = sum(r["code"]["ok"] for r in rows)
    levels.append({"level": "client utterances (templates + graders)", "ok": len(rows) == 80 and passed == 80,
                   "output": f"{passed}/{len(rows)} passed; expected 80"})
    return levels, rows


def live_dialog(persona, scenario, run_number):
    """sim.py client protocol with the current speak API and per-turn snapshots."""
    statement = (ROOT / scenario["file"]).read_text(encoding="utf-8")
    state = dialog.new_state(scenario["questionnaire"])
    history = []
    memory = deepcopy(persona.get("memory", []))
    error = None
    def turn(text, attachment=None):
        reply = dialog.turn(state, text, attachment, intake=llm.intake,
                            speak=llm.speak, client_memory=memory)
        state["trace"][-1].update(need=deepcopy(state["need"]), view=deepcopy(state["view"]), memory=deepcopy(memory))
        if text:
            history.append({"role": "client", "text": text})
        history.append({"role": "agent", "text": reply})
    try:
        turn("")
        text = persona["first_message"]
        while len(state["trace"]) < 12:
            attachment = {}
            if "[ВЫПИСКА]" in text:
                attachment["statement_csv"] = statement
            if "[ДОГОВОР]" in text and persona["need"].get("contract_with_main_customer"):
                attachment["contract_main_customer"] = persona["need"]["contract_with_main_customer"]
            clean = text.replace("[ВЫПИСКА]", "").replace("[ДОГОВОР]", "").replace("[СТОП]", "").strip()
            turn(clean, attachment)
            if "[СТОП]" in text:
                break
            if len(state["trace"]) < 12:
                text = sim.client_says(persona, history, sim.CLIENT_MODEL)
    except Exception as exc:
        error = repr(exc)
    return {"id": f"{persona['id']}:{run_number}", "persona": persona["id"], "run": run_number,
            "scenario": scenario["id"], "suite": persona.get("suite", "unclassified"),
            "trace": state["trace"], "history": history, "need": state["need"], "view": state["view"],
            "memory": memory, "error": error}


def evaluate(row, persona, golden, evaluator, judge_all=False, admitted=None):
    row["code"] = graders.grade(row, persona, golden)
    row["judgments"] = evaluator.evaluate(row) if row["code"]["ok"] or judge_all else []
    all_pass = bool(row["judgments"]) and all(r["verdict"] == "pass" for r in row["judgments"])
    row["provisional_pass"] = row["code"]["ok"] and row["code"]["outcome"] == "pass" and all_pass
    row["passed"] = row["provisional_pass"] and all((admitted or {}).get(d, {}).get("admitted", False) for d in judge.DIMENSIONS)
    return row


def pass_k(rows, k, field="passed"):
    groups = defaultdict(list)
    for row in rows:
        if "persona" in row:
            groups[row["persona"]].append(row)
    return {p: len(rs) == k and all(r.get(field, False) for r in rs) for p, rs in groups.items()}


def compare_traces(current, reference, evaluator):
    def index(rows):
        indexed, counts = {}, Counter()
        for row in rows:
            p = row.get("persona", row.get("id"))
            counts[p] += 1
            key = (p, row.get("run", counts[p]))
            if key in indexed:
                raise ValueError(f"Duplicate A/B key: {key}")
            indexed[key] = row
        return indexed
    a, b = index(current), index(reference)
    if set(a) != set(b) or not a:
        raise ValueError("A/B traces must contain the same nonempty persona/run pairs")
    return [{"persona": key[0], "run": key[1], "dimension": d, "winner": evaluator.compare(a[key], b[key], d)}
            for key in sorted(a) for d in "LVF"]


def report(path, levels, rows, k, calibration=None, ab=None):
    lines = ["# Agent evaluation", "", f"Дата: {datetime.now().isoformat(timespec='seconds')}", "",
             "| Уровень | Результат |", "|---|---|"]
    lines += [f"| {r['level']} | {'pass' if r['ok'] else 'fail'} |" for r in levels]
    lines += ["", f"## pass^{k}", "", "| Персона | Набор | pass^k | provisional |", "|---|---|---|---|"]
    strict, provisional = pass_k(rows, k), pass_k(rows, k, "provisional_pass")
    for p, ok in strict.items():
        suite = next(r.get("suite", "unclassified") for r in rows if r.get("persona") == p)
        lines.append(f"| {p} | {suite} | {ok} | {provisional[p]} |")
    if not strict:
        lines.append("| не запускался | — | n/a | n/a |")
    for suite in sorted({r.get("suite", "unclassified") for r in rows if "persona" in r}):
        ps = {r["persona"] for r in rows if r.get("suite", "unclassified") == suite and "persona" in r}
        lines.append(f"\n{suite}: {sum(strict[p] for p in ps)}/{len(ps)} pass^{k}")
    lines += ["", "## Измерения", "", "| Измерение | pass / всего | fail | unknown | Допущен |", "|---|---|---|---|---|"]
    for d in judge.DIMENSIONS:
        c = Counter(j["verdict"] for r in rows for j in r.get("judgments", []) if j["dimension"] == d)
        lines.append(f"| {d} | {c['pass']}/{sum(c.values())} | {c['fail']} | {c['unknown']} | {(calibration or {}).get(d, {}).get('admitted', False)} |")
    failures = []
    for row in rows:
        for f in row.get("code", {}).get("failures", []):
            failures.append((row.get("id", row.get("persona", "?")), f.get("n"), f["rule"], f["quote"]))
        for f in row.get("judgments", []):
            if f["verdict"] != "pass":
                failures.append((row.get("id", "?"), f["n"], f["dimension"] + ": " + f["verdict"] + " " + f["reasoning"], f["quote"]))
    lines += ["", "## Топ-10 провалов", ""]
    # Most frequent failure categories first, stable within a category.
    frequencies = Counter(f[2] for f in failures)
    for identity, n, reason, quote in sorted(failures, key=lambda f: -frequencies[f[2]])[:10]:
        lines.append(f"- {identity}, n={n}: {reason}; цитата: {quote}")
    if not failures:
        lines.append("Нет зарегистрированных провалов реплик; см. результаты offline и unknown выше.")
    if calibration:
        lines += ["", "## Калибровка", "", "| Измерение | Согласие | Допущен |", "|---|---|---|"]
        lines += [f"| {d} | {r['agree']}/{r['total']} | {r['admitted']} |" for d, r in calibration.items()]
    if ab:
        lines += ["", "## A/B", "", "A = current, B = reference; tie включает расхождения перестановок."]
        for d in "LVF":
            lines.append(f"\n{d}: {dict(Counter(r['winner'] for r in ab if r['dimension'] == d))}")
    lines += ["", "## Принятые трактовки и ограничения", ""] + ["- " + n for n in NOTES]
    for level in levels:
        lines += ["", f"## {level['level']}: вывод", "", "```text", level["output"].replace("```", "'''"), "```"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--k", type=int, default=3)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--judge-all", action="store_true")
    ap.add_argument("--min-pass", type=float, default=0)
    ap.add_argument("--ab", metavar="REF", help="reference JSONL trace; requires --trace or --live")
    ap.add_argument("--trace", help="current JSONL trace; also supplies dialogs for calibration")
    ap.add_argument("--calibrate", metavar="LABELS_JSONL")
    args = ap.parse_args(argv)
    if args.k < 1 or args.workers < 1 or not 0 <= args.min_pass <= 1:
        ap.error("k/workers must be positive; min-pass must be in [0,1]")
    if args.ab and not (args.trace or args.live):
        ap.error("--ab requires --trace or --live")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    levels, rows, calibration, ab = [], [], None, None
    offline_rows = []
    try:
        if args.live or args.ab or args.calibrate:
            if args.live:
                levels, offline_rows = offline()
                save_trace(offline_rows, TRACES / f"offline-{stamp}.jsonl")
            evaluator = judge.Judge(workers=args.workers)
            current = read_trace(args.trace) if args.trace else []
            if args.calibrate:
                labels = [json.loads(l) for l in Path(args.calibrate).read_text(encoding="utf-8").splitlines() if l.strip()]
                dialogs = {r.get("id", r.get("persona")): r for r in current}
                for label in labels:
                    if label["dialog"] not in dialogs:
                        src = Path(label["dialog"])
                        if not src.is_absolute():
                            src = Path(args.calibrate).resolve().parent / src
                        loaded = read_trace(src)
                        if len(loaded) != 1:
                            raise ValueError("Use --trace and an unambiguous dialog id for multi-dialog files")
                        dialogs[label["dialog"]] = loaded[0]
                calibration = judge.calibrate(labels, evaluator, dialogs)
                levels.append({"level": "human calibration", "ok": all(c["admitted"] for c in calibration.values()),
                               "fatal": False, "output": json.dumps(calibration)})
            if args.live:
                golden = load_json(ROOT / "data/golden.json")
                scenarios = {s["id"]: s for s in golden["scenarios"]}
                personas = [dict(p, source=source) for source in ("deepseek", "redteam-deepseek")
                            for p in load_json(EVAL / f"data/personas-{source}.json")]
                current = []
                for p in personas:
                    for run in range(1, args.k + 1):
                        print(f"live {p['id']} {run}/{args.k}", flush=True)
                        row = live_dialog(p, scenarios[p["scenario"]], run)
                        current.append(evaluate(row, p, golden, evaluator, args.judge_all, calibration))
                        save_trace(current, TRACES / f"live-{stamp}.jsonl")
                levels.append({"level": "live code graders", "ok": all(r["code"]["ok"] for r in current),
                               "fatal": False, "output": f"{sum(r['code']['ok'] for r in current)}/{len(current)} pass"})
                judged = [j for r in current for j in r["judgments"]]
                levels.append({"level": "live dimension judges (provisional without calibration)",
                               "ok": bool(judged) and all(j["verdict"] == "pass" for j in judged),
                               "fatal": False, "output": str(dict(Counter(j["verdict"] for j in judged)))})
            rows = offline_rows + current
            if args.ab:
                ab = compare_traces(current, read_trace(args.ab), evaluator)
                levels.append({"level": "A/B with swap", "ok": True, "fatal": False,
                               "output": f"{len(ab)} paired dimension comparisons"})
        else:
            levels, rows = offline()
            save_trace(rows, TRACES / f"offline-{stamp}.jsonl")
    except Exception as error:
        levels.append({"level": "harness", "ok": False, "output": repr(error)})
    out = TRACES / f"report-{stamp}.md"
    report(out, levels, rows, args.k, calibration, ab)
    print(out)
    metric = pass_k(rows, args.k)
    rate = sum(metric.values()) / len(metric) if metric else 0
    return int(any(not l["ok"] and l.get("fatal", True) for l in levels)
               or (args.min_pass > 0 and rate < args.min_pass))


if __name__ == "__main__":
    sys.exit(main())
