# Состояния по коду

The bank application machine is implemented in `hw/tolya/alfa-intellect/server/applications.ts`. Core results, dialog slots and legacy funding previews below are separate entities.

## Результат ядра

`core.py` возвращает русское `core.status`, `translate.py` переводит его в `view.status`. Каждый расчёт создаёт новый результат, переходы ниже показывают выбор исхода, а не запись изменения банковской заявки.

```mermaid
stateDiagram-v2
    state "Новый расчёт" as Score
    state "можно подавать (ready)" as Ready
    state "можно после шага (ready_after_step)" as After
    state "лучше другой инструмент (other_instrument)" as Other
    state "нужен менеджер (need_manager)" as Manager
    [*] --> Score
    Score --> Ready
    Score --> After
    Score --> Other
    Score --> Manager
    After --> Score: Новые подтверждения или параметры
    Ready --> Score: Повторный расчёт
    Other --> Score: Изменение запроса
    Manager --> Score: Новые данные
```

Стоп-правила, DSCR, инструмент и лимиты определяет код, LLM статус не выбирает. «Можно подавать» не означает «одобрено». Основания: [core](../context/core.md), [stop-rules](../context/stop-rules.md), `services/ml-model/translate.py`.

## Слоты диалога агента

```mermaid
stateDiagram-v2
    state "purpose: цель" as Purpose
    state "amount: сумма" as Amount
    state "repay: источник возврата" as Repay
    state "term: срок" as Term
    state "statement: выписка" as Statement
    state "Расчёт и объяснение" as Explain
    state "Предложить менеджера" as Offer
    [*] --> Purpose
    Purpose --> Amount: Цель заполнена
    Amount --> Repay: Сумма заполнена
    Repay --> Term: Источник заполнен
    Term --> Statement: Срок заполнен
    Statement --> Explain: CSV получен через dialog.turn
    Purpose --> Offer: Две неудачи уточнения
    Amount --> Offer: Две неудачи уточнения
    Repay --> Offer: Две неудачи уточнения
    Term --> Offer: Две неудачи уточнения
    Statement --> Offer: Две неудачи уточнения
    Explain --> Explain: Новые поля или подтверждение договора
```

Это порядок `next_slot`, заполненные поля пропускаются. Номер попытки 1: первый вопрос, 2: переформулировка, 3 и далее: предложение менеджера. `Offer` обозначает текст ответа, отдельного поля состояния для передачи нет. Ошибка ядра оставляет сессию для повтора. HTTP-статус ответа агента в JSON: `collecting`, `ready` либо `view.status`; это не HTTP-код и не банковское решение. В `/turn` нет поля attachment, поэтому веб-диалог не завершает шаг выписки.

## Документы и демо-заявка Толи

```mermaid
stateDiagram-v2
    state "Файл извлечён, confirmed=false" as Extracted
    state "Пользователь подтвердил, confirmed=true" as Confirmed
    [*] --> Extracted: POST /api/documents
    Extracted --> Confirmed: POST /api/documents/{id}/confirm
```

Документ хранится в `files` и `users.state.documents`. Повторная загрузка того же файла тем же пользователем возвращает прежний документ (id из SHA-256). При подтверждении нового документа старые подтверждённые документы той же категории исключаются из JSON-списка; исходные BLOB этим обработчиком не удаляются. Подтверждение пользователем не равно банковской проверке подлинности.

```mermaid
stateDiagram-v2
    state "Подбор версии N" as Selection
    state "Предварительный вид заявления" as Preview
    state "Демо-заявка создана" as Created
    [*] --> Selection
    Selection --> Selection: Пересчёт, версия N плюс 1
    Selection --> Preview: application-preview
    Preview --> Created: Версия совпала, риски подтверждены при необходимости
    Created --> Created: Повторная подача той же версии возвращает прежнюю запись
    Created --> Selection: Новый пересчёт
```

Единственный явный `lead.status`: `Демо-заявка создана`. В legacy `/leads` и `/consultations` поле status отсутствует. `funding_applications` хранит неизменный JSON-снимок версии, уникальный по пользователю, подбору и версии. Несовпадение `expectedVersion` даёт 409, неподтверждённый обязательный риск даёт 422. Оценка подбора `assessment.decision`: `consider`, `reduce`, `unnecessary`, `rethink`, `insufficient`; уровни: «Ориентировочная», «Предварительно обоснованная», «Расширенная». Это оценка сценария, не этапы рассмотрения.

## Bank application v2

Source: [frozen v2 contract](v2-contract.md). `TRANSITIONS` is the sole transition table;
`transition(from,event,role,target?)` checks every persisted outcome against it.

