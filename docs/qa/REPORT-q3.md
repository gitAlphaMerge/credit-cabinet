# Карта рисков

| Отказ | Цена | Как поймаю | Источник |
|---|---|---|---|
| Клиент получает банковскую очередь или чужое досье | Раскрытие клиентских данных | Реальные HTTP-запросы с client cookie и подменой заголовков | docs/v2-contract.md:25,44 |
| UI показывает успешную подачу без запуска v2-конвейера | Заявка потеряна для банка | Кнопка оформления, затем GET /applications и журнал submit | .codex-ctx/case.txt:100-104; docs/v2-contract.md:38 |
| Менеджер отправляет сумму сверх лимита или действует по отказу | Ложное одобрение | Границы лимита и все не-queued статусы | docs/v2-contract.md:22,45 |
| Три кнопки менеджера посылают несовместимый payload | Заблокирована ручная обработка | Обработчики форм -> sendManagerEvent -> supertest -> реальная БД | docs/v2-contract.md:44-46 |
| Ошибка сети или 4xx теряется | Непонятный исход действия, повторная отправка | Ошибка транспорта и текст ответа проходят до role=alert | .codex-ctx/case.txt:81-82; TASK.md, Q3 п.2 |
| UI выдумывает N/M или скрывает недоступный источник | Неверная оценка досье | Серверные N/M, compliance unavailable и пустые поля | docs/v2-contract.md:22,25; TASK.md, жёсткие правила п.5 |
| Кнопка или поле недоступны с клавиатуры | Невозможен путь клиента | Имена контролов, связанные ошибки, Tab/Enter в CDP | TASK.md, Q3 п.2-3 |

## Карта экранов и путей

Обозначения состояний: П = пусто, З = загрузка, С = ошибка сети, 4 = ошибка 4xx с текстом, У = успех. Для статического лендинга сетевые состояния неприменимы. Общий владелец загрузки state/config и ошибок act: src/App.tsx. Пути src/ и server/ ниже от hw/tolya/alfa-intellect/.

| Маршрут / экран | Файл | Обязательные состояния и проверка | Источник |
|---|---|---|---|
| / | src/Landing.tsx | У: вход и анкета; доступные CTA | case.txt:81-82; TASK.md Q3 |
| /login, /onboarding | src/Onboarding.tsx | П: незаполненные поля; З: busy; С/4: alert; У: onAuth | case.txt:100-104; TASK.md Q3 |
| /cabinet, /cabinet-v2, /efficiency | src/CabinetV2.tsx, src/WorkspaceView.tsx | П: нет кредита/платежей; З: App loading; С/4: App toast; У: показатели и график | case.txt:81-82,100-104 |
| /financing | src/Financing.tsx | П: новая задача/история; З: расчёт/сохранение; С/4: funding-error; У: результат и подача в v2 | case.txt:100-104; v2-contract.md:38 |
| /chat | src/Chat.tsx, src/ChatComposer.tsx | П: нет сообщений; З: sending/uploading; С/4: App toast; У: сообщение и история | case.txt:81-82; TASK.md Q3 |
| уведомления | src/NotificationCenter.tsx | П: нет уведомлений; З: busy mark; С/4: App act toast; У: read/open | case.txt:81-82; TASK.md Q3 |
| /profile | src/Profile.tsx | П: нет документов/ИНН; З: lookupBusy; С/4: lookupError; У: кандидат/профиль | case.txt:100-104; TASK.md Q3 |
| /bank, очередь и отказы | src/manager/ManagerWorkspace.tsx | П: нет красных/отказов; З: очередь/досье; С/4: alert + retry; У: досье, три действия | v2-contract.md:25-28,44-46 |
| /bank под client | src/App.tsx, src/manager/ManagerWorkspace.tsx | Вкладка скрыта; экран отказа; API 403 | v2-contract.md:25,44-46 |

# Находки

[критично] `hw/tolya/alfa-intellect/src/Financing.tsx:590`, `server/funding-routes.ts:110,171`: видимая кнопка «Отправить заявление» успешно создаёт только legacy `funding_applications` и lead, не создаёт заявку v2 и не запускает submit. Пользователь до банковского конвейера не доходит. Источник оракула: `.codex-ctx/case.txt:100-104`, `docs/v2-contract.md:38`. Воспроизведение: `q3-server.test.tsx`, `BUG: Q3 visible client submission must enter v2 and expose a submitted application`, seed неприменим. Настоящий обработчик кнопки вызывает настоящий HTTP-сервер, тот возвращает 200; до и после GET /api/applications содержит 4 записи, ожидается 5. Фикс: связать оформление с POST /applications и событием submit с согласием, показать результат v2 вместо одного legacy lead; контракт согласия сохранить. Продакшен не исправлялся.

Ограничение доказательств: CDP-смоук подготовлен, но по TASK.md запуск в песочнице не выполняется. Достижимость клавиатурой, имена всех контролов во всех модальных окнах, порядок Tab, реальные 390/1440 и отсутствие overflow пока не приняты. Это не подтверждённый дефект продукта.

