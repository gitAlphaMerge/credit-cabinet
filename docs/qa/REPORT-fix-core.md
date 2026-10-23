# Сделано

F2, ветка `codex/fix-core`. Изменены только разрешённые исходники, QA-тесты и этот отчёт. Сети, установки зависимостей, коммитов и новых веток не было.

19 исходных красных QA-проверок стали зелёными: Q1 8/8, исправляемая часть Q4 10/10, upstream journal Q2 1/1. Добавлены 14 регрессионных проверок F2. Префикс `BUG:` снят только у исправленных Q1/Q4; ассерты исходных QA не менялись. Q2-тест остался с прежним именем, поскольку его файл не входит в разрешённые для записи.

`hw/tolya/alfa-intellect/server/applications.ts:467,698,978` · Q1 #1, Q4 #1: раньше изменение профиля или подтверждённой выписки на ожидании ядра завершалось HTTP 200/offered. CAS заявки не защищал `users.state`. Теперь профиль, подтверждённые документы и закреплённая версия подбора хешируются до первого await; вход ядра строится из того же снимка. Хеш повторно проверяется под BEGIN IMMEDIATE до первой записи. Изменение даёт 409, без нового досье, событий или idempotency-cache. Чат и неподтверждённая загрузка хеш не меняют. Два Q1 и два Q4 теста гонок были красными и стали зелёными; F2 дополнительно проверяет все девять сочетаний submit/client_update/accept_alternative с изменением на compliance/core/BKI и повтор того же ключа после нового расчёта.

Выбран именно отказ 409 с повтором клиентом. Основания: `docs/application-states.md:142`, "Async calls happen before BEGIN IMMEDIATE; CAS is checked again inside the transaction."; строки 164-165, "Response cache, dossier, parameter changes and all cascade events commit atomically. Stale concurrent updates get 409 and cannot create another offer." Замороженный `docs/v2-contract.md:16-24` требует комплаенс, затем скоринг и только затем автоматический оффер зелёной заявки. Автоматически использовать результат по старому входу нельзя.

`server/applications.ts:893,923` · Q1 #2: BEGIN IMMEDIATE при втором writer выбрасывал сырой SQLite error и HTTP 500. Теперь SQLITE_BUSY/LOCKED, включая extended errcode, преобразуются в ApplicationError 409. Асинхронные команды делают максимум три попытки с паузами 10 и 20 мс через timers/promises; скоринг выполняется один раз. Синхронный busy_timeout равен нулю. Создание заявки сохраняет синхронный API и при contention сразу даёт 409. Q1 writer-test: 500 -> 409; F2 показывает, что освобождение writer через event loop позволяет закончить единственный оффер без повторного скоринга.

`server/applications.ts:1254` · Q1 #3: три разрешённые делегации клиента раньше получали 403. После проверки владения только agent_nudge/escalate_silent/escalate_disagreed преобразуются в внутреннюю system-команду; ключ replay остаётся привязан к исходному пользователю. Менеджеру такая делегация запрещена. Все три красных Q1-теста стали зелёными.

`server/applications.ts:553,991` · Q1 #4: request_info требовал неописанный top-level reason. Теперь принимает контрактные hole/text, текст становится reason журнала. Старый reason поддерживается. Дополнительный F2-тест воспроизвёл пустой legacy reason: ожидался текст, сохранялась пустая строка; после нормализации он зелёный. Приоритет источника: `docs/v2-contract.md:44` задаёт `{ hole, text }`; более старое описание `docs/application-states.md:124` требует reason и ему противоречит.

`server/applications.ts:540` · Q1 #5: system мог инициировать accept_alternative. Теперь инициатор только client, а события результата по-прежнему принадлежат system. Таблица persisted transitions и публичные экспорты сохранены. Красный Q1-тест стал зелёным.

`server/applications.ts:399,480,487,709,1098` · Q4 #4: принятие ALFA_RCL_UNSEC пересчитывалось как исходный «кредит» и создавало аннуитет под 24%. Теперь принятый вариант сохраняется в checks._v2.acceptedAlternative, product_id передаётся в asked_for; ставка берётся из серверной альтернативы, способ погашения из data/catalog/products.json. Для revolving месяцы содержат проценты, основной долг возвращается последним платежом. Все три Q4-теста стали зелёными. F2 дополнительно проверяет сохранение условий после info_requested/client_update, 5875 рублей первого платежа, ставку 0.235 и сумму погашения principal 300000.

`server/compliance.ts:238`, `server/applications.ts:729` · Q4 #7: старая неподтверждённая выписка портила freshness свежей подтверждённой. Оба пути теперь проверяют подтверждённые документы; отдельный красный Q4-тест стал зелёным, старые тесты срока годности проходят.

`server/applications.ts:455,862` · Q4 #9: цель нормализовалась только для ядра, альтернативы получали UI-строку. Одна существующая таблица соответствий теперь используется обоими путями. «Развитие» и «Исполнение контракта» дают те же реальные варианты каталога, что «рост» и «закупка под контракт». Обе красные проверки зелёные; новые цели не добавлялись.

