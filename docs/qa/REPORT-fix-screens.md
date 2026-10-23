# F3: экраны клиента и записка андеррайтеру

## Сделано

Пути src/, server/, tests/qa/ ниже от hw/tolya/alfa-intellect/, если не указан корень репозитория. Правки только в разрешённой области F3. Сети, установки пакетов, коммитов, новых веток и правок серверных файлов не было.

1. src/ApplicationStatus.tsx:59, src/App.tsx:327. После подачи не было клиентского экрана состояний, навигация не читала v2-заявки. Добавлен единый экран «Моя заявка» и маршрут /application, доступный клиентской роли. Все 11 контрактных статусов имеют заголовок и следующий шаг. История выводит только названия публичных состояний и корректные даты. Внутренние причины передачи, комментарии менеджера и неизвестные коды клиенту не выводятся. Известные причины комплаенса переведены на человеческий язык. Новый тест «F3 every contract status has a safe client screen» был красным из-за отсутствия компонента и стал зелёным; все 11 статусов без undefined/null/NaN и сырых кодов.

2. src/application-client.ts:97, src/ApplicationStatus.tsx:424. Добавлены GET списка собственных заявок и GET выбранной заявки с same-origin cookie. Банковская очередь не используется. Селектор формируется исключительно из собственного серверного списка; несоответствие ID ответа запрошенному ID отклоняется. При переключении и обновлении старое досье скрывается, отменённый эффект не применяет поздний ответ. Есть пустое состояние, загрузка, ошибка и повтор. Подтверждено новыми тестами транспорта и устаревшего ответа, а также существующим Q3 HTTP-тестом изоляции клиента.

3. src/ApplicationStatus.tsx:59, src/application-client.ts. Подключены существующий загрузчик документов и проверка извлечённых данных из App. Подтверждённые документы выбираются явно, client_update получает их IDs. Альтернативы принимаются через accept_alternative. Возражение сохраняется через существующий маршрут сообщений чата; системная эскалация не подменяется клиентским событием. Условия предложения и график взяты исключительно из payload последнего make_offer, отсутствующие/нечисловые поля скрыты. Серверный SMS-мок найден в server/applications.ts:551: code === '0000'. Подпись вызывает sign, отказ от предложения вызывает withdraw; демо обозначено прямо. POST содержит текущую expectedVersion и Idempotency-Key. Новые тесты проверяют точные payload, реальные серверные условия, ошибки, имена контролов и блокировку при busy.

4. src/manager/ManagerMemo.tsx:17,69, src/manager/ManagerWorkspace.tsx:215,591. Раньше была только текстовая форма записки при альтернативе, без шести блоков и явной проверки. Добавлена модалка с детерминированным черновиком: запрос, вердикт ядра, за, против, проверки, рекомендация. Комментарий и обязательный чекбокс проверки; при изменении комментария подтверждение сбрасывается. Отправка доступна только для queued при известном лимите и сумме в его пределах. И исходный запрос, и выбранная альтернатива используют существующий send_to_underwriting. Ошибка сохраняет модалку и черновик. Новый тест «F3 memo has six deterministic dossier blocks and explicit review» был красным из-за отсутствия модуля и стал зелёным; дополнительные тесты доказывают запрет непроверенной/сверхлимитной передачи и фактический вызов существующего события из контейнера.

5. src/application-status.css, src/manager/manager.css, tests/e2e/UI_SMOKE.md (корень). Адаптивные сетки, существующие классы/токены, нативные контролы, видимые состояния фокуса. Используется существующая Modal с Escape, удержанием и возвратом фокуса. SVG подключаются по имени статуса, если присутствуют при сборке; при отсутствии файлов используется lucide-react. Сейчас public/icons/status отсутствует. Добавлены шаги ручной приёмки на 360/1440, все статусы и сценарии ошибок.

## Доказательства

Команды ниже выполнялись из hw/tolya/alfa-intellect/. Все новые регрессии постоянные; временных тестов нет, существующие QA-тесты не переименованы и не ослаблены, поскольку красный Q3 submit находится вне F3.

До реализации: `node --import ./tests/qa/q3-loader.ts --test tests/qa/f3-screens.test.tsx`, exit 1:

```text
tests 2
pass 0
fail 2
ERR_MODULE_NOT_FOUND: src/ApplicationStatus
ERR_MODULE_NOT_FOUND: src/manager/ManagerMemo
```

После реализации префиксы BUG у этих двух тестов убраны. Итоговый расширенный набор: `node --import ./tests/qa/q3-loader.ts --test tests/qa/f3-screens.test.tsx`, exit 0:

```text
F3 memo completion uses existing manager event; failure retains the draft
F3 obsolete client detail response is ignored after selection changes
tests 11
pass 11
fail 0
cancelled 0
skipped 0
todo 0
```

