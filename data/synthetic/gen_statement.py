"""Синтетическая выписка МСБ, сценарий «кассовый разрыв»: ООО, кровля и фасады, УСН.

Запуск из корня репо:  python data/synthetic/gen_statement.py
Пишет data/synthetic/cash_gap.csv и data/golden.json. Детерминирована (SEED): перезапуск даёт тот же файл.

Колонки CSV: date, amount, counterparty, purpose, label.
amount: плюс = поступление, минус = списание, в рублях.
label: ответ для проверки ядра, в настоящей выписке такой колонки нет, ядро должно понять это по назначению.
Метки и правила: context/stop-rules.md.

Цифры подогнаны под мокап: свободный поток 120 000 ₽/мес, лимит сейчас ≈ 1 015 000 ₽, после договора ≈ 1 523 000 ₽.
"""
import calendar
import csv
import datetime as dt
import json
import random
from pathlib import Path

SEED = 1010
START = dt.date(2025, 10, 1)
MONTHS = 12
N_OPS = 1248
TARGET_FLOW = 120_000      # ₽/мес в среднем: поступления − обязательные − операционные
MIN_CUSHION = 35_000      # остаток в самый тонкий день: на грани, но не в минусе

# допущения ядра, совпадают с core.md; RATE заменить ставкой из hw/tolya/instruments.md
RATE = 0.24
TERM = 12
DSCR_MIN = 1.25
STRESS = 0.30              # выручка −30%, переменные (операционные) расходы −30% вместе с ней
CONTRACT_SUM = 1_440_000   # договор с заказчиком на следующие 12 месяцев (шаг X)
VARIABLE_SHARE = 0.5       # доля материалов и субподряда в выручке по договору
REQUESTED = 1_500_000

MAIN = "ООО «ГенПодряд-Центр»"
OUT = Path(__file__).resolve().parent
ROOT = OUT.parent.parent

rnd = random.Random(SEED)
ops = []


def month(i):
    y = START.year + (START.month - 1 + i) // 12
    m = (START.month - 1 + i) % 12 + 1
    return y, m


def day(i, d):
    y, m = month(i)
    return dt.date(y, m, min(d, calendar.monthrange(y, m)[1]))


def add(date, amount, cp, purpose, label):
    ops.append({"date": date, "amount": round(amount, 2), "counterparty": cp, "purpose": purpose, "label": label})


MONTH_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август",
            "сентябрь", "октябрь", "ноябрь", "декабрь"]

# --- поступления -------------------------------------------------------------
# главный заказчик платит раз в два месяца, через 60 дней после акта: отсюда разрыв
act_no = 40
for i in range(1, MONTHS, 2):
    act_no += 1
    act_date = day(i, 20) - dt.timedelta(days=60)
    add(day(i, rnd.randint(18, 26)), rnd.uniform(1_450_000, 1_750_000), MAIN,
        f"Оплата по договору подряда №17/25 за выполненные работы по акту КС-2 №{act_no} "
        f"от {act_date:%d.%m.%Y}. НДС не облагается", "inflow")

small = [("ИП Соколов Дмитрий Игоревич", "ремонт кровли частного дома"),
         ("ТСЖ «Северный квартал»", "текущий ремонт кровли, этап"),
         ("ООО «Дом и Сад»", "монтаж водосточной системы")]
for i in range(MONTHS):
    for cp, what in rnd.sample(small, rnd.randint(1, 3)):
        add(day(i, rnd.randint(3, 28)), rnd.uniform(70_000, 190_000), cp,
            f"Оплата по счёту №{rnd.randint(100, 999)} за {what}. Без НДС", "inflow")

# ловушки: деньги пришли, но это не выручка
add(day(4, 12), 300_000, "Петров Алексей Викторович",
    "Предоставление процентного займа учредителем по договору займа №1 от 10.02.2026", "financing")
add(day(8, 15), -300_000, "Петров Алексей Викторович",
    "Возврат займа учредителю по договору займа №1 от 10.02.2026", "financing")
add(day(6, 3), -200_000, "ООО «Кровля и Фасад» (счёт в другом банке)",
    "Перевод собственных средств между своими счетами", "transfer")
add(day(6, 9), 200_000, "ООО «Кровля и Фасад» (счёт в другом банке)",
    "Перевод собственных средств между своими счетами", "transfer")
add(day(2, 26), -150_000, "Петров Алексей Викторович",
    "Выплата дивидендов участнику за 9 месяцев 2025 г. за вычетом НДФЛ", "owner")

