# Карта рисков

1. Зелёная заявка попадает менеджеру -> лишнее ручное вмешательство -> S1 проверяет автоматические события и отсутствие в очереди (`docs/v2-contract.md:19`, `:24-27`).
2. Сид подменяет расчёт выдуманными цифрами -> ложное кредитное решение -> настоящий httpCoreClient и ядро Лизы, отказ при outage (`TASK.md:57`, `docs/v2-contract.md:14`).
3. Ручной дозапрос теряет заявку менеджера -> сценарий показа обрывается -> BUG S-manager после client_update (`TASK.md:59`, `docs/v2-contract.md:40-46`).
4. Комплаенс пропускает недействующую компанию -> ложный оффер -> S4, rejected до вызова ядра (`docs/v2-contract.md:11`, `:49`).
5. Статус не совпадает с журналом -> неверное досье -> полный replay каждого события, seq и actor_role (`TASK.md:57-58`, `docs/v2-contract.md:34-46`).
6. Повтор сида создаёт дубли или стирает работу менеджера -> демо непредсказуемо -> полные снимки SQL до/после, включая повтор после request_info (`TASK.md:57-58`).
7. Неверный приоритет скрывает важный кейс -> неверная очередь -> независимый расчёт по формуле, четыре разных кейса (`TASK.md:58`).
8. Демо требует LLM -> недоступно на ПК жюри -> AI_PROVIDER и TEAM_AGENT_URL пустые в тестах (`TASK.md:59`, `.codex-ctx/inputs-2026-10-22.md:24`, ответ оргов 20.10 12:21).

# Находки

[важно] `hw/tolya/alfa-intellect/server/applications.ts:781`, `:899-935`: после ручного request_info полностью подтверждённый client_update автоматически получает offered вместо queued, требуемого Q5 S-менеджер. Воспроизведение: `q5-jury-path.test.ts`, тест `BUG: S-manager: resupplied red case returns to queue then underwriting with memo`, фиксированные входы, seed не используется. Фактически offered, ожидается queued. Предлагаемый фикс одной строкой: согласовать с владельцем P2 возврат после менеджерского request_info в queued и последующую отправку с memo, сохранив автоматическое одобрение обычной зелёной заявки. Это изменение стыка, не безопасный однострочный патч Q5. Чужой код не исправлялся.

Предыдущий блокер с отсутствующими корректными ИНН снят ответом архитектора в конце TASK.md. Добавлены четыре синтетические записи в каждый разрешённый JSON, demo_seed=q5, существующие записи сохранены. ИНН ООО: 9900050018, 9900050025. ИНН ИП: 990005000140, 990005000214. Независимый checksum в тесте проверяет все четыре.

Реализован сид: четыре клиента, менеджер, анкеты, синтетические операции выписок, createApplication, submit с настоящим httpCoreClient, agent_nudge/escalate_silent или escalate_disagreed. Прямых INSERT/UPDATE статусов, досье или событий нет. Заявки действительно красные по дыркам/лимиту, комплаенс и БКИ проходят локальные моки. Случайные пароли только в консоли создания, в базе только scrypt-хеши. Повтор не меняет пароли, заявки, досье и журнал, включая заявку после ручного request_info. Outage оставляет draft без досье; повтор после восстановления проходит.

# Доказательства

Команды ниже из hw/tolya/alfa-intellect. Новые пакеты не ставились, сеть не использовалась.

`node_modules/.bin/tsc.cmd --noEmit` -> exit 0, вывод пустой.

`node_modules/.bin/tsx.cmd --test tests/qa/q5-seed.test.ts` и `npm.cmd test` -> exit 1 до тестов:

```text
SystemError [ERR_SYSTEM_ERROR]: A system error occurred: uv_os_get_passwd returned ENOMEM (not enough memory)
Node.js v24.16.0
```

Для QA-файлов добавлен q5-run.ts на встроенном registerHooks/stripTypeScriptTypes Node 24, без пакетов и записи скомпилированного кода.

`node --experimental-transform-types tests/qa/q5-run.ts ./q5-seed.test.ts` -> exit 0:

```text
Q5 seed: four genuinely red cases, priority, journal replay, credentials and retry
Q5 core outage leaves draft with no invented dossier; retry succeeds
tests 2
pass 2
fail 0
```

