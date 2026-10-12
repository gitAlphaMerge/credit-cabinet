"""Остальные сценарии экзамена ядра и сборка data/golden.json.

Запуск из корня репо:  python data/synthetic/gen_statement.py && python data/synthetic/gen_scenarios.py
gen_statement.py пишет cash_gap.csv (его цифры совпадают с мокапом), этот файл пишет ещё 6 выписок
и считает ожидания всех 8 сценариев эталоном reference.py. Детерминирован (SEED).

Каждый сценарий бьёт в свою ветку stop-rules.md: все 4 статуса и все стопы, кроме NOT_BUSINESS
(его ловит анкета, выписка не нужна) и OVERDUE_DEBT.
"""
import calendar
import csv
import datetime as dt
import json
import random
from pathlib import Path

from reference import PARAMS, reference

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent.parent
MONTH_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август",
            "сентябрь", "октябрь", "ноябрь", "декабрь"]

# формулировки нарочно разные: ядро не должно ловить одну строку
WAGES = ["Перечисление заработной платы за {m} по реестру №{n}", "Зарплата сотрудникам за {m}, реестр {n}",
         "Оплата труда за {m}. НДС не облагается", "Аванс по заработной плате за {m}", "Выплата ЗП за {m} (реестр {n})"]
TAXES = ["Единый налоговый платёж", "ЕНП за {m}", "Уплата налогов и взносов (ЕНП)", "Пополнение ЕНС, налоги за {m}"]
RENT = ["Арендная плата за {m} по договору №{n}", "Аренда помещения за {m}. Без НДС", "Оплата аренды по счёту {n}"]
LOAN = ["Погашение кредита по договору №КД-{n} (основной долг и проценты)", "Ежемесячный платёж по кредиту №КД-{n}"]
IP_FIXED = "Страховые взносы ИП в фиксированном размере за {m}"


class Builder:
    def __init__(self, seed, start, months):
        self.rnd = random.Random(seed)
        self.start, self.months, self.ops, self.tunable = start, months, [], []

    def ym(self, i):
        y = self.start.year + (self.start.month - 1 + i) // 12
        return y, (self.start.month - 1 + i) % 12 + 1

    def day(self, i, d):
        y, m = self.ym(i)
        return dt.date(y, m, min(d, calendar.monthrange(y, m)[1]))

    def mname(self, i):
        return MONTH_RU[self.ym(i)[1] - 1]

    def add(self, i, d, amount, cp, purpose, label, tunable=False):
        if tunable:
            self.tunable.append(len(self.ops))
        self.ops.append({"date": self.day(i, d), "amount": round(amount, 2), "counterparty": cp,
                         "purpose": purpose, "label": label})

    def split(self, total, k):
        w = [self.rnd.uniform(0.6, 1.4) for _ in range(k)]
        return [total * x / sum(w) for x in w]

    def payers(self, i, revenue, payers):
        """payers: (имя, доля, назначение, платежей в месяц)."""
        for cp, share, purpose, k in payers:
            for part in self.split(revenue * share, k):
                self.add(i, self.rnd.randint(1, 28), part, cp,
                         purpose.format(n=self.rnd.randint(100, 9999), m=self.mname(i)), "inflow")

    def mandatory(self, i, wages=0, taxes=0, rent=0, loan=0, ip=False):
        r = self.rnd
        if wages:
            for d, part in zip((10, 25), self.split(wages, 2)):
                self.add(i, d, -part, "Зарплатный проект, реестр", r.choice(WAGES).format(m=self.mname(i), n=r.randint(1, 99)), "mandatory")
        if taxes:
            self.add(i, 28, -taxes * r.uniform(0.92, 1.08), "УФК (ФНС России)", r.choice(TAXES).format(m=self.mname(i)), "mandatory")
        if rent:
            self.add(i, 5, -rent, "ООО «АрендаПлюс»", r.choice(RENT).format(m=self.mname(i), n=r.randint(10, 99)), "mandatory")
        if loan:
            self.add(i, 15, -loan, "Банк", r.choice(LOAN).format(n=4410), "mandatory")
        if ip:
            self.add(i, 27, -4_400, "УФК (ФНС России)", IP_FIXED.format(m=self.mname(i)), "mandatory")

    def operating(self, i, total, suppliers, k):
        for part in self.split(total, k):
            cp, what = self.rnd.choice(suppliers)
            self.add(i, self.rnd.randint(1, 28), -part, cp,
                     f"Оплата по счёту №{self.rnd.randint(1000, 9999)} за {what}", "operating", tunable=True)
        self.add(i, 1, -1_490, "Банк", "Комиссия за ведение счёта по тарифу", "operating")

    def pad(self, n_ops):
        while len(self.ops) < n_ops:
            i = self.rnd.randrange(self.months)
            self.add(i, self.rnd.randint(1, 28), -self.rnd.choice([19, 29, 49, 99]), "Банк",
                     "Комиссия за исходящий платёж", "operating")

    def calibrate(self, target_flow):
        """Двигает только счета поставщиков, чтобы средний поток стал ровно target_flow."""
        flow = lambda: sum(o["amount"] for o in self.ops if o["label"] in ("inflow", "mandatory", "operating", "cash", "enforcement"))
        diff = flow() - target_flow * self.months
        base = sum(self.ops[k]["amount"] for k in self.tunable)
        f = 1 + diff / abs(base)
        assert f > 0, "поставщиков не хватает, чтобы выйти на поток"
        for k in self.tunable:
            self.ops[k]["amount"] = round(self.ops[k]["amount"] * f, 2)
        self.ops[self.tunable[0]]["amount"] = round(self.ops[self.tunable[0]]["amount"] - (flow() - target_flow * self.months), 2)

    def write(self, name):
        self.ops.sort(key=lambda o: (o["date"], -o["amount"]))
        with open(OUT / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["date", "amount", "counterparty", "purpose", "label"])
            for o in self.ops:
                w.writerow([o["date"].isoformat(), f'{o["amount"]:.2f}', o["counterparty"], o["purpose"], o["label"]])