```mermaid
stateDiagram-v2
    [*] --> draft: create (client)
    draft --> underwriting: submit, gate pass, complete, within limit (system)
    draft --> info_requested: submit, missing data or excessive amount (system)
    draft --> rejected: submit, hard stop (system)
    info_requested --> underwriting: client_update / accept_alternative, green (system)
    info_requested --> info_requested: client_update / accept_alternative, incomplete (system)
    info_requested --> rejected: client_update / accept_alternative, stop (system)
    info_requested --> info_requested: agent_nudge (system)
    info_requested --> queued: escalate_silent / escalate_disagreed (system)
    queued --> info_requested: request_info (manager) / accept_alternative (system)
    queued --> underwriting: send_to_underwriting (manager) / accept_alternative, green (system)
    queued --> rejected: reject (manager) / accept_alternative, stop (system)
    underwriting --> approved: underwriter_approve (system)
    approved --> offered: make_offer (system)
    offered --> signed: sign (client)
    signed --> disbursed: disburse (system)
    offered --> expired: expire (system)
    draft --> withdrawn: withdraw (client)
    queued --> withdrawn: withdraw (client)
    info_requested --> withdrawn: withdraw (client)
    underwriting --> withdrawn: withdraw (client)
    approved --> withdrawn: withdraw (client)
    offered --> withdrawn: withdraw (client)
```

| Event | From | Caller | Persisted outcome and guard |
|---|---|---|---|
| create | none | client | draft, owned selection version |
| submit | draft | client/system | underwriting, info_requested, rejected; consent=true |
| client_update | info_requested | client/system | same outcomes, confirmed_fields or stored documents |
| accept_alternative | info_requested, queued | client | same outcomes, option_id from latest dossier; 422 otherwise |
| agent_nudge | info_requested | system | info_requested; nonblank text |
| escalate_silent | info_requested | system | queued, CLIENT_SILENT; nudge after latest info cycle, else 409 |
| escalate_disagreed | info_requested | system | queued, CLIENT_DISAGREED; nonblank client_objections |
| request_info | queued | manager | info_requested; reason |
| send_to_underwriting | queued | manager | underwriting; memo, full dossier, amount within current limit |
| reject | queued | manager | rejected; reason, optional legacy alternative |
| underwriter_approve | underwriting | system | approved; complete passed dossier, principal within request and limit |
| make_offer | approved | system | offered; same guards, rate/term/schedule validation |
| sign | offered | client | signed; demo code 0000 |
| disburse | signed | system | disbursed |
| expire | offered | system | expired; strictly older than OFFER_TTL_DAYS |
| withdraw | draft, queued, info_requested, underwriting, approved, offered | client | withdrawn |

`submit`, `client_update`, `accept_alternative` always run compliance first with clock
and stored document dates. A non-pass gate persists its entire report and skips core/BKI.
On pass: core then BKI. 90+ overdue rejects; 30+ or unavailable BKI leaves a bki hole.
Hard core stops reject, SHORT_STATEMENT requests statement data. Holes precede alternatives.
Excessive amount requests alternatives even if the builder returns an empty array.
A green decision persists underwriting, approved and offered in one transaction, all system.
HTTP send_to_underwriting cascades to offered; HTTP sign cascades to disbursed. Internal
transitionApplication keeps individual non-scoring transitions available for orchestration.
Async calls happen before BEGIN IMMEDIATE; CAS is checked again inside the transaction.

Dossier SQL columns remain compatible. `checks._v2` JSON stores the full compliance report
and alternatives; reads expose `dossier.compliance`, `dossier.alternatives` and
`dossier.client_objections` (from the persisted escalation event). No schema migration is
needed; legacy JSON has empty alternatives. Raw core_result stays untouched. N/M comes
from the server checklist, never from additional fields returned by core.

The queue contains only queued applications. Priority uses min(request amount, current
core limit), multiplied by N/M and divided by 1+holes, plus PRIORITY_AGING_K times hours.
A missing core limit contributes zero principal to priority. Queue rows expose red_reason,
client_objections, alternatives, N, M, holes and checks. Rejected applications are listed
separately with UNDERWRITING_REJECTED and reason. No terminal state has outgoing edges.

There is no agent account role in the session schema. Minimal HTTP delegation permits an
owned client session to request only agent_nudge, escalate_silent and escalate_disagreed;
these journal entries use system. A manager cannot delegate them, and foreign client
ownership is checked first. Other system actions remain internal and cannot be forged
through payload.actorRole. The Python agent must carry the client's existing session;
a standalone service-token endpoint is not implemented here.

Every HTTP event requires Idempotency-Key and expectedVersion. Replay returns the original
response before rescoring. Response cache, dossier, parameter changes and all cascade
events commit atomically. Stale concurrent updates get 409 and cannot create another offer.
