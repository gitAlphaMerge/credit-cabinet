# Сделано

F5, 23.10.2026. Изменены только `services/agent/**` и этот отчёт. Сеть, установка пакетов, коммиты и изменение веток не использовались.

`services/agent/guard.py:18`: сравнение подстрок исходного текста пропускало смешанный алфавит, транслитерацию и разделители. Добавлены NFKC, приведение регистра, транслитерация латинских слов, замена визуально похожих символов и нуля, удаление невидимых символов, повторов и разделителей. Правила решения применяются к нормализованному тексту. Отрицание учитывается локально, поэтому оговорка об отсутствии гарантий не разрешает другое утвердительное обещание в той же реплике. Красные Q4 `approval_obfuscated` и `injection` стали зелёными. Дополнительный тест сначала показал три пропуска: «Кредит одобрен!», «Кредит гарантирован.», «Вам о.д.о.б.р.е.н.о!». После исправления все девять дополнительных вариантов блокируются.

`services/agent/guard.py:47,100`: Q4 также обнаружил непроверенные словесные суммы, проценты и сроки. Словесные числа переводятся в числовую форму перед существующей проверкой происхождения значений; ставка и срок дополнительно проверяются по соответствующим данным, обещания времени выдачи запрещаются. Число 12 из срока не разрешает выдуманную ставку 12%. Сохранены проверки подтверждённых процентов в причинах ядра и допустимых чисел из клиента. Все 60 враждебных Q4 проходят настоящий `dialog.turn` с фейком `speak`, получают нарушение и безопасный шаблон вместо кандидата. Результат: было 38/60 пойманных, стало 60/60.

`services/agent/privacy.py:32`, `services/agent/server.py:99`: сохранение сессии раньше сериализовало свободный текст без маскирования. Теперь перед атомарной записью строится отдельный рекурсивно очищенный снимок всей сессии, включая history, trace, поля и возражения. Маскируются ИНН 10/12 цифр, телефоны с разделителями, email и счета 20 цифр. ФИО берётся из значений профиля/анкеты; явная подпись «ФИО» также задаёт известное значение. Общая эвристика «два слова с большой буквы» не используется для сохранения. Все 12 красных Q4 проверок history/trace стали зелёными.

`services/agent/server.py:284`, `services/agent/privacy.py:14`: значения ФИО из карточки превращаются в отпечатки для последующего маскирования, включая следующие ходы без повторной передачи профиля. Открытые ФИО не добавляются в состояние сессии и контекст модели. Снимок очищается без изменения ответа клиенту и оперативной истории; дополнительный тест проверяет точное равенство живого ответа исходному тексту, очистку вложенных полей и следующий ход без профиля.

`services/agent/dialog.py:216`: дополнительная причина утечки ИНН в trace была в intake: идентификатор принимался за запрошенную сумму. При обнаружении личных данных бизнес-поля теперь извлекаются из очищенного текста. Сохранена обработка обычных бизнес-полей, включая случай, когда только LLM пометила намерение как pii. Проверены соответствующие прежние регрессии и новый тест `test_private_identifier_is_not_a_financial_slot`.

`services/agent/tests/qa/test_f5_safety.py:30`: добавлен корпус из 51 безопасной фразы, в том числе 46 различных реальных фраз из QUESTIONS, RETRY_QUESTIONS, STAGES, констант и ответов `_answer`, а также макетов ClientAlternative/ManagerMemo. Ложных срабатываний: 0/51. Существующие Q4 ассерты сохранены, из имён исправленных тестов и идентификаторов параметров убран `BUG:`. Пропусков, xfail и ослабления ассертов нет.

# Доказательства

Команды Python выполнялись из корня репозитория. `--basetemp` нужен из-за недоступной стандартной временной папки Windows; `-p no:cacheprovider` отключает кэш pytest.

До фиксов:

```text
python -X utf8 -m pytest services/agent/tests/qa -q --basetemp=services/agent/.pytest-f5-baseline -p no:cacheprovider
FAILED ...test_q4_guard_bugs.py::test_BUG_hostile_answer_must_not_reach_customer[BUG:approval_obfuscated:1]
AssertionError: ('approval_obfuscated', 'Вам 0добрено.', 'Вам 0добрено.')
FAILED ...test_q4_pii_bugs.py::test_BUG_12_private_values_must_not_persist[fio-trace-application-objections]
36 failed, 44 passed in 1.46s
```

