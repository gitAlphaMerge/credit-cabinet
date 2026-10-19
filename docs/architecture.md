# Архитектура по коду

Срез 19.10.2026. Сервисы и ограничения: `docker-compose.yml`. Агентная часть следует [архитектуре автора](../context/agent-architecture.md), без изменения принятого workflow.

```mermaid
flowchart TB
    B["Браузер клиента"] --> F["frontend: nginx, статические экраны"]
    B --> T["alfa-intellect: Express + React"]
    F -->|"/api/*: убрать префикс"| A["api: Go, 8080"]
    T -->|"TEAM_API_URL: /score"| A
    T -->|"TEAM_AGENT_URL: /turn"| G["agent: Python, 8090"]
    G --> I["Приёмщик: intake_rules + LLM при ключе"]
    I --> R["Роутер: dialog.next_slot"]
    R -->|"Если все слоты и CSV собраны"| H["core_http"]
    H --> A
    A --> M["ml-model: security → guards → core → translate"]
    M --> J["journal: JSONL с цепочкой SHA-256"]
    R --> E["Объяснялка: LLM или шаблон"]
    E --> Q["Страж: guard, откат к шаблону"]
    G --> S["agent_state: JSON сессий"]
    T --> D[("alfa_data: SQLite и BLOB файлов")]
    T --> L["Локальный transparent-mvp-2: сценарный подбор"]
    T --> K["ЕГРЮЛ/ЕГРИП: локальный мок"]
    I -.-> V["Необязательный DeepSeek API"]
    E -.-> V
```

API не оркестрирует агента, а проксирует `/score`. Кабинет вызывает агента сам. Внешние порты: frontend, Go и кабинет; ml-model привязан к loopback, agent доступен только внутри Compose. TLS стенда не настраивается этим compose. Три именованных volume разделяют SQLite, журнал и сессии. Суммарные `mem_limit`: 864M; пересмотр у Артёма.

## Клиент считает выписку в v2-чате

```mermaid
sequenceDiagram
    actor C as Клиент
    participant B as Браузер v2
    participant F as frontend nginx
    participant A as api Go
    participant M as ml-model
    participant J as journal
    C->>B: Выбирает CSV или демо-выписку
    opt Демо
        B->>F: GET /demo/cash_gap.csv
        F-->>B: Синтетический CSV
    end
    B->>F: POST /api/score (CSV, фиксированные need и questionnaire)
    F->>A: POST /score
    A->>M: POST /score (тело без изменения)
    M->>M: security, guards, core.py, translate
    M->>J: Хэш CSV, нужда, статус, лимиты, цепочка хэшей
    M-->>A: decision_id, core, view
    A-->>F: JSON и статус upstream
    F-->>B: JSON
    B-->>C: Статус, инструмент, лимиты, причины, следующие шаги
```

LLM в этом сценарии не вызывается. Клиентский таймаут 35 с, прокси и Go ждут ядро до 30 с. Ошибка журнала логируется и не отменяет расчёт.

## Клиент кабинета Толи говорит с агентом до расчёта

```mermaid
sequenceDiagram
    actor C as Клиент
    participant B as Кабинет в браузере
    participant T as alfa-intellect
    participant D as SQLite
    participant G as agent
    participant L as Приёмщик и роутер
    participant S as Сессия агента
    C->>B: Создаёт чат и пишет потребность
    B->>T: POST /api/chats, затем /api/chats/{id}/messages
    T->>D: Сохранить сообщение клиента
    T->>G: POST /turn (session_id, text, card)
    G->>S: Загрузить слоты или создать сессию
    G->>L: Извлечь purpose, amount_rub, term_months, repay_from
    Note over G,L: Без ключа intake_rules, при ключе LLM с откатом на правила
    L->>L: next_slot и счётчик попыток
    L-->>G: Уточнение или просьба загрузить выписку
    G->>S: Атомарно сохранить состояние без CSV
    G-->>T: text, mode, status, llm, view
    T->>D: Сохранить ответ ассистента
    T-->>B: Обновлённое состояние кабинета
    B-->>C: Следующий вопрос
```

Карточка передаёт только разрешённые поля подбора, категории/периоды документов и обязательства. Имена, ИНН и файлы целиком в неё не входят. При полном наборе цели, суммы и срока сервер задаёт временный источник возврата «поступления бизнеса, уточнить по выписке». Первичная анкета агента фиксирована как ООО старше трёх лет, а не взята из профиля.

`dialog.turn` умеет принимать вложение CSV и затем вызывать ядро: приёмщик → роутер → `core_http → api → ml-model` → объяснялка → страж. Но HTTP `/turn` передаёт в `dialog.turn` только текст; загрузка документа кабинета туда не подключена. Полный цикл реализован в прямых вызовах и eval, а веб-сценарий выше ограничен сбором потребности. Две неудачи уточнения приводят к предложению менеджера, не к реальной передаче сотруднику.

В Compose `AGENT_CORE_URL` ведёт к Go. На ноутбуке/eval без этой переменной `core_local` вызывает `app.decide`. Guard отбрасывает выдуманные цифры, обещания и слово «одобрено», заменяя объяснение шаблоном. Сессия сохраняет trace, view и слоты; после рестарта CSV требуется повторно.