Y = dt.date(2025, 10, 1)


def equipment_leasing():
    b = Builder(201, Y, 12)
    sup = [("ООО «ЛесТорг»", "плиту ЛДСП и МДФ"), ("ООО «Фурнитура-Опт»", "фурнитуру"), ("ООО «КромкаСнаб»", "кромку и клей")]
    payers = [("ООО «Кухни Регион»", 0.34, "Оплата по договору поставки №{n}, мебель на заказ", 2),
              ("ИП Белова Ирина Сергеевна", 0.22, "Оплата по счёту №{n} за корпусную мебель", 2),
              ("ООО «ОфисСтиль»", 0.26, "Оплата по спецификации №{n} к договору поставки", 1),
              ("Физические лица через СБП", 0.18, "Перевод по СБП, оплата заказа №{n}", 9)]
    for i in range(12):
        R = 1_400_000 * b.rnd.uniform(0.85, 1.15)
        b.payers(i, R, payers)
        b.mandatory(i, wages=380_000, taxes=128_000, rent=90_000)
        b.operating(i, R * 0.45, sup, 8)
    b.pad(980)
    b.calibrate(180_000)
    return b, {
        "story": "ООО, мебельный цех, 3+ лет. Хочет кредит 4,2 млн на новый форматно-раскроечный станок. Агент должен сказать: не кредит, а лизинг.",
        "questionnaire": {"form": "ООО", "need": "оборудование", "sector": "производство", "years": "больше 3", "trend": "в плюс"},
        "need": {"purpose": "оборудование", "amount_rub": 4_200_000, "term_months": 36, "repay_from": "текущая выручка", "asked_for": "кредит"},
        "tests": "лучше другой инструмент; клиент просит кредит, ядро не должно молча считать кредит на станок",
    }


