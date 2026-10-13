"""
Сборка реалистичных выписок:
- чистые размеченные CSV в data/hidden/clean
- грязные файлы в data/dirty
- golden в data/dirty/golden_dirty.json и data/hidden/hidden_golden.json
- ответы data/hidden/answers/<id>.labels.csv
- manifest.json для selftest
"""

from __future__ import annotations

import sys
import json
import csv
import math
import datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

sys.path.insert(0, str(ROOT / "data" / "synthetic"))
sys.path.insert(0, str(HERE))

import model
import calibrate
import scenarios
import dirt
from reference import reference, PARAMS

CLEAN_DIR = ROOT / "data" / "hidden" / "clean"
DIRTY_DIR = ROOT / "data" / "dirty"
ANS_DIR = ROOT / "data" / "hidden" / "answers"
HIDDEN_DIR = ROOT / "data" / "hidden"

FORMAT_CYCLE = ["semicolon", "debit_credit", "cp1251", "bank_header", "1c", "dirty_typos"]


def band(x: float, tol: float):
    return {
        "value": int(round(x, -3)),
        "min": int(round(x * (1 - tol), -3)),
        "max": int(round(x * (1 + tol), -3)),
    }


def rows_for_reference(ops):
    return [
        {
            "date": o["date"].isoformat(),
            "amount": float(o["amount"]),
            "counterparty": o["counterparty"],
            "purpose": o["purpose"],
            "label": o["label"],
        }
        for o in ops
    ]


def _split_total(total: float, k: int, rnd):
    if k <= 0:
        return []
    weights = [rnd.uniform(0.6, 1.4) for _ in range(k)]
    sw = sum(weights)
    return [total * w / sw for w in weights]


# --- Генерация операций -----------------------------------------------------

def _month_list(spec):
    start = dt.date(*spec["start"])
    out = []
    for i in range(spec["months"]):
        y, m = model.month_shift(start, i)
        out.append((y, m))
    return out


def _random_day(y, m, rnd, day_min=1, day_max=28, prev=True):
    d = dt.date(y, m, min(rnd.randint(day_min, day_max), model.days_in_month(y, m)))
    return model.ensure_workday(d, prev=prev)


def _add_inflows(ops, spec, months, rnd):
    total = spec["revenue_month_avg"] * spec["months"]
    top = spec.get("top_share") or 0.0
    acq = spec.get("acquiring_share") or 0.0
    mp = spec.get("marketplace_share") or 0.0

    s = top + acq + mp
    if s > 1.0:
        top, acq, mp = top / s, acq / s, mp / s

    main_amount = top * total
    acq_amount = acq * total
    mp_amount = mp * total
    other_amount = max(0.0, total - main_amount - acq_amount - mp_amount)

    main_name = f'ООО «ГлавЗаказчик-{model.random_inn(rnd, 10)}»'

    # B2B main
    if main_amount > 0:
        every = spec.get("main_pay_every", 1) or 1
        if every == 2:
            idxs = list(range(1, spec["months"], 2)) or list(range(spec["months"]))
        else:
            idxs = list(range(spec["months"]))
        per = main_amount / len(idxs)
        lag = model.industry_param(spec["industry"], "lag_days", 30)
        for mi in idxs:
            y, m = months[mi]
            pay_date = _random_day(y, m, rnd, 18, 26)
            act_date = model.ensure_workday(pay_date - dt.timedelta(days=lag), prev=True)
            ops.append({
                "date": pay_date,
                "amount": per,
                "counterparty": main_name,
                "purpose": f'Оплата по договору №{rnd.randint(10,99)}/25 за работы по акту КС-2 №{rnd.randint(100,999)} от {act_date:%d.%m.%Y}. НДС не облагается',
                "label": "inflow",
                "inn": model.random_inn(rnd, 10),
                "lag_days": lag,
            })

    # other B2B
    if other_amount > 0:
        for mi, part in enumerate(_split_total(other_amount, spec["months"], rnd)):
            y, m = months[mi]
            n_pay = max(2, min(6, int(part / 80_000) + 2))
            for amount in _split_total(part, n_pay, rnd):
                ops.append({
                    "date": _random_day(y, m, rnd, 3, 28),
                    "amount": amount,
                    "counterparty": f'ООО «Контрагент-{model.random_inn(rnd, 10)}»',
                    "purpose": f'Оплата по счёту №{rnd.randint(100,9999)} за услуги/товары. Без НДС',
                    "label": "inflow",
                    "inn": model.random_inn(rnd, 10),
                })

    # acquiring
    if acq_amount > 0:
        acq_name = "ПАО Банк (эквайринг)"
        for mi, part in enumerate(_split_total(acq_amount, spec["months"], rnd)):
            y, m = months[mi]
            for amount in _split_total(part, 4, rnd):
                # эквайринг за выходные приходит в понедельник, поэтому next workday
                d = _random_day(y, m, rnd, 1, 28, prev=False)
                ops.append({
                    "date": d,
                    "amount": amount,
                    "counterparty": acq_name,
                    "purpose": "Зачисление средств по операциям эквайринга",
                    "label": "inflow",
                    "inn": model.random_inn(rnd, 10),
                })

    # marketplace
    if mp_amount > 0:
        mp_name = "ООО «Маркетплейс» (эквайринг-агрегатор)"
        for mi, part in enumerate(_split_total(mp_amount, spec["months"], rnd)):
            y, m = months[mi]
            for amount in _split_total(part, 4, rnd):
                ops.append({
                    "date": _random_day(y, m, rnd, 1, 28, prev=False),
                    "amount": amount,
                    "counterparty": mp_name,
                    "purpose": f'Выплата по договору оферты маркетплейса за {model.MONTH_RU[m-1]}',
                    "label": "inflow",
                    "inn": model.random_inn(rnd, 10),
                })


