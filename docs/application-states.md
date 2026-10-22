# Состояния по коду

Это три независимые сущности. Единого банковского автомата заявки в репозитории пока нет.

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

## Чего нет и что делаем

Банковские исходы «одобрено», «иные условия», «дозапрос», «отказ» пока отсутствуют как автомат, API и сохранённые состояния. Подписание, реальная отправка в банк, выдача и очередь менеджера отсутствуют. План для решения человеком: определить контракт рассмотрения, хранить состояние и историю переходов, привязать дозапрос к документам, описать роли и проверки переходов. До реализации демонстрируем только локальную демо-заявку и расчёт готовности.
