# ТЗ Codex 2: агент на DeepSeek, автозапуск с кабинетом, журнал запуска

Ветка `codex/agent-in-cabinet`, продолжение `codex-agent-in-cabinet-task.md` (сделано, коммит `7d99dd7`). Коммит сделает Клод: `.git` в песочнице только на чтение, оставь изменения в рабочем дереве.

## 1. LLM в `server.py`

Сейчас `server.py` всегда зовёт `dialog.turn(..., intake=intake_rules.parse)` с шаблонами, и LLM не участвует.
Нужно так: если `llm.available()`, то приёмщик и объяснялка идут через `llm` (те же слоты, что в `eval/sim.py`), иначе шаблоны. Страж остаётся в любом случае.
Модель и адрес берутся из `AGENT_LLM_MODEL` / `AGENT_LLM_URL` (уже есть в `llm.py`). Ключ: `OPENROUTER_API_KEY`, плюс в `_key()` добавить `DEEPSEEK_API_KEY` для прямого DeepSeek API на сервере YC (OpenRouter оттуда отдаёт 403). Порядок такой: `DEEPSEEK_API_KEY` берётся при заданном `AGENT_LLM_URL`, иначе `OPENROUTER_API_KEY`.
В ответе `/turn` и `/health` добавить `llm: "<модель>" | "templates"`, чтобы было видно, кто отвечает.

## 2. Автозапуск агента вместе с кабинетом

Толин сервер (`hw/tolya/alfa-intellect/server/index.ts`) при старте:
- `TEAM_AGENT_URL` не задан → ничего не делает;
- задан и `GET /health` отвечает за 2 с → агент уже поднят, используем его;
- не отвечает и `TEAM_AGENT_AUTOSTART=1` → запускает `python services/agent/server.py` дочерним процессом (python из `TEAM_AGENT_PYTHON`, по умолчанию `python`; порт из URL), ждёт `/health` до 15 с, при остановке кабинета гасит процесс;
- не поднялся → кабинет всё равно стартует, чат отвечает `agent-offline`.
Код положи в новый файл `server/team-agent-process.ts`, в `index.ts` вызов одной строкой. Кроме этой строки Толин код не трогать.

## 3. Журнал

Файл `var/log/team-agent.log` (папка `var/` уже в .gitignore), по одной JSON-строке на событие:
- `agent_start`: ts, url, pid, llm, результат `up` | `down` | `already_up`, причина при `down`, ms до health;
- `agent_exit`: ts, pid, код выхода (агент упал посреди работы → видно когда);
- `agent_turn` (пишет `server.py` в `AGENT_LOG`, по умолчанию тот же файл): ts, session_id, status, llm, ms, `fallback: true`, если страж или ошибка LLM увели в шаблон.
Текст реплик, карточку и ПДн в журнал не писать.
В `/health` добавить `started_at` и `turns` (счётчик).

## Ограничения

Те же, что в первом ТЗ: `guard.py`, `services/ml-model`, Толины `funding-engine.ts` / UI не трогать, `.env` не читать, пакеты не ставить, живые LLM-вызовы в тестах не делать (мок `llm.chat`).

## Приёмка (сначала красный)

- Python: тест на выбор LLM/шаблонов по наличию ключа (мок), тест, что строка `agent_turn` пишется и в ней нет текста реплики.
- TS: `tests/team-agent-process.test.ts`: `already_up`, `down` с причиной при недоступном агенте, кабинет стартует при `down`, событие `agent_exit`.
- Прогоны: pytest (как в первом ТЗ) + `npx tsx --test tests/*.test.ts tests/*.test.tsx`; `server-start.test.ts` красный и на чистом коде Толи, его не чинить.

## Отчёт

Таблица файл → что сделано, последние строки прогонов, что не сделано.