Три действия менеджера, которые ранее рисковали получить 422, сейчас проходят через реальные формы и сервер: request_info -> 200/info_requested, send_to_underwriting -> 200/offered, reject -> 200/rejected. В журнале actor_role=manager. Для request_info добавлена дыра statement только в тестовую БД. Для остальных dossier получено штатным комплаенсом, скорингом и escalation с локальными детерминированными адаптерами. Серверный роутер, схемы, транзакции и SQLite настоящие; HTTP-ответы не заглушены.

Проверенные зелёные свойства: client не получает queue/rejected даже с X-Role=manager; чужое досье возвращает 404; client не может reject; /config берёт роль из БД; менеджерская вкладка не рендерится клиенту. Проверены десять не-queued статусов, NaN/Infinity/нулевой/неизвестный/превышенный лимит, точное равенство лимиту, busy/detailLoading, серверные N/M и недоступный комплаенс. Кнопки сохранения профиля, чтения уведомлений и нового чата тоже проходят до реальных маршрутов и дают 200.

Покрытие клиентских состояний: лендинг и его CTA; анкета; вход с пустыми полями, связанными ошибками, busy, успехом, offline/401/422; подбор с пустой историей, формой, результатом, ожиданием подачи и ошибкой; профиль с пустыми документами/ИНН, loading lookup, невалидным ИНН, offline/404/422; кабинет без кредита и с публичным примером; уведомления без данных/с данными/busy; чат без сообщений/с отправкой; общие ошибки shell для уведомлений, профиля и чата; блокировка повторного send и восстановление после offline; ErrorBoundary с действием обновления. Сеть и ошибки JSON отдельно проверены на общих API-клиентах.

# Доказательства

Команды, кроме node --check, выполнялись из `hw/tolya/alfa-intellect/`. Исходный git status --short пуст. Проверка `git diff --quiet -- hw/tolya/alfa-intellect/src hw/tolya/alfa-intellect/server`: exit 0 после работы. Изменения только в разрешённых новых QA-файлах, смоуке, его инструкции и этом отчёте. REPORT.md игнорируется существующими git-правилами; файл на диске есть, в индекс не добавлялся.

`node node_modules/typescript/bin/tsc --noEmit` -> exit 0, stdout пуст. Это установленный tsc из задачи, без вызова npx и без сети.

`node node_modules/tsx/dist/cli.mjs --test tests/manager-ui.test.tsx` и `npm.cmd test` -> exit 1 до тестов:

```text
SystemError [ERR_SYSTEM_ERROR]: A system error occurred:
uv_os_get_passwd returned ENOMEM (not enough memory)
Node.js v24.16.0
```

PowerShell `npm test` дополнительно блокируется ExecutionPolicy на npm.ps1; npm.cmd обходит только этот shell-барьер, не ENOMEM.

Обходной загрузчик `q3-loader.ts` использует уже установленный транзитивный esbuild и Node registerHooks. Новых пакетов и установок нет. Исходные 11 manager-ui тестов с ним проходят. Стандартный tsx вне песочницы остаётся основным способом запуска. Мини-харнес `q3-harness.ts` выполняет настоящие обработчики с контролируемыми hook-state, а SSR использует настоящий renderToStaticMarkup, как существующие тесты. Харнес не доказывает React lifecycle, layout или focus.

Полный запуск Q3:

```powershell
node --import ./tests/qa/q3-loader.ts --test tests/qa/q3-manager.test.tsx tests/qa/q3-screens.test.tsx tests/qa/q3-server.test.tsx
```

Фактический финальный итог: 24 зелёных проверки и 1 намеренно красный BUG, exit 1:

```text
tests 25
suites 0
pass 24
fail 1
cancelled 0
skipped 0
todo 0
AssertionError: visible UI succeeded but created zero v2 applications
4 !== 5
```

Отдельный финальный прогон server-файла: tests 8, pass 7, fail 1 с тем же BUG. Детерминированные данные; случайного генератора нет, команда повтора совпадает с командой запуска, seed неприменим.

Зелёная часть, пять последовательных повторов:

```powershell
node --import ./tests/qa/q3-loader.ts --test --test-skip-pattern="BUG:" tests/qa/q3-manager.test.tsx tests/qa/q3-screens.test.tsx tests/qa/q3-server.test.tsx
```

| Повтор | q3-manager | q3-screens | q3-server без BUG | Exit |
|---|---|---|---|---|
| 1 | 7 pass | 10 pass | 7 pass | 0 |
| 2 | 7 pass | 10 pass | 7 pass | 0 |
| 3 | 7 pass | 10 pass | 7 pass | 0 |
| 4 | 7 pass | 10 pass | 7 pass | 0 |
| 5 | 7 pass | 10 pass | 7 pass | 0 |

