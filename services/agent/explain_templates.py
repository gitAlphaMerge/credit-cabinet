"""Объяснялка без LLM (baseline): ответ ядра (`view`) → текст по словам Тони (hw/tonya/mockups/03-result.html).

Это же текст-запаска: страж зарубил ответ LLM, клиент получает шаблон.
"""


def rub(x: float) -> str:
    return f"{round(x):,}".replace(",", " ") + " ₽"


def explain(view: dict, need: dict) -> str:
    n = view["numbers"]
    reason = view["reasons"][0]["text"].rstrip(".") if view["reasons"] else ""
    bank = "Решение принимает банк."
    status = view["status"]
    if status == "ready":
        return (f"Можно подавать. Сейчас можно взять до {rub(n['available_now'])}, платёж около "
                f"{rub(n['monthly_payment'])} в месяц. {bank} Собрать папку для банка?")
    if status == "ready_after_step":
        step = view["next_steps"][0] if view["next_steps"] else None
        step_text = f" {step['text']}: это подтвердит, {step['confirms']}." if step else ""
        return (f"Можно подавать после одного шага. Сейчас можно взять {rub(n['available_now'])}, "
                f"после шага {rub(n['available_after'])}.{step_text} {bank} "
                f"Загрузите документ или подать на {rub(n['available_now'])} сразу?")
    if status == "other_instrument":
        why = f" {reason}." if reason else ""
        return (f"Под эту задачу лучше подойдёт {view['instrument']}, а не кредит.{why} {bank} "
                f"Рассказать, как работает {view['instrument']}?")
    # причину стопа не называем (спека Саши, ситуация 13): менеджер объяснит сам и скажет, какие документы нужны
    return ("Ваш случай лучше обсудить с менеджером: он посмотрит выписку вместе с вами и скажет, какие документы "
            f"могут понадобиться. {bank} Позвать менеджера?")