def _add_mandatory(ops, spec, months, rnd):
    total = spec["mandatory_ratio"] * spec["revenue_month_avg"] * spec["months"]
    if total <= 0:
        return

    form = spec["questionnaire"].get("form", "ООО")
    has_loan = spec.get("has_loan", False)

    monthly = _split_total(total, spec["months"], rnd)
    enp_name = "УФК по Тульской области (Межрегиональная инспекция ФНС России по управлению долговыми обязательствами)"

    for mi, month_total in enumerate(monthly):
        y, m = months[mi]

        # Зарплата: две части. Факт ТК РФ 136, дни допущение.
        wages = 0.55 * month_total
        for day, part in zip((10, 25), _split_total(wages, 2, rnd)):
            ops.append({
                "date": _random_day(y, m, rnd, day - 1, day + 1, prev=True),
                "amount": -part,
                "counterparty": "Зарплатный проект, реестр",
                "purpose": f'Перечисление заработной платы за {model.MONTH_RU[m-1]} по реестру №{rnd.randint(1,99)}',
                "label": "mandatory",
                "inn": model.random_inn(rnd, 10),
            })

        # Налоги/ЕНП
        taxes = 0.25 * month_total
        ops.append({
            "date": _random_day(y, m, rnd, 26, 28, prev=True),
            "amount": -taxes,
            "counterparty": enp_name,
            "purpose": rnd.choice([
                "Единый налоговый платёж",
                f'ЕНП за {model.MONTH_RU[m-1]}',
                "Пополнение ЕНС, налоги и взносы",
            ]),
            "label": "mandatory",
            "inn": "7727406020",
        })

        # Аренда
        rent = 0.12 * month_total
        ops.append({
            "date": _random_day(y, m, rnd, 3, 6, prev=True),
            "amount": -rent,
            "counterparty": "ООО «АрендаПлюс»",
            "purpose": f'Арендная плата за {model.MONTH_RU[m-1]} по договору №{rnd.randint(10,99)}',
            "label": "mandatory",
            "inn": model.random_inn(rnd, 10),
        })

        # Кредит/лизинг
        if has_loan:
            loan = 0.08 * month_total
            ops.append({
                "date": _random_day(y, m, rnd, 12, 18, prev=True),
                "amount": -loan,
                "counterparty": "Банк",
                "purpose": f'Погашение кредита по договору №КД-{rnd.randint(1000,9999)} (основной долг и проценты)',
                "label": "mandatory",
                "inn": model.random_inn(rnd, 10),
            })

        # Фиксированные взносы ИП
        if form == "ИП" and spec.get("ip_fixed"):
            ops.append({
                "date": _random_day(y, m, rnd, 25, 28, prev=True),
                "amount": -4_400.0,
                "counterparty": enp_name,
                "purpose": f'Страховые взносы ИП в фиксированном размере за {model.MONTH_RU[m-1]}',
                "label": "mandatory",
                "inn": "7727406020",
            })


