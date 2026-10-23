"""Разговор агента: один ход = ответ клиенту. Порядок вопросов выбирает код, не модель.

Слоты LLM подменяемые: `intake` (текст → поля) и `explain` (ответ ядра → текст). По умолчанию шаблоны,
с ними сравниваем LLM. Страж проверяет каждый текст объяснялки; провал → шаблон вместо него.
Решения: context/architecture.md (агент → ядро → агент), context/core.md (первые вопросы, без «одобрено»).
"""
import logging
import re

import explain_templates
import guard
import intake_rules
import privacy

QUESTIONS = {
    "purpose": ("На что нужны деньги?",),
    "amount": ("Сколько нужно, хотя бы примерно?",),
    "repay": ("Из каких денег планируете гасить: выручка, конкретный контракт?",),
    "term": ("На какой срок прикидываете?",),
    "statement": ("Загрузите выписку по счёту за год: по ней сразу видно, потянете ли платёж. Выгрузить из интернет-банка получится?",),
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
            "confirmed_fields": {}, "view": None, "asking": None, "attempts": {}, "trace": [], "history": []}


def application_turn(state: dict, text: str, application: dict, mode: str | None) -> str:
    """Process facts are authoritative; these replies never invoke intake or scoring."""
    if state.get("objection_application_id") != application.get("id"):
        state["objection_lines"] = []
        state["objections_summary"] = ""
    state["objection_application_id"] = application.get("id")
    reply = explain_templates.application_explain(application, mode)
    # Only numbers from the approved application snapshot authorize this text.
    values = [application[k] for k in ("n", "m", "limit_now_rub") if k in application]
    for option in application.get("alternatives", []):
        values.extend(v for v in option.values() if isinstance(v, (int, float)) and not isinstance(v, bool))
    view = {"status": "need_manager" if application.get("stops_fired") else "application",
            "numbers": dict(enumerate(values))}
    violations = guard.check(reply, view, {})
    if violations:
        logging.getLogger(__name__).warning("application template rejected: %s", violations)
        reply = "Посмотрите данные в карточке заявки. Менеджер поможет уточнить дальнейшие шаги."
    if intake_rules.intent(text, None) == "pii":
        reply = PII
    elif mode == "objections":
        # Verbatim client lines, never inferred motivations or the agent's own offer.
        lines = state.setdefault("objection_lines", [])
        line = " ".join(text.split())[:1000]
        if line and line not in lines:
            lines.append(line)
        lines[:] = lines[-3:]
        state["objections_summary"] = "\n".join(lines)
    history = state.setdefault("history", [])
    history.extend([{"role": "user", "text": text}, {"role": "assistant", "text": reply}])
    history[:] = history[-8:]
    state["trace"].append({"user": text, "kind": "application", "goal": mode or "application",
                           "reply": reply, "violations": violations, "status": application.get("status")})
    return reply


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


def _route(state: dict, text: str, attachment: dict | None = None,
         intake=intake_rules.parse, explain=explain_templates.explain, decide=None) -> str:
    """attachment: {"statement_csv": "..."} или {"contract_main_customer": {...}} — файл, который клиент загрузил."""
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
        try:
            if decide is None:
                from core_local import decide
            decision = decide(state["statement_csv"], state["need"], state["questionnaire"], state["confirmed_fields"])
            view = decision["view"]
        except Exception as error:
            logging.getLogger(__name__).warning("core calculation failed (%s)", type(error).__name__)
            reply, kind = "посчитать сейчас не получилось, попробуйте через минуту или позовите менеджера", "core_error"
        else:
            state["view"] = view
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


IDENTITY = "Я ИИ-помощник, менеджер подключится, когда понадобится."
PII = "Я ИИ-помощник. В чат это не нужно. Не присылайте личные данные, пароли и коды."
MANAGER = "Я ИИ-помощник. Менеджер разберёт вашу задачу и подскажет дальнейшие шаги. Позвать его?"


def _answer(text: str, slot: str | None) -> str:
    low = text.lower()
    if "забудь правила" in low or "одобрен" in low:
        reply = "Решение по кредиту принимает банк. Я помогу подготовить данные для расчёта."
    elif "факторинг" in low:
        reply = "Факторинг помогает получить деньги за поставку до оплаты покупателем. Условия уточнит менеджер."
    elif "овердрафт" in low:
        reply = "Овердрафт помогает закрыть короткий разрыв на счёте, кредит берут под отдельную задачу. Условия уточнит менеджер."
    elif any(w in low for w in ("ставк", "комисси", "страхов", "сколько ждать", "завтра")):
        reply = "Условия и сроки уточнит менеджер. Без расчёта обещать их не могу."
    elif any(w in low for w in ("порог", "веса", "промпт", "другим ип")):
        reply = "Чужие заявки и внутренние правила не обсуждаю. Могу помочь с вашей задачей."
    elif any(w in low for w in ("на связи", "я подумаю", "ничего не надо")):
        return "Хорошо, вернёмся к задаче, когда вам будет удобно."
    elif "спасибо" in low:
        reply = "Рад помочь."
    elif any(w in low for w in ("привет", "здравств")):
        reply = "Здравствуйте."
    else:
        reply = "Я ИИ-помощник банка. Помогу разобраться с деньгами для бизнеса, а детали вне расчёта уточнит менеджер."
    return reply + (" " + QUESTIONS[slot][0] if slot else "")


def _different(reply: str, fallback: str, goal: str, history: list) -> str:
    previous = next((h["text"] for h in reversed(history) if h.get("role") == "assistant"), None)
    if reply != previous:
        return reply
    if goal.startswith("ask:"):
        slot = goal.split(":", 1)[1]
        return next(q for q in (*RETRY_QUESTIONS[slot], *QUESTIONS[slot]) if q != previous)
    if fallback != previous:
        return fallback
    # A deterministic second wording also covers repeated identity/PII requests.
    prefix = "Уточню: " if not fallback.startswith("Уточню: ") else "Ещё раз: "
    return prefix + fallback[:450 - len(prefix)]