Тест использует настоящие SQLite, runComplianceGate, БКИ, httpCoreClient и Python cores.REGISTRY['liza']; fetch подменяет только транспорт без сети, возвращаемые числа вычисляет ядро. На первом сиде ровно четыре вызова ядра, на повторе новых вызовов нет. Пароли из перехваченного консольного вывода сверяются с verifyPassword, в state их нет. Снимок всех строк users/applications/application_events/dossiers совпадает до и после повтора. После ручного request_info второй повтор также ничего не меняет.

`node --experimental-transform-types tests/qa/q5-run.ts ./q5-jury-path.test.ts` -> exit 1, ожидаемый открытый BUG:

```text
S1: green application reaches offer and schedule without manager or LLM: PASS
S4: inactive company rejected with understandable compliance reason before core: PASS
BUG: S-manager: resupplied red case returns to queue then underwriting with memo: FAIL
tests 3
pass 2
fail 1
+ 'offered'
- 'queued'
```

S1 проверяет весь журнал до make_offer, отсутствие manager, 12 платежей и сумму основного долга. S4 проверяет COMPLIANCE_EGRUL_INACTIVE, понятный clientText и ноль вызовов ядра. Шаги docs/demo-script.md совпадают с тестами. Красный тест не ослаблен и не пропущен.

`node --experimental-transform-types tests/qa/q5-mutations.ts` -> exit 0, kill rate 8/8. Ручные одиночные подстановки автоматизированы для воспроизводимости, каждая откачена в finally. Меняется только разрешённый seed-manager.ts; запрещённый к записи server/applications.ts не мутировался. Проверены вызовы переходов и их ограничения со стороны сида.

| Место в seed-manager.ts | Мутация | Покрасневший тест | Итог |
|---|---|---|---|
| 247 | consent=false при submit | seed и outage retry | KILLED |
| 237 | actorRole=manager вместо system | seed и outage retry | KILLED |
| 273 | agent_nudge вместо escalate_silent | seed и outage retry | KILLED |
| 270 | пропуск agent_nudge | seed и outage retry | KILLED |
| 217 | поиск существующей заявки по неверному selection_id | seed, снимок/состав очереди | KILLED |
| 48 | полная выписка вместо короткой | seed, красность document | KILLED |
| 36 | 300000 вместо 90000000 | seed, красность disagreed | KILLED |
| 27 | убрана концентрация на одном покупателе | seed, красность silent | KILLED |

Номера строк напечатаны harness в финальном прогоне; при изменении форматирования повторить команду для актуальных ссылок. Все восемь мутаций перезаписывают по одной разрешённой строке/вызову и откатываются; выживших нет.

Пять последовательных запусков зелёного q5-seed.test.ts: 5/5 exit 0, в каждом tests 2, pass 2, fail 0. q5-jury-path.test.ts намеренно красный, поэтому как зелёный файл пять раз не заявляется.

# Числа

Производительность не измерялась. 4 красных заявки, 5 учёток, 4 новых корректных ИНН в каждом из двух JSON. 2/2 seed-проверки, 2/3 jury-проверки, 8/8 убитых мутаций, 5/5 повторов зелёного файла. Не путать этот результат с полной приёмкой продукта.

# Нужно от других

Владелец P2/архитектор: согласовать S-менеджер после ручного дозапроса, устранить разрыв queued/offered и прогнать красный тест до зелёного. Полный сценарий Q5 сейчас не готов; исправление чужого серверного файла не входит в разрешённый список.

# Не проверено

npm test и штатный tsx не запустились из-за ENOMEM. Docker, живой HTTP API /score, прокси Go, браузер, авторизация/HTTP-маршруты, UI очереди и лимит памяти не проверены. QA вызывает executeApplicationEvent, а не Express-маршруты. Python-адаптер cores настоящий, но app.decide, guards и журнал ml-model не вызываются транспортным тестом. Пароли не выводились в чат и не сохранялись тестом в файлы. Продакшен-сид против работающего стенда не запускался: в задании нет разрешения на сетевые соединения. В docs/demo-script.md команды запуска для приёмки и явно отмечен открытый BUG.