Хвост каждого прогона: tests 24, pass 24, fail 0, cancelled 0, skipped 0, todo 0. Итого 120/120 зелёных выполнений. Node test-skip-pattern исключает BUG до регистрации, поэтому skipped в его summary равно 0. BUG отдельно прогнан красным, не отключён в полном наборе.

### Мутации

Каждая мутация отдельно компилируется и исполняется в памяти, затем изолированный модуль отбрасывается. Исходные файлы на диске не меняются: это соблюдает приоритетное ограничение «писать только файлы из задачи». Это проверка силы оракулов, не запуск отдельной копии всего приложения на диске. Исходный вариант проходит те же оракулы. Префиксы src/ и server/ в таблице от hw/tolya/alfa-intellect/.

| Файл:строка | Мутация | Что краснеет | Результат |
|---|---|---|---|
| src/manager/ManagerWorkspace.tsx:99 | Убрать требование queued | manager guards, десять остальных статусов | killed |
| src/manager/ManagerWorkspace.tsx:315 | Убрать amount > limit | manager guards, 299999 против 300000 | killed |
| src/manager/ManagerWorkspace.tsx:184 | Показать M из M вместо N из M | server N/M oracle, 3 из 5 | killed |
| src/manager/ManagerWorkspace.tsx:133 | Скрыть alert | visible textual error oracle | killed |
| src/Onboarding.tsx:325 | Проглотить ошибку setError | offline/401/422 доходят до alert | killed |
| src/manager/api.ts:157 | expectedVersion=1 | transport payload oracle, ожидается 7 | killed |
| src/manager/api.ts:159 | Потерять reason отказа | transport payload oracle, точный текст причины | killed |
| src/manager/api.ts:68 | Потерять Idempotency-Key | transport header oracle | killed |
| server/applications-routes.ts:27 | Убрать проверку manager | настоящий HTTP к мутантному роутеру: 200 вместо 403 | killed |
| server/app.ts:102 | Возвращать manager клиенту в config | настоящий /api/config: manager вместо client | killed |

Kill rate 10/10 = 100%, выживших нет. Для server role проверка фактически находится в applications-routes.ts, дополнительно проверена выдача роли из app.ts. Повтор мутаций: обычный запуск трёх Q3-файлов; stdout содержит 10 строк KILLED.

Регрессия существующих тестов через обходной загрузчик:

```powershell
node --import ./tests/qa/q3-loader.ts --test tests/*.test.ts tests/*.test.tsx
```

```text
tests 901
suites 4
pass 899
fail 2
cancelled 0
skipped 0
todo 0
```

Два падения не выдаются за баги продукта: applications-contract.test.ts:772 использует import с query, который не обрабатывается fallback-loader, Node strip-only падает на parameter property с ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX; server-start.test.ts:6 запускает дочерний tsx, получающий ENOMEM вместо тестируемой ошибки занятого порта. Эти проверки надо повторить стандартным npm test вне sandbox. Существующие тесты не менялись.

Из корня: `node --check tests/e2e/ui_smoke.mjs` -> exit 0, stdout пуст. Prettier --check только по семи новым QA/smoke файлам -> `All matched files use Prettier code style!`, exit 0.

# Числа

Производительность не измерялась.

# Нужно от других

Архитектору и владельцу клиентского оформления: связать видимую подачу с v2-конвейером, затем прогнать оставленный BUG без ослабления оракула. Ядро Лизы не менялось, замечаний к нему в этой задаче не заявляю.

Для браузерной приёмки: изолированный локальный стенд, два клиентских подбора и шесть красных заявок менеджеру, синтетические учётные записи. Команды и точные предусловия: `tests/e2e/UI_SMOKE.md`. Сценарии реально меняют состояния. Результат: PNG для каждой роли/ширины/шага, JSON с ошибками консоли, ответами >=400, loadingFailed, overflow, доступностью и клавиатурной трассой; таблица в stdout; exit 1 на ошибку или неполный проход. Нужны 42 успешных шага. Заявки и ответы HTTP не подменяются.

# Не проверено

Браузер не запускался по условиям TASK.md; скриншоты и JSON результата не создавались. Проверены синтаксис и ручное соответствие селекторов текущему коду. Визуальный QA, размеры, реальные фокус/Tab и выполнение CDP требуют внешнего прогона. Семантический порядок табуляции полностью автоматикой не доказывается: смоук проверяет достижимость целевых действий и positive tabindex.

Не выполнена исчерпывающая динамическая проверка каждой кнопки во всех модальных окнах: документные file picker/download, календарь с вводом дат, все варианты редактора кредита, все варианты feedback, подтверждение реестрового кандидата и первые шаги нового подбора требуют дополнительной браузерной приёмки. Общие ошибки API и начальные состояния покрыты, но это не замена этим путям. Чат на реальном LLM не проверялся и не нужен для основного сценария. Комплаенс/score в серверных QA сценариях замоканы на границе адаптеров, ядро не перепроверялось. Стандартный npm test целиком вне песочницы не выполнен.