def seasonal_ok():
    b = Builder(202, Y, 12)
    sup = [("ООО «Питомник Подмосковья»", "саженцы и рассаду"), ("ООО «АгроГрунт»", "грунт и удобрения"), ("ООО «СадИнвентарь»", "садовый инвентарь")]
    shape = [0.5, 0.35, 0.3, 0.25, 0.28, 0.4, 1.3, 1.7, 1.4, 0.9, 0.7, 0.6]  # окт..сен: пик весной
    for i in range(12):
        R = 700_000 * shape[i]
        b.payers(i, R, [("ПАО Банк (эквайринг)", 0.85, "Зачисление средств по операциям эквайринга, торговая выручка", 22),
                        ("ООО «Ландшафт-Про»", 0.15, "Оплата по счёту №{n} за посадочный материал", 1)])
        b.mandatory(i, wages=140_000, taxes=42_000, rent=70_000, ip=True)
        b.operating(i, 700_000 * shape[(i + 2) % 12] * 0.45, sup, 5)  # закупка за два месяца до продаж
        b.add(i, 20, -60_000, "Морозова Анна Павловна", "Перевод на личную карту, собственные средства ИП", "owner")
    b.pad(820)
    b.calibrate(95_000)
    return b, {
        "story": "ИП, садовый центр, 4 года. Весной выручка втрое выше зимней, закупка за два месяца до сезона. Нужно 400 тыс на полгода под весеннюю закупку.",
        "questionnaire": {"form": "ИП", "need": "сезон", "sector": "торговля", "years": "больше 3", "trend": "в плюс"},
        "need": {"purpose": "сезон", "amount_rub": 400_000, "term_months": 6, "repay_from": "весенняя выручка", "asked_for": "кредит"},
        "tests": "можно подавать; эквайринг не считать одним заказчиком; переводы на личную карту ИП не расход бизнеса",
    }


def enforcement():
    b = Builder(203, Y, 12)
    sup = [("ООО «ХимЧистСнаб»", "моющие средства"), ("ООО «Инвентарь-Клин»", "расходные материалы")]
    payers = [("ООО «БЦ Северная башня»", 0.4, "Оплата по договору оказания услуг №{n} за уборку", 1),
              ("ООО «ТЦ Радуга»", 0.35, "Оплата за клининговые услуги по акту №{n}", 1),
              ("ТСЖ «Лесная 12»", 0.25, "Оплата по счёту №{n}, уборка подъездов", 1)]
    for i in range(12):
        R = 900_000 * b.rnd.uniform(0.9, 1.1)
        b.payers(i, R, payers)
        b.mandatory(i, wages=520_000, taxes=150_000, rent=35_000)
        b.operating(i, R * 0.12, sup, 4)
    b.add(7, 14, -184_350, "УФК (ФНС России)", "Инкассовое поручение №1182 ИФНС, взыскание задолженности по налогам и пени", "enforcement")
    b.add(9, 3, -96_400, "УФК (ФНС России)", "Списание по инкассовому поручению налогового органа №1427", "enforcement")
    b.add(10, 21, -57_000, "ГУФССП России", "Списание по исполнительному листу ФС №0381 в пользу ООО «ПромСервис»", "enforcement")
    b.pad(560)
    b.calibrate(40_000)
    return b, {
        "story": "ООО, клининг, 2 года. Выручка ровная, но налоговая дважды списала долг инкассо, а приставы списали по суду с бывшим поставщиком.",
        "questionnaire": {"form": "ООО", "need": "кассовый разрыв", "sector": "услуги", "years": "1–3", "trend": "около нуля"},
        "need": {"purpose": "кассовый разрыв", "amount_rub": 500_000, "term_months": 12, "repay_from": "текущая выручка", "asked_for": "кредит"},
        "tests": "нужен менеджер по стопу ENFORCEMENT, хотя поток положительный",
    }