def _add_suppliers(ops, spec, months, rnd, force_factor=1.0):
    total = spec["operating_ratio"] * spec["revenue_month_avg"] * spec["months"]
    if total <= 0:
        return []

    n_per_month = spec.get("supplier_ops_month", 12)
    mu = model.industry_param(spec["industry"], "supplier_mu", 10.3)
    sigma = model.industry_param(spec["industry"], "supplier_sigma", 0.6)

    suppliers = [
        (f'ООО «Поставщик-{i}-{model.random_inn(rnd, 10)}»', 1.0 / (i + 1))
        for i in range(8)
    ]
    sup_names = [s[0] for s in suppliers]
    sup_weights = [s[1] for s in suppliers]

    raw = []
    for mi in range(spec["months"]):
        for _ in range(n_per_month):
            raw.append((mi, model.lognormal_amount(rnd, mu, sigma, 300.0)))

    raw_sum = sum(x for _, x in raw)
    scale = total / raw_sum if raw_sum > 0 else 0.0

    tunable = []
    for mi, amount in raw:
        y, m = months[mi]
        cp = rnd.choices(sup_names, weights=sup_weights, k=1)[0]
        op = {
            "date": _random_day(y, m, rnd, 1, 28),
            "amount": -amount * scale,
            "counterparty": cp,
            "purpose": f'Оплата по счёту №{rnd.randint(1000,9999)} за материалы/услуги. В т.ч. НДС 20%',
            "label": "operating",
            "inn": model.random_inn(rnd, 10),
            "tunable": True,
        }
        ops.append(op)
        tunable.append(op)

    # Принудительные отрицательные месяцы: крупные некритичные платежи поставщикам.
    monthly_inflow = spec["revenue_month_avg"]
    for mi in spec.get("negative_months", []):
        if mi >= spec["months"]:
            continue
        y, m = months[mi]
        extra = monthly_inflow * 0.35 * force_factor
        cp = rnd.choices(sup_names, weights=sup_weights, k=1)[0]
        ops.append({
            "date": _random_day(y, m, rnd, 10, 26),
            "amount": -extra,
            "counterparty": cp,
            "purpose": f'Оплата по счёту №{rnd.randint(1000,9999)} за крупную партию/этап. В т.ч. НДС 20%',
            "label": "operating",
            "inn": model.random_inn(rnd, 10),
            "tunable": False,
        })

    return tunable


def _add_cash(ops, spec, months, rnd):
    share = spec.get("cash_share", 0.0)
    if share <= 0:
        return
    total = share * spec["revenue_month_avg"] * spec["months"]
    purposes = [
        "Снятие наличных по чеку на хозяйственные нужды",
        "Выдача наличных под отчёт",
        "Снятие наличных через банкомат по корпоративной карте",
    ]
    for mi, part in enumerate(_split_total(total, spec["months"], rnd)):
        y, m = months[mi]
        for amount in _split_total(part, rnd.randint(3, 6), rnd):
            ops.append({
                "date": _random_day(y, m, rnd, 1, 28),
                "amount": -amount,
                "counterparty": "Банк",
                "purpose": rnd.choice(purposes),
                "label": "cash",
                "inn": model.random_inn(rnd, 10),
            })


