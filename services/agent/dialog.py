"""Разговор агента: один ход = ответ клиенту. Порядок вопросов выбирает код, не модель.

Слоты LLM подменяемые: `intake` (текст → поля) и `explain` (ответ ядра → текст). По умолчанию шаблоны,
с ними сравниваем LLM. Страж проверяет каждый текст объяснялки; провал → шаблон вместо него.
Решения: context/architecture.md (агент → ядро → агент), context/core.md (первые вопросы, без «одобрено»).
"""
import explain_templates
import guard
import intake_rules

QUESTIONS = {
    "purpose": ("На что планируете потратить деньги?", "Какую задачу бизнеса хотите решить?", "Для чего вам сейчас нужны средства?"),
    "amount": ("Какая сумма вам нужна?", "Сколько примерно планируете взять?", "На какую сумму рассчитываете?"),
    "repay": ("Из каких поступлений планируете вернуть деньги?", "Когда и за счёт чего сможете вернуть?", "Как планируете погашать кредит?"),
    "term": ("На какой срок вам нужны деньги?", "Когда планируете вернуть кредит?", "Какой срок вам подходит?"),
    "statement": ("Пришлите выписку по счёту — по ней оценим движение денег. Сможете загрузить её?", "Можете прикрепить выписку из интернет-банка?", "Загрузите выписку по счёту, пожалуйста. Получится?"),
}
RETRY_QUESTIONS = {
    "purpose": ("Это нужно закрыть кассовый разрыв, купить оборудование, сделать закупку под заказ или подготовиться к сезону?", "Расскажите, пожалуйста, что именно хотите оплатить: закупку, оборудование или текущие расходы?", "Какая задача сейчас важнее: закрыть кассовый разрыв, закупить товар или вложиться в развитие?"),
    "amount": ("О какой сумме примерно идёт речь?", "Сколько понадобится для этой задачи?", "Назовите ориентир по сумме, пожалуйста."),
    "repay": ("Что будет источником возврата: выручка или оплата заказчика?", "Из каких поступлений сможете погасить кредит?", "Когда ожидаете деньги, из которых вернёте кредит?"),
    "term": ("Какой срок вам удобен: несколько месяцев или год?", "Примерно когда сможете вернуть деньги?", "На сколько месяцев рассчитываете?"),
    "statement": ("Подойдёт файл выписки или CSV. Сможете его прикрепить?", "Получится загрузить выписку из интернет-банка?", "Пришлите выписку по счёту, когда будет удобно."),
}
MANAGER_OFFER = "Похоже, я не понял ответ. Могу позвать менеджера, чтобы обсудить задачу с вами. Позвать?"
DONE = ("сделаю", "загрузил договор", "вот договор")


def new_state(questionnaire: dict) -> dict:
    return {"questionnaire": questionnaire, "need": {"asked_for": "кредит"}, "statement_csv": None,
            "confirmed_fields": {}, "view": None, "asking": None, "attempts": {}, "trace": []}


def next_slot(state: dict) -> str | None:
    need = state["need"]
    if "purpose" not in need:
        return "purpose"
    if "amount_rub" not in need:
        return "amount"
    if "repay_from" not in need:
        return "repay"
    if "term_months" not in need:
        return "term"
    if not state["statement_csv"]:
        return "statement"
    return None


def _apply(state: dict, fields: dict) -> None:
    need = state["need"]
    for key, value in fields.items():
        need[key] = value  # новое слово клиента перекрывает старое: «не 1,5, а 2 млн»


def _acknowledge(fields: dict, old_need: dict, attachment: dict) -> str:
    facts = []
    if attachment.get("statement_csv"):
        facts.append("Выписку получил.")
    if attachment.get("contract_main_customer"):
        facts.append("Договор получил.")
    changed = {key for key, value in fields.items() if old_need.get(key) != value}
    if "purpose" in changed:
        facts.append("Цель понял.")
    if {"amount_rub", "term_months"} <= changed:
        facts.append("Сумму и срок записал.")
    else:
        if "amount_rub" in changed:
            facts.append("Сумму записал.")
        if "term_months" in changed:
            facts.append("Срок записал.")
    if "repay_from" in changed:
        facts.append("Источник возврата записал.")
    return " ".join(facts)


def turn(state: dict, text: str, attachment: dict | None = None,
         intake=intake_rules.parse, explain=explain_templates.explain, decide=None) -> str:
    """attachment: {"statement_csv": "..."} или {"contract_main_customer": {...}} — файл, который клиент загрузил."""
    if decide is None:
        from core_local import decide
    fields = intake(text, state["asking"])
    old_need = dict(state["need"])
    _apply(state, fields)
    attachment = attachment or {}
    acknowledgement = _acknowledge(fields, old_need, attachment)
    if "statement_csv" in attachment:
        state["statement_csv"] = attachment["statement_csv"]
    if "contract_main_customer" in attachment:
        state["confirmed_fields"]["contract_main_customer"] = attachment["contract_main_customer"]

    recalc = state["view"] is not None and ("contract_main_customer" in attachment or fields)
    slot = next_slot(state)
    violations = []
    if slot:
        attempts = state["attempts"]
        attempts[slot] = attempts.get(slot, 0) + 1
        n = attempts[slot]
        reply, kind = ((QUESTIONS[slot][(n - 1) % len(QUESTIONS[slot])], "question") if n == 1 else
                       (RETRY_QUESTIONS[slot][(n - 2) % len(RETRY_QUESTIONS[slot])], "question") if n == 2 else
                       (MANAGER_OFFER, "fallback"))
    elif state["view"] is None or recalc:
        decision = decide(state["statement_csv"], state["need"], state["questionnaire"], state["confirmed_fields"])
        state["view"] = decision["view"]
        reply, kind = explain(state["view"], state["need"]), "explain"
        violations = guard.check(reply, state["view"], state["need"])
        if violations and explain is not explain_templates.explain:
            reply = explain_templates.explain(state["view"], state["need"])
    else:
        reply, kind = "Если хотите, позову менеджера: он ответит на вопросы, которые я не посчитаю. Позвать?", "fallback"
    if acknowledgement:
        reply = f"{acknowledgement} {reply}"
    state["asking"] = slot
    state["trace"].append({"user": text, "attachment": sorted(attachment), "fields": fields, "slot": slot,
                           "kind": kind, "reply": reply, "violations": violations,
                           "status": state["view"]["status_text"] if state["view"] else None})
    return reply