`server/applications.ts:883,933`, `server/applications-routes.ts:168` · Q2: upstream error.message попадал в журнал. Вместо него журналируется фиксированный код и разрешённый класс ошибки, без исходного текста/name/code. Отдельный красный upstream exception test стал зелёным; обработка 503 и диагностическая строка сохранены.

`server/applications.ts:958,1042` · Q4 #12: свободный текст возражений сохранял тестовые ИНН, телефон и ФИО. Перед записью строк payload скрываются длинные цифровые реквизиты, email и точное имя из профиля. Исходный рекурсивный фильтр структурных ключей сохранён. Q4_PII_SCAN теперь `[]`; все три мутации структурного фильтра также убиты. Это ограниченный фильтр известных форматов, не универсальный распознаватель ПДн.

`tests/applications-live.test.ts:48,170` · Q4 #15: scalar-сравнение отвергало массив допустимых golden instruments. Проверяется вхождение в массив, старый scalar поддерживается. Красный Q4-тест зелёный; отрицательный контроль F2 отвергает продукт вне массива. Настоящее live-ядро для проверки оракула не запускалось.

# Доказательства

Все команды ниже выполнялись из `hw/tolya/alfa-intellect/`. QA-loader уже был в репозитории: он использует установленный esbuild без новых пакетов и без патчей продукта.

До фиксов:

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit tests/qa/q1-bugs.test.ts tests/qa/q4-review-bugs.test.ts
```

Хвост: `tests 20; pass 0; fail 20; skipped 0`. В выводе: `Q1_SQLITE_CONTENTION: HTTP=500`, `Q1_STALE_PROFILE: HTTP=200 status=offered`, `Q1_STALE_DOCUMENT: HTTP=200 status=offered`. Q4 rate: `0.24 !== 0.235`, repayment: `53557.74 !== 5875`.

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit --test-name-pattern 'upstream exception' tests/qa/q2-boundary-bugs.test.ts
```

До: `tests 1; pass 0; fail 1`, журнал содержал SECRET_Q2 и синтетический номер счёта. После: `tests 1; pass 1; fail 0`.

Финальная типизация:

```powershell
npx.cmd --no-install tsc --noEmit
```

Exit 0, вывода нет.

Финальная адресная регрессия:

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit tests/qa/q1-bugs.test.ts tests/qa/q1-contract.test.ts tests/qa/q1-regression.test.ts tests/qa/q4-review-regressions.test.ts tests/qa/f2-core.test.ts tests/qa/f2-writer.test.ts
```

Хвост: `tests 43; pass 43; fail 0; cancelled 0; skipped 0; duration_ms 5733.997`.
Логи: `Q1_SQLITE_CONTENTION: HTTP=409`, обе строки `Q1_STALE_*: HTTP=409 status=draft`. Три `Q4_MUTATION ... killed`.

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit --test-name-pattern '#1 |#4 |#7 |#9 |#12 |#15 ' tests/qa/q4-review-bugs.test.ts
```

Хвост: `tests 10; pass 10; fail 0; cancelled 0; skipped 0; duration_ms 3921.9837`. `Q4_PII_SCAN=application_events.payload []`. Это отдельно выделенная исправленная часть; полный Q4-файл тоже прогонялся и имеет 10 pass/2 fail, без изменения/skip оставшихся тестов.

Модельные последовательности:

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit tests/qa/q1-contract.test.ts tests/qa/q1-regression.test.ts tests/qa/q1-sequences.test.ts tests/qa/q4-review-regressions.test.ts
```

Исполнены все 1000 последовательностей с исходным seed 20261023, по 500 на internal и HTTP. Хвост: `tests 23; pass 21; fail 2; skipped 0`. У каждого транспорта осталось `failures=2/500`, всего 996/1000 без расхождений. Минимальный пример: seed 20261198, scenario limit, `submit(client), escalate_disagreed(system), send_to_underwriting(manager)`. Модель безусловно запрещает send_to_underwriting, хотя payload содержит разрешённый option_id с суммой в пределах лимита. Подробность ниже; зелёным этот прогон не объявляется.

Мутации, выполнялись отдельно от других тестов и с восстановлением точных байтов:

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts tests/qa/q1-mutations.ts
```

Хвост: `M1 ... KILLED` ... `M10 ... KILLED`; `KILL_RATE=10/10 (100%)`, exit 0. Baseline 12/12 зелёный. Мутации consent, ownership, role, amount/limit, hard core stop, BKI90, idempotency hash, replay, version increment и router role убиты assertions. После прогона восстановление SHA-256 проверено самим runner; role guard присутствует в финальном файле.

Обязательная общая проверка:

```powershell
npm.cmd test
```

Exit 1 до загрузки тестов: `SystemError [ERR_SYSTEM_ERROR]: uv_os_get_passwd returned ENOMEM`, Node v24.16.0. Штатный npm test не прогнан в песочнице.

