"""Защита цифр от слов клиента. Правило продукта: лимит двигают только данные, которые видно в выписке.

Договор с заказчиком поднимает «лимит после шага» не больше, чем самый крупный плательщик
реально приносил в месяц по этой же выписке. Договор на миллиард от нового «заказчика» лимит не надувает.
Временная мера в окошке; правило переедет в context/stop-rules.md и ядро Лизы.
"""
import csv
import io
from collections import defaultdict


def top_payer_month(statement_csv: str) -> tuple[str | None, float]:
    """Самый крупный плательщик и его средний приход в месяц за период выписки."""
    paid, months = defaultdict(float), set()
    for r in csv.DictReader(io.StringIO(statement_csv)):
        months.add(r["date"][:7])
        amount = float(r["amount"])
        if amount > 0:
            paid[r["counterparty"]] += amount
    if not paid:
        return None, 0.0
    payer = max(paid, key=paid.get)
    return payer, paid[payer] / len(months)


def cap_contract(statement_csv: str, contract: dict) -> tuple[dict, dict]:
    """Возвращает договор, урезанный до истории платежей, и пояснение для ответа."""
    payer, cap = top_payer_month(statement_csv)
    claimed = contract["sum_rub"] / contract["months"]
    capped = claimed > cap
    month = min(claimed, cap)
    note = {
        "claimed_month_rub": round(claimed),
        "cap_month_rub": round(cap),
        "cap_payer": payer,
        "capped": capped,
    }
    return {"sum_rub": month * contract["months"], "months": contract["months"]}, note
