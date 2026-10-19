# AGENTS.md — кабинет Толи (alfa-intellect)

Сначала прочитай корневой `AGENTS.md` репо, потом этот файл.

## Твоя зона

Кабинет, подбор, документы, UI, `server/funding-engine.ts`, `shared/*`, тесты в `tests/`. Здесь работаешь свободно.

## Зона агента: только чтение (владелец Саша)

Чат кабинета отвечает через агента команды: `TeamAgentProvider` → HTTP → `services/agent` → ядро Лизы.
Вся эта цепочка — **контракт**, его меняет только владелец:

- `services/agent/**` (агент), `services/ml-model/**` (ядро Лизы), `services/api/**` (Артём)
- `server/ai-provider.ts`: класс `TeamAgentProvider` и сборка карточки клиента для агента
- `server/app.ts`: порядок выбора провайдера чата (`TEAM_AGENT_URL` → `OPENAI_API_KEY` → демо)
- `server/team-agent-process.ts` (автозапуск агента и журнал `var/log/team-agent.log`) и строка его вызова в `server/index.ts`
- `tests/team-agent.test.ts`, `tests/team-agent-process.test.ts`

Задача требует правки в контракте → остановись и напиши в отчёт: «нужна правка в зоне агента: файл, что и зачем». Решает Саша.

## Как работать рядом с контрактом

- Карточка агента собирается из `AppState`: `selection`, `documents`, обязательства. Переименовал или убрал такое поле → `tests/team-agent.test.ts` обязан остаться зелёным.
- В карточку агента идут только цель, сумма, срок, инструмент, категории и периоды документов, обязательства. Персональные данные (ИНН, ФИО, телефон, email, название компании, счета) остаются в кабинете.
- Новый тип ответа чата → новый `mode`. `team-agent` и `agent-offline` заняты агентом.
- Готово = `npx tsx --test tests/*.test.ts tests/*.test.tsx` зелёный, включая `team-agent` и `team-agent-process`. `server-start.test.ts` красный и до агента, это не регрессия.