Дополнительные красные тесты до последнего исправления нормализации:

```text
python -X utf8 -m pytest services/agent/tests/qa/test_f5_safety.py -q --basetemp=services/agent/.pytest-f5-extra-red -p no:cacheprovider
FAILED ...test_normalized_approval_promises_are_blocked[Кредит одобрен!]
FAILED ...test_normalized_approval_promises_are_blocked[Кредит гарантирован.]
FAILED ...test_normalized_approval_promises_are_blocked[Вам о.д.о.б.р.е.н.о!]
3 failed, 60 passed in 0.57s
```

Полный набор агента, LLM отключена переменной окружения, внешние ответы подменены тестовыми слотами:

```powershell
$env:AGENT_LLM_URL=' '
python -X utf8 -m pytest services/agent/tests -q --basetemp=services/agent/.pytest-f5-final -p no:cacheprovider
```

```text
.................................................................. [100%]
426 passed, 6 subtests passed in 9.23s
```

После удаления BUG из имён отдельно перепроверен весь QA:

```powershell
$env:AGENT_LLM_URL=' '
python -X utf8 -m pytest services/agent/tests/qa -q -s --basetemp=services/agent/.pytest-f5-qa-final -p no:cacheprovider
```

```text
Q4_GUARD_RATES={"approval": [6, 6], "approval_obfuscated": [6, 6], "injection": [6, 6], "invented_numbers": [6, 6], "length": [6, 6], "percent": [6, 6], "pii": [6, 6], "questions": [6, 6], "word_money": [6, 6], "word_term": [6, 6]}
Q4_MUTATION=guard.py:104 forbidden killed
Q4_MUTATION=guard.py:106 jargon killed
Q4_MUTATION=guard.py:125 stop_reason killed
Q4_MUTATION=guard.py:127 pii killed
Q4_MUTATION=guard.py:129 length killed
Q4_MUTATION=guard.py:133 empty killed
Q4_MUTATION=guard.py:137 numbers killed
Q4_MUTATION=guard.py:141 questions killed
Q4_MUTATION=guard.py:15 tolerance killed
Q4_PII_SCAN: chat, matches={"history": [], "trace": [], "agent.log": []}
Q4_PII_SCAN: application-objections, matches={"history": [], "trace": [], "agent.log": []}
143 passed in 1.58s
SAFE_CORPUS: 51 phrases; 46 distinct real phrases; 0 false positives
```

TypeScript, из `hw/tolya/alfa-intellect/`, локальный установленный компилятор без npx и сети:

```text
node node_modules/typescript/bin/tsc --noEmit
exit code 0, вывод пустой
```

Обязательный общий JS-прогон, из той же папки:

```text
npm.cmd test
> tsx --test tests/*.test.ts tests/*.test.tsx
SystemError [ERR_SYSTEM_ERROR]: A system error occurred: uv_os_get_passwd returned ENOMEM (not enough memory)
code: 'ERR_SYSTEM_ERROR'
syscall: 'uv_os_get_passwd'
Node.js v24.16.0
exit code 1
```

`git diff --check`: exit code 0, вывод пустой.

# Не сделано и почему

Общий `npm test` не прогнан в песочнице: загрузчик tsx завершается с `uv_os_get_passwd ENOMEM` до исполнения тестов. Согласно TASK.md выполнен обязательный tsc, runtime-приёмка JS остаётся архитектору. Новые зависимости и обходы системных ограничений не добавлялись.

# Нужно от других

F2: `hw/tolya/alfa-intellect/server/applications.ts:807`, `eventPayload`: удаляются только структурные ключи, свободный `client_objections` остаётся без маскирования. Нужна очистка свободного текста до записи application_events; файл не изменён.

# Не проверено

Реальная LLM, внешние интеграции, браузерный стенд и JS runtime-тесты не проверялись. Качество правил измерено на указанных фиксированных корпусах, это не доказательство распознавания любых возможных обещаний или вариантов ПДн. ФИО без значения в профиле и без явной подписи «ФИО» намеренно не угадывается по заглавным буквам. Старые файлы сессий не переписывались пакетно; маскирование выполняется при следующем сохранении.
