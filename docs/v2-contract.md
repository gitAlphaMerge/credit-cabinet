# v2: контракт пайплайна заявки (заморожен 23.10 ночью)

Общий для пяти пакетов Codex (P1–P5). Меняется только через Сашу. Пакет, которому стыка не хватает, пишет это в свой `REPORT.md`, а не правит чужой файл.

## Процесс (решение команды 22.10, доска Толи)

```
submit / client_update
  │
  ▼
КОМПЛАЕНС (P1, server/compliance.ts) ── info_requested ──▶ info_requested, скоринг НЕ вызывается
  │ hard_stop ─────────────────────────────────────────────▶ rejected (+ видна менеджеру)
  │ pass
  ▼
СКОРИНГ: ядро Лизы /score (services/ml-model/core.py, никто из P1–P5 его не правит)
  │
  ▼
АНДЕРРАЙТИНГ (P2, server/applications.ts)
  ├─ жёсткий стоп ядра ───────────────────────────────────▶ rejected (+ видна менеджеру)
  ├─ дыры чеклиста (holes), в т.ч. SHORT_STATEMENT ────────▶ info_requested
  ├─ сумма > limit_now_rub, альтернативы есть (P3) ────────▶ info_requested + dossier.alternatives
  └─ зелёная: N = M, стопов нет, сумма ≤ limit_now_rub ───▶ underwriting → approved → offered автоматически, actor system
```

Менеджер получает только красные заявки, три случая:
1. `CLIENT_SILENT`: заявка в `info_requested`, агент написал клиенту (`agent_nudge`), клиент молчит → `escalate_silent` → `queued`.
2. `CLIENT_DISAGREED`: клиент не согласен с альтернативами, агент не переубедил → `escalate_disagreed` (тезисы клиента в досье) → `queued`.
3. `UNDERWRITING_REJECTED`: заявка в `rejected` по стопу; менеджер видит её на вкладке «Отказы» и может связаться (статус не меняется).

## Статусы

Имена 11 статусов в `applications.ts` не меняются: `draft queued info_requested underwriting approved offered signed disbursed rejected expired withdrawn`.

## События (P2 владеет `TRANSITIONS`)

| Событие | Из | Кто | В | Payload |
|---|---|---|---|---|
| `submit` | draft | client/system | offered (зелёная), info_requested, rejected | `{ consent: true }` |
| `client_update` | info_requested | client/system | offered, info_requested, rejected | `{ confirmed_fields?, documents? }` |
| `accept_alternative` | info_requested, queued | client | offered / info_requested / rejected (полный повторный проход) | `{ option_id }` |
| `agent_nudge` | info_requested | system | info_requested | `{ text }` |
| `escalate_silent` | info_requested | system | queued | `{}`, только после `agent_nudge` |
| `escalate_disagreed` | info_requested | system | queued | `{ client_objections: string }` |
| `request_info` | queued | manager | info_requested | `{ hole, text, return_to_manager? }` |
| `send_to_underwriting` | queued | manager | underwriting → approved → offered | `{ option_id? }`, сумма ≤ limit_now_rub, иначе 409 `AMOUNT_EXCEEDS_LIMIT` |
| `reject` | queued | manager | rejected | `{ reason }` |
| `sign`, `disburse`, `expire`, `withdraw` | как сейчас | | | |

## Коды причин

Комплаенс (P1): `COMPLIANCE_INN_MISSING`, `COMPLIANCE_EGRUL_NOT_FOUND`, `COMPLIANCE_EGRUL_INACTIVE` (hard_stop), `COMPLIANCE_EGRUL_MISMATCH`, `COMPLIANCE_FNS_UNRELIABLE`, `COMPLIANCE_FNS_TAX_DEBT`, `COMPLIANCE_BANKRUPTCY` (hard_stop), `COMPLIANCE_AML_REVIEW`, `COMPLIANCE_DOC_EXPIRED`, `COMPLIANCE_DOC_DATE_UNKNOWN`, `COMPLIANCE_SOURCE_UNAVAILABLE`.
БКИ из комплаенса уходит в андеррайтинг (P2): `BKI_OVERDUE_90_PLUS` (hard_stop), `BKI_OVERDUE_30_PLUS` (дыра для менеджера).
Ядро: коды как есть в `core.py` (`stops_fired`, `reasons`, `missing`), P1–P5 их не переименовывают.
Красные: `CLIENT_SILENT`, `CLIENT_DISAGREED`, `UNDERWRITING_REJECTED`. Альтернативы: `LIMIT_EXCEEDED_ALTERNATIVES`.

## Владение файлами

| Пакет | Правит | Только читает |
|---|---|---|
| P1 комплаенс | `server/compliance.ts`, `server/checks.ts`, `server/registry.ts`, `fixtures/checks-mock.json`, `fixtures/egr-mock.json`, `tests/compliance.test.ts`, `tests/checks.test.ts`, `tests/registry.test.ts` | всё остальное |
| P2 машина состояний | `server/applications.ts`, `server/applications-routes.ts`, `tests/applications-*.test.ts`, `docs/application-states.md`, `docs/openapi.yaml` | `compliance.ts`, `alternatives.ts` (типы) |
| P3 альтернативы и экзамен | `server/alternatives.ts`, `tests/alternatives.test.ts`, `data/realistic/check_v3.py`, `data/golden.json`, `data/check_golden.py` | `data/catalog/products.json`, `core.py` |
| P4 агент на Qwen | `services/agent/**`, `server/ai-provider.ts`, `tests/ai.test.ts`, `compose.yaml` и `.env.example` кабинета, корневой `docker-compose.yml`, `README.md`, `THIRD_PARTY_NOTICES.md` | |
| P5 экран менеджера | новые файлы `src/manager/**`, одна строка подключения роли в `src/App.tsx`, `tests/manager-ui.test.tsx` | маршруты P2 |

Пути `server/`, `src/`, `tests/`, `fixtures/` даны от `hw/tolya/alfa-intellect/`.
Файл не в твоей строке = не трогаешь, даже если «очевидно надо». Пиши в `REPORT.md`.

## Возврат менеджеру после досылки (решение 23.10)

`request_info` принимает необязательный `return_to_manager: boolean` (по умолчанию `false`, выставляет только роль manager, иначе 403; не boolean, 422). Флаг живёт на одном цикле запроса: следующий `request_info` без флага его снимает. После досылки (`client_update` или `accept_alternative`) заявка всегда пересчитывается ядром, затем:

- флаг снят, результат зелёный: автоматический оффер без менеджера;
- результат всё ещё красный: `queued`, причина исходной эскалации сохраняется;
- флаг стоит: `queued` при любом результате, вердикт ядра лежит в `core_verdict`, в очереди `return_to_manager=true`.

## Возраст бизнеса во входе ядра (решение 23.10, Q4 #8)

`questionnaire.years` сервер заполняет из реестра (`enrichment.monthsActive`) в словаре ядра (`меньше года`, `1–3`, `3–5`, `5–10`, `более 10`). Нет данных реестра: берётся анкета, переведённая в тот же словарь, и в досье `age.source = "questionnaire"`. Анкета расходится с реестром больше чем на 12 месяцев от границ своего интервала: `age.mismatch = true`, скоринг по реестру.
