# Карта рисков

1. Чужая заявка доступна клиенту: утечка финансовых данных; проверка всех application/bank HTTP-маршрутов вторым клиентом (docs/application-states.md:158-160).
2. Одобрение без комплаенса или полного досье: ложная выдача; матрица gate/core/BKI/лимит и воспроизведение журнала (docs/v2-contract.md:16-24).
3. Изменённый профиль или документ во время скоринга: выдача по устаревшим сведениям; управляемая пауза core и изменение users.state (docs/application-states.md:134-142).
4. Двойная подача или конкурентное событие: несколько решений; 24 HTTP-запроса с одной expectedVersion на файловом SQLite (docs/application-states.md:163-165).
5. Повтор запроса меняет результат: потеря идемпотентности; повтор ключа до и после изменения состояния (docs/application-states.md:163-165).
6. Неверный переход или версия журнала: потеря контекста; независимая модель, 500 seeded последовательностей, минимизация провала (docs/application-states.md:116-132,154).
7. Агент не может передать красную заявку: блокировка пути клиента; owned HTTP delegation и internal system (docs/v2-contract.md:27-30; docs/application-states.md:156-161).

# Находки

Ожидания взяты из замороженного контракта и диаграммы, не из реализации. Найдено 5 групп дефектов, 8 адресных красных тестов. Продакшен не исправлялся.

1. **[критично] hw/tolya/alfa-intellect/server/applications.ts:629,674,826,1084.** Изменение профиля или подтверждённой выписки через настоящий HTTP во время ожидания core не инвалидирует результат. Ответ на submit остаётся 200, заявка становится offered по старому входу. Версия applications защищает только саму заявку, а не users.state. Воспроизведение: `q1-bugs.test.ts`, `BUG: changing profile...` / `BUG: changing document...`, без рандома. Пауза core управляется Promise, ожиданий по таймеру нет; PATCH profile и upload/confirm проходят с 200. Логи: `Q1_STALE_PROFILE: HTTP=200 status=offered`, `Q1_STALE_DOCUMENT: HTTP=200 status=offered`. Фикс одной строкой: захватывать ревизию или хеш скорингового входа до await и сравнивать внутри транзакции, при изменении возвращать 409 без записей. Источник: TASK.md Q1.3, docs/application-states.md:134-142,163-165. Зависимости core/compliance здесь синтетические, банковская точность ответа ядра не проверяется.
2. **[важно] hw/tolya/alfa-intellect/server/applications.ts:795, hw/tolya/alfa-intellect/server/applications-routes.ts:163.** Активный writer во втором соединении настоящего файлового SQLite приводит к HTTP 500. Воспроизведение: `BUG: another SQLite writer...`, без рандома: BEGIN IMMEDIATE во втором соединении, HTTP withdraw, ROLLBACK в finally. Логи: `[applications] transaction failed database is locked`, `Q1_SQLITE_CONTENTION: HTTP=500`. Текст SQLite наружу не утекает, но статус нарушает требование Q1.3. Фикс одной строкой: преобразовывать SQLITE_BUSY/SQLITE_LOCKED в повторяемый 409 с ограниченным retry там, где это уместно; синхронное ожидание не должно блокировать event loop.
3. **[важно] hw/tolya/alfa-intellect/server/applications.ts:1072-1080.** Все три owned HTTP delegation события запрещены, хотя docs/application-states.md:156-161 и docs/openapi.yaml:99-106 их разрешают. Воспроизведение: три `BUG: owned client HTTP delegation...`: ожидается 200/system journal, фактически 403, без рандома. Полный model-based HTTP прогон: seed 20261024, scenario gate_info, минимальное воспроизведение `submit(client), agent_nudge(forged system, owned client session)`. Фикс одной строкой: после проверки владения разрешать только три перечисленные делегации клиента и записывать их с system; manager и остальные system-события запрещать. TASK.md Q1.5 запрещает прямую подделку system; здесь проверяется отдельно документированное узкое исключение.
4. **[важно] hw/tolya/alfa-intellect/server/applications.ts:474-481.** request_info с контрактным payload `{hole,text}` возвращает 422 без неописанного в замороженной таблице top-level reason. Воспроизведение: `BUG: request_info accepts contracted hole/text...`, без рандома. docs/v2-contract.md:44 требует hole/text; docs/application-states.md:124 расходится с ним и требует reason. Приоритет у замороженного контракта. Фикс одной строкой: нормализовать reason из payload.text на сервере с валидацией hole/text и привести младшую документацию в соответствие.
5. **[важно, внутренний контракт] hw/tolya/alfa-intellect/server/applications.ts:74-83,464.** Internal system может сам выполнить accept_alternative, хотя docs/v2-contract.md:40 и docs/application-states.md:120 разрешают инициатором только client. Не является HTTP-повышением прав: HTTP роль берётся из БД и это проверено отдельно. Воспроизведение: `BUG: accept_alternative caller...`; model-based seed 20261049, scenario limit, 1-минимальная последовательность `submit(client), accept_alternative(system)`. Фикс одной строкой: разделить авторизацию инициатора и роль persisted event, запретить system как инициатора принятия клиентского варианта.