def _add_enforcement(ops, spec, months, rnd):
    total = spec.get("enforcement_total", 0.0)
    if total <= 0:
        return
    parts = _split_total(total, rnd.randint(2, 3), rnd)
    for i, amount in enumerate(parts):
        mi = rnd.randrange(spec["months"])
        y, m = months[mi]
        cp, purpose = rnd.choice([
            ("УФК (ФНС России)", "Инкассовое поручение №1182 ИФНС, взыскание задолженности по налогам и пени"),
            ("УФК (ФНС России)", "Списание по инкассовому поручению налогового органа №1427"),
            ("ГУФССП России", "Списание по исполнительному листу ФС №0381"),
            ("ГУФССП России", "Списание по ИД №12345/24/77"),
        ])
        ops.append({
            "date": _random_day(y, m, rnd, 5, 25),
            "amount": -amount,
            "counterparty": cp,
            "purpose": purpose,
            "label": "enforcement",
            "inn": model.random_inn(rnd, 10),
        })


def _add_traps(ops, spec, months, rnd):
    traps = spec.get("traps", [])
    own_inn = model.random_inn(rnd, 10 if spec["questionnaire"].get("form") == "ООО" else 12)
    month_avg = spec["revenue_month_avg"]

    def mi_rand():
        return rnd.randrange(spec["months"])

    if "founder_loan" in traps:
        mi = mi_rand()
        y, m = months[mi]
        amount = max(100_000, 0.25 * month_avg)
        ops.append({
            "date": _random_day(y, m, rnd, 5, 20),
            "amount": amount,
            "counterparty": "Петров Алексей Викторович",
            "purpose": "Предоставление займа учредителем по договору займа №1",
            "label": "financing",
            "inn": model.random_inn(rnd, 12),
        })
        if mi + 1 < spec["months"]:
            y2, m2 = months[mi + 1]
            ops.append({
                "date": _random_day(y2, m2, rnd, 5, 20),
                "amount": -amount,
                "counterparty": "Петров Алексей Викторович",
                "purpose": "Возврат займа учредителю по договору займа №1",
                "label": "financing",
                "inn": model.random_inn(rnd, 12),
            })

    if "credit_tranche" in traps:
        mi = mi_rand()
        y, m = months[mi]
        ops.append({
            "date": _random_day(y, m, rnd, 5, 25),
            "amount": max(200_000, 0.4 * month_avg),
            "counterparty": "Банк",
            "purpose": "Поступление кредитных средств по кредитному договору №777",
            "label": "financing",
            "inn": model.random_inn(rnd, 10),
        })

    if "own_transfer" in traps:
        mi = mi_rand()
        y, m = months[mi]
        amount = max(50_000, 0.15 * month_avg)
        other = f'ООО «Ромашка» (счёт в другом банке), ИНН {own_inn}'
        ops.append({
            "date": _random_day(y, m, rnd, 5, 25),
            "amount": -amount,
            "counterparty": other,
            "purpose": "Перевод собственных средств между своими счетами",
            "label": "transfer",
            "inn": own_inn,
        })
        ops.append({
            "date": _random_day(y, m, rnd, 5, 25),
            "amount": amount,
            "counterparty": other,
            "purpose": "Перевод собственных средств между своими счетами",
            "label": "transfer",
            "inn": own_inn,
        })

    if "dividend" in traps:
        mi = mi_rand()
        y, m = months[mi]
        ops.append({
            "date": _random_day(y, m, rnd, 20, 28),
            "amount": -max(50_000, 0.1 * month_avg),
            "counterparty": "Участник общества",
            "purpose": "Выплата дивидендов участнику за вычетом НДФЛ",
            "label": "owner",
            "inn": model.random_inn(rnd, 12),
        })

    if "ip_self_card" in traps:
        mi = mi_rand()
        y, m = months[mi]
        ops.append({
            "date": _random_day(y, m, rnd, 10, 28),
            "amount": -max(30_000, 0.08 * month_avg),
            "counterparty": "ИП собственник",
            "purpose": "Перевод на личную карту ИП, собственные средства",
            "label": "owner",
            "inn": model.random_inn(rnd, 12),
        })

    if "supplier_refund" in traps:
        mi = mi_rand()
        y, m = months[mi]
        ops.append({
            "date": _random_day(y, m, rnd, 5, 25),
            "amount": max(10_000, 0.02 * month_avg),
            "counterparty": "ООО «Поставщик-возврат»",
            "purpose": "Возврат переплаты от поставщика по счёту №777",
            "label": "operating",  # обоснование в таблице скрытого набора
            "inn": model.random_inn(rnd, 10),
        })

    if "buyer_refund" in traps:
        mi = mi_rand()
        y, m = months[mi]
        ops.append({
            "date": _random_day(y, m, rnd, 5, 25),
            "amount": -max(10_000, 0.02 * month_avg),
            "counterparty": "Покупатель",
            "purpose": "Возврат денежных средств покупателю по претензии",
            "label": "operating",  # обоснование в таблице скрытого набора
            "inn": model.random_inn(rnd, 10),
        })

    if "overdue_penalty" in traps:
        mi = mi_rand()
        y, m = months[mi]
        ops.append({
            "date": _random_day(y, m, rnd, 5, 25),
            "amount": -max(3_000, 0.005 * month_avg),
            "counterparty": "Банк",
            "purpose": "Пени и неустойка по кредитному договору №555",
            "label": "mandatory",
            "inn": model.random_inn(rnd, 10),
        })

    if "enforcement_vague" in traps and spec.get("enforcement_total", 0) == 0:
        spec["enforcement_total"] = max(50_000, 0.05 * month_avg)


