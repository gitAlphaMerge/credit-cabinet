"""
Спецификации 7 видимых и 12 скрытых сценариев.
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

VISIBLE_TARGETS = {
    "cash_gap": {
        "start": (2025, 10, 1), "months": 12, "industry": "стройка",
        "revenue_month_avg": 1_011_236, "target_flow": 120_000,
        "top_share": 0.788, "acquiring_share": 0.0, "marketplace_share": 0.0,
        "cash_share": 0.0, "mandatory_ratio": 0.499, "operating_ratio": 0.382,
        "main_pay_every": 2, "negative_months": [0, 2, 4, 6, 8, 10],
        "traps": ["founder_loan", "own_transfer", "dividend"],
        "supplier_ops_month": 42, "has_loan": True, "ip_fixed": False,
        "expected_status_hint": "можно после шага",
    },
    "cash_gap_small": {
        "base_id": "cash_gap",
        "start": (2025, 10, 1), "months": 12, "industry": "стройка",
        "revenue_month_avg": 1_011_236, "target_flow": 120_000,
        "top_share": 0.788, "acquiring_share": 0.0, "marketplace_share": 0.0,
        "cash_share": 0.0, "mandatory_ratio": 0.499, "operating_ratio": 0.382,
        "main_pay_every": 2, "negative_months": [0, 2, 4, 6, 8, 10],
        "traps": ["founder_loan", "own_transfer", "dividend"],
        "supplier_ops_month": 42, "has_loan": True, "ip_fixed": False,
        "expected_status_hint": "можно подавать",
    },
    "equipment_leasing": {
        "start": (2025, 10, 1), "months": 12, "industry": "производство",
        "revenue_month_avg": 1_360_363, "target_flow": 180_000,
        "top_share": 0.34, "acquiring_share": 0.0, "marketplace_share": 0.0,
        "cash_share": 0.0, "mandatory_ratio": 0.439, "operating_ratio": 0.429,
        "main_pay_every": 1, "negative_months": [],
        "traps": ["supplier_refund", "own_transfer"],
        "supplier_ops_month": 38, "has_loan": False, "ip_fixed": False,
        "expected_status_hint": "лучше другой инструмент",
    },
    "seasonal_ok": {
        "start": (2025, 10, 1), "months": 12, "industry": "розница",
        "revenue_month_avg": 506_333, "target_flow": 95_000,
        "top_share": 0.15, "acquiring_share": 0.85, "marketplace_share": 0.0,
        "cash_share": 0.0, "mandatory_ratio": 0.507, "operating_ratio": 0.306,
        "main_pay_every": 1, "negative_months": [1, 2, 3, 4, 5],
        "traps": ["ip_self_card", "supplier_refund"],
        "supplier_ops_month": 28, "has_loan": False, "ip_fixed": True,
        "expected_status_hint": "можно подавать",
    },
    "enforcement": {
        "start": (2025, 10, 1), "months": 12, "industry": "услуги",
        "revenue_month_avg": 899_102, "target_flow": 40_000,
        "top_share": 0.40, "acquiring_share": 0.0, "marketplace_share": 0.0,
        "cash_share": 0.0, "mandatory_ratio": 0.784, "operating_ratio": 0.14,
        "main_pay_every": 1, "negative_months": [7, 9],
        "traps": ["founder_loan", "own_transfer"],
        "supplier_ops_month": 16, "has_loan": False, "ip_fixed": False,
        "enforcement_total": 337_750,
        "expected_status_hint": "нужен менеджер",
        "first_stop_hint": "ENFORCEMENT",
    },
    "no_cashflow": {
        "start": (2025, 10, 1), "months": 12, "industry": "общепит",
        "revenue_month_avg": 617_324, "target_flow": -25_000,
        "top_share": 0.07, "acquiring_share": 0.93, "marketplace_share": 0.0,
        "cash_share": 0.0, "mandatory_ratio": 0.693, "operating_ratio": 0.347,
        "main_pay_every": 1, "negative_months": list(range(12)),
        "traps": ["ip_self_card", "buyer_refund"],
        "supplier_ops_month": 34, "has_loan": False, "ip_fixed": True,
        "expected_status_hint": "нужен менеджер",
        "first_stop_hint": "NO_FREE_CASHFLOW",
    },
    "short_history": {
        "start": (2026, 5, 1), "months": 5, "industry": "IT",
        "revenue_month_avg": 408_713, "target_flow": 150_000,
        "top_share": 0.45, "acquiring_share": 0.0, "marketplace_share": 0.0,
        "cash_share": 0.0, "mandatory_ratio": 0.306, "operating_ratio": 0.327,
        "main_pay_every": 1, "negative_months": [],
        "traps": ["ip_self_card", "founder_loan"],
        "supplier_ops_month": 10, "has_loan": False, "ip_fixed": True,
        "expected_status_hint": "нужен менеджер",
        "first_stop_hint": "TOO_YOUNG",
    },
    "cash_out": {
        "start": (2025, 10, 1), "months": 12, "industry": "розница",
        "revenue_month_avg": 2_216_832, "target_flow": 110_000,
        "top_share": 0.30, "acquiring_share": 0.45, "marketplace_share": 0.0,
        "cash_share": 0.38, "mandatory_ratio": 0.163, "operating_ratio": 0.407,
        "main_pay_every": 1, "negative_months": [],
        "traps": ["cash", "own_transfer"],
        "supplier_ops_month": 36, "has_loan": True, "ip_fixed": False,
        "expected_status_hint": "нужен менеджер",
        "first_stop_hint": "CASH_OUT",
    },
}


def visible_specs():
    path = ROOT / "data" / "golden.json"
    golden = json.loads(path.read_text(encoding="utf-8"))
    specs = []
    for i, s in enumerate(golden["scenarios"]):
        t = VISIBLE_TARGETS[s["id"]]
        spec = {
            "kind": "visible",
            "id": s["id"],
            "story": s["story"],
            "tests": s["tests"],
            "questionnaire": s["questionnaire"],
            "need": s["need"],
            "expected_visible": s["expected"],
            "clean_name": f'{s["id"]}.csv',
            "dirty_name": f"st_{i+1:02d}.csv",
        }
        spec.update(t)
        spec.setdefault("base_id", s["id"])
        specs.append(spec)
    return specs


def hidden_specs():
    """Правка Клода: описания скрытого экзамена вынесены в data/hidden/hidden_specs.py (вне git).
    Нет файла (у всех, кроме капитана) = скрытого набора нет, собираются только видимые 8."""
    path = ROOT / "data" / "hidden" / "hidden_specs.py"
    if not path.exists():
        return []
    ns = {}
    exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), ns)
    return ns["hidden_specs"]()


def all_specs():
    return visible_specs() + hidden_specs()