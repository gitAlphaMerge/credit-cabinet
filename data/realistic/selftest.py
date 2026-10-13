#!/usr/bin/env python3
"""
Инварианты реалистичной сборки.
Запуск после build.py: python data/realistic/selftest.py
"""

import hashlib
import json
import sys
import csv
import datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

sys.path.insert(0, str(ROOT / "data" / "synthetic"))
sys.path.insert(0, str(HERE))

import build
import model
from reference import reference


def sha_tree(paths):
    h = hashlib.sha256()
    for p in sorted(paths):
        rel = p.relative_to(ROOT).as_posix()
        h.update(rel.encode("utf-8"))
        h.update(p.read_bytes())
    return h.hexdigest()


def collect_files():
    files = []
    for d in (ROOT / "data" / "dirty", ROOT / "data" / "hidden"):
        if d.exists():
            files.extend([p for p in d.rglob("*") if p.is_file() and "__pycache__" not in str(p)])
    return files


def read_clean_csv(path):
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


def check_reference_for_golden(golden_path):
    golden = json.loads(golden_path.read_text(encoding="utf-8"))
    for scen in golden["scenarios"]:
        clean = ROOT / scen["clean_file"]
        rows = read_clean_csv(clean)
        got = reference(rows, scen["need"], scen["questionnaire"])
        exp = scen["expected"]

        assert got["status"] == exp["status"], f'{scen["id"]}: status'
        assert got["instrument"] == exp["instrument"], f'{scen["id"]}: instrument'
        assert got["stops_fired"][:1] == exp["stops_fired"][:1], f'{scen["id"]}: first stop'
        assert set(got["stops_fired"]) == set(exp["stops_fired"]), f'{scen["id"]}: stops set'

        for reason in exp["reasons"]:
            assert reason in got["reasons"], f'{scen["id"]}: reason {reason}'

        for miss in exp["missing"]:
            assert miss in got["missing"], f'{scen["id"]}: missing {miss}'

        fb = exp["flow_month_rub"]
        if "min" in fb:
            assert fb["min"] <= got["flow_month_rub"] <= fb["max"], f'{scen["id"]}: flow corridor'
        else:
            assert got["flow_month_rub"] <= fb.get("max", 0), f'{scen["id"]}: flow max'

        for key, band in exp["limit_rub"].items():
            val = got["limit_now_rub"] if key == "now" else got["limit_after_rub"]
            assert band["min"] <= val <= band["max"], f'{scen["id"]}: limit {key}'


def main():
    # 1. Детерминизм: две сборки подряд дают одинаковые байты.
    build.build_all(force=True)
    files = collect_files()
    h1 = sha_tree(files)

    build.build_all(force=True)
    files = collect_files()
    h2 = sha_tree(files)

    assert h1 == h2, "детерминизм сломан: повторный build изменил файлы"

    manifest = json.loads((ROOT / "data" / "hidden" / "manifest.json").read_text(encoding="utf-8"))

    # 2. В грязных файлах нет меток и слова label.
    dirty_dir = ROOT / "data" / "dirty"
    for p in dirty_dir.iterdir():
        if p.is_file() and p.suffix.lower() in {".csv", ".txt", ".1c"}:
            data = p.read_bytes().lower()
            assert b"label" not in data, f"dirty file {p.name} содержит label"

    # 3. Суммы, остатки, комиссии.
    for sid, m in manifest["scenarios"].items():
        assert abs(m["clean_total"] - m["dirty_total"]) < 0.005, f"{sid}: clean/dirty total"
        assert m["commission_count"] == m["outgoing_orders"], f"{sid}: commission count"
        if not m.get("overdraft", False):
            assert m["min_balance"] >= -0.005, f"{sid}: balance below zero"

    # 4. Платёжки только в рабочие дни.
    clean_dir = ROOT / "data" / "hidden" / "clean"
    for p in clean_dir.glob("*.csv"):
        with open(p, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                d = dt.date.fromisoformat(row["date"])
                assert model.is_workday(d), f"{p.name}: weekend/holiday payment {d}"

    # 5. Reference на чистых строках даёт целевые статусы.
    check_reference_for_golden(ROOT / "data" / "dirty" / "golden_dirty.json")
    check_reference_for_golden(ROOT / "data" / "hidden" / "hidden_golden.json")

    # 6. Сверка видимых статусов с оригинальным golden.json.
    old_golden_path = ROOT / "data" / "golden.json"
    if old_golden_path.exists():
        old = json.loads(old_golden_path.read_text(encoding="utf-8"))
        new = json.loads((ROOT / "data" / "dirty" / "golden_dirty.json").read_text(encoding="utf-8"))
        new_by_id = {s["id"]: s for s in new["scenarios"]}
        for s in old["scenarios"]:
            ns = new_by_id[s["id"]]
            assert ns["expected"]["status"] == s["expected"]["status"], f'{s["id"]}: visible status'
            assert ns["expected"]["instrument"] == s["expected"]["instrument"], f'{s["id"]}: visible instrument'
            assert ns["expected"]["stops_fired"][:1] == s["expected"]["stops_fired"][:1], f'{s["id"]}: visible first stop'
            assert set(ns["expected"]["stops_fired"]) == set(s["expected"]["stops_fired"]), f'{s["id"]}: visible stop set'
            for r in s["expected"]["reasons"]:
                assert r in ns["expected"]["reasons"], f'{s["id"]}: visible reason {r}'

    print("selftest OK")


if __name__ == "__main__":
    main()