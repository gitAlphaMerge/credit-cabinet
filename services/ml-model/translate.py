"""Переводчик: ответ ядра → то, что показывает сайт (поля из hw/sasha/prompt-frontend.md). Сайт сам ничего не считает."""

STATUS = {
    "можно подавать": "ready",
    "можно после шага": "ready_after_step",
    "лучше другой инструмент": "other_instrument",
    "нужен менеджер": "need_manager",
}

REASONS = {
    "CONCENTRATION_ONE_CUSTOMER": "Больше 70% выручки от одного заказчика",
    "STRESS_NEGATIVE_FLOW": "Если выручка упадёт на 30%, денег на платёж не хватит",
    "CASH_GAP": "Есть месяцы, когда расходы больше поступлений",
    "TOO_YOUNG": "Бизнесу меньше года или выписка короче 6 месяцев",
    "SHORT_STATEMENT": "Выписка короче 12 месяцев",
    "NO_FREE_CASHFLOW": "После обязательных платежей денег не остаётся",
    "ENFORCEMENT": "Есть списания по исполнительному листу",
    "CASH_OUT": "Больше 30% выручки снимается наличными",
    "NOT_BUSINESS": "Продукт для ИП и ООО",
}

STEPS = {
    "contract_main_customer": ("Загрузите договор с главным заказчиком", "что оплата по договору придёт"),
    "reconciliation_act": ("Загрузите акт сверки с главным заказчиком", "что заказчик платит вовремя"),
    "statement_12m": ("Загрузите выписку за 12 месяцев", "стабильность выручки за год"),
}


def to_view(core: dict, need: dict, rate: float, dscr_min: float) -> dict:
    flow = core["flow_month_rub"]
    now, after = core["limit_now_rub"], core["limit_after_rub"]
    i, n = rate / 12, need["term_months"]
    payment = need["amount_rub"] * i / (1 - (1 + i) ** -n)
    return {
        "status": STATUS.get(core["status"], "need_manager"),
        "status_text": core["status"],
        "instrument": core["instrument"],
        "numbers": {
            "available_now": round(now, -3),
            "available_after": round(after, -3),
            "limit_delta": round(after - now, -3),
            "monthly_payment": round(payment),
            "dscr": round(flow / payment, 2),
            "dscr_required": dscr_min,
            "rate_used": rate,
            "term_months": n,
        },
        "reasons": [{"code": c, "text": REASONS.get(c, c)} for c in core["stops_fired"] + core["reasons"]],
        "next_steps": [
            {"code": m, "text": STEPS.get(m, (m, ""))[0], "confirms": STEPS.get(m, ("", ""))[1]}
            for m in core["missing"]
        ],
        "monthly_flow": [{"month": m, "flow": v} for m, v in core["evidence"]["flow_by_month"].items()],
    }
