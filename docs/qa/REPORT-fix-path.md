# Сделано

F1 выполнен частично. Подача, системные эскалации, контекст чата и зелёная досылка работают. Один контрпример остаётся красным: немедленный возврат менеджеру красной досылки после прежнего CLIENT_SILENT. Для него нужен переход в запрещённом для F1 server/applications.ts. Готовность всего задания не заявляется.

Пути server/, src/, scripts/ и tests/ ниже относительно hw/tolya/alfa-intellect/.

server/funding-routes.ts:117,194 · кнопка создавала только legacy funding_applications и lead · обработчик не вызывал машину состояний · подача с consent=true теперь вызывает createApplication и executeApplicationEvent(submit), с продуктом из того же selection и его версией · исходный Q3 visible client submission: красный 4 !== 5, после исправления зелёный.

src/Financing.tsx:176,603 · успешная legacy-запись выглядела как завершённая подача · UI не передавал согласие в конвейер · текст перед кнопкой фиксирует согласие, запрос передаёт consent=true, состояние результата привязано к выбранному подбору и версии, ошибка остаётся в role=alert. Новые экраны статусов не добавлялись.

server/funding-routes.ts:194,232 · повтор после недоступности ядра мог бы создать ещё один draft, а сохранение старого AppState после await могло бы стереть параллельные изменения · мост applicationId сохраняется в legacy dossier до проверки, submit имеет устойчивый ключ идемпотентности, успех-лид добавляется только после результата, состояние перечитывается после await. F1 проверяет 503 с понятным текстом, отсутствие успех-лида и повтор с тем же applicationId без повторного submit.

Legacy не удалён: поиск по src/server/tests обнаружил зависимости в Financing.tsx, funding-api.test.ts и QA. Вызовы без consent сохраняют прежнее демонстрационное поведение, новая видимая подача передаёт consent=true. funding_applications и lead остаются побочными записями, в клиентский ответ добавлены applicationId/applicationStatus.

server/app.ts:512 · отказ от альтернатив не вызывал системный переход · добавлен принадлежащий клиенту POST /api/applications/:id/disagreement, принимающий expectedVersion и client_objections. Внутренний вызов transitionApplication имеет только actorRole=system и actorId=null. Роль берётся из БД, системные /events остаются закрыты. F1 проверяет CLIENT_DISAGREED в очереди и 403 на оба прямых escalate_* даже с X-Role=manager.

server/app.ts:629,673 · чат вызывал агента без активной заявки · добавлен выбор принадлежащей пользователю заявки по подбору; для общего чата допускается только одна однозначная активная заявка. В существующий AgentTurnContext передаются id/status, серверные N/M, дыры, причины, лимит и альтернативы. При info_requested передаётся mode=objections. Явное возражение клиента вызывает системный переход и без LLM; текст модели сам по себе не разрешает переход. Исходный Q4 #11: красный undefined вместо application id, после исправления зелёный.

server/application-silence.ts:14,125,213 и server/app.ts:47 · никто не запускал напоминания и эскалацию молчания · добавлены явный обход, доставка agent_nudge в чат, последующая проверка ответа и порога, таймер сервера с защитой от перекрытия, yield каждые 25 записей и корректная остановка активного обхода. Порог в контракте не найден. Документированный демонстрационный конфиг: APPLICATION_SILENCE_MS=86400000, APPLICATION_SWEEP_MS=60000, только положительные целые миллисекунды. F1 проверяет границу порога, единственный CLIENT_SILENT, отмену после ответа в общем чате и реальное срабатывание таймера без ручного обхода.

scripts/seed-manager.ts:292 · добавлен --sweep-silent для ручного запуска против той же БД без создания сидовых клиентов и без обхода порога. Демо-инструкция обновлена в docs/demo-script.md.

tests/qa/q5-jury-path.test.ts:115 · старый S-manager ожидал queued даже после зелёного пересчёта · это противоречит решению 23.10 в TASK.md · единственная разрешённая смена продуктового ожидания: offered, автоматические client_update/underwriter_approve/make_offer, отсутствие менеджерской записки и очереди. Исходный красный тест переименован. Дополнительно на настоящем ядре проверена красная досылка при неразрешённом CLIENT_DISAGREED: она снова в очереди с сохранёнными тезисами.

server/application-silence.ts:86 и server/app.ts:529 · HTTP client_update повторно оценивается существующей машиной; если прежнее явное возражение осталось неразрешённым, системная обработка восстанавливает очередь. Повторные и конкурентные запросы с одним Idempotency-Key не добавляют эскалаций, итоговый ответ сохраняется для replay. Обычная зелёная досылка не перехватывается этой логикой.