# --- обязательные списания -----------------------------------------------------
for i in range(MONTHS):
    y, m = month(i)
    prev = MONTH_RU[(m - 2) % 12]
    add(day(i, 10), -rnd.uniform(128_000, 138_000), "Зарплатный проект, реестр",
        f"Перечисление заработной платы (аванс) за {MONTH_RU[m - 1]} по реестру №{i * 2 + 1}", "mandatory")
    add(day(i, 25), -rnd.uniform(158_000, 170_000), "Зарплатный проект, реестр",
        f"Перечисление заработной платы за {prev} по реестру №{i * 2 + 2}", "mandatory")
    add(day(i, 28), -rnd.uniform(108_000, 118_000), "УФК по Тульской области (ФНС России)",
        "Единый налоговый платёж (НДФЛ, страховые взносы)", "mandatory")
    add(day(i, 5), -45_000, "ООО «СкладИнвест»",
        f"Арендная плата за склад по договору №А-12 за {MONTH_RU[m - 1]}. Без НДС", "mandatory")
    add(day(i, 15), -38_400, "АО «ЛизингТехПарк»",
        "Лизинговый платёж по договору лизинга №ЛД-2291 (экскаватор-погрузчик), в т.ч. НДС", "mandatory")
    if m in (1, 4, 7):  # авансы по УСН за квартал и налог за год
        add(day(i, 28), -rnd.uniform(40_000, 52_000), "УФК по Тульской области (ФНС России)",
            "Единый налоговый платёж (УСН)", "mandatory")

# --- операционные --------------------------------------------------------------
suppliers = [("ООО «ПрофКровля-Опт»", "кровельные материалы"), ("ООО «ТехноФасад»", "фасадные панели и крепёж"),
             ("ООО «Метизы-Регион»", "метизы и крепёж"), ("ООО «УтеплительСнаб»", "утеплитель")]
materials = []
for i in range(MONTHS):
    for _ in range(rnd.randint(6, 9)):
        cp, what = rnd.choice(suppliers)
        materials.append(len(ops))
        add(day(i, rnd.randint(1, 28)), -rnd.uniform(25_000, 110_000), cp,
            f"Оплата по счёту №{rnd.randint(1000, 9999)} за {what}. В т.ч. НДС 20%", "operating")
    if rnd.random() < 0.6:
        add(day(i, rnd.randint(5, 25)), -rnd.uniform(40_000, 90_000), "ИП Гарипов Ринат Альбертович",
            "Оплата за монтажные работы по договору субподряда №С-3. Без НДС", "operating")
    add(day(i, 20), -2_900, "ПАО «Мобильная связь»", "Оплата услуг связи по счёту", "operating")
    add(day(i, 1), -1_490, "Банк", "Комиссия за ведение счёта по тарифу", "operating")

# мелочь до N_OPS: топливные карты и комиссии за платежи
while len(ops) < N_OPS:
    i = rnd.randrange(MONTHS)
    if rnd.random() < 0.35:
        add(day(i, rnd.randint(1, 28)), -rnd.uniform(4_000, 12_000), "ООО «ТопливоКарт»",
            "Пополнение топливных карт по договору №ТК-88", "operating")
    else:
        add(day(i, rnd.randint(1, 28)), -rnd.choice([19, 29, 49, 99]), "Банк",
            "Комиссия за исходящий платёж", "operating")

# --- подгонка под поток 120 000 ₽/мес: двигаем только материалы ---------------
FLOW_LABELS = ("inflow", "mandatory", "operating")


def flow_total():
    return sum(o["amount"] for o in ops if o["label"] in FLOW_LABELS)


diff = flow_total() - TARGET_FLOW * MONTHS
mat_total = sum(ops[k]["amount"] for k in materials)
k = 1 + diff / abs(mat_total)
for idx in materials:
    ops[idx]["amount"] = round(ops[idx]["amount"] * k, 2)
ops[materials[0]]["amount"] = round(ops[materials[0]]["amount"] - (flow_total() - TARGET_FLOW * MONTHS), 2)

ops.sort(key=lambda o: (o["date"], -o["amount"]))
assert len(ops) == N_OPS, len(ops)

