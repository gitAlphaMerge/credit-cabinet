# P1 · Контракт заявки (заморожен, общий для всех агентов)

Источник: спека банка `case-champion/docs/spec-bank-side-2026-10-21.md` (решения Саши 21.10), кейс `research/case-2026-10-19/case.txt`, вебинар 20.10 (таймкоды ниже).
Этот файл меняет только Саша. Агент нашёл в нём противоречие или дыру → не чинит сам, пишет в отчёт «контракт: пункт, проблема, вариант».

## Зачем

Путь клиента сейчас обрывается на подборе (шаг 5). Жюри режет за обрыв старта или финала (вебинар 24:24) и за отсутствие банковской стороны (25:56, 1:20:40). P1 даёт заявке id, статус, историю и очередь менеджера.

## Где живёт

Сервер Толи: `hw/tolya/alfa-intellect/server/` (Express 5, `node:sqlite` `DatabaseSync`, синхронно). Новые файлы: `server/applications.ts` (машина состояний, чистые функции + SQL), `server/applications-routes.ts` (роуты), тесты `tests/applications-*.test.ts`. Миграция номер **4** (1, 2, 3 заняты). Go (`services/api`) не трогаем: это провод к ядру Лизы.
Зона агента (`server/ai-provider.ts`, `team-agent-process.ts`, порядок провайдеров в `app.ts`, `services/**`) только чтение, см. `hw/tolya/alfa-intellect/AGENTS.md`.

## Сущности (миграция 4)

```
users           + role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('client','manager'))
applications    id TEXT PK, user_id FK users, selection_id TEXT, selection_version INT,
                status TEXT NOT NULL, amount INT (рубли, >0), term_months INT, purpose TEXT,
                version INT NOT NULL (оптимистичная блокировка, +1 на каждый переход),
                consent_at TEXT NULL, queued_at TEXT NULL, created_at, updated_at
application_events  id INTEGER PK AUTOINCREMENT, application_id FK, seq INT (1,2,3… внутри заявки, UNIQUE(application_id,seq)),
                    event TEXT, from_status TEXT NULL, to_status TEXT, actor_role TEXT ('client'|'manager'|'system'),
                    actor_id TEXT NULL, reason TEXT NULL, payload TEXT (JSON), at TEXT
dossiers        application_id FK, version INT, core_result TEXT (JSON как вернуло ядро), checks TEXT (JSON),
                holes TEXT (JSON-массив), created_at; PK(application_id, version)
```

Журнал `application_events` = источник правды. `applications.status` = кэш, обязан совпадать с `to_status` последнего события.

## Статусы и переходы

| Событие | Из | В | Кто | Условие |
|---|---|---|---|---|
| create | (нет) | draft | client | подбор принадлежит клиенту |
| submit | draft | queued | client | `consent=true` (согласие на ПДн и запрос в БКИ, 218-ФЗ), ядро ответило без стоп-фактора |
| submit | draft | rejected | system | ядро вернуло стоп-фактор: reason = код стоп-фактора, мимо очереди |
| request_info | queued | info_requested | manager | reason обязателен (что дозагрузить) |
| client_update | info_requested | queued | client | новые данные → ядро пересчитало → новая версия досье; queued_at НЕ сбрасывается |
| reject | queued | rejected | manager | reason обязателен |
| send_to_underwriting | queued | underwriting | manager | записка обязательна (payload.memo) |
| underwriter_approve | underwriting | approved | system | мок андеррайтера, сумма ≤ amount заявки |
| make_offer | approved | offered | system | сразу после approve, payload: сумма, ставка, срок, график платежей |
| sign | offered | signed | client | мок SMS: payload.code = "0000" |
| disburse | signed | disbursed | system | сразу после sign, событие «деньги на счёте» |
| expire | offered | expired | system | offered дольше `OFFER_TTL_DAYS` (по умолчанию 7) |
| withdraw | draft, queued, info_requested, underwriting, approved, offered | withdrawn | client | |

Терминальные: rejected, disbursed, expired, withdrawn. Любая пара (статус, событие) вне таблицы → HTTP 409, заявка и журнал не меняются. Чужая роль → 403. Чужая заявка клиента → 404 (не палим существование).
Отказ + оффер = новая заявка-черновик клиента со ссылкой `parent_id` в payload события create; старая остаётся rejected.

## Инварианты (то, что проверяют тесты, а не только примеры)

1. Статус в `applications` = `to_status` последнего события; повтор журнала с нуля по таблице переходов даёт тот же статус.
2. `seq` идёт 1..n без дыр; `from_status` события k = `to_status` события k−1.
3. После терминального статуса событий нет.
4. Каждый переход атомарен: событие и смена статуса в одной транзакции `BEGIN IMMEDIATE`; падение посередине не оставляет половину.
5. Два одновременных перехода по одной `version`: ровно один успешен, второй 409 (`expectedVersion` в теле обязателен для всех переходов, кроме create).
6. Повтор того же запроса с тем же `Idempotency-Key` возвращает тот же ответ и не пишет второе событие.
7. Статус меняет только этот модуль. Агент и фронт двигают заявку только через HTTP.
8. Цифры риска (N из M, лимит сейчас и после шага, стоп-факторы) берутся только из ответа ядра, сервер их не считает и не правит.
9. Данные переживают перезапуск процесса (тот же `DATABASE_PATH`).

## Ядро

Сервер зовёт ядро через `TEAM_API_URL` (`POST /score`, контракт `context/api-contract.md`). Обёртка `CoreClient` инжектится; в тестах фейк. Ядро недоступно → submit отвечает 503, заявка остаётся draft, событие не пишется.

## Очередь менеджера

```
priority = amount × ready / (1 + holes) + K × hours_in_queue
ready  = N / M из ответа ядра (0..1)      holes = длина dossier.holes
hours_in_queue = (now − queued_at) в часах  K = PRIORITY_AGING_K, по умолчанию 20000 (заглушка, Саша поправит)
```

`GET /api/bank/queue` (роль manager): заявки в queued и info_requested, сортировка по priority убыв., при равенстве по queued_at возр., затем id. Каждая строка отдаёт все слагаемые (amount, ready, holes, hours, K, priority), чтобы менеджер видел, откуда число (вебинар 45:24: необъяснимое = баг). Время берётся из инжектируемых часов, не из `Date.now()` напрямую.
Отклонённые по стоп-фактору: `GET /api/bank/rejected`.

## Ручки

```
POST /api/applications                        client  {selectionId, selectionVersion}            → 201 {application}
GET  /api/applications                        client  свои                                       → 200 [...]
GET  /api/applications/:id                    client  своя / manager любая                       → 200 {application, events, dossier}
POST /api/applications/:id/events             client|manager {event, expectedVersion, reason?, payload?} + Idempotency-Key → 200 {application}
GET  /api/bank/queue                          manager                                            → 200 [{application, priority, terms}]
GET  /api/bank/rejected                       manager                                            → 200 [...]
```

Мок андеррайтера и выдачи: system-события выполняются синхронно внутри того же запроса, который их вызвал (send_to_underwriting → underwriter_approve → make_offer; sign → disburse), в одной транзакции на каждое событие. Без setTimeout.

## Не входит в P1

Экран менеджера (Тоня), агент менеджера (сб), экран андеррайтера, моки БКИ/ЕГРЮЛ/115-ФЗ (отдельная задача C, здесь `checks` пишется как пришло), реальные SMS и ЭП.
