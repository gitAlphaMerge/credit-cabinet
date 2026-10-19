# Модель данных

Источники: `server/store.ts`, миграция 2 в `server/funding-routes.ts`, `shared/types.ts` кабинета; `services/ml-model/journal.py`, `services/agent/server.py` и `dialog.py`. Объекты JSON показаны отдельно от SQL-таблиц.

## SQLite кабинета

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : "сессии"
    USERS ||--o{ FILES : "файлы"
    USERS ||--o{ FUNDING_APPLICATIONS : "снимки заявок"
    USERS ||..o{ USAGE : "учёт вызовов без SQL FK"
    USERS {
        TEXT id PK
        TEXT phone UK
        TEXT password "salt:scrypt, не открытый пароль"
        TEXT state "JSON AppState"
    }
    SESSIONS {
        TEXT token PK "SHA-256 токена cookie"
        TEXT user_id FK
        INTEGER expires "Unix milliseconds"
    }
    FILES {
        TEXT id PK "SHA-256 пользователя и файла"
        TEXT user_id FK
        TEXT name
        TEXT mime
        BLOB data
    }
    USAGE {
        TEXT user_id PK
        TEXT day PK
        INTEGER calls
    }
    FUNDING_APPLICATIONS {
        TEXT id PK
        TEXT user_id FK
        TEXT selection_id
        INTEGER version
        TEXT dossier "JSON-снимок"
    }
    MIGRATIONS {
        INTEGER version PK
    }
```

`users.phone` уникален, обязательны phone/password/state. Сессии живут 7 дней, cookie HttpOnly и SameSite=strict; Secure зависит от настройки. В `funding_applications` уникальна тройка `(user_id, selection_id, version)`; SQL FK есть только на users, таблицы selections нет. `usage` имеет составной PK `(user_id, day)`, SQL FK не объявлен. SQLite включает WAL и foreign_keys. Версии миграций: 1 и 2. Файл: `DATABASE_PATH`, в Compose именованный volume `alfa_data`.

## Содержимое users.state

```mermaid
erDiagram
    APP_STATE ||--|| PROFILE : "профиль"
    APP_STATE ||--o{ DOCUMENT : "documents"
    APP_STATE ||--o{ CHAT : "chats"
    CHAT ||--o{ MESSAGE : "messages"
    APP_STATE ||--o{ SELECTION : "selections"
    SELECTION ||--o{ FUNDING_VERSION : "versions"
    APP_STATE ||--o{ LEAD : "leads"
    APP_STATE ||--o{ NOTICE : "notifications"
    APP_STATE ||--o| CREDIT : "credit"
    APP_STATE {
        object financials
        object preferences
        object cabinet "необязательный объект"
    }
    DOCUMENT {
        string id
        string category
        string period
        object fields
        array records
        boolean confirmed
    }
    CHAT {
        string id
        string selectionId "необязательная ссылка"
        string title
        object cabinetContext
    }
    MESSAGE {
        string id
        string role
        string text
        string createdAt
    }
    SELECTION {
        string id
        integer version
        object input
        object assessment
        object calculation
        string status
    }
    FUNDING_VERSION {
        integer version
        object input
        object assessment
        object calculation
        string status
    }
    LEAD {
        string id
        string selectionId
        integer version
        string status "необязательный демо-статус"
        object application
    }
```

JSON-связи не обеспечены SQL FK. `lead.selectionId` может быть `consultation`. `financials` содержит числа и строки источников. Профиль хранит подтверждённый пользователем `registryRecord`, документ хранит извлечённые значения и отметку подтверждения. Чат и подбор связываются через selectionId; версии mvp-2 сохраняются внутри одного подбора. Старый путь сохраняет отдельный parentId. В SQLite лежат сами файлы; в журнале ядра их нет.

## Журнал решений и сессия агента

```mermaid
erDiagram
    DECISION_ENTRY o|--o| DECISION_ENTRY : "prev_hash указывает на hash предыдущей строки"
    DECISION_ENTRY {
        string decision_id
        string created_at
        string core_id
        string model_version
        string input_sha256
        object need
        string status
        number limit_now_rub
        number limit_after_rub
        string prev_hash
        string hash
    }
    AGENT_SESSION ||--o{ TRACE_TURN : "trace"
    AGENT_SESSION {
        string file_key "SHA-256 session_id"
        object questionnaire
        object need
        object confirmed_fields
        object attempts
        string asking "слот или null"
        object view "или null"
        boolean has_statement
        string statement_sha256
    }
    TRACE_TURN {
        string user
        array attachment "имена вложений"
        object fields
        string slot
        string kind
        string reply
        array violations
        string status
    }
```

Журнал append-only JSONL по `JOURNAL_PATH`, первый prev_hash равен 64 нулям. `hash` считается по полям строки до добавления самого hash. Проверка `journal.verify()` обнаруживает нарушение цепочки; это не внешняя нотариальная фиксация. Сырая выписка не сохраняется, но need сохраняется.

Сессия лежит в оперативном `SESSIONS` и `AGENT_STATE_DIR/sessions/<sha256(session_id)>.json`, пишется атомарно. `statement_csv` существует только в памяти и исключается при записи. Trace содержит реплики, поля и ответы, поэтому не является обезличенной телеметрией. После рестарта слоты и view восстанавливаются, CSV для нового расчёта нужно загрузить повторно. HTTP session_id соответствует id чата кабинета; SQL FK между хранилищами нет. Сырой session_id также попадает в технический лог агента.
