# Проверка eval A

Обязательная команда агента:

```text
python -m pytest services/agent/tests -q --ignore=services/agent/tests/test_live_dialog.py
338 passed, 6 subtests passed in 9.73s
```

В Windows-песочнице PYTEST_DEBUG_TEMPROOT перенесён в eval/inspect/.runtime,
JOURNAL_PATH в test-journal.jsonl. Первый запуск упал на системной папке
Temp/pytest-of-s1107: PermissionError. После переноса все 338 тестов зелёные.
Тесты агента и prod-файлы не изменены. `git diff --exit-code` для dialog.py,
llm.py, intake_rules.py, guard.py и services/ml-model/core.py вернул 0.

Проверка измерителя:

```text
services/agent/eval/.venv/Scripts/python -m pytest services/agent/eval/inspect/test_eval.py -q
15 passed in 10.32s
```

Красная регрессия:

```text
python -X utf8 services/agent/eval/inspect/check_loop.py
LOOP REGRESSION: 27/36 dialogs repeat the purpose slot (RED)
exit code 1
```

`--expect-red` возвращает 0 только при воспроизведённом красном наборе >=30 фраз.
Полные две реплики каждого случая: loop-regression.json.

Smoke запускался до полной матрицы на трёх обычных и трёх redteam-персонах.
Статусы и ошибки сохранены в 2026-10-24-smoke-models.md/json. Baseline также
проверен с полностью offline-клиентом, без сетевых вызовов. Исходные .eval
в inspect/logs, исключены из git.

Исправленные ошибки самого измерителя и оставленные свидетельства:

```text
PermissionError: AppData/Local/inspect_ai
Исправлено перенаправлением только Inspect appdirs в eval/.runtime.

TypeError: '>' not supported between instances of 'Epochs' and 'Epochs'
Исправлено использованием публичного task_with(..., epochs=Epochs(...)).

В старом phrases-deepseek нет меток repay_from, data_io.FIELDS содержит четыре поля.
Исправлено: unknown annotation исключена, добавлены 12 позитивных repay-проб.

Зависший HTTP-await при одном config.timeout.
Исправлено: attempt_timeout и внешний asyncio.wait_for; резервы сохранены.

BEFORE FIX: incomplete baseline accepted = True
Исправлено: выбор запрещён, если baseline incomplete. Покрыто тестом.
```

Изменение gate при incomplete baseline не меняет траектории или численные scores;
итоговый отчёт пересобирается из .eval после всех кандидатов. Это проверка
валидности сравнения, не подбор порогов по рейтингу кандидатов.

Локальный коммит не создан: sandbox отказал уже на git add:

```text
fatal: Unable to create 'C:/Users/s1107/projects/credit-cabinet/.git/worktrees/cc-eval-a/index.lock': Permission denied
```

Обход доступа к .git не выполнялся. Все изменения ограничены services/agent/eval.
Пользовательские hw/sasha/eval-common.md и eval-task-a.md не включаются в patch.
Для передачи изменений подготовлен eval-a.patch; git push не выполнялся.
`git apply --check --directory=services/agent/eval/inspect/.runtime/patch-check services/agent/eval/reports/eval-a.patch`
вернул 0. Patch содержит 29 новых файлов eval и исключает пользовательские задания,
ключ, виртуальную среду и локальные .eval/console-логи.

## Итоговая матрица и бюджет

```text
services/agent/eval/.venv/Scripts/python -X utf8 services/agent/eval/inspect/run_matrix.py --workers 16
REPORT services/agent/eval/reports/2026-10-24-models.md
QUALIFIED none
exit code 1: пять строк incomplete из-за API/пустых completion, локальная unavailable

python -X utf8 services/agent/eval/inspect/check_acceptance.py services/agent/eval/reports/2026-10-24-models.json
MATRIX ARTIFACTS OK: 5 evaluated; 108 intake + 48 dialog + 48 redteam attempts per candidate
LOOP RED: 27/36; budget ledger $1.330336 <= $3
MODEL FAILURES/UNAVAILABLE ARE PRESERVED; qualified: none
exit code 0
```

Всего выполнено 1020 samples. Все 108 intake и 96 диалоговых попыток на каждого
из baseline и четырёх удалённых кандидатов сохранены. Неуспех модели не скрывается
за успехом проверки инструмента. У incomplete baseline выбор запрещён; также
кандидаты не проходят ограничения стража/чисел. Сводка и причина каждого провала
есть в JSON, полные ModelEvents и состояния в .eval.

Локальная qwen3:8b и CPU-замер qwen3:14b не измерены: Ollama отвечает, но weights
не установлены, список tags пуст. Hidden не создавался; судьи не откалиброваны
человеческими метками и не определяют победителя.

Полный offline-прогон: exit 0, 108 intake + 48 dialog + 48 redteam, tokens 0,
USD 0. Сравнивать его с LLM-клиентом нельзя; это отдельная проверка работы без LLM.
Отчёт: 2026-10-24-offline-models.md/json.

Проверены 41 декодированный Inspect .eval и все файлы сдачи: настоящий credential
не найден. Секреты в вывод не печатались. Итоговый ledger включает smoke,
прерванные запросы и неизвестные списания, предел $3 соблюдён.