def _add_commissions(ops, rnd):
    snapshot = [op for op in ops if op["amount"] < 0 and not op.get("commission")]
    for op in snapshot:
        ops.append({
            "date": op["date"],
            "amount": -float(rnd.choice([19, 29, 49, 99])),
            "counterparty": "Банк",
            "purpose": "Комиссия за исходящий платёж по тарифу",
            "label": "operating",
            "inn": model.random_inn(rnd, 10),
            "commission": True,
            "tunable": False,
        })
    return len(snapshot), len(snapshot)


def _balance_metrics(ops, cushion=35_000):
    ops.sort(key=lambda o: (o["date"], -o["amount"]))
    running = 0.0
    lowest = 0.0
    for op in ops:
        running += op["amount"]
        lowest = min(lowest, running)
    opening = int(math.ceil(-lowest + cushion))
    closing = opening + sum(op["amount"] for op in ops)
    return opening, closing, lowest


def generate_once(spec, attempt=0):
    base_id = spec.get("base_id", spec["id"])
    rnd = model.get_rng(base_id, attempt)

    ops = []
    months = _month_list(spec)

    _add_inflows(ops, spec, months, rnd)
    _add_mandatory(ops, spec, months, rnd)
    tunable = _add_suppliers(ops, spec, months, rnd, force_factor=1.0 + 0.25 * attempt)
    _add_cash(ops, spec, months, rnd)
    _add_enforcement(ops, spec, months, rnd)
    _add_traps(ops, spec, months, rnd)

    outgoing_orders, commission_count = _add_commissions(ops, rnd)

    target_total = spec["target_flow"] * spec["months"]
    calibrate.calibrate_tunable(ops, target_total, tunable)
    calibrate.round_amounts(
        ops,
        target_total=target_total,
        anchor_filter=lambda r: r.get("tunable", False) and r["label"] == "operating",
    )

    opening, closing, lowest = _balance_metrics(ops)

    metrics = {
        "outgoing_orders": outgoing_orders,
        "commission_count": commission_count,
        "opening": opening,
        "closing": closing,
        "min_balance": lowest + opening,
        "clean_total": round(sum(o["amount"] for o in ops), 2),
    }

    rows = rows_for_reference(ops)
    res = reference(rows, spec["need"], spec["questionnaire"])
    return ops, metrics, res