# Доказательства

Команды ниже выполнялись из hw/tolya/alfa-intellect/. Пакеты не устанавливались, внешняя сеть не использовалась. F1 HTTP использует настоящий Express, supertest и SQLite :memory:, с детерминированными адаптерами проверок и ядра. Q5 использует настоящий Python cores.REGISTRY['liza'] через существующий перехват fetch-транспорта. LLM отключена. Никаких подмен HTTP-ответов в F1 нет.

До исправления:

```text
node --import ./tests/qa/q3-loader.ts --test tests/qa/q3-server.test.tsx
tests 8; pass 7; fail 1
BUG: Q3 visible client submission must enter v2 and expose a submitted application
AssertionError: visible UI succeeded but created zero v2 applications
4 !== 5

node --import ./tests/qa/q3-loader.ts --test --test-name-pattern="#11" tests/qa/q4-review-bugs.test.ts
tests 1; pass 0; fail 1
actual: undefined; expected: application id

node --experimental-transform-types tests/qa/q5-run.ts ./q5-jury-path.test.ts
tests 3; pass 2; fail 1
actual: offered; expected: queued
```

Последняя проверка типов:

```text
node node_modules/typescript/bin/tsc --noEmit
exit 0, stdout пустой
```

Последний F1-прогон после добавления проверки настоящего таймера:

```text
node --experimental-transform-types --import ./tests/qa/q3-loader.ts --test tests/qa/f1-path.test.ts
tests 8
pass 8
fail 0
skipped 0
```

Проверяются подача и параметры, повтор, прямые поддельные эскалации, системный отказ от альтернативы, молчание после доставленного напоминания, чат без LLM, retry после сбоя ядра, красная досылка при прежнем возражении, конкурентный replay, ответ в общем чате и запуск таймером.

Совместный прогон F1 и всех трёх Q3-файлов до добавления восьмого F1-теста таймера:

```text
node --experimental-transform-types --import ./tests/qa/q3-loader.ts --test tests/qa/f1-path.test.ts tests/qa/q3-manager.test.tsx tests/qa/q3-screens.test.tsx tests/qa/q3-server.test.tsx
tests 32
pass 32
fail 0
skipped 0
```

Q4, исправленный #11 и положительный контроль адаптера:

```text
node --experimental-transform-types --import ./tests/qa/q3-loader.ts --test --test-name-pattern="#11" tests/qa/q4-review-bugs.test.ts tests/qa/q4-review-regressions.test.ts
tests 2; pass 2; fail 0
```

Q5 запускался отдельными процессами с собственной пустой SQLite:

```text
node --experimental-transform-types tests/qa/q5-run.ts ./q5-jury-path.test.ts
tests 4; pass 4; fail 0

node --experimental-transform-types tests/qa/q5-run.ts ./q5-seed.test.ts
tests 2; pass 2; fail 0
```

Один ошибочный объединённый запуск этих двух файлов в одном процессе дал ошибку первого seed-assert: jury уже изменил ту же SQLite. Это ошибка способа запуска, не регрессия сида. После разделения оба файла зелёные.

Ручной CLI-обход проверен на пустой SQLite без создания клиентов:

```powershell
$env:DATABASE_PATH = ':memory:'
node --experimental-transform-types --import ./tests/qa/q3-loader.ts scripts/seed-manager.ts --sweep-silent
```

```text
{ nudged: 0, escalated: 0 }
exit 0
```

Обязательный штатный полный прогон:

```text
npm.cmd test
exit 1 до выполнения тестов
SystemError [ERR_SYSTEM_ERROR]: uv_os_get_passwd returned ENOMEM
Node.js v24.16.0
```

Полный набор запущен также существующим обходным загрузчиком:

```text
node --import ./tests/qa/q3-loader.ts --test tests/*.test.ts tests/*.test.tsx
tests 901; pass 899; fail 2
```

Два сбоя окружения: restart-импорт с query string обошёл esbuild-loader и попал в strip-only TypeScript; server-start.test.ts запускает дочерний tsx, который падает с тем же ENOMEM до проверки занятого порта. Restart отдельно проверен с разрешённым transform-types:

```text
node --experimental-transform-types --import ./tests/qa/q3-loader.ts --test --test-name-pattern="restart:" tests/applications-contract.test.ts
tests 1; pass 1; fail 0
```

Все существовавшие QA-файлы также запускались, вместе с первым F1-файлом из семи тестов, до добавления контрпримера и таймера:

```text
node --experimental-transform-types --import ./tests/qa/q3-loader.ts --test tests/qa/*.test.ts tests/qa/*.test.tsx
tests 113; pass 84; fail 29; skipped 0
```

