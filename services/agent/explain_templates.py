"""Объяснялка без LLM: ответ ядра (`view`) → короткий текст для клиента."""


def rub(x: float) -> str:
    return f"{round(x):,}".replace(",", " ") + " ₽"


HOLES = {
    "contract_main_customer": "договор с главным заказчиком",
    "statement": "выписку по счёту",
    "statement_csv": "выписку по счёту",
    "SHORT_STATEMENT": "выписку за полный период",
    "COMPLIANCE_INN_MISSING": "данные компании в профиле",
    "COMPLIANCE_EGRUL_MISMATCH": "подтверждение данных компании",
    "COMPLIANCE_DOC_EXPIRED": "действующий документ",
    "COMPLIANCE_DOC_DATE_UNKNOWN": "дату документа",
}
STAGES = {
    "draft": "Заявка пока в черновике. Проверьте данные и отправьте её на рассмотрение.",
    "queued": "Заявка передана менеджеру. Он изучит данные и свяжется с вами.",
    "info_requested": "По заявке нужны уточнения.",
    "underwriting": "Заявка на проверке. Дождитесь результата в карточке заявки.",
    "approved": "По заявке есть результат проверки. Посмотрите условия в карточке заявки.",
    "offered": "Условия доступны в карточке заявки. Проверьте их перед подписанием.",
    "signed": "Документы подписаны. Следующий этап указан в карточке заявки.",
    "disbursed": "Выдача отражена в кабинете. Проверьте график платежей.",
    "rejected": "По заявке получен отказ. Менеджер поможет обсудить дальнейшие шаги.",
    "expired": "Срок действия заявки истёк. Уточните актуальные данные для новой заявки.",
    "withdrawn": "Заявка отозвана. При необходимости можно начать новую.",
}


def application_explain(application: dict, mode: str | None) -> str:
    status = application.get("status")
    if mode == "nudge" and status != "info_requested":
        return "Актуальный этап и дальнейшие действия можно посмотреть в карточке заявки."
    if mode == "objections":
        options = []
        for option in application.get("alternatives", [])[:3]:
            name = option.get("product_name") or option.get("product") or "вариант финансирования"
            detail = str(name)
            if "amount_rub" in option:
                detail += ": " + rub(option["amount_rub"])
            if "term_months" in option:
                detail += f", срок {option['term_months']:g} мес."
            if len("; ".join(options + [detail])) <= 300:
                options.append(detail.rstrip("."))
        offered = "; ".join(options)
        if offered:
            return f"Есть варианты: {offered}. Решение принимает банк. Что в этих условиях вам не подходит?"
        return "В карточке пока нет альтернатив. Передам ваши возражения менеджеру. Что для вас принципиально?"
    reply = STAGES.get(status, "Актуальный этап указан в карточке заявки.")
    if status == "info_requested":
        holes = application.get("holes", [])
        documents = []
        for code in holes:
            if isinstance(code, dict):
                code = code.get("code")
            document = HOLES.get(code, "недостающие данные из карточки заявки")
            if document not in documents and len(", ".join(documents + [document])) <= 220:
                documents.append(document)
        document = ", ".join(documents) or "недостающие данные из карточки заявки"
        reply = ("Чтобы продолжить рассмотрение, пришлите " + document + ". Сможете загрузить?")
        if mode != "nudge":
            reply = "По заявке нужны уточнения. " + reply
    if mode != "nudge" and "n" in application and "m" in application:
        reply += f" Подтверждено {application['n']} из {application['m']}."
    if mode != "nudge" and not application.get("stops_fired") and status != "rejected":
        reason = next((r.get("text") for r in application.get("reasons", [])
                       if isinstance(r, dict) and r.get("text")), None)
        if reason and len(reply) + len(reason) < 440:
            reply += " " + reason.rstrip(".") + "."
        if "limit_now_rub" in application:
            limit = f" Лимит по расчёту: {rub(application['limit_now_rub'])}. Решение принимает банк."
            if len(reply) + len(limit) <= 450:
                reply += limit
    return reply


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
