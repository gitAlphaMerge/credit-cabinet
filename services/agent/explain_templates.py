"""Объяснялка без LLM: ответ ядра (`view`) → короткий текст для клиента."""


def rub(x: float) -> str:
    return f"{round(x):,}".replace(",", " ") + " ₽"


def explain(view: dict, need: dict) -> str:
    n = view["numbers"]
    reason = view["reasons"][0]["text"].rstrip(".") if view["reasons"] else ""
    bank = "Решение принимает банк."
    status = view["status"]
    if status == "ready":
        return (f"Глянул: позиция крепкая, можно подавать. Платёж около {rub(n['monthly_payment'])} в месяц, до "
                f"{rub(n['available_now'])} можно брать уже сейчас. {bank} Подать заявку?")
    if status == "ready_after_step":
        step = view["next_steps"][0] if view["next_steps"] else None
        step_text = f" {step['text']}: это подтвердит, {step['confirms']}." if step else ""
        return (f"Сейчас можно взять {rub(n['available_now'])}, после шага до {rub(n['available_after'])}."
                f"{step_text} {bank} Загрузите документ и прикинем дальше?")
    if status == "other_instrument":
        why = f" {reason}." if reason else ""
        return (f"Глянул: под эту задачу лучше ляжет {view['instrument']}, он удобнее кредита.{why} {bank} "
                f"Рассказать, как он работает?")
    return (f"Ваш случай лучше обсудить с менеджером, он посмотрит выписку вместе с вами. {bank} "
            "Позвать менеджера?")