def no_cashflow():
    b = Builder(204, Y, 12)
    sup = [("ООО «КофеРост»", "кофе в зёрнах"), ("ООО «МолПродукт»", "молочную продукцию"), ("ООО «Выпечка Сити»", "выпечку")]
    for i in range(12):
        R = 650_000 * b.rnd.uniform(0.85, 1.1)
        b.payers(i, R, [("ПАО Банк (эквайринг)", 0.93, "Зачисление средств по операциям эквайринга за {m}", 26),
                        ("ООО «Ивент-Агентство»", 0.07, "Оплата по счёту №{n} за кейтеринг", 1)])
        b.mandatory(i, wages=210_000, taxes=55_000, rent=160_000, ip=True)
        b.operating(i, R * 0.42, sup, 7)
    b.pad(1150)
    b.calibrate(-25_000)
    return b, {
        "story": "ИП, кофейня, 2 года. Выручка через эквайринг каждый день, но аренда, зарплата и закупка съедают больше, чем приходит.",
        "questionnaire": {"form": "ИП", "need": "кассовый разрыв", "sector": "общепит", "years": "1–3", "trend": "в минус"},
        "need": {"purpose": "кассовый разрыв", "amount_rub": 700_000, "term_months": 12, "repay_from": "текущая выручка", "asked_for": "кредит"},
        "tests": "нужен менеджер по стопу NO_FREE_CASHFLOW; агент говорит, что изменить, а не «отказ»",
    }


def short_history():
    b = Builder(205, dt.date(2026, 5, 1), 5)
    sup = [("ООО «Хостинг-Сервис»", "хостинг и домены"), ("ИП Ершов Павел Андреевич", "вёрстку по договору подряда")]
    payers = [("ООО «ТурАгентство Глобус»", 0.45, "Оплата по договору №{n} за разработку сайта, этап", 1),
              ("ООО «Автосервис 24»", 0.3, "Оплата по счёту №{n} за доработку сайта", 1),
              ("ИП Насибуллин Тимур Рустемович", 0.25, "Оплата по счёту №{n}, поддержка сайта", 1)]
    for i in range(5):
        R = 400_000 * b.rnd.uniform(0.8, 1.2)
        b.payers(i, R, payers)
        b.mandatory(i, wages=90_000, taxes=30_000, ip=True)
        b.operating(i, R * 0.2, sup, 3)
        b.add(i, 26, -45_000, "Лебедев Кирилл Олегович", "Перевод на личную карту ИП", "owner")
    b.pad(70)
    b.calibrate(150_000)
    return b, {
        "story": "ИП, веб-студия, открылся в мае 2026. Пять месяцев истории, клиенты платят хорошо. Хочет миллион на найм двух разработчиков.",
        "questionnaire": {"form": "ИП", "need": "рост", "sector": "IT", "years": "меньше года", "trend": "в плюс"},
        "need": {"purpose": "рост", "amount_rub": 1_000_000, "term_months": 12, "repay_from": "новые заказы", "asked_for": "кредит"},
        "tests": "нужен менеджер по TOO_YOUNG; срабатывает и SHORT_STATEMENT, статус решает первый стоп",
    }


def cash_out():
    b = Builder(206, Y, 12)
    sup = [("ООО «ЦементТорг»", "цемент и сухие смеси"), ("ООО «Кирпичный двор»", "кирпич"), ("ООО «МеталлПрофиль»", "металлопрокат")]
    payers = [("ООО «СМУ-7»", 0.3, "Оплата по счёту №{n} за стройматериалы", 3),
              ("ООО «ДорСтрой»", 0.25, "Оплата по договору поставки №{n}", 2),
              ("ПАО Банк (эквайринг)", 0.45, "Зачисление средств по операциям эквайринга", 20)]
    cash_purposes = ["Снятие наличных по чеку на хозяйственные нужды", "Выдача наличных под отчёт",
                     "Снятие наличных через банкомат по корпоративной карте"]
    for i in range(12):
        R = 2_200_000 * b.rnd.uniform(0.85, 1.15)
        b.payers(i, R, payers)
        b.mandatory(i, wages=120_000, taxes=60_000, rent=110_000, loan=72_000)
        for part in b.split(R * 0.38, 6):
            b.add(i, b.rnd.randint(1, 28), -part, "ООО «СтройБаза-Сервис»", b.rnd.choice(cash_purposes), "cash")
        b.operating(i, R * 0.4, sup, 8)
    b.pad(1050)
    b.calibrate(110_000)
    return b, {
        "story": "ООО, торговля стройматериалами, 3+ лет. Обороты большие, но почти 40% поступлений уходит наличными. Хочет 2 млн на закупку под контракт.",
        "questionnaire": {"form": "ООО", "need": "закупка под контракт", "sector": "торговля", "years": "больше 3", "trend": "в плюс"},
        "need": {"purpose": "закупка под контракт", "amount_rub": 2_000_000, "term_months": 12, "repay_from": "оплата по контракту", "asked_for": "кредит"},
        "tests": "нужен менеджер по CASH_OUT; текущий кредит (mandatory) уже уменьшает поток",
    }