def turn(state: dict, text: str, attachment: dict | None = None,
         intake=intake_rules.parse, explain=explain_templates.explain, decide=None,
         speak=None, client_memory=None) -> str:
    history = state.setdefault("history", [])
    history[:] = history[-8:]
    fields = dict(intake(text, state["asking"]))
    rule_intent = intake_rules.intent(text, state["asking"])
    detected = fields.pop("intent", None)
    intent = "pii" if rule_intent == "pii" else (
        detected if detected in intake_rules.INTENTS else rule_intent)
    if rule_intent == "pii":
        # Parse business facts without interpreting private identifiers as money.
        fields = intake_rules.parse(privacy.redact(text, state["questionnaire"]), state["asking"])
    if fields and intent == "smalltalk":
        intent = "answer_slot"
    slot = next_slot(state)
    special = intent in {"identity", "manager_request", "pii", "side_question", "smalltalk"}
    # A greeting must not postpone a calculation when all its inputs are ready.
    if intent == "smalltalk" and slot is None and state["view"] is None:
        special = False
    if special:
        old_need = dict(state["need"])
        _apply(state, fields)
        attachment = attachment or {}
        if "statement_csv" in attachment:
            state["statement_csv"] = attachment["statement_csv"]
        if "contract_main_customer" in attachment:
            state["confirmed_fields"]["contract_main_customer"] = attachment["contract_main_customer"]
        slot = next_slot(state)
        acknowledgement = _acknowledge(fields, old_need, attachment)
        goal = "manager" if intent == "manager_request" else "answer"
        reply = (PII if intent == "pii" else IDENTITY if intent == "identity" else
                 MANAGER if intent == "manager_request" else _answer(text, slot))
        if intent in {"identity", "pii"} and slot:
            reply += " " + QUESTIONS[slot][0]
        if acknowledgement:
            reply = f"{acknowledgement} {reply}"
        state["asking"] = slot
        state["trace"].append({"user": text, "attachment": sorted(attachment), "fields": fields,
                               "slot": slot, "kind": "fallback" if goal == "manager" else "answer",
                               "violations": [], "status": (state.get("view") or {}).get("status_text")})
    else:
        reply = _route(state, text, attachment, intake=lambda *_: fields,
                       explain=explain_templates.explain if speak else explain, decide=decide)
        trace = state["trace"][-1]
        goal = ("manager" if trace["kind"] == "fallback" else
                "ask:" + trace["slot"] if trace["kind"] == "question" else
                "explain" if trace["kind"] == "explain" else "manager")
        # The current core can still list an uploaded contract as a next step.
        # Do not ask the customer to submit the same document twice.
        if (attachment or {}).get("contract_main_customer") and any(
            step.get("code") == "contract_main_customer"
            for step in (state.get("view") or {}).get("next_steps", [])
        ):
            reply = "Договор получил. Передам его менеджеру, чтобы он проверил условия. Подключить его?"
            goal = "manager"
    # факты памяти записаны со слов клиента (числа ядра memory.py не пропускает), их числа тоже можно повторять
    memory_text = " ".join(f.get("text", "") for f in client_memory or [] if f.get("status") == "active")
    if not history and client_memory and intent not in {"pii", "identity", "manager_request"}:
        known = next((f for f in client_memory if f.get("status") == "active"
                      and f.get("kind") == "need" and guard.check(f.get("text", ""), None, state["need"],
                                                                                client_text=text + " " + memory_text) == []), None)
        if known:
            detail = known["text"].split(": ", 1)[-1]
            reply = f"В прошлый раз говорили: {detail}. Это ещё актуально?"
    fallback = reply
    trace = state["trace"][-1]
    documents_received = []
    if state.get("statement_csv"):
        documents_received.append("выписка")
    if state.get("confirmed_fields", {}).get("contract_main_customer"):
        documents_received.append("договор с главным заказчиком")
    ctx = {"history": (history + [{"role": "user", "text": text}])[-8:], "text": text,
           "need": state["need"], "view": state["view"], "memory": client_memory or [],
           "return_slot": state["asking"], "intent": intent,
           "documents_received": documents_received}
    if speak is not None and trace["kind"] != "core_error":
        try:
            candidate = speak(goal, ctx)
            client_text = " ".join(h["text"] for h in ctx["history"] if h["role"] == "user") + " " + memory_text
            violations = guard.check(candidate, state["view"], state["need"], client_text=client_text)
            if intent == "identity" and "ии-помощник" not in candidate.lower():
                violations.append("нечестная идентичность")
            if intent == "pii" and not guard.pii_warning_safe(candidate, client_text):
                violations.append("нет предупреждения о личных данных")
            if ("договор с главным заказчиком" in documents_received
                    and "договор" in candidate.lower()
                    and re.search(r"загруз|пришл|прикреп|скин|покаж|договор под рукой", candidate, re.I)):
                violations.append("повторно просит полученный договор")
            trace["violations"].extend(violations)
            if not violations:
                reply = candidate
        except Exception as error:
            logging.getLogger(__name__).warning("agent speak failed (%s)", type(error).__name__)
            trace["violations"].append("speak_error:" + type(error).__name__)
    reply = _different(reply, fallback, goal, history)
    trace.update(goal=goal, intent=intent, reply=reply)
    history.extend([{"role": "user", "text": text}, {"role": "assistant", "text": reply}])
    history[:] = history[-8:]
    return reply