def acceptable(spec, res):
    if spec["kind"] == "visible":
        exp = spec.get("expected_visible", {})
        return (
            res["status"] == exp.get("status")
            and res["stops_fired"][:1] == exp.get("stops_fired", [])[:1]
            and set(res["stops_fired"]) == set(exp.get("stops_fired", []))
            and all(r in res["reasons"] for r in exp.get("reasons", []))
        )

    if spec.get("expected_status_hint") and res["status"] != spec["expected_status_hint"]:
        return False
    if spec.get("first_stop_hint"):
        if not res["stops_fired"] or res["stops_fired"][0] != spec["first_stop_hint"]:
            return False
    return True


def generate_statement(spec):
    last = None
    for attempt in range(18):
        try:
            ops, metrics, res = generate_once(spec, attempt)
        except calibrate.CalibrationError:
            continue
        last = (ops, metrics, res)
        if acceptable(spec, res):
            return ops, metrics, res
    # Fallback: если совсем не сошлось, возвращаем последний вариант,
    # чтобы selftest показал конкретное расхождение, а не молчаливый пропуск.
    if last is None:
        raise RuntimeError(f'не удалось сгенерировать {spec["id"]}')
    return last


# --- Запись -----------------------------------------------------------------

def inn_for(name):
    """Правка Клода: ИНН детерминирован от имени. Раньше он был случайным на каждой строке,
    и ловушка «перевод между своими счетами по совпадающему ИНН» не работала."""
    return model.random_inn(model.get_rng("inn", name), 12 if name.startswith("ИП ") or name.count(" ") == 2 and "«" not in name else 10)


def write_clean(path, ops):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "amount", "counterparty", "purpose", "label"])
        for o in ops:
            w.writerow([o["date"].isoformat(), f'{o["amount"]:.2f}', o["counterparty"], o["purpose"], o["label"]])


def make_meta(spec, ops, metrics):
    first = ops[0]["date"]
    last = ops[-1]["date"]
    credit_total = round(sum(o["amount"] for o in ops if o["amount"] > 0), 2)
    debit_total = round(sum(-o["amount"] for o in ops if o["amount"] < 0), 2)
    owner = spec["questionnaire"].get("form", "ООО")
    return {
        "account": "40702" + str(model.seed_from(spec["id"], "acc"))[-12:],
        "owner": f'{owner} «{spec["id"].upper()}»',
        "period": f'{first:%d.%m.%Y} - {last:%d.%m.%Y}',
        "opening": metrics["opening"],
        "closing": metrics["closing"],
        "credit_total": credit_total,
        "debit_total": debit_total,
        "turnover": round(credit_total + debit_total, 2),
    }


def expected_block(res):
    flow = res["flow_month_rub"]
    if flow > 0:
        flow_band = band(flow, 0.03)
    else:
        flow_band = {"value": int(round(flow, -3)), "max": 0}

    return {
        "status": res["status"],
        "instrument": res["instrument"],
        "stops_fired": res["stops_fired"],
        "reasons": res["reasons"],
        "missing": res["missing"],
        "flow_month_rub": flow_band,
        "limit_rub": {
            "now": band(res["limit_now_rub"], 0.05),
            "after_actions": band(res["limit_after_rub"], 0.05),
        },
    }


def scenario_public(spec, dirty_path, clean_path, ans_path, res):
    return {
        "id": spec["id"],
        "file": dirty_path.relative_to(ROOT).as_posix(),
        "clean_file": clean_path.relative_to(ROOT).as_posix(),
        "answers_file": ans_path.relative_to(ROOT).as_posix(),
        "story": spec["story"],
        "tests": spec["tests"],
        "questionnaire": spec["questionnaire"],
        "need": spec["need"],
        "expected": expected_block(res),
        "evidence": res["evidence"],
    }