Таблица persisted edges после нормализации caller preflight совпала с независимой моделью; это не отменяет дефект №5 на границе command/persistence. Журнал событий и версия сверяются после каждого успешного и отклонённого шага.

Повтор ключа с другим телом не является пробелом контракта: docs/openapi.yaml:106,134 явно задаёт 422; проверка проходит.

# Доказательства

- До изменений: `npx.cmd --no-install tsc --noEmit`: exit 0, вывода нет.
- До изменений: `npx.cmd --no-install tsx --test tests/applications-v2.test.ts`: exit 1 до загрузки тестов: `SystemError [ERR_SYSTEM_ERROR]: uv_os_get_passwd returned ENOMEM`; Node.js v24.16.0.

Все следующие команды выполняются из `hw/tolya/alfa-intellect/`. Пакеты не устанавливались, сеть для интеграций не использовалась. Supertest открывает локальный HTTP listener. `q1-loader.ts` использует уже установленный esbuild и Node registerHooks, без подмены os.userInfo и без изменений node_modules. Исходный tsx и `npm.cmd test` по-прежнему падают при запуске из-за ENOMEM.

Зелёные проверки:

```powershell
npx.cmd --no-install tsc --noEmit
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit tests/qa/q1-contract.test.ts tests/qa/q1-regression.test.ts
```

Хвост: `tests 14; pass 14; fail 0; cancelled 0; skipped 0`. Сверка модели: 2 теста. HTTP/SQLite регрессии: 12 тестов. Проверены 24 одинаковых запроса с разными ключами, 24 смешанных события, 24 одинаковых запроса с одним ключом, CAS при конкурентном withdraw из второго соединения, атомарный rollback оффера и retry того же ключа, IDOR всех application/bank маршрутов, актуальная роль БД, gate/core/BKI/лимит и очередь.

Красные адресные проверки:

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit tests/qa/q1-bugs.test.ts
```

Хвост: `tests 8; pass 0; fail 8`, ошибки оставлены с префиксом BUG. Ожидаемые отличия: 200 вместо 409 при смене входа, 500 вместо 409 при lock, 403 вместо 200 при delegation, 422 вместо 200 при request_info, отсутствие ожидаемого rejection для internal accept_alternative.

Model-based прогон:

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit tests/qa/q1-sequences.test.ts
```

Исполнены 500 последовательностей через transitionApplication и ещё 500 через HTTP, длины 1-25, mulberry32, начальный seed 20261023. Все 500 случаев каждого транспорта исполняются даже при находках. HTTP не имеет system account: попытка подделки actorRole использует client-сессию, фактическая роль oracle остаётся client, кроме документированной delegation. Досье синтетическое, скоринг не делает внешних запросов.

```text
internal: seed=20261049; scenario=limit; failures=11/500
1-minimal=[submit(client),accept_alternative(system)]
HTTP: seed=20261024; scenario=gate_info; failures=96/500
1-minimal=[submit(client),agent_nudge(system payload, owned client session)]
tests 2; pass 0; fail 2; cancelled 0; skipped 0
```

Сжатие сохраняет вид провалившегося события и роли, а не заменяет дефект другим. Результат 1-минимален по удалению событий, глобально кратчайшая последовательность не обещается.

Повтор одного seed (после выполнения переменные удалить из своей оболочки вручную):

```powershell
$env:Q1_SEED='20261049'
$env:Q1_CASES='1'
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit tests/qa/q1-sequences.test.ts
```

Мутации:

```powershell
node --experimental-transform-types --import ./tests/qa/q1-loader.ts tests/qa/q1-mutations.ts
```

Baseline 12/12 зелёный; по одной применены 10 заданных вручную замен. После каждой восстановлен исходный Buffer в finally, SHA-256 восстановления сверяется. Ошибка компиляции/запуска или timeout не засчитывается как kill, требуется assertion. Итог `KILL_RATE=10/10 (100%)`, exit 0. Полный `git diff -- server` после прогона пустой.