Повтор тех же globs с запасным loader:

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit --test-concurrency=2 tests/*.test.ts tests/*.test.tsx
```

Хвост: `tests 893; suites 4; pass 887; fail 6; cancelled 0; skipped 0; duration_ms 68068.5753`. Четыре fail в applications-v2.test.ts требуют запрещать контрактную HTTP-делегацию. Ещё два: server-start.test.ts запускает tsx в дочернем процессе и падает на ENOMEM; team-agent-process.test.ts завершается native assertion `!(handle->flags & UV_HANDLE_CLOSING), src/win/async.c:94`. Все остальные baseline-проверки прошли; полной зелёной регрессии нет.

Широкий QA-прогон, кроме отдельно исполненных sequences:

```powershell
$f2QaFiles = Get-ChildItem tests/qa -File | Where-Object { $_.Name -match '\.test\.tsx?$' -and $_.Name -ne 'q1-sequences.test.ts' } | ForEach-Object { $_.FullName }
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit --test-concurrency=2 $f2QaFiles
```

Хвост на момент прогона: `tests 116; pass 105; fail 11; cancelled 0; skipped 0; duration_ms 62611.4737`. После этого добавлена и отдельно проверена четырнадцатая F2-регрессия пустого reason; финальный адресный набор 43/43 приведён выше. Все оставшиеся QA-падения: 3 team-score boundary в app.ts, 4 dirty-document в documents.ts, 1 Q3 visible legacy submission, Q4 #8/#11 и Q5 S-manager со старым оракулом возврата к менеджеру.

```powershell
node node_modules/prettier/bin/prettier.cjs --check server/applications.ts server/applications-routes.ts server/compliance.ts tests/qa/f2-core.test.ts tests/qa/f2-writer.test.ts
git diff --check
```

Хвост Prettier: `All matched files use Prettier code style!`, exit 0. diff --check: exit 0. Live-файл и исходные QA не переформатировались целиком: у них только адресная правка оракула/имён.

# Не сделано и почему

Q4 #8 оставлен красным по прямому указанию TASK.md: приоритет реестра над анкетой должен выбрать Саша.

Q4 #11 не исправлен: отсутствующий контекст заявки/objections mode собирается в запрещённом для F2 server/app.ts.

Модель Q1 оставлена без изменения. `tests/qa/q1-sequences.test.ts:68` безусловно запрещает send_to_underwriting; `docs/v2-contract.md:45` прямо разрешает менеджеру `{ option_id? }` при сумме в пределах limit_now_rub. Существующий `tests/applications-v2.test.ts`, FIX-A3, отдельно подтверждает этот путь и проходит. Это конфликт оракула, а не основание запретить контрактный переход. Требование TASK.md об ошибочном QA: оставить тест и описать противоречие выполнено.

Не исправлены четыре старых baseline-теста HTTP delegation: они требуют 403 там, где `docs/application-states.md:156-161` разрешает owned client delegation. TASK F2 прямо требует исправить Q1 #3. Менять applications-v2.test.ts не разрешено.

Q5 S-manager требует queued после полных новых данных. Это противоречит решению 23.10 из TASK.md и `docs/v2-contract.md:17-24`: зелёная заявка после client_update автоматически получает offered. Оракул не менялся.

# Нужно от других

Архитектор: согласовать исправление оракула `tests/qa/q1-sequences.test.ts:68` с разрешённым manager option_id; сохранённые seeds и минимальная последовательность выше.

Владелец baseline-тестов: `tests/applications-v2.test.ts:419,437` (блоки nudge/FIX-A7) привести требования 403 к документированной узкой делегации клиента.

Владелец F5: `server/app.ts`, обработчик `/api/chats/:id/messages`, добавить принадлежащую клиенту application и objections mode; Q4 #11 остаётся красным.

Владельцы соседних участков: team-score boundary в `server/app.ts`, dirty CSV/date/row-limit в `server/documents.ts`, связка visible submission с v2 в `server/funding-routes.ts`. Чужие файлы не менялись.

Владелец Q5: `tests/qa/q5-jury-path.test.ts:163` привести к принятому автоматическому офферу после зелёного client_update.

Архитектор: независимо прогнать npm test вне песочницы и проверить известные native/process ошибки среды.

# Не проверено

Live /score, реальное ядро Лизы, браузерный e2e, Docker и банковская точность расчётов не проверялись. Основные проверки используют настоящее приложение/SQLite с детерминированными зависимостями скоринга. Проверка live-оракула выполняет настоящий helper в VM, без обращения к live-сервису.

Полная общая регрессия не зелёная по перечисленным причинам; приёмку задачи целиком зелёной объявлять нельзя. Проверка 1000 последовательностей не доказывает полноту пространства состояний. Kill rate относится только к десяти заданным мутациям.

Фильтр текста payload закрывает проверенные маркеры, но не обещает распознавание любого написания ФИО/телефона. Приоритет источников Q4 #8 намеренно не менялся.

Файловые SQLite-артефакты существующих Q1-harness остаются в `tests/qa/q1-sqlite-*/applications.sqlite`. Удаление не выполнялось; это runtime-артефакты тестов, не исходники для переноса. `.env`, ключи, team-accounts.txt и data/hidden не читались.