Красные 29 относятся к открытым BUG в q1-bugs/q1-sequences, q2-boundary-bugs/q2-dirty-bugs/q2-faults и q4-review-bugs: CAS по исходным данным, SQLite lock, старые оракулы ролей, формат документов, team-score, альтернативы, комплаенс и PII. Эти исходники F1 менять не вправе. Три старых теста Q1 ожидают делегированные системные /events от клиента; замороженный контракт и пункт F1.5(г) требуют запретить прямую эскалацию, что новый тест явно проверяет. Оракулы чужих тестов не менялись.

Блокер, отдельный настоящий красный контрпример с ядром Лизы:

```text
node --experimental-transform-types tests/qa/q5-run.ts ./f1-resupply-gap.test.ts
tests 1; pass 0; fail 1
BUG: F1 still-red resupply after CLIENT_SILENT returns to the manager queue
actual: info_requested
expected: queued
```

Клиент первоначально молчал, менеджер запросил договор и акт. Клиент подтвердил договор, акт по результату настоящего ядра всё ещё отсутствует. Проверка наличия reconciliation_act в holes проходит. Падает именно ожидание queued после красной досылки, а не инфраструктура теста. Тест сохранён красным, без skip и ослабления ассертов.

# Не сделано и почему

Немедленный возврат в очередь после красной досылки с предыдущим CLIENT_SILENT не реализован. У client_update нет целевого queued; escalate_silent требует нового agent_nudge после этой досылки, но называть ответившего клиента снова молчащим до истечения порога неверно. escalate_disagreed требует настоящих возражений, которых в этом сценарии нет. Прямые UPDATE статуса, выдуманные возражения и подмена причины не применялись.

Исходные Q3/Q4 тесты теперь зелёные, но слово BUG в их именах оставлено: tests/qa/q3-*.tsx и q4-*.ts не входят в разрешённый список записи F1. Их ассерты и имена не редактировались. В разрешённом Q5-тесте BUG снят, новые зелёные F1-тесты переименованы.

Штатный npm test не прогнан в песочнице из-за ENOMEM. Его 901 проверка запускалась обходным загрузчиком с двумя описанными ограничениями окружения. Полностью зелёный общий прогон не заявляется.

# Нужно от других

F2: hw/tolya/alfa-intellect/server/applications.ts:65,496,899 · нужен законный системный переход возврата всё ещё красного client_update после менеджерского request_info в queued, с корректной причиной для прежнего CLIENT_SILENT; при этом зелёный пересчёт должен сохранить автоматический offered. Приёмка: tests/qa/f1-resupply-gap.test.ts должен стать зелёным без выдуманного нового молчания или возражения. server/applications.ts и applications-routes.ts F1 не менял.

Архитектор: переименовать ставшие зелёными Q3 visible client submission и Q4 #11 без BUG в их именах, если нужно привести весь QA к единому соглашению. Их файлы не разрешены F1.

F3: существующий интерфейс отказа от альтернативы может вызывать описанный в docs/demo-script.md POST /api/applications/:id/disagreement. Новые экраны принадлежат F3 и здесь не создавались.

# Не проверено

Живой браузер, фокус и вёрстка, Docker, запуск всего стенда, реальный HTTP /score и лимит памяти 256M не проверялись. Серверные HTTP-переходы и SQLite проверены, качество банковского решения F1-тестами не измеряется. Q5 использует настоящее ядро через перехваченный транспорт, а не живую сеть.

Финальный git diff --check: exit 0. Prettier --check на семи разрешённых изменённых файлах (кроме app.ts, где сохранялось форматирование чужих обработчиков): All matched files use Prettier code style!. Запрещённые applications.ts, applications-routes.ts, compliance.ts, documents.ts и services/agent имеют пустой git diff. В добавленных строках отслеживаемых файлов нет U+2014.

Обязательные общие QA-прогоны оставили три неотслеживаемых каталога с временными SQLite-артефактами: tests/qa/q1-sqlite-OrgFOo/, tests/qa/q1-sqlite-WP6rpW/, tests/qa/q1-sqlite-YIW13R/. Их создаёт существующий Q1-тест. По запрету контракта Боцмана на самостоятельные удаления я их не удалял; это не новые исходники F1, в сдачу их включать не нужно.

Никаких коммитов, push, новых веток, установок, удалений и изменений чужих исходников. .env, ключи, team-accounts.txt и data/hidden не читались. REPORT.md создаётся в корне и игнорируется существующими правилами git; его нужно передать архитектору отдельным файлом вместе с изменениями.