| № | Файл:строка | Поломка | Покрасневший тест | Итог |
|---|---|---|---|---|
| M1 | server/applications.ts:470 | убрать проверку consent | missing consent | killed, 200 вместо 422 |
| M2 | server/applications.ts:326 | убрать ownership | IDOR | killed, 200 вместо 404 |
| M3 | server/applications.ts:116 | убрать actor === role | HTTP ignores | killed, 200 вместо 403 |
| M4 | server/applications.ts:759 | не направлять excessive amount на alternatives | gate/core/BKI/limit | killed, 409 вместо успешного info_requested |
| M5 | server/applications.ts:748 | игнорировать hard core stops | gate/core/BKI/limit | killed, 409 вместо успешного rejected |
| M6 | server/applications.ts:746 | игнорировать BKI90 reject | gate/core/BKI/limit | killed, info_requested вместо rejected |
| M7 | server/applications.ts:1046 | не сверять request_hash | exact response replay | killed, 200 вместо 422 |
| M8 | server/applications.ts:1083 | убрать ранний replay | exact response replay | killed, 409 вместо 200 |
| M9 | server/applications.ts:880 | version +2 вместо +1 | gate/core/BKI/limit | killed, version 7 вместо 4 |
| M10 | server/applications-routes.ts:26 | роль всегда manager | IDOR | killed, submit 403 вместо 200 |

M4/M5 пойманы и нижним защитным guard, это полезный отказ с rollback, а не доказательство ложного одобрения. В живом коде эти guards сохранены. Выживших мутантов нет.

Пять последовательных повторов каждого зелёного файла, без мутаций: объединённая команда выше исполнена 5 раз, каждый раз `tests 14; pass 14; fail 0`, `REPEAT=1..5 EXIT=0`. Красные BUG-файлы флаки-проверкой зелёных не объявляются.

Общая регрессия:

```powershell
npm.cmd test
node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit --test-concurrency=2 tests/*.test.ts tests/*.test.tsx
```

`npm.cmd test`: exit 1, `uv_os_get_passwd returned ENOMEM`, тесты не загружены. Через запасной loader существующие проверки прошли, кроме двух инфраструктурных отказов: server-start.test.ts запускает дочерний `--import tsx`, снова ENOMEM; team-agent-process.test.ts заканчивается native assertion `!(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:94`. Отдельный повтор последнего подтверждает `tests 4; pass 3; fail 1` после трёх успешно исполненных assertions. Общая регрессия полностью зелёной не считается. Чужие тесты не менялись.

Runtime SQLite базы с синтетикой оставлены в `tests/qa/q1-sqlite-*/applications.sqlite`: контракт исполнителя запрещает удаление файлов. Они не являются исходниками к переносу. Каждая база печатает свой абсолютный путь, в before проверяется PRAGMA database_list; :memory: не используется. Существующие тесты общей регрессии имеют собственные механизмы временных каталогов.

# Числа

Нагрузочных замеров p50/p95/max и RSS нет; длительности node:test не выдаются за latency продукта. Есть 1000 случайных сценариев, по 24 запроса в трёх конкурентных проверках, 10 мутаций, 5 повторов двух зелёных файлов. Seeds и команды выше.

# Нужно от других

Владелец P2: исправить №1-5 отдельной волной, затем переснять красные тесты. Для №1 потребуется согласованный механизм ревизии входа на стороне profile/document writes, этот файл вне зоны Q1. Саше: разрешить расхождение request_info между замороженной таблицей и младшим документом, а также согласовать internal caller policy accept_alternative. Архитектору: независимо прогнать команды, не принимать работу по этому отчёту. REPORT.md исключён текущим git info/exclude; файл существует локально, для переноса его нужно забрать явно.

# Не проверено

Реальный HTTP слой использован, но физическое состязание двух отдельных OS-процессов не измерялось: HTTP конкурирует в одном Node event loop, отдельное SQLite-соединение проверяет CAS и lock. Нет proof полноты state space от 500 случайных последовательностей. Scoring/compliance/BKI подменены управляемыми синтетическими зависимостями, ядро Лизы, внешние сервисы, UI и LLM не проверялись. Никаких скрытых данных, .env, ключей или team-accounts.txt не читалось. Полный npm regression остаётся ограничен двумя ошибками среды выше. Новые зависимости, коммиты, ветки и push отсутствуют.
