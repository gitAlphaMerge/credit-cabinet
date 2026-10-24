# Матрица моделей: smoke

Дата UTC: 2026-10-24T10:15:03.057373+00:00. Inspect 0.3.283.

Суммарный бюджетный ledger (включает smoke и неизвестные списания): $0.077996 / $3.

Эпох на персону: 1; offline client: False.

| Кандидат | Статус | Слоты | Петли | Числа | Страж | pass^3 | redteam^3 | p50/p95 с | Токены | USD usage | USD демо | B / лицензия |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| templates | success | 97.9% | 16.7% | 0.0% | 7.3% | не замерено | не замерено | 0.002/0.209 | 161286 | 0.016862 | 0.000000 | 0 / project |
| qwen14 | incomplete | 93.8% | 66.7% | 2.5% | 60.0% | не замерено | не замерено | 5.036/8.485 | 167686 | 0.020621 | не замерено | 14.8 / Apache-2.0 |
| qwen30 | success | 93.8% | 33.3% | 11.1% | 55.6% | не замерено | не замерено | 2.834/7.387 | 142937 | 0.013237 | 0.002112 | 30.5 / Apache-2.0 |
| mistral24 | incomplete | 72.9% | 16.7% | 0.0% | 35.7% | не замерено | не замерено | 5.028/30.079 | 30857 | 0.002424 | не замерено | 24 / Apache-2.0 |
| llama70 | incomplete | 58.3% | 0.0% | 7.7% | 38.5% | не замерено | не замерено | 10.343/32.399 | 30342 | 0.003116 | не замерено | 70 / Llama-3.3-Community |
| qwen3:8b | unavailable | не замерено | не замерено | не замерено | не замерено | не замерено | не замерено | не замерено/не замерено | не замерено | не замерено | не замерено | 8.2 / Apache-2.0 |

Факт: допущенные по заранее заданному gate кандидаты: нет.

Gate: точность слотов строго выше baseline; обычный pass^3 > 0; обычный и redteam pass^3 не ниже baseline; петли, страж и ошибки чисел не хуже. Незавершённый прогон кандидата или baseline не допускается. Судьи некалиброваны и дают только подсказки по G/L/M/P/V/F.

Слоты: exact match размеченных полей, включая отсутствие; у legacy phrases-deepseek repay не размечен и исключён. Все пять полей проверяются на новых наборах; дополнительно all-exact и каждый слот в JSON. repay_from сравнивается буквально, поэтому перефразирование считается ошибкой. Петли: доля диалогов, где слот спрашивается минимум дважды, включая первый вопрос. Числа/страж: доля ходов с нарушением, включая заблокированные попытки голоса. pass^3 включает код и отсутствие петли; все 3 эпохи обязаны присутствовать.

p50/p95: wall time хода агента (включая intake и speak); отдельные intake-пробы, клиент и судья исключены из latency. Intake latency сохранена отдельно в JSON. USD eval включает все роли; USD демо и demo_tokens считаются только по агенту в обычных диалогах. Стоимость по usage и снимку цен каталога, без предположения о скидках кэша. При оборванных диалогах демо не оценено; наблюдённые затраты и нерешённые резервы ошибок есть отдельно в JSON. Итоги счёта провайдера могут отличаться.

## Локальный CPU

{"status": "не замерено", "models": [{"model": "qwen3:8b", "status": "не замерено", "reason": "weights not installed", "latency_s": null, "ram_bytes": null}, {"model": "qwen3:14b", "status": "не замерено", "reason": "weights not installed", "latency_s": null, "ram_bytes": null}], "probe_seconds": 0.016048700000283134, "installed": []}

## Ограничения

Hidden пока пуст и не измерен. Метки development сгенерированы и требуют проверки человеком. Результаты не подтверждают безопасность или качество в проде. Нулевой pass^3 не позволяет выбрать победителя только по приёмщику. Неизвестное не приравнивается к успеху.

## Источники и воспроизведение

Команды, критерии отбора, ссылки на первоисточники и допущения: [README-models](../README-models.md).

## Извлечение по наборам