def build_all(force=False):
    CLEAN_DIR.mkdir(parents=True, exist_ok=True)
    DIRTY_DIR.mkdir(parents=True, exist_ok=True)
    ANS_DIR.mkdir(parents=True, exist_ok=True)

    specs = scenarios.all_specs()
    manifest = {"scenarios": {}}
    all_scen = []
    hidden_scen = []

    for idx, spec in enumerate(specs):
        ops, metrics, res = generate_statement(spec)
        client_inn = inn_for(spec["id"])
        for o in ops:
            o["inn"] = client_inn if o["label"] == "transfer" else inn_for(o["counterparty"])

        hidden = spec["kind"] == "hidden"
        # правка Клода: скрытые выписки и все их ответы живут только в data/hidden (вне git),
        # видимые чистые строки и разметка лежат рядом с грязью: это учебные данные, не экзамен
        clean_dir = CLEAN_DIR if hidden else DIRTY_DIR / "clean"
        ans_dir = ANS_DIR if hidden else DIRTY_DIR / "answers"
        out_dir = HIDDEN_DIR / "dirty" if hidden else DIRTY_DIR
        for d in (clean_dir, ans_dir, out_dir):
            d.mkdir(parents=True, exist_ok=True)
        clean_path = clean_dir / spec["clean_name"]
        write_clean(clean_path, ops)

        fmt = FORMAT_CYCLE[idx % len(FORMAT_CYCLE)]
        meta = make_meta(spec, ops, metrics)
        rnd_dirty = model.get_rng(spec["id"], "dirty")
        dirty_bytes, line_labels = dirt.write_dirty(ops, meta, fmt, rnd_dirty)

        dirty_path = out_dir / spec["dirty_name"]
        dirty_path.write_bytes(dirty_bytes)

        ans_path = ans_dir / f'{spec["id"]}.labels.csv'
        with open(ans_path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["line", "label"])
            for i, lab in enumerate(line_labels, 1):
                w.writerow([i, lab])

        # dirty_total считаем без service/duplicate
        dirty_total = 0.0
        line_idx = 0
        for lab in line_labels:
            if lab in {"service", "duplicate"}:
                line_idx += 1
                continue
            # найти соответствующую операцию по порядку недубликатных транзакций
            # проще взять из clean: порядок транзакций в грязи совпадает с clean,
            # если не считать дубли. Для контроля используем manifest.
            pass

        # Надежнее: в manifest сохраняем суммы и список номеров.
        transaction_lines = []
        clean_iter = iter(ops)
        dirty_total = 0.0
        for i, lab in enumerate(line_labels, 1):
            if lab in {"service", "duplicate"}:
                continue
            op = next(clean_iter)
            transaction_lines.append({"line": i, "amount": round(op["amount"], 2), "label": lab})
            dirty_total += op["amount"]

        manifest["scenarios"][spec["id"]] = {
            "clean_file": clean_path.relative_to(ROOT).as_posix(),
            "dirty_file": dirty_path.relative_to(ROOT).as_posix(),
            "answers_file": ans_path.relative_to(ROOT).as_posix(),
            "format": fmt,
            "clean_total": metrics["clean_total"],
            "dirty_total": round(dirty_total, 2),
            "transaction_lines": transaction_lines,
            "opening_balance": metrics["opening"],
            "closing_balance": round(metrics["closing"], 2),
            "min_balance": round(metrics["min_balance"], 2),
            "outgoing_orders": metrics["outgoing_orders"],
            "commission_count": metrics["commission_count"],
            "overdraft": False,
        }

        public = scenario_public(spec, dirty_path, clean_path, ans_path, res)
        (hidden_scen if hidden else all_scen).append(public)

    golden_common = {
        "version": "2026-10-11-realistic",
        "how_to_use": "python data/realistic/check.py: ядро получает грязный файл, анкету и нужду; статус/инструмент/стопы сверяются точно, суммы в коридоре.",
        "params": PARAMS,
        "params_note": "rate 24% допущение; правила: context/stop-rules.md; эталон: data/synthetic/reference.py",
        "scenarios": all_scen,
    }

    (DIRTY_DIR / "golden_dirty.json").write_text(json.dumps(golden_common, ensure_ascii=False, indent=2), encoding="utf-8")
    (HIDDEN_DIR / "hidden_golden.json").write_text(
        json.dumps({**golden_common, "scenarios": hidden_scen}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (HIDDEN_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    build_all(force=True)