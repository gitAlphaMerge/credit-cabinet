"""
Грязная упаковка выписок.
Суммы и даты операций не меняются; меняется только формат.
"""

from __future__ import annotations

import datetime as dt
import random

MONTH_RU = ["январь", "февраль", "март", "апрель", "май", "июнь",
            "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]


def _clean_text(s: str) -> str:
    return s.replace(";", ",").replace("\n", " ").replace("\r", " ").strip()


def _fmt_comma(x: float, thousand: str = " ") -> str:
    sign = "-" if x < 0 else ""
    s = f"{abs(x):,.2f}".replace(",", thousand)
    int_part, frac = s.rsplit(".", 1)
    return f"{sign}{int_part},{frac}"


def _date_dot(d: dt.date, short_year=False) -> str:
    if short_year:
        return d.strftime("%d.%m.%y")
    return d.strftime("%d.%m.%Y")


def _csv(*fields):
    """Правка Клода: поля через запятую экранируются как в настоящей выгрузке.
    Раньше «-19,00» без кавычек разваливалось на два поля, это брак, а не грязь."""
    import csv, io
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(fields)
    return buf.getvalue()


def format_semicolon(rows, meta, rnd: random.Random):
    lines = [
        "Выписка по расчётному счёту (выгрузка банка)",
        "Дата операции;Номер док;Контрагент;Назначение;Сумма",
    ]
    labels = ["service", "service"]
    for i, r in enumerate(rows, 1):
        lines.append(
            f'{_date_dot(r["date"])};{i:06d};{_clean_text(r["counterparty"])};'
            f'{_clean_text(r["purpose"])};{_fmt_comma(r["amount"], chr(160))}'
        )
        labels.append(r["label"])
    lines.append(f'Итого обороты; ; ; ;{_fmt_comma(meta["turnover"], chr(160))}')
    labels.append("service")
    return "\n".join(lines) + "\n", labels, "utf-8"


def format_debit_credit(rows, meta, rnd: random.Random):
    lines = ["Дата,Док,Контрагент,Назначение,Дебет,Кредит"]
    labels = ["service"]
    for i, r in enumerate(rows, 1):
        debit = _fmt_comma(-r["amount"]) if r["amount"] < 0 else ""
        credit = _fmt_comma(r["amount"]) if r["amount"] > 0 else ""
        lines.append(_csv(_date_dot(r["date"]), f"{i:06d}", _clean_text(r["counterparty"]),
                          _clean_text(r["purpose"]), debit, credit))
        labels.append(r["label"])
    lines.append(_csv("Остаток на конец периода", "", "", "", "", _fmt_comma(meta["closing"])))
    labels.append("service")
    return "\n".join(lines) + "\n", labels, "utf-8"


def format_cp1251(rows, meta, rnd: random.Random):
    lines = ["Дата проводки,ИНН контрагента,Контрагент,Назначение платежа,Сумма"]
    labels = ["service"]
    for r in rows:
        lines.append(_csv(_date_dot(r["date"]), r.get("inn", ""), _clean_text(r["counterparty"]),
                          _clean_text(r["purpose"]), _fmt_comma(r["amount"])))
        labels.append(r["label"])
    return "\n".join(lines) + "\n", labels, "cp1251"


def format_bank_header(rows, meta, rnd: random.Random):
    lines = [
        "БАНКОВСКАЯ ВЫПИСКА",
        f'Счёт: {meta["account"]}',
        f'Владелец: {meta["owner"]}',
        f'Период: {meta["period"]}',
        f'Остаток на начало: {_fmt_comma(meta["opening"])}',
        "Дата;Назначение;Приход;Расход",
    ]
    labels = ["service"] * len(lines)

    for r in rows:
        credit = _fmt_comma(r["amount"]) if r["amount"] > 0 else ""
        debit = _fmt_comma(-r["amount"]) if r["amount"] < 0 else ""
        lines.append(f'{_date_dot(r["date"])};{_clean_text(r["purpose"])};{credit};{debit}')
        labels.append(r["label"])

    lines.extend([
        f'Итого приход: {_fmt_comma(meta["credit_total"])}',
        f'Итого расход: {_fmt_comma(meta["debit_total"])}',
        f'Остаток на конец: {_fmt_comma(meta["closing"])}',
    ])
    labels.extend(["service", "service", "service"])
    return "\n".join(lines) + "\n", labels, "utf-8-sig"


def format_1c(rows, meta, rnd: random.Random):
    lines = ["1CClientBankExchange"]
    labels = ["service"]
    for i, r in enumerate(rows, 1):
        # Упрощённый однострочный обмен, чтобы сохранить построчную разметку.
        lines.append(
            "СекцияДокумент=Платежное поручение|"
            f'Номер={i:06d}|Дата={_date_dot(r["date"])}|Сумма={_fmt_comma(r["amount"])}|'
            f'Контрагент={_clean_text(r["counterparty"])}|Назначение={_clean_text(r["purpose"])}|КонецДокумента'
        )
        labels.append(r["label"])
    lines.append("КонецФайла")
    labels.append("service")
    return "\n".join(lines) + "\n", labels, "utf-8"


def format_dirty_typos(rows, meta, rnd: random.Random):
    lines = ["Дата операции,Контрагент,Назначение платежа,Сумма"]
    labels = ["service"]
    n = len(rows)
    dup_targets = set(rnd.sample(range(n), k=min(2, max(1, n // 200)) if n >= 10 else 0))

    for idx, r in enumerate(rows):
        cp = _clean_text(r["counterparty"])
        purpose = _clean_text(r["purpose"])

        if rnd.random() < 0.02:
            cp = ""
        if rnd.random() < 0.02:
            purpose = purpose[: max(10, len(purpose) - 12)]
        if rnd.random() < 0.05:
            purpose = purpose.upper()
        purpose = purpose.replace("ООО", "ООО").replace("ИП ", "ИП ").replace("в т.ч. НДС", "в тч НДС")

        lines.append(_csv(_date_dot(r["date"], short_year=rnd.random() < 0.2), cp, purpose, _fmt_comma(r["amount"])))
        labels.append(r["label"])

        if idx in dup_targets:
            lines.append(lines[-1])
            labels.append("duplicate")

    lines.append("Конец выгрузки")
    labels.append("service")
    return "\n".join(lines) + "\n", labels, "utf-8"


FORMATTERS = {
    "semicolon": format_semicolon,
    "debit_credit": format_debit_credit,
    "cp1251": format_cp1251,
    "bank_header": format_bank_header,
    "1c": format_1c,
    "dirty_typos": format_dirty_typos,
}


def write_dirty(rows, meta, fmt_name: str, rnd: random.Random):
    fn = FORMATTERS[fmt_name]
    text, labels, encoding = fn(rows, meta, rnd)
    data = text.encode(encoding)
    return data, labels