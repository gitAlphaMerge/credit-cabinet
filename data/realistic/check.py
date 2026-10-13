"""
Экзамен ядра на грязных файлах.

--reference: проверка эталоном. Эталон не парсит грязь, поэтому для --reference
используются чистые размеченные строки из data/hidden/clean. Это осознанное
ограничение: эталон проверяет математику, а парсинг грязи проверяется реальным
ядром через score().

Без --reference: вызывает services/ml-model/core.py:score(statement_csv, need, questionnaire).
"""

import argparse
import json
import sys
import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

sys.path.insert(0, str(ROOT / "data" / "synthetic"))
sys.path.insert(0, str(HERE))

from reference import reference


def read_clean(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append({
                "date": r["date"],
                "amount": float(r["amount"]),
                "counterparty": r["counterparty"],
                "purpose": r["purpose"],
                "label": r["label"],
            })
    return rows


def in_band(value, band):
    if "min" in band:
        return band["min"] <= value <= band["max"]
    return value <= band.get("max", 0)


def compare(res, exp):
    diffs = []
    if res.get("status") != exp["status"]:
        diffs.append(f'status {res.get("status")} != {exp["status"]}')
    if res.get("instrument") != exp["instrument"]:
        diffs.append(f'instrument {res.get("instrument")} != {exp["instrument"]}')

    got_stops = res.get("stops_fired", [])
    if got_stops[:1] != exp["stops_fired"][:1]:
        diffs.append("first stop mismatch")
    if set(got_stops) != set(exp["stops_fired"]):
        diffs.append("stop set mismatch")

    for r in exp["reasons"]:
        if r not in res.get("reasons", []):
            diffs.append(f"missing reason {r}")
    for m in exp["missing"]:
        if m not in res.get("missing", []):
            diffs.append(f"missing missing {m}")

    if not in_band(res.get("flow_month_rub", 0), exp["flow_month_rub"]):
        diffs.append("flow out of corridor")
    if not in_band(res.get("limit_now_rub", 0), exp["limit_rub"]["now"]):
        diffs.append("limit_now out of corridor")
    if not in_band(res.get("limit_after_rub", 0), exp["limit_rub"]["after_actions"]):
        diffs.append("limit_after out of corridor")

    return diffs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", action="store_true")
    ap.add_argument("--hidden", action="store_true")
    args = ap.parse_args()

    if args.hidden:
        golden_path = ROOT / "data" / "hidden" / "hidden_golden.json"
    else:
        golden_path = ROOT / "data" / "dirty" / "golden_dirty.json"

    golden = json.loads(golden_path.read_text(encoding="utf-8"))

    if args.reference:
        ok = 0
        total = len(golden["scenarios"])
        for scen in golden["scenarios"]:
            rows = read_clean(ROOT / scen["clean_file"])
            res = reference(rows, scen["need"], scen["questionnaire"])
            diffs = compare(res, scen["expected"])
            if not diffs:
                ok += 1
                print(f'{scen["id"]}: совпало')
            else:
                print(f'{scen["id"]}: не совпало; ' + "; ".join(diffs))
        print(f"reference: {ok} из {total}")
        return

    # Реальный экзамен: ядро должно само парсить грязь.
    core_path = ROOT / "services" / "ml-model" / "core.py"
    if not core_path.exists():
        print(f"нет файла ядра: {core_path}")
        sys.exit(1)

    import importlib.util
    spec = importlib.util.spec_from_file_location("core", core_path)
    core = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(core)

    if not hasattr(core, "score"):
        print("в core.py нет функции score(statement_csv, need, questionnaire)")
        sys.exit(1)

    ok = 0
    total = len(golden["scenarios"])
    for scen in golden["scenarios"]:
        dirty_path = ROOT / scen["file"]
        try:
            res = core.score(str(dirty_path), scen["need"], scen["questionnaire"])
        except Exception as e:
            print(f'{scen["id"]}: не совпало; core exception {e}')
            continue
        diffs = compare(res, scen["expected"])
        if not diffs:
            ok += 1
            print(f'{scen["id"]}: совпало')
        else:
            print(f'{scen["id"]}: не совпало; ' + "; ".join(diffs))

    print(f"core: {ok} из {total}")


if __name__ == "__main__":
    main()