# --- CSV -----------------------------------------------------------------------
with open(OUT / "cash_gap.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["date", "amount", "counterparty", "purpose", "label"])
    for o in ops:
        w.writerow([o["date"].isoformat(), f'{o["amount"]:.2f}', o["counterparty"], o["purpose"], o["label"]])

# --- эталонный расчёт (то, что должно получиться у ядра) -------------------------
running, lowest = 0, 0
for o in ops:
    running += o["amount"]
    lowest = min(lowest, running)
START_BALANCE = int(round(-lowest + MIN_CUSHION, -3))   # остаток на 01.10.2025, его даёт шапка выписки

months = []
balance, min_bal, min_day = START_BALANCE, START_BALANCE, START
for i in range(MONTHS):
    y, m = month(i)
    mo = [o for o in ops if (o["date"].year, o["date"].month) == (y, m)]
    s = {lab: sum(o["amount"] for o in mo if o["label"] == lab) for lab in ("inflow", "mandatory", "operating")}
    months.append({"month": f"{y}-{m:02d}", "inflow": round(s["inflow"]), "mandatory": round(-s["mandatory"]),
                   "operating": round(-s["operating"]), "flow": round(s["inflow"] + s["mandatory"] + s["operating"])})
for o in ops:
    balance += o["amount"]
    if balance < min_bal:
        min_bal, min_day = balance, o["date"]

avg = lambda key: sum(mo[key] for mo in months) / MONTHS
flow = avg("flow")
i_m = RATE / 12
annuity = (1 - (1 + i_m) ** -TERM) / i_m
limit_now = flow / DSCR_MIN * annuity
flow_after = flow + CONTRACT_SUM / 12 * (1 - VARIABLE_SHARE)
limit_after = flow_after / DSCR_MIN * annuity
stress_flow = avg("inflow") * (1 - STRESS) - avg("mandatory") - avg("operating") * (1 - STRESS)
main_share = sum(o["amount"] for o in ops if o["counterparty"] == MAIN) / sum(mo["inflow"] for mo in months)
gap_months = [mo["month"] for mo in months if mo["flow"] < 0]


def band(x, tol=0.05):
    return {"value": int(round(x, -3)), "min": int(round(x * (1 - tol), -3)), "max": int(round(x * (1 + tol), -3))}


golden = {
    "version": "2026-10-10",
    "how_to_use": "Ядро получает CSV без колонки label и анкету с нуждой. Ответ ядра сверяется с expected: статус и инструмент точно, суммы внутри min..max.",
    "assumptions": {
        "rate": RATE, "rate_note": "допущение; заменить ставкой из hw/tolya/instruments.md (верх диапазона, «от X%» → X+3)",
        "term_months": TERM, "dscr_min": DSCR_MIN,
        "flow": "среднее за 12 месяцев: inflow − mandatory − operating; financing, transfer, owner не считаются",
        "limit": "аннуитет: платёж = поток / dscr_min, лимит = платёж × (1 − (1+r/12)^−n) / (r/12)",
        "stress": "выручка −30%, операционные −30% вместе с ней, обязательные не меняются; это код причины, а не стоп",
    },
    "scenarios": [{
        "id": "cash_gap",
        "file": "data/synthetic/cash_gap.csv",
        "story": "ООО, кровля и фасады, 3+ лет. Главный заказчик платит раз в два месяца через 60 дней после акта, зарплата и налоги каждый месяц. Нужно 1,5 млн на год, вернуть из оплаты по договору.",
        "questionnaire": {"form": "ООО", "need": "кассовый разрыв", "sector": "стройка", "years": "больше 3", "trend": "в плюс"},
        "need": {"purpose": "кассовый разрыв", "amount_rub": REQUESTED, "term_months": TERM, "repay_from": "оплата по договору"},
        "expected": {
            "stage": 1,
            "status": "можно после шага",
            "instrument": "овердрафт",
            "flow_month_rub": band(flow, 0.03),
            "limit_rub": {"now": band(limit_now), "after_actions": band(limit_after)},
            "after_actions": [{"action": "загрузить договор с главным заказчиком",
                               "effect": f"+{round(flow_after - flow):,} ₽/мес к подтверждённому потоку".replace(",", " "),
                               "missing_key": "contract_main_customer"}],
            "reasons": ["CONCENTRATION_ONE_CUSTOMER", "STRESS_NEGATIVE_FLOW"],
            "missing": ["contract_main_customer", "reconciliation_act"],
            "stops_fired": [],
        },
        "evidence": {
            "operations": N_OPS,
            "opening_balance_rub": START_BALANCE,
            "period": f"{months[0]['month']} .. {months[-1]['month']}",
            "avg_month_rub": {k: round(avg(k)) for k in ("inflow", "mandatory", "operating", "flow")},
            "main_customer_share": round(main_share, 3),
            "negative_flow_months": gap_months,
            "stress_flow_month_rub": round(stress_flow),
            "min_balance_rub": round(min_bal), "min_balance_date": min_day.isoformat(),
            "traps": ["заём учредителя +300 000 ₽ (financing) не выручка",
                      "перевод между своими счетами ±200 000 ₽ (transfer) не выручка и не расход",
                      "дивиденды −150 000 ₽ (owner) не обязательное списание"],
            "months": months,
        },
    }],
}
(ROOT / "data" / "golden.json").write_text(json.dumps(golden, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"ops={N_OPS} flow={flow:,.0f} now={limit_now:,.0f} after={limit_after:,.0f} "
      f"stress={stress_flow:,.0f} main={main_share:.0%} gap={gap_months} min_bal={min_bal:,.0f} {min_day} open={START_BALANCE:,.0f}")