`node node_modules/typescript/bin/tsc --noEmit`, exit 0, stdout пуст. Прогнан после последних изменений кода и расширения тестов. Это установленный tsc из задания без npx/сети.

Совместный прогон экранов и менеджера: `node --import ./tests/qa/q3-loader.ts --test tests/qa/f3-screens.test.tsx tests/qa/q3-manager.test.tsx tests/qa/q3-screens.test.tsx tests/manager-ui.test.tsx`, exit 0. На момент этого прогона F3 содержал 9 тестов; затем добавлены и отдельно успешно прогнаны ещё 2:

```text
tests 37
pass 37
fail 0
cancelled 0
skipped 0
todo 0
```

Полный Q3 вместе с новыми экранами: `node --import ./tests/qa/q3-loader.ts --test tests/qa/f3-screens.test.tsx tests/qa/q3-manager.test.tsx tests/qa/q3-screens.test.tsx tests/qa/q3-server.test.tsx`, exit 1 (в этот момент F3 содержал 9 тестов):

```text
HTTP request_info -> 200
HTTP send_to_underwriting -> 200
HTTP reject -> 200
tests 34
pass 33
fail 1
BUG: Q3 visible client submission must enter v2 and expose a submitted application
AssertionError: visible UI succeeded but created zero v2 applications
4 !== 5
```

Единственный красный Q3 относится к src/Financing.tsx и server/funding-routes.ts, запрещённым для F3. Совпадает с исходным docs/qa/REPORT-q3.md. Зелёная часть Q3, включая настоящий HTTP и SQLite, осталась зелёной.

Обязательный `npm.cmd test`, exit 1 до тестов:

```text
> tsx --test tests/*.test.ts tests/*.test.tsx
SystemError [ERR_SYSTEM_ERROR]: A system error occurred:
uv_os_get_passwd returned ENOMEM (not enough memory)
Node.js v24.16.0
```

Стандартный npm test не прогнан в песочнице из-за ENOMEM. Для доступной проверки использован уже существующий QA-загрузчик без новых пакетов: `node --import ./tests/qa/q3-loader.ts --test tests/*.test.ts tests/*.test.tsx`, exit 1:

```text
tests 901
suites 4
pass 899
fail 2
cancelled 0
skipped 0
todo 0
```

Два падения совпадают с исходным Q3-отчётом: tests/applications-contract.test.ts:772 импортирует TypeScript с query-параметром, который QA-загрузчик не трансформирует, ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX; tests/server-start.test.ts:6 запускает дочерний tsx, получающий тот же ENOMEM вместо ошибки занятого порта. Изменённые компоненты и старые 11 manager-ui тестов зелёные.

## Не сделано и почему

Загрузка договора с заказчиком и акта сверки не реализована сервером: server/documents.ts:22 допускает только statement, balance, pnl, model, plan, schedule, а server/documents.ts:224 отвергает неизвестную категорию. F3 не имеет права менять сервер. UI не предлагает неработающие категории, показывает запрос документа и честное ограничение. Работает существующая загрузка финансовых шаблонов и client_update с подтверждёнными документами.

Автоматическая эскалация возражения клиента не добавлена: по docs/v2-contract.md событие escalate_disagreed разрешено только system. Клиент сохраняет тезисы в существующем чате, но изменение статуса должен выполнить системный агент.

Автоматический переход на /application после legacy-подачи не добавлен: src/Financing.tsx принадлежит F1. Экран доступен из шапки и по прямому адресу.

## Нужно от других

server/documents.ts:22,224: владельцу загрузчика добавить поддерживаемые категории договора и акта сверки с проверяемыми шаблонами и подтверждением, чтобы закрыть основной мок Main.

server/applications.ts:79 и системному агенту: связать сохранённые в чате возражения с допустимым system escalate_disagreed и client_objections; клиентская роль не может отправлять это событие.

src/Financing.tsx:590, server/funding-routes.ts:171: F1 должен связать подачу с v2-конвейером и после submit открывать /application. Исходный красный Q3-тест оставлен без изменений.

## Не проверено

Живой браузер, визуальное соответствие мокам, реальная геометрия 360/1440, Tab/Shift+Tab/Escape и возврат фокуса. SSR и вызов обработчиков не доказывают эти свойства. Ручные шаги записаны в tests/e2e/UI_SMOKE.md.

Сквозная загрузка файлов и действительная подпись в браузере. Транспорт/payload и серверные маршруты проверены тестами, но UI-сценарий загрузки нового финансового шаблона руками не проходился.

Поведение со SVG F6 при их фактическом появлении и production-сборка. Сейчас файлов иконок нет; путь без них покрыт SSR. Стандартный npm test требуется повторить вне ограничения ENOMEM.