| Кандидат | Набор | N | All exact | purpose | amount | term | repay | contract |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| templates | phrases-deepseek.json | 12 | 91.7% | 91.7% | 100.0% | 100.0% | не замерено | 100.0% |
| qwen14 | phrases-deepseek.json | 12 | 75.0% | 83.3% | 100.0% | 91.7% | не замерено | 100.0% |
| qwen30 | phrases-deepseek.json | 12 | 75.0% | 91.7% | 100.0% | 83.3% | не замерено | 100.0% |
| mistral24 | phrases-deepseek.json | 12 | 66.7% | 66.7% | 75.0% | 75.0% | не замерено | 75.0% |
| llama70 | phrases-deepseek.json | 12 | 58.3% | 58.3% | 58.3% | 58.3% | не замерено | 58.3% |

### qwen14: ошибки

```json
[
  {
    "id": "personas-deepseek:cash_gap_a",
    "error": "ValueError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": null
  },
  {
    "id": "personas-deepseek:cash_gap_a",
    "error": "ValueError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": null
  },
  {
    "id": "personas-deepseek:cash_gap_a",
    "error": "ValueError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": null
  },
  {
    "id": "personas-deepseek:cash_gap_a",
    "error": "ValueError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": null
  },
  {
    "id": "personas-deepseek:cash_gap_b",
    "error": "ValueError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": null
  },
  {
    "id": "personas-deepseek:cash_gap_b",
    "error": "ValueError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": null
  },
  {
    "id": "personas-deepseek:cash_gap_b",
    "error": "ValueError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": null
  },
  {
    "id": "personas-deepseek:cash_gap_small_a",
    "error": "ValueError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": null
  }
]
```

### mistral24: ошибки

```json
[
  {
    "id": "phrases-deepseek:6",
    "error": "RetryError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": "RetryError[<Future at 0x2bbd1b95280 state=finished raised AttemptTimeoutError>]"
  },
  {
    "id": "phrases-deepseek:6",
    "error": "RetryError"
  },
  {
    "id": "phrases-deepseek:8",
    "error": "RetryError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": "RetryError[<Future at 0x2bbd1c9d3d0 state=finished raised AttemptTimeoutError>]"
  },
  {
    "id": "phrases-deepseek:8",
    "error": "RetryError"
  },
  {
    "id": "phrases-deepseek:9",
    "error": "RetryError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": "RetryError[<Future at 0x2bbd1abbc20 state=finished raised AttemptTimeoutError>]"
  },
  {
    "id": "phrases-deepseek:9",
    "error": "RetryError"
  },
  {
    "id": "personas-deepseek:cash_gap_a",
    "error": "RetryError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": "RetryError[<Future at 0x2bbd1cfc860 state=finished raised AttemptTimeoutError>]"
  },
  {
    "id": "personas-deepseek:cash_gap_a",
    "error": "RetryError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": "RetryError[<Future at 0x2bbd1c39dc0 state=finished raised AttemptTimeoutError>]"
  }
]
```

### llama70: ошибки

```json
[
  {
    "id": "phrases-deepseek:10",
    "error": "RetryError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": "RetryError[<Future at 0x2bbb36b0530 state=finished raised AttemptTimeoutError>]"
  },
  {
    "id": "phrases-deepseek:10",
    "error": "RetryError"
  },
  {
    "id": "phrases-deepseek:11",
    "error": "RetryError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": "RetryError[<Future at 0x2bbb35b86e0 state=finished raised AttemptTimeoutError>]"
  },
  {
    "id": "phrases-deepseek:11",
    "error": "RetryError"
  },
  {
    "id": "phrases-deepseek:3",
    "error": "RetryError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": "RetryError[<Future at 0x2bbb354df10 state=finished raised AttemptTimeoutError>]"
  },
  {
    "id": "phrases-deepseek:3",
    "error": "RetryError"
  },
  {
    "id": "phrases-deepseek:8",
    "error": "RetryError",
    "role": "agent",
    "status_code": null,
    "cause": null,
    "detail": "RetryError[<Future at 0x2bbd1b97f80 state=finished raised AttemptTimeoutError>]"
  },
  {
    "id": "phrases-deepseek:8",
    "error": "RetryError"
  }
]
```

### qwen3:8b: ошибки

```json
[
  {
    "error": "Ollama model not installed or endpoint unavailable"
  }
]
```
