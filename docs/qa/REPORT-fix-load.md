# F4: документы, вход ядра и память

## Сделано

`hw/tolya/alfa-intellect/server/documents.ts:15`: CP1251 с ASCII-заголовком
терял «Банк» и «ФССП», CSV с `;` не распознавался. Причина: безусловное чтение
CSV как UTF-8 с разделителем по умолчанию. Теперь весь буфер проверяется строгим
UTF-8 decoder, при ошибке декодируется windows-1251; разделитель выбирается по
первой записи вне кавычек. Сохраняются BOM, кавычки, экранирование, CRLF и
переносы внутри ячеек. Два соответствующих BUG-теста были красными и стали
зелёными, их имена переведены в регрессионные.

`server/documents.ts:3,46,164`: 50000 операций плюс заголовок отклонялись.
Причина: предел 700000 символов и счётчик, включавший заголовок. Теперь файл
ограничен 8 MiB, табличные данные 50000 операциями плюс заголовок, лишняя
текстовая копия таблицы не создаётся. Предел нетабличного текста сохранён.
Тест границы 50000 стал зелёным, отдельный тест проверяет отказ на 50001.

`server/documents.ts:6`: Date.parse нормализовал 2026-02-30 в март.
Добавлена проверка обратного ISO-преобразования для выписки и графика.
Исходный BUG-тест стал зелёным; дополнительно проверены високосный день,
невисокосный февраль, 31 апреля и неверный месяц.

`server/app.ts:880`: `/api/team-score` возвращал HTTP 200 на `{}`,
строковый и отрицательный limit_now_rub. Причина: JSON ядра проксировался без
проверки успешного результата. Внутри разрешённого обработчика добавлена
проверка числового конечного неотрицательного лимита и массивов кодов
stops_fired/missing; используется существующая безопасная ошибка 502.
Все три исходных BUG-теста стали зелёными без ослабления assert.
Валидный ответ передаётся без изменения, 150 KiB запрос доходит до ядра,
oversized запрос возвращает 413, malformed JSON/строка/HTTP 500 дают безопасный
502 без содержимого upstream. Это проверено новыми f4-team-score тестами.

`server/documents.ts:118,144,149`: CSV создавал Workbook и копии таблицы,
при старте загружались все документные библиотеки. CSV теперь разбирается
напрямую, библиотеки XLSX/DOCX/PDF импортируются по требованию. Новый QA-инструмент
сравнивает исходную обвязку с отдельным production API-аналогом и выводит
process.memoryUsage по фазам, snapshot V8 и крупнейшие группы объектов/ссылок.
Подробные числа, ограничения и команды: `docs/qa/LOAD.md`.

Исходная нагрузка: 417,97 MiB; после фикса в той же обвязке: 315,17 MiB.
Изолированный сервер: 297,08 MiB до, 278,42 MiB после, 200,12 MiB после с
явным old space 64 MiB. В каждой серии 750/750, три круга. Без настройки запуска
цель памяти НЕ выполнена; настройка Docker не менялась.

`tests/qa/f4-v3.test.ts`: до фикса снят digest результатов/ошибок всех 654
CSV/TXT-файлов data/v3, после фикса он совпал:
71fab4229efeae612f15794c862e94b3b912ba76699a18cfeff5d0df2a2ac632.
Все 654 образца по-прежнему явно отклоняются: новые форматы не добавлялись.
Это проверка совместимости отказов, а не заявление о поддержке грязного 1C.

Итого исходные дефекты F4: 7 красных -> 7 зелёных. Соседний BUG утечки журнала
applications.ts оставлен красным. Новые тесты постоянные, временных тестов нет.

## Доказательства

Все команды ниже из `hw/tolya/alfa-intellect/`, кроме git status/diff,
использованы только установленные зависимости. Сеть не использовалась.

До фикса:

```text
node --import ./scripts/qa/q2-runtime.ts --test tests/qa/q2-dirty-bugs.test.ts tests/qa/q2-boundary-bugs.test.ts
tests 8
pass 0
fail 8
received 200 {}
counterparty: '����' вместо 'Банк'
Missing expected rejection
Слишком большой документ: используйте до 50 000 строк.
```

Семь падений относятся к F4, восьмое к чужому applications.ts.

Регрессии документов/API/данных после фикса:

```text
node --import ./scripts/qa/q2-runtime.ts --test tests/qa/q2-dirty-bugs.test.ts tests/qa/f4-*.test.ts
F4_V3 files=654 accepted=0 rejected=654 digest=71fab4229efeae612f15794c862e94b3b912ba76699a18cfeff5d0df2a2ac632
tests 10
pass 10
fail 0
```

```text
node --import ./scripts/qa/q2-runtime.ts --test tests/documents.test.ts tests/cabinet-documents.test.ts
tests 12
pass 12
fail 0
```

Включены настоящие PDF, DOCX и XLSX из генератора фикстур.

```text
npx.cmd --no-install tsc --noEmit
exit 0, без диагностик
```

```text
npm.cmd test
> tsx --test tests/*.test.ts tests/*.test.tsx
SystemError: uv_os_get_passwd returned ENOMEM
Node.js v24.16.0
```

Полный npm test в штатном tsx не прогнан в песочнице. Прогнан тот же набор через
native QA-loader; для TSX он использует уже установленный esbuild:

```text
node --import ./scripts/qa/q2-runtime.ts --test tests/*.test.ts tests/*.test.tsx
tests 901
suites 4
pass 899
fail 2
```

Два падения: server-start.test.ts сам запускает tsx и падает на ENOMEM;
team-score-size.test.ts:19 возвращает неполный мок `{view:{}}`, ожидая 200.
Теперь это 502 по задаче F4. Тест не разрешён к правке, не менялся;
проверка его полезного сценария с валидным core добавлена в f4-team-score.

Расширенный набор QA с зависимостью от документов/API:

```text
node --import ./scripts/qa/q2-runtime.ts --test tests/qa/q2-*.test.ts tests/qa/f4-*.test.ts tests/qa/q3-server.test.tsx
tests 44
pass 42
fail 2
```

Этот прогон до добавления двух f4-team-score тестов: журнал applications и
известный BUG Q3 про legacy submit, создающий ноль новых v2 applications.
Все q2-faults, q2-profile и q2-dirty, семь исправленных F4-тестов зелёные.
Финальный прогон после всех правок:

```text
node --import ./scripts/qa/q2-runtime.ts --test tests/qa/q2-*.test.ts tests/qa/f4-*.test.ts
tests 38
pass 37
fail 1
BUG: upstream exception must not expose confidential values in server journal
```

Единственное падение здесь: чужой журнал applications.ts. Штатные проверки
документов повторены после финальной правки: 12/12. `npx.cmd --no-install tsc
--noEmit` и `git diff --check` завершились с exit 0. Финальный smoke отдельного
сервера с Q2_HEAP_MB=64: attempted=2, completed=2, errors=[], exit 0.

Дополнительно прогнаны q1-bugs и q4-review-bugs/regressions: их существующие
красные тесты остались красными, assertions и чужие исходники не менялись.

Нагрузка, хвосты (полные команды и фазы в LOAD.md):

```text
node --import ./scripts/qa/q2-runtime.ts scripts/qa/q2-load.ts
Q2_LOAD seed=2302 attempted=750 completed=750 errors=[] rounds=3 peakMiB=315.171875
exit 0
```

```text
Q2_MODE=production, default heap:
Q2_LOAD attempted=750 completed=750 errors=[] rounds=3 peakMiB=278.41796875
exit 1: превышен приёмочный предел 220 MiB
```

```text
Q2_MODE=production, Q2_HEAP_MB=64:
Q2_LOAD attempted=750 completed=750 errors=[] rounds=3 peakMiB=200.12109375 exceedsComposeLimit=false
exit 0
```

Heap snapshot: исходный изолированный сервер, 3 круга, и исправленный
изолированный сервер, диагностический 1 круг. Сырые снимки на диск не записаны.
Диагностика не входит в RSS-приёмку. Агрегаты и ограничения записаны в LOAD.md.

## Не сделано и почему

Не достигнута цель 220 MiB при текущих настройках запуска по умолчанию.
Подтверждён вариант 200,12 MiB с old space 64 MiB, но файлы запуска и compose
вне разрешённой зоны. Не утверждается, что нужна смена архитектуры или что
доказана утечка: GC-политика и нативная память требуют проверки в cgroup.

Не исправлены чужие BUG в applications.ts, UI и комплаенсе, не изменён
некорректный мок в tests/team-score-size.test.ts. Не менялись core.py,
Dockerfile, package.json, compose, контракты, внешние сервисы и лимиты RAM.
Коммиты, push и новые ветки не создавались.

## Нужно от других

`Dockerfile:10`, `package.json:11`, корневой docker-compose.yml: владелец запуска
должен проверить и при подтверждении применить NODE_OPTIONS=--max-old-space-size=64;
на Windows API-аналоге это 750/750 и 200,12 MiB вместо 278,42 MiB, mem_limit 256m
сохраняется. Повторить на постоянной WAL-БД с тёплыми PDF/XLSX/DOCX.

`tests/team-score-size.test.ts:19`: владелец теста должен заменить `{view:{}}`
на валидный ответ ядра с числовым limit_now_rub и массивами stops_fired/missing.
Замороженный контракт: «Ядро: коды как есть в core.py ... их не переименовывают»;
задача F4 явно требует не отвечать 200 с мусором. Тест здесь не ослаблялся.

`server/applications.ts:785`: F2, исключение upstream целиком попадает в журнал;
исходный BUG про SECRET_Q2 остаётся красным.

QA q1-bugs создал временную папку
`hw/tolya/alfa-intellect/tests/qa/q1-sqlite-5kdctr/` с тестовой SQLite.
Это артефакт исполнения чужого теста, не исходник; оставлен, потому что удаление
не разрешено контрактом исполнителя. Остальные правки только в файлах F4 и REPORT.md.

## Не проверено

Штатный npm test через tsx; реальный npm start/Docker/cgroup; постоянная WAL-БД;
точный мгновенный RSS внутри блокирующих операций; длинная серия больше трёх
кругов; смешанная нагрузка с большими PDF/XLSX/DOCX под лимитом 64 MiB old space;
истинный dominator retained size и нативные держатели SQLite/scrypt;
реальные внешние сервисы, LLM и формулы Python-ядра.

Полный набор тестов не является зелёным: причины и конкретные файлы указаны выше.