CASH_GAP = {
    "story": "ООО, кровля и фасады, 3+ лет. Главный заказчик платит раз в два месяца через 60 дней после акта, зарплата и налоги каждый месяц. Нужно 1,5 млн на год, вернуть из оплаты по договору.",
    "questionnaire": {"form": "ООО", "need": "кассовый разрыв", "sector": "стройка", "years": "больше 3", "trend": "в плюс"},
    "need": {"purpose": "кассовый разрыв", "amount_rub": 1_500_000, "term_months": 12, "repay_from": "оплата по договору",
             "asked_for": "кредит", "contract_with_main_customer": {"sum_rub": 1_440_000, "months": 12}},
    "tests": "можно после шага; три ловушки (заём учредителя, перевод между счетами, дивиденды); цифры как в мокапе",
}
CASH_GAP_SMALL = dict(CASH_GAP, story="Тот же клиент, что cash_gap, но просит 900 тыс.",
                      need=dict(CASH_GAP["need"], amount_rub=900_000),
                      tests="можно подавать на той же выписке: статус зависит от суммы, а не только от выписки")


def read(name):
    with open(OUT / f"{name}.csv", encoding="utf-8") as f:
        return [dict(r, amount=float(r["amount"])) for r in csv.DictReader(f)]


def band(x, tol):
    return {"value": int(round(x, -3)), "min": int(round(x * (1 - tol), -3)), "max": int(round(x * (1 + tol), -3))}


def main():
    specs = [("cash_gap", "cash_gap", CASH_GAP), ("cash_gap_small", "cash_gap", CASH_GAP_SMALL)]
    for fn in (equipment_leasing, seasonal_ok, enforcement, no_cashflow, short_history, cash_out):
        b, spec = fn()
        b.write(fn.__name__)
        specs.append((fn.__name__, fn.__name__, spec))

    scenarios = []
    for sid, file, spec in specs:
        r = reference(read(file), spec["need"], spec["questionnaire"])
        scenarios.append({
            "id": sid, "file": f"data/synthetic/{file}.csv", "story": spec["story"], "tests": spec["tests"],
            "questionnaire": spec["questionnaire"], "need": spec["need"],
            "expected": {
                "status": r["status"], "instrument": r["instrument"], "stops_fired": r["stops_fired"],
                "reasons": r["reasons"], "missing": r["missing"],
                "flow_month_rub": band(r["flow_month_rub"], 0.03) if r["flow_month_rub"] > 0 else {"value": int(round(r["flow_month_rub"], -3)), "max": 0},
                "limit_rub": {"now": band(r["limit_now_rub"], 0.05), "after_actions": band(r["limit_after_rub"], 0.05)},
            },
            "evidence": r["evidence"],
        })
        print(f'{sid:18} {r["status"]:24} {r["instrument"]:18} flow={r["flow_month_rub"]:>10,.0f} '
              f'now={r["limit_now_rub"]:>11,.0f} after={r["limit_after_rub"]:>11,.0f} stops={r["stops_fired"]} reasons={r["reasons"]}')

    cg = next(s for s in scenarios if s["id"] == "cash_gap")["expected"]["limit_rub"]
    assert cg["now"]["value"] == 1_015_000 and cg["after_actions"]["value"] == 1_523_000, "cash_gap разошёлся с мокапом"

    golden = {
        "version": "2026-10-11",
        "how_to_use": "python data/check_golden.py: ядро получает CSV без label, анкету и нужду; статус, инструмент и стопы сверяются точно, суммы в коридоре min..max.",
        "params": PARAMS,
        "params_note": "rate 24% допущение до hw/tolya/instruments.md; формулы и правила: context/stop-rules.md, эталон: data/synthetic/reference.py",
        "scenarios": scenarios,
    }
    (ROOT / "data" / "golden.json").write_text(json.dumps(golden, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
