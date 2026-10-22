"""
Отчёт реализма.
Пороги — допущение, кроме ссылок на MAD Бенфорда (пороги Нигрини).
"""

import csv
import json
import math
import datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

CLEAN_DIR = ROOT / "data" / "hidden" / "clean"
OLD_DIR = ROOT / "data" / "synthetic"
MANIFEST = ROOT / "data" / "hidden" / "manifest.json"

BENFORD = {d: math.log10(1 + 1 / d) for d in range(1, 10)}


def first_digit(x):
    s = f"{abs(x):.10f}".lstrip("0").lstrip(".")
    for ch in s:
        if ch.isdigit() and ch != "0":
            return int(ch)
    return 1


def benford_mad(values):
    if not values:
        return None
    counts = {d: 0 for d in range(1, 10)}
    for v in values:
        if abs(v) >= 1:
            counts[first_digit(v)] += 1
    total = sum(counts.values())
    if total == 0:
        return None
    mad = 0.0
    for d in range(1, 10):
        obs = counts[d] / total
        mad += abs(obs - BENFORD[d])
    return mad


def read_rows(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def cv(values):
    if len(values) < 2:
        return None
    mean = sum(values) / len(values)
    if mean == 0:
        return None
    var = sum((x - mean) ** 2 for x in values) / len(values)
    return math.sqrt(var) / abs(mean)


def report_file(path):
    rows = read_rows(path)
    supplier_amounts = []
    weekday = [0] * 7
    round_by_label = {}
    payer_dates = {}

    for r in rows:
        d = dt.date.fromisoformat(r["date"])
        weekday[d.weekday()] += 1
        amount = float(r["amount"])
        label = r["label"]

        round_by_label.setdefault(label, [0, 0])
        round_by_label[label][0] += 1
        if abs(amount) >= 1000 and abs(amount) % 1000 < 0.01:
            round_by_label[label][1] += 1

        if label == "operating" and amount < 0 and not r["purpose"].startswith("Комиссия"):
            supplier_amounts.append(abs(amount))

        if label == "inflow" and "эквайринг" not in r["counterparty"].lower():
            payer_dates.setdefault(r["counterparty"], []).append(d)

    intervals = []
    for cp, dates in payer_dates.items():
        dates.sort()
        for i in range(1, len(dates)):
            intervals.append((dates[i] - dates[i - 1]).days)

    return {
        "file": path.name,
        "ops": len(rows),
        "benford_mad_suppliers": benford_mad(supplier_amounts),
        "weekday_shares": [x / max(1, len(rows)) for x in weekday],
        "round_shares": {k: (v[1] / v[0] if v[0] else None) for k, v in round_by_label.items()},
        "cv_payer_intervals": cv(intervals),
    }


def old_synthetic_report():
    out = []
    for p in sorted(OLD_DIR.glob("*.csv")):
        rows = read_rows(p)
        vals = [abs(float(r["amount"])) for r in rows if r.get("label") == "operating" and float(r["amount"]) < 0]
        weekend = sum(1 for r in rows if dt.date.fromisoformat(r["date"]).weekday() >= 5)
        out.append({
            "file": p.name,
            "ops": len(rows),
            "benford_mad_suppliers": benford_mad(vals),
            "weekend_share": weekend / max(1, len(rows)),
        })
    return out


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {"scenarios": {}}

    print("=== Реалистичные чистые файлы ===")
    for p in sorted(CLEAN_DIR.glob("*.csv")):
        rep = report_file(p)
        mad = rep["benford_mad_suppliers"]
        if mad is None:
            verdict = "нет данных"
        elif mad < 0.006:
            verdict = "close (Nigrini)"
        elif mad < 0.012:
            verdict = "acceptable (Nigrini)"
        elif mad < 0.015:
            verdict = "marginally acceptable (Nigrini)"
        else:
            verdict = "suspicious (Nigrini)"

        print(
            f'{rep["file"]:32} ops={rep["ops"]:5} '
            f'MAD={mad if mad is None else round(mad,4):>8} {verdict:28} '
            f'CVint={rep["cv_payer_intervals"] if rep["cv_payer_intervals"] is None else round(rep["cv_payer_intervals"],2)}'
        )

    print("\n=== Старая синтетика ===")
    for rep in old_synthetic_report():
        print(
            f'{rep["file"]:32} ops={rep["ops"]:5} MAD={rep["benford_mad_suppliers"]} '
            f'weekend_share={round(rep["weekend_share"],3)}'
        )

    print("\nПороги: MAD < 0.006 close, 0.006-0.012 acceptable, 0.012-0.015 marginal, >0.015 suspicious. Источник порогов: Nigrini, Benford's Law, 2012.")


if __name__ == "__main__":
    main()