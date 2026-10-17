"""Разговор агента: один ход = ответ клиенту. Порядок вопросов выбирает код, не модель.

Слоты LLM подменяемые: `intake` (текст → поля) и `explain` (ответ ядра → текст). По умолчанию шаблоны,
с ними сравниваем LLM. Страж проверяет каждый текст объяснялки; провал → шаблон вместо него.
Решения: context/architecture.md (агент → ядро → агент), context/core.md (первые вопросы, без «одобрено»).
"""
import explain_templates
import guard
import intake_rules

QUESTIONS = {
    "purpose": "На что нужны деньги?",
    "amount": "Сколько нужно?",
    "repay": "Понял. Когда и из чего планируете вернуть?",
    "term": "На сколько месяцев нужны деньги?",
    "statement": ("Загрузите выписку по счёту за 12 месяцев: по ней посчитаем, хватит ли денег на платёж. "
                  "Сможете выгрузить её из интернет-банка?"),
}
DONE = ("сделаю", "загрузил договор", "вот договор")


def new_state(questionnaire: dict) -> dict:
    return {"questionnaire": questionnaire, "need": {"asked_for": "кредит"}, "statement_csv": None,
            "confirmed_fields": {}, "view": None, "asking": None, "trace": []}


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


def turn(state: dict, text: str, attachment: dict | None = None,
         intake=intake_rules.parse, explain=explain_templates.explain, decide=None) -> str:
    """attachment: {"statement_csv": "..."} или {"contract_main_customer": {...}} — файл, который клиент загрузил."""
    if decide is None:
        from core_local import decide
    fields = intake(text, state["asking"])
    _apply(state, fields)
    attachment = attachment or {}
    if "statement_csv" in attachment:
        state["statement_csv"] = attachment["statement_csv"]
    if "contract_main_customer" in attachment:
        state["confirmed_fields"]["contract_main_customer"] = attachment["contract_main_customer"]

    recalc = state["view"] is not None and ("contract_main_customer" in attachment or fields)
    slot = next_slot(state)
    violations = []
    if slot:
        reply, kind = QUESTIONS[slot], "question"
    elif state["view"] is None or recalc:
        decision = decide(state["statement_csv"], state["need"], state["questionnaire"], state["confirmed_fields"])
        state["view"] = decision["view"]
        reply, kind = explain(state["view"], state["need"]), "explain"
        violations = guard.check(reply, state["view"], state["need"])
        if violations and explain is not explain_templates.explain:
            reply = explain_templates.explain(state["view"], state["need"])
    else:
        reply, kind = "Если хотите, позову менеджера: он ответит на вопросы, которые я не посчитаю. Позвать?", "fallback"
    state["asking"] = slot
    state["trace"].append({"user": text, "attachment": sorted(attachment), "fields": fields, "slot": slot,
                           "kind": kind, "reply": reply, "violations": violations,
                           "status": state["view"]["status_text"] if state["view"] else None})
    return reply
