"""Dimension judges; prompts are read verbatim from JUDGE.md, never duplicated."""
import hashlib
import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

EVAL = Path(__file__).resolve().parent
sys.path.insert(0, str(EVAL.parent))
import llm
try:
    from . import sim
except ImportError:
    import sim

DIMENSIONS = tuple("GLMPVF")


def evidence(dialog):
    """Keep conversation and facts; hide version names and prior evaluation results."""
    return {key: dialog[key] for key in ("trace", "history", "need", "view", "memory") if key in dialog}


def validate_model(model=None):
    model = model or os.getenv("JUDGE_MODEL", "google/gemini-3.8-flash")
    family = model.split("/", 1)[0].lower()
    for role, other in (("agent", llm.MODEL), ("client", sim.CLIENT_MODEL)):
        if family == other.split("/", 1)[0].lower():
            raise ValueError(f"Judge family {family!r} matches {role} model {other!r}; choose another JUDGE_MODEL")
    return model


def parse_response(raw):
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(value, dict):
            raise ValueError("expected JSON object")
        verdict = value.get("verdict")
        return {"reasoning": str(value.get("reasoning", "")),
                "verdict": verdict if verdict in ("pass", "fail", "unknown") else "unknown",
                "quote": "" if verdict == "pass" else " ".join(str(value.get("quote", "")).split()[:15])}
    except (ValueError, TypeError):
        return {"reasoning": "Invalid judge JSON", "verdict": "unknown", "quote": ""}


def instructions(dimension):
    if dimension not in DIMENSIONS:
        raise ValueError(f"Unknown dimension: {dimension}")
    spec = (EVAL / "JUDGE.md").read_text(encoding="utf-8")
    header = spec.split("## Общая шапка каждого судьи", 1)[1].split("```", 2)[1].strip()
    text = re.search(rf"(?ms)^\*\*{dimension}\. .*?(?=^\*\*[GLMPVF]\. |^## |\Z)", spec).group().strip()
    if dimension == "P":
        text += "\n\n" + (EVAL.parent / "PERMISSIONS.md").read_text(encoding="utf-8")
    if dimension == "V":
        voice = (EVAL.parent / "AGENT.md").read_text(encoding="utf-8")
        text += "\n\n## Слоп" + voice.split("## Слоп", 1)[1].split("\n## ", 1)[0]
    return header + "\n\n" + text


class Judge:
    def __init__(self, model=None, workers=6, cache=None):
        self.model = validate_model(model)
        self.workers = workers
        self.path = Path(cache) if cache is not None else EVAL / "traces" / "judge-cache.jsonl"
        self.lock = threading.Lock()
        self.cache = {}
        if self.path.exists():
            for line in self.path.read_text(encoding="utf-8").splitlines():
                try:
                    row = json.loads(line)
                    self.cache[row["sha256"]] = row["result"]
                except (ValueError, KeyError, TypeError):
                    continue  # an interrupted last append is not a verdict

    def request(self, system, payload):
        user = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        prompt = json.dumps({"model": self.model, "system": system, "user": user,
                             "temperature": 0, "as_json": True}, ensure_ascii=False, sort_keys=True)
        key = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        with self.lock:
            if key in self.cache:
                return self.cache[key]
        try:
            raw = llm.chat(system, user, model=self.model, as_json=True, temperature=0)
        except Exception as error:
            return {"reasoning": f"Judge error: {type(error).__name__}: {error}",
                    "verdict": "unknown", "quote": ""}
        result = parse_response(raw)
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps({"sha256": key, "result": result}, ensure_ascii=False) + "\n")
            self.cache[key] = result
        return result

    def evaluate(self, dialog):
        tasks = [(d, None) if d == "M" else (d, n)
                 for d in DIMENSIONS for n in ([None] if d == "M" else range(1, len(dialog.get("trace", [])) + 1))]
        def score(task):
            d, n = task
            return dict(self.request(instructions(d), {"dialog": evidence(dialog), "dimension": d, "n": n}),
                        dimension=d, n=n)
        with ThreadPoolExecutor(self.workers) as pool:
            return list(pool.map(score, tasks))

    def compare(self, left, right, dimension):
        if dimension not in "LVF":
            raise ValueError("A/B dimensions are L, V, F")
        system = instructions(dimension) + '\nПопарное сравнение: выбери лучший диалог целиком по этому измерению.'
        # request() validates ordinary verdicts; A/B has its own JSON vocabulary.
        def choice(a, b):
            result = self.request(system + '\nВ verdict верни pass при A, fail при B, unknown при равно.',
                                  {"A": evidence(a), "B": evidence(b)})
            return {"pass": "A", "fail": "B", "unknown": "tie"}[result["verdict"]]
        first, swapped = choice(left, right), choice(right, left)
        second = {"A": "B", "B": "A", "tie": "tie"}[swapped]
        return first if first == second else "tie"


def calibrate(labels, judge, dialogs):
    """At least ten cases and >=80% agreement; unknown is an explicit label."""
    counts = {d: {"agree": 0, "total": 0} for d in DIMENSIONS}
    seen = set()
    for label in labels:
        d = label["dimension"]
        if d not in counts or label["verdict"] not in ("pass", "fail", "unknown"):
            raise ValueError(f"Invalid human label: {label}")
        n = None if d == "M" else label["n"]
        key = (label["dialog"], n, d)
        if key in seen:
            raise ValueError(f"Duplicate human label: {key}")
        seen.add(key)
        dialog = dialogs[label["dialog"]]
        if d != "M" and (not isinstance(n, int) or not 1 <= n <= len(dialog["trace"])):
            raise ValueError(f"Invalid reply n: {n}")
        result = judge.request(instructions(d), {"dialog": evidence(dialog), "dimension": d, "n": n})
        counts[d]["total"] += 1
        counts[d]["agree"] += result["verdict"] == label["verdict"]
    for row in counts.values():
        row["admitted"] = row["total"] >= 10 and row["agree"] / row["total"] >= .8
    return counts
