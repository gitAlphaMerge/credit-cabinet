"""Экзамен ядра: прогоняет все сценарии data/golden.json и показывает, что совпало.

    python data/check_golden.py              # проверяет ядро: services/ml-model/core.py, функция score
    python data/check_golden.py --reference  # проверяет сам экзамен эталоном (должно быть 8/8)
    python data/check_golden.py -k cash_gap  # только сценарии, в id которых есть подстрока

Что ждём от ядра:
    def score(statement_csv: str, need: dict, questionnaire: dict) -> dict
statement_csv: путь к CSV с колонками date, amount, counterparty, purpose (label ядру не даём).
need и questionnaire: как в golden.json. Ответ: dict с ключами
    status, instrument, stops_fired, reasons, missing, flow_month_rub, limit_now_rub, limit_after_rub
Статус, инструмент и первый стоп сверяются точно, суммы в коридоре min..max,
reasons и missing: ожидаемые должны быть в ответе, лишние только подсвечиваются.
"""
import argparse
import csv
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data" / "synthetic"))


def load_core():
    path = ROOT / "services" / "ml-model" / "core.py"
    if not path.exists():
        sys.exit(f"нет {path.relative_to(ROOT)}: заведи там score(statement_csv, need, questionnaire) -> dict (см. шапку этого файла)")
    spec = importlib.util.spec_from_file_location("core", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.score


def reference_score(statement_csv, need, questionnaire, _labeled=None):
    from reference import reference
    with open(_labeled, encoding="utf-8") as f:
        rows = [dict(r, amount=float(r["amount"])) for r in csv.DictReader(f)]
    result = reference(rows, need, questionnaire)
    # Only the legacy reference adapter translates vocabulary. The actual core
    # must return catalogue IDs and cannot pass by returning a legacy label.
    result["instrument"] = {
        "овердрафт": "ALFA_OVERDRAFT",
        "кредитная линия": "ALFA_RCL_UNSEC",
        "кредит на развитие": "ALFA_START",
        "лизинг": "ALFA_LUMP_SEC",
    }.get(result.get("instrument"), result.get("instrument"))
    return result


def without_label(src, tmp):
    dst = Path(tmp) / Path(src).name
    with open(src, encoding="utf-8") as fi, open(dst, "w", newline="", encoding="utf-8") as fo:
        r, w = csv.DictReader(fi), csv.writer(fo)
        w.writerow(["date", "amount", "counterparty", "purpose"])
        for row in r:
            w.writerow([row["date"], row["amount"], row["counterparty"], row["purpose"]])
    return str(dst)


def in_band(x, band):
    if x is None:
        return False
    return band.get("min", float("-inf")) <= x <= band.get("max", float("inf"))


def check(got, exp):
    fails, notes = [], []
    for key in ("status",):
        if got.get(key) != exp[key]:
            fails.append(f"{key}: ждали «{exp[key]}», ядро «{got.get(key)}»")
    if got.get("instrument") not in exp["instrument"]:
        fails.append(f"instrument: ждали одно из {exp['instrument']}, ядро «{got.get('instrument')}»; {exp['why_products']}")
    stops = got.get("stops_fired") or []
    if (stops[:1] != exp["stops_fired"][:1]) or set(stops) != set(exp["stops_fired"]):
        fails.append(f"stops_fired: ждали {exp['stops_fired']}, ядро {stops}")
    for key in ("reasons", "missing"):
        g, e = set(got.get(key) or []), set(exp[key])
        if e - g:
            fails.append(f"{key}: не хватает {sorted(e - g)}")
        if g - e:
            notes.append(f"{key}: лишние {sorted(g - e)}")
    if not in_band(got.get("flow_month_rub"), exp["flow_month_rub"]):
        fails.append(f"поток: ждали {exp['flow_month_rub']}, ядро {got.get('flow_month_rub')}")
    for key, band in (("limit_now_rub", exp["limit_rub"]["now"]), ("limit_after_rub", exp["limit_rub"]["after_actions"])):
        if not in_band(got.get(key), band):
            fails.append(f"{key}: ждали {band['min']:,}..{band['max']:,}, ядро {got.get(key)}".replace(",", " "))
    return fails, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", action="store_true")
    ap.add_argument("-k", default="")
    a = ap.parse_args()
    golden = json.loads((ROOT / "data" / "golden.json").read_text(encoding="utf-8"))
    score = None if a.reference else load_core()

    passed = total = 0
    with tempfile.TemporaryDirectory() as tmp:
        for s in golden["scenarios"]:
            if a.k not in s["id"]:
                continue
            total += 1
            src = ROOT / s["file"]
            csv_path = without_label(src, tmp)
            try:
                got = (reference_score(csv_path, s["need"], s["questionnaire"], src) if a.reference
                       else score(csv_path, s["need"], s["questionnaire"]))
                fails, notes = check(got, s["expected"])
            except Exception as e:  # ядро упало: это тоже провал сценария
                fails, notes = [f"ядро упало: {type(e).__name__}: {e}"], []
            ok = not fails
            passed += ok
            print(f"{'✅' if ok else '❌'} {s['id']:18} ждём: {s['expected']['status']} · {s['tests']}")
            for f in fails:
                print(f"     ✗ {f}")
            for n in notes:
                print(f"     · {n}")
    print(f"\n{passed}/{total} сценариев")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
