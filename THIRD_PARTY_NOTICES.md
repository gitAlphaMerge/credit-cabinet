# Сторонние компоненты и смоделированные интеграции

Инвентаризация по Dockerfile, package.json/package-lock.json, исходникам и локальным ассетам. Сеть и установка пакетов не использовались. Лицензии npm ниже взяты из поля `license` lock-файла. Полные тексты LICENSE поставляемых пакетов учитываются отдельно. Это перечень зависимостей, а не подтверждение прав на материалы команды.

## Образы и среды

| Образ из Dockerfile | Роль | Лицензирование |
|---|---|---|
| `golang:1.22-alpine` | Сборка Go API | Go: BSD-3-Clause; лицензии Alpine и включённых пакетов учитываются отдельно |
| `alpine:3.20` | Runtime Go API | Составная Linux-дистрибуция, лицензии отдельных пакетов |
| `python:3.11-slim` | ml-model и agent | Python: PSF-2.0; Debian и системные пакеты имеют собственные лицензии |
| `nginx:alpine` | Статика и прокси | nginx: BSD-2-Clause; Alpine и пакеты отдельно |
| `node:24.0.0-slim` | Кабинет и его сборка | Node.js: MIT и встроенные notices; Debian и пакеты отдельно |

Для образов перечислены лицензии основных проектов, не единая лицензия всего образа. Полного SBOM слоёв в репозитории нет. Теги `nginx:alpine`, `python:3.11-slim` и `golang:1.22-alpine` не закреплены digest. Python-сервисы используют stdlib; Go API использует stdlib, сторонних Go-модулей в go.mod нет. pytest требуется для тестов агента, не устанавливается Dockerfile агента; локальная версия и её metadata здесь не зафиксированы.

## Прямые npm-зависимости кабинета

Версии разрешены lock-файлом, диапазоны заданы package.json. dev означает инструменты разработки/проверки, но текущий Dockerfile делает полный `npm ci` и не исключает их из образа.

| Компонент | Версия lock | Лицензия lock | Роль |
|---|---|---|---|
| `dotenv` | 18.0.8 | BSD-2-Clause | runtime |
| `exceljs` | 4.4.0 | MIT | runtime |
| `express` | 5.3.0 | MIT | runtime |
| `lucide-react` | 1.58.0 | ISC | runtime |
| `mammoth` | 1.13.0 | BSD-2-Clause | runtime |
| `multer` | 2.4.0 | MIT | runtime |
| `openai` | 7.34.0 | Apache-2.0 | runtime |
| `pdf-parse` | 2.4.5 | Apache-2.0 | runtime |
| `react` | 19.3.1 | MIT | runtime |
| `react-dom` | 19.3.1 | MIT | runtime |
| `zod` | 4.6.7 | MIT | runtime |
| `@types/express` | 5.0.6 | MIT | dev |
| `@types/multer` | 2.3.0 | MIT | dev |
| `@types/node` | 26.6.5 | MIT | dev |
| `@types/pdfkit` | 0.17.6 | MIT | dev |
| `@types/react` | 19.3.0 | MIT | dev |
| `@types/react-dom` | 19.3.0 | MIT | dev |
| `@types/supertest` | 7.2.1 | MIT | dev |
| `@vitejs/plugin-react` | 6.1.2 | MIT | dev |
| `docx` | 9.11.0 | MIT | dev |
| `pdfkit` | 0.20.2 | MIT | dev |
| `prettier` | 3.9.10 | MIT | dev |
| `supertest` | 7.3.1 | MIT | dev |
| `tsx` | 4.23.15 | MIT | dev |
| `typescript` | 7.0.2 | Apache-2.0 | dev |
| `vite` | 8.3.4 | MIT | dev |

Overrides package.json: exceljs → uuid 11.1.1; mammoth → argparse 2.0.1. Это также учтено в lock-файле. OpenAI SDK присутствует для экспериментального провайдера, но ключ OpenAI не нужен проверяемой версии.

## Статический frontend, шрифты и изображения

| Компонент | Где | Учёт |
|---|---|---|
| petite-vue, включая Vue reactivity | `services/frontend/v2/petite-vue.iife.js` | Vendored минифицированный файл без заголовка версии/лицензии. Проект petite-vue распространяется под MIT; соответствие конкретного файла версии и полный notice нужно подтвердить перед передачей |
| Mermaid 10.9.1 | `services/frontend/puti.html`, CDN jsDelivr | MIT проекта Mermaid; сетевой CDN нужен для схемы на этой странице, не для расчёта |
| Manrope | Ссылки Google Fonts в frontend и v2 | Семейство под SIL OFL-1.1; шрифт не vendored, точная CDN-версия и текст лицензии в дереве отсутствуют. При отсутствии сети используется запасной системный шрифт |
| Системные шрифты кабинета | CSS кабинета | Файлов woff/woff2/ttf в каталоге кабинета не найдено; системные шрифты не поставляются как активы |
| Локальные SVG/PNG и бренд Альфа | `services/frontend/`, `v2/img`, favicon кабинета | Не npm-пакеты; права на бренд и происхождение изображений не определены package-lock. Требуется подтверждение владельца, см. CLEANUP |
| dc-lite.js | `services/frontend/v2/dc-lite.js` | Локальный мост классов экрана к petite-vue, отдельного стороннего пакета в коде не указано |

Лицензии petite-vue, Mermaid и Manrope названы на уровне проектов; локальные полные тексты и подтверждённые версии для всех ассетов не собраны. Лицензии npm далее отражают только metadata lock-файла; сохраните тексты LICENSE/NOTICE из поставляемых пакетов при финальной комплектации.

## Модель

По умолчанию модель выключена: пустой `AGENT_LLM_URL` отключает LLM без попыток сети, в том числе при запуске без `.env`. Опциональная модель: [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B), открытые веса, лицензия Apache 2.0 указана в карточке весов. Для локального запуска установите Ollama на хосте, загрузите `ollama pull qwen3:8b` и запустите службу `ollama serve`, если она ещё не работает. Потребление RAM зависит от квантования и контекста, модель работает вне контейнера агента.

Свой OpenAI-совместимый провайдер: `AGENT_LLM_URL` (base URL, например `https://openrouter.ai/api/v1`; полный путь `/chat/completions` тоже принимается), `AGENT_LLM_API_KEY` (можно пустой, без Authorization), `AGENT_LLM_MODEL`. Подробности подключения и отключения приведены в README. Платные API не нужны основному сценарию. Веса и Ollama не включены в дистрибутив; лицензии и notices конкретной загружаемой сборки учитываются при её передаче.

## Модели, сервисы и данные

| Компонент | Использование | Проверяемая версия и ограничения |
|---|---|---|
| [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B) | Опциональная `qwen3:8b` через Ollama на хосте | Открытые веса, Apache 2.0 по карточке весов. Веса не поставляются, по умолчанию LLM выключена |
| Qwen, клиент eval | `agent/eval/sim.py`, qwen/qwen3.8-flash | Опциональный сетевой eval, точные веса и лицензия не зафиксированы локально |
| Судья другой семьи моделей | judge_pack.py формирует пакет | Конкретная модель и лицензия не закреплены; человеческая калибровка отдельно |
| Внешний OpenAI-совместимый провайдер моделей с открытыми весами (например OpenRouter, Cloud.ru) | Явно настраиваемые base URL, модель и ключ | Опционально; сетевые услуги по условиям провайдера |
| OpenAI API | Экспериментальный провайдер кабинета только при AI_PROVIDER=openai | Опционально, не для проверки; закрытые модели не входят в проверяемую версию |
| Telegram | tgbot.py, внутренний eval | Не часть пользовательского пути, для проверки жюри не нужен |
| ЕГРЮЛ / ЕГРИП | `server/registry.ts`, fixtures/egr-mock.json | В Compose EGR_PROVIDER=mock: только синтетические записи с меткой мока |
| API-ФНС, DaData | Опциональные провайдеры registry.ts | Ключи FNS_API_KEY/DADATA_API_KEY, платные/внешние услуги не нужны проверке. API-ФНС является провайдером доступа, а не прямым подключением к корпоративной системе банка |
| ФНС egrul.nalog.ru | Ссылка в профиле | Внешняя справочная ссылка; не обязательный шаг сквозного сценария |
| БКИ | Подключения нет | Не считать реализованной проверкой кредитной истории |
| Банк, подписание, выдача | В кабинете реализованы роли client/manager/system, очередь, дозапрос, андеррайтинг, оффер, подпись, выдача и отказы с причинами | Данные и внешние проверки синтетические, реального подключения БКИ нет. Подпись демонстрационная по коду подтверждения без SMS, реальных переводов денег нет |
| Синтетические данные | data/synthetic, frontend/demo, fixtures кабинета, eval/data | Генераторы и тестовые сценарии репозитория; данные клиентов банка и внешние обучающие датасеты не используются ядром |

Веса моделей и сторонние датасеты в этой поставке не включены. Проверяемый продукт не требует платных API, мессенджера, SMS или корпоративных систем Альфа-Банка. Сборка получает публичные образы и npm-пакеты; это отличается от работы уже собранной версии. Полнота лицензирования точных hosted-моделей и локальных изображений остаётся задачей владельцев, а не заявленным свойством этой инвентаризации.

## Все транзитивные npm-пакеты lock-файла

Включены необязательные пакеты других платформ и сборочные инструменты. Путь различает вложенные версии; при отсутствии license это указано явно.

| Путь package-lock | Версия | Лицензия metadata |
|---|---|---|
| `node_modules/@esbuild/aix-ppc64` | 0.28.2 | MIT |
| `node_modules/@esbuild/android-arm` | 0.28.2 | MIT |
| `node_modules/@esbuild/android-arm64` | 0.28.2 | MIT |
| `node_modules/@esbuild/android-x64` | 0.28.2 | MIT |
| `node_modules/@esbuild/darwin-arm64` | 0.28.2 | MIT |
| `node_modules/@esbuild/darwin-x64` | 0.28.2 | MIT |
| `node_modules/@esbuild/freebsd-arm64` | 0.28.2 | MIT |
| `node_modules/@esbuild/freebsd-x64` | 0.28.2 | MIT |
| `node_modules/@esbuild/linux-arm` | 0.28.2 | MIT |
| `node_modules/@esbuild/linux-arm64` | 0.28.2 | MIT |
| `node_modules/@esbuild/linux-ia32` | 0.28.2 | MIT |
| `node_modules/@esbuild/linux-loong64` | 0.28.2 | MIT |
| `node_modules/@esbuild/linux-mips64el` | 0.28.2 | MIT |
| `node_modules/@esbuild/linux-ppc64` | 0.28.2 | MIT |
| `node_modules/@esbuild/linux-riscv64` | 0.28.2 | MIT |
| `node_modules/@esbuild/linux-s390x` | 0.28.2 | MIT |
| `node_modules/@esbuild/linux-x64` | 0.28.2 | MIT |
| `node_modules/@esbuild/netbsd-arm64` | 0.28.2 | MIT |
| `node_modules/@esbuild/netbsd-x64` | 0.28.2 | MIT |
| `node_modules/@esbuild/openbsd-arm64` | 0.28.2 | MIT |
| `node_modules/@esbuild/openbsd-x64` | 0.28.2 | MIT |
| `node_modules/@esbuild/openharmony-arm64` | 0.28.2 | MIT |
| `node_modules/@esbuild/sunos-x64` | 0.28.2 | MIT |
| `node_modules/@esbuild/win32-arm64` | 0.28.2 | MIT |
| `node_modules/@esbuild/win32-ia32` | 0.28.2 | MIT |
| `node_modules/@esbuild/win32-x64` | 0.28.2 | MIT |
| `node_modules/@fast-csv/format` | 4.3.5 | MIT |
| `node_modules/@fast-csv/format/node_modules/@types/node` | 14.18.63 | MIT |
| `node_modules/@fast-csv/parse` | 4.3.6 | MIT |
| `node_modules/@fast-csv/parse/node_modules/@types/node` | 14.18.63 | MIT |
| `node_modules/@napi-rs/canvas` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-android-arm64` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-darwin-arm64` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-darwin-x64` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-linux-arm-gnueabihf` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-linux-arm64-gnu` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-linux-arm64-musl` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-linux-riscv64-gnu` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-linux-x64-gnu` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-linux-x64-musl` | 0.1.80 | MIT |
| `node_modules/@napi-rs/canvas-win32-x64-msvc` | 0.1.80 | MIT |
| `node_modules/@noble/ciphers` | 1.3.0 | MIT |
| `node_modules/@noble/hashes` | 1.8.0 | MIT |
| `node_modules/@oxc-project/types` | 0.154.0 | MIT |
| `node_modules/@paralleldrive/cuid2` | 2.3.1 | MIT |
| `node_modules/@rolldown/binding-android-arm-eabi` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-android-arm64` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-darwin-arm64` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-darwin-x64` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-freebsd-x64` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-linux-arm-gnueabihf` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-linux-arm64-gnu` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-linux-arm64-musl` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-linux-ppc64-gnu` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-linux-s390x-gnu` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-linux-x64-gnu` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-linux-x64-musl` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-openharmony-arm64` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-win32-arm64-msvc` | 1.2.14 | MIT |
| `node_modules/@rolldown/binding-win32-x64-msvc` | 1.2.14 | MIT |
| `node_modules/@rolldown/pluginutils` | 1.0.1 | MIT |
| `node_modules/@swc/helpers` | 0.5.23 | Apache-2.0 |
| `node_modules/@types/body-parser` | 1.19.6 | MIT |
| `node_modules/@types/connect` | 3.4.38 | MIT |
| `node_modules/@types/cookiejar` | 2.1.5 | MIT |
| `node_modules/@types/express` | 5.0.6 | MIT |
| `node_modules/@types/express-serve-static-core` | 5.1.3 | MIT |
| `node_modules/@types/http-errors` | 2.0.5 | MIT |
| `node_modules/@types/methods` | 1.1.4 | MIT |
| `node_modules/@types/multer` | 2.3.0 | MIT |
| `node_modules/@types/node` | 26.6.5 | MIT |
| `node_modules/@types/pdfkit` | 0.17.6 | MIT |
| `node_modules/@types/qs` | 6.15.1 | MIT |
| `node_modules/@types/range-parser` | 1.2.7 | MIT |
| `node_modules/@types/react` | 19.3.0 | MIT |
| `node_modules/@types/react-dom` | 19.3.0 | MIT |
| `node_modules/@types/send` | 1.2.1 | MIT |
| `node_modules/@types/serve-static` | 2.2.0 | MIT |
| `node_modules/@types/superagent` | 8.1.11 | MIT |
| `node_modules/@types/supertest` | 7.2.1 | MIT |
| `node_modules/@typescript/typescript-aix-ppc64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-darwin-arm64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-darwin-x64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-freebsd-arm64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-freebsd-x64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-linux-arm` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-linux-arm64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-linux-loong64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-linux-mips64el` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-linux-ppc64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-linux-riscv64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-linux-s390x` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-linux-x64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-netbsd-arm64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-netbsd-x64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-openbsd-arm64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-openbsd-x64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-sunos-x64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-win32-arm64` | 7.0.2 | Apache-2.0 |
| `node_modules/@typescript/typescript-win32-x64` | 7.0.2 | Apache-2.0 |
| `node_modules/@vitejs/plugin-react` | 6.1.2 | MIT |
| `node_modules/@xmldom/xmldom` | 0.8.15 | MIT |
| `node_modules/accepts` | 2.0.0 | MIT |
| `node_modules/append-field` | 1.0.0 | MIT |
| `node_modules/archiver` | 5.3.2 | MIT |
| `node_modules/archiver-utils` | 2.1.0 | MIT |
| `node_modules/archiver-utils/node_modules/isarray` | 1.0.0 | MIT |
| `node_modules/archiver-utils/node_modules/readable-stream` | 2.3.8 | MIT |
| `node_modules/archiver-utils/node_modules/safe-buffer` | 5.1.2 | MIT |
| `node_modules/archiver-utils/node_modules/string_decoder` | 1.1.1 | MIT |
| `node_modules/argparse` | 2.0.1 | Python-2.0 |
| `node_modules/array-buffer-byte-length` | 1.0.2 | MIT |
| `node_modules/arraybuffer.prototype.slice` | 1.0.4 | MIT |
| `node_modules/asap` | 2.0.6 | MIT |
| `node_modules/async` | 3.2.6 | MIT |
| `node_modules/async-function` | 1.0.0 | MIT |
| `node_modules/asynckit` | 0.4.0 | MIT |
| `node_modules/available-typed-arrays` | 1.0.7 | MIT |
| `node_modules/balanced-match` | 1.0.2 | MIT |
| `node_modules/base64-js` | 1.5.1 | MIT |
| `node_modules/big-integer` | 1.6.52 | Unlicense |
| `node_modules/binary` | 0.3.0 | MIT |
| `node_modules/bl` | 4.1.0 | MIT |
| `node_modules/bluebird` | 3.4.7 | MIT |
| `node_modules/body-parser` | 2.3.0 | MIT |
| `node_modules/brace-expansion` | 1.1.21 | MIT |
| `node_modules/brotli` | 1.3.3 | MIT |
| `node_modules/buffer` | 5.7.1 | MIT |
| `node_modules/buffer-crc32` | 0.2.13 | MIT |
| `node_modules/buffer-indexof-polyfill` | 1.0.2 | MIT |
| `node_modules/buffers` | 0.1.1 | не указана |
| `node_modules/busboy` | 1.6.0 | не указана |
| `node_modules/bytes` | 3.1.2 | MIT |
| `node_modules/call-bind` | 1.0.9 | MIT |
| `node_modules/call-bind-apply-helpers` | 1.0.2 | MIT |
| `node_modules/call-bound` | 1.0.4 | MIT |
| `node_modules/chainsaw` | 0.1.0 | MIT/X11 |
| `node_modules/clone` | 2.1.2 | MIT |
| `node_modules/combined-stream` | 1.0.8 | MIT |
| `node_modules/component-emitter` | 1.3.1 | MIT |
| `node_modules/compress-commons` | 4.1.2 | MIT |
| `node_modules/concat-map` | 0.0.1 | MIT |
| `node_modules/content-disposition` | 2.0.1 | MIT |
| `node_modules/content-type` | 2.1.0 | MIT |
| `node_modules/cookie` | 0.7.2 | MIT |
| `node_modules/cookie-signature` | 1.2.2 | MIT |
| `node_modules/cookiejar` | 2.1.4 | MIT |
| `node_modules/core-util-is` | 1.0.3 | MIT |
| `node_modules/crc-32` | 1.2.2 | Apache-2.0 |
| `node_modules/crc32-stream` | 4.0.3 | MIT |
| `node_modules/csstype` | 3.2.3 | MIT |
| `node_modules/data-view-buffer` | 1.0.2 | MIT |
| `node_modules/data-view-byte-length` | 1.0.2 | MIT |
| `node_modules/data-view-byte-offset` | 1.0.1 | MIT |
| `node_modules/dayjs` | 1.11.23 | MIT |
| `node_modules/debug` | 4.4.3 | MIT |
| `node_modules/define-data-property` | 1.1.4 | MIT |
| `node_modules/define-properties` | 1.2.1 | MIT |
| `node_modules/delayed-stream` | 1.0.0 | MIT |
| `node_modules/depd` | 2.0.0 | MIT |
| `node_modules/detect-libc` | 2.1.2 | Apache-2.0 |
| `node_modules/dezalgo` | 1.0.4 | ISC |
| `node_modules/dfa` | 1.2.0 | MIT |
| `node_modules/dingbat-to-unicode` | 1.0.2 | BSD-2-Clause |
| `node_modules/docx` | 9.11.0 | MIT |
| `node_modules/dotenv` | 18.0.8 | BSD-2-Clause |
| `node_modules/duck` | 0.1.12 | BSD |
| `node_modules/dunder-proto` | 1.0.1 | MIT |
| `node_modules/duplexer2` | 0.1.4 | BSD-3-Clause |
| `node_modules/duplexer2/node_modules/isarray` | 1.0.0 | MIT |
| `node_modules/duplexer2/node_modules/readable-stream` | 2.3.8 | MIT |
| `node_modules/duplexer2/node_modules/safe-buffer` | 5.1.2 | MIT |
| `node_modules/duplexer2/node_modules/string_decoder` | 1.1.1 | MIT |
| `node_modules/ee-first` | 1.1.1 | MIT |
| `node_modules/encodeurl` | 2.0.0 | MIT |
| `node_modules/end-of-stream` | 1.4.5 | MIT |
| `node_modules/es-abstract` | 1.24.2 | MIT |
| `node_modules/es-abstract-get` | 1.0.0 | MIT |
| `node_modules/es-define-property` | 1.0.1 | MIT |
| `node_modules/es-errors` | 1.3.0 | MIT |
| `node_modules/es-object-atoms` | 1.1.2 | MIT |
| `node_modules/es-set-tostringtag` | 2.1.0 | MIT |
| `node_modules/es-to-primitive` | 1.3.4 | MIT |
| `node_modules/esbuild` | 0.28.2 | MIT |
| `node_modules/escape-html` | 1.0.3 | MIT |
| `node_modules/etag` | 1.8.1 | MIT |
| `node_modules/exceljs` | 4.4.0 | MIT |
| `node_modules/express` | 5.3.0 | MIT |
| `node_modules/fast-csv` | 4.3.6 | MIT |
| `node_modules/fast-deep-equal` | 3.1.3 | MIT |
| `node_modules/fast-safe-stringify` | 2.1.1 | MIT |
| `node_modules/fdir` | 6.5.0 | MIT |
| `node_modules/fflate` | 0.8.3 | MIT |
| `node_modules/finalhandler` | 2.1.1 | MIT |
| `node_modules/fontkit` | 2.0.4 | MIT |
| `node_modules/for-each` | 0.3.5 | MIT |
| `node_modules/form-data` | 4.0.6 | MIT |
| `node_modules/form-data/node_modules/mime-db` | 1.52.0 | MIT |
| `node_modules/form-data/node_modules/mime-types` | 2.1.35 | MIT |
| `node_modules/formidable` | 3.5.4 | MIT |
| `node_modules/forwarded` | 0.2.0 | MIT |
| `node_modules/fresh` | 2.0.0 | MIT |
| `node_modules/fs-constants` | 1.0.0 | MIT |
| `node_modules/fs.realpath` | 1.0.0 | ISC |
| `node_modules/fsevents` | 2.3.3 | MIT |
| `node_modules/fstream` | 1.0.12 | ISC |
| `node_modules/function-bind` | 1.1.2 | MIT |
| `node_modules/function.prototype.name` | 1.2.0 | MIT |
| `node_modules/functions-have-names` | 1.2.3 | MIT |
| `node_modules/generator-function` | 2.0.1 | MIT |
| `node_modules/get-intrinsic` | 1.3.0 | MIT |
| `node_modules/get-proto` | 1.0.1 | MIT |
| `node_modules/get-symbol-description` | 1.1.0 | MIT |
| `node_modules/glob` | 7.2.3 | ISC |
| `node_modules/globalthis` | 1.0.4 | MIT |
| `node_modules/gopd` | 1.2.0 | MIT |
| `node_modules/graceful-fs` | 4.2.11 | ISC |
| `node_modules/has-bigints` | 1.1.0 | MIT |
| `node_modules/has-property-descriptors` | 1.0.2 | MIT |
| `node_modules/has-proto` | 1.2.0 | MIT |
| `node_modules/has-symbols` | 1.1.0 | MIT |
| `node_modules/has-tostringtag` | 1.0.2 | MIT |
| `node_modules/hash.js` | 1.1.7 | MIT |
| `node_modules/hasown` | 2.0.4 | MIT |
| `node_modules/http-errors` | 2.0.1 | MIT |
| `node_modules/iconv-lite` | 0.7.3 | MIT |
| `node_modules/ieee754` | 1.2.1 | BSD-3-Clause |
| `node_modules/immediate` | 3.0.6 | MIT |
| `node_modules/inflight` | 1.0.6 | ISC |
| `node_modules/inherits` | 2.0.4 | ISC |
| `node_modules/internal-slot` | 1.1.0 | MIT |
| `node_modules/ipaddr.js` | 1.9.1 | MIT |
| `node_modules/is-array-buffer` | 3.0.5 | MIT |
| `node_modules/is-async-function` | 2.1.1 | MIT |
| `node_modules/is-bigint` | 1.1.0 | MIT |
| `node_modules/is-boolean-object` | 1.2.2 | MIT |
| `node_modules/is-callable` | 1.2.7 | MIT |
| `node_modules/is-data-view` | 1.0.2 | MIT |
| `node_modules/is-date-object` | 1.1.0 | MIT |
| `node_modules/is-document.all` | 1.0.0 | MIT |
| `node_modules/is-finalizationregistry` | 1.1.1 | MIT |
| `node_modules/is-generator-function` | 1.1.2 | MIT |
| `node_modules/is-map` | 2.0.3 | MIT |
| `node_modules/is-negative-zero` | 2.0.3 | MIT |
| `node_modules/is-number-object` | 1.1.1 | MIT |
| `node_modules/is-promise` | 4.0.0 | MIT |
| `node_modules/is-regex` | 1.2.1 | MIT |
| `node_modules/is-set` | 2.0.3 | MIT |
| `node_modules/is-shared-array-buffer` | 1.0.4 | MIT |
| `node_modules/is-string` | 1.1.1 | MIT |
| `node_modules/is-symbol` | 1.1.1 | MIT |
| `node_modules/is-typed-array` | 1.1.15 | MIT |
| `node_modules/is-weakmap` | 2.0.2 | MIT |
| `node_modules/is-weakref` | 1.1.1 | MIT |
| `node_modules/is-weakset` | 2.0.4 | MIT |
| `node_modules/isarray` | 2.0.5 | MIT |
| `node_modules/jszip` | 3.10.2 | (MIT OR GPL-3.0-or-later) |
| `node_modules/jszip/node_modules/isarray` | 1.0.0 | MIT |
| `node_modules/jszip/node_modules/readable-stream` | 2.3.8 | MIT |
| `node_modules/jszip/node_modules/safe-buffer` | 5.1.2 | MIT |
| `node_modules/jszip/node_modules/string_decoder` | 1.1.1 | MIT |
| `node_modules/lazystream` | 1.0.1 | MIT |
| `node_modules/lazystream/node_modules/isarray` | 1.0.0 | MIT |
| `node_modules/lazystream/node_modules/readable-stream` | 2.3.8 | MIT |
| `node_modules/lazystream/node_modules/safe-buffer` | 5.1.2 | MIT |
| `node_modules/lazystream/node_modules/string_decoder` | 1.1.1 | MIT |
| `node_modules/lie` | 3.3.0 | MIT |
| `node_modules/lightningcss` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-android-arm64` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-darwin-arm64` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-darwin-x64` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-freebsd-x64` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-linux-arm-gnueabihf` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-linux-arm64-gnu` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-linux-arm64-musl` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-linux-x64-gnu` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-linux-x64-musl` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-win32-arm64-msvc` | 1.33.0 | MPL-2.0 |
| `node_modules/lightningcss-win32-x64-msvc` | 1.33.0 | MPL-2.0 |
| `node_modules/linebreak` | 1.1.0 | MIT |
| `node_modules/linebreak/node_modules/base64-js` | 0.0.8 | MIT |
| `node_modules/listenercount` | 1.0.1 | ISC |
| `node_modules/lodash.defaults` | 4.2.0 | MIT |
| `node_modules/lodash.difference` | 4.5.0 | MIT |
| `node_modules/lodash.escaperegexp` | 4.1.2 | MIT |
| `node_modules/lodash.flatten` | 4.4.0 | MIT |
| `node_modules/lodash.groupby` | 4.6.0 | MIT |
| `node_modules/lodash.isboolean` | 3.0.3 | MIT |
| `node_modules/lodash.isequal` | 4.5.0 | MIT |
| `node_modules/lodash.isfunction` | 3.0.9 | MIT |
| `node_modules/lodash.isnil` | 4.0.0 | MIT |
| `node_modules/lodash.isplainobject` | 4.0.6 | MIT |
| `node_modules/lodash.isundefined` | 3.0.1 | MIT |
| `node_modules/lodash.union` | 4.6.0 | MIT |
| `node_modules/lodash.uniq` | 4.5.0 | MIT |
| `node_modules/lop` | 0.4.2 | BSD-2-Clause |
| `node_modules/lucide-react` | 1.58.0 | ISC |
| `node_modules/mammoth` | 1.13.0 | BSD-2-Clause |
| `node_modules/math-intrinsics` | 1.1.0 | MIT |
| `node_modules/media-typer` | 1.1.1 | MIT |
| `node_modules/merge-descriptors` | 2.0.0 | MIT |
| `node_modules/methods` | 1.1.2 | MIT |
| `node_modules/mime` | 2.6.0 | MIT |
| `node_modules/mime-db` | 1.54.0 | MIT |
| `node_modules/mime-types` | 3.0.2 | MIT |
| `node_modules/minimalistic-assert` | 1.0.1 | ISC |
| `node_modules/minimatch` | 3.1.5 | ISC |
| `node_modules/minimist` | 1.2.8 | MIT |
| `node_modules/mkdirp` | 0.5.6 | MIT |
| `node_modules/ms` | 2.1.3 | MIT |
| `node_modules/multer` | 2.4.0 | MIT |
| `node_modules/multer/node_modules/media-typer` | 0.3.0 | MIT |
| `node_modules/multer/node_modules/mime-db` | 1.52.0 | MIT |
| `node_modules/multer/node_modules/mime-types` | 2.1.35 | MIT |
| `node_modules/multer/node_modules/type-is` | 1.6.18 | MIT |
| `node_modules/nanoid` | 6.0.2 | MIT |
| `node_modules/negotiator` | 1.1.0 | MIT |
| `node_modules/normalize-path` | 3.0.0 | MIT |
| `node_modules/object-inspect` | 1.13.4 | MIT |
| `node_modules/object-keys` | 1.1.1 | MIT |
| `node_modules/object.assign` | 4.1.7 | MIT |
| `node_modules/on-finished` | 2.4.1 | MIT |
| `node_modules/once` | 1.4.0 | ISC |
| `node_modules/openai` | 7.34.0 | Apache-2.0 |
| `node_modules/option` | 0.2.4 | BSD-2-Clause |
| `node_modules/own-keys` | 1.0.2 | MIT |
| `node_modules/pako` | 1.0.11 | (MIT AND Zlib) |
| `node_modules/parseurl` | 1.3.3 | MIT |
| `node_modules/path-is-absolute` | 1.0.1 | MIT |
| `node_modules/path-to-regexp` | 8.4.2 | MIT |
| `node_modules/pdf-parse` | 2.4.5 | Apache-2.0 |
| `node_modules/pdfjs-dist` | 5.4.296 | Apache-2.0 |
| `node_modules/pdfkit` | 0.20.2 | MIT |
| `node_modules/picocolors` | 1.1.1 | ISC |
| `node_modules/picomatch` | 4.0.7 | MIT |
| `node_modules/png-js` | 2.0.0 | не указана |
| `node_modules/possible-typed-array-names` | 1.1.0 | MIT |
| `node_modules/postcss` | 8.5.30 | MIT |
| `node_modules/postcss/node_modules/nanoid` | 3.3.20 | MIT |
| `node_modules/prettier` | 3.9.10 | MIT |
| `node_modules/process-nextick-args` | 2.0.1 | MIT |
| `node_modules/proxy-addr` | 2.0.8 | MIT |
| `node_modules/qs` | 6.16.1 | BSD-3-Clause |
| `node_modules/range-parser` | 1.3.0 | MIT |
| `node_modules/raw-body` | 3.0.2 | MIT |
| `node_modules/react` | 19.3.1 | MIT |
| `node_modules/react-dom` | 19.3.1 | MIT |
| `node_modules/readable-stream` | 3.6.2 | MIT |
| `node_modules/readdir-glob` | 1.1.3 | Apache-2.0 |
| `node_modules/readdir-glob/node_modules/brace-expansion` | 2.1.7 | MIT |
| `node_modules/readdir-glob/node_modules/minimatch` | 5.1.9 | ISC |
| `node_modules/reflect.getprototypeof` | 1.0.10 | MIT |
| `node_modules/regexp.prototype.flags` | 1.5.4 | MIT |
| `node_modules/restructure` | 3.0.2 | MIT |
| `node_modules/rimraf` | 2.7.1 | ISC |
| `node_modules/rolldown` | 1.2.14 | MIT |
| `node_modules/router` | 2.2.0 | MIT |
| `node_modules/safe-array-concat` | 1.1.4 | MIT |
| `node_modules/safe-buffer` | 5.2.1 | MIT |
| `node_modules/safe-push-apply` | 1.0.0 | MIT |
| `node_modules/safe-regex-test` | 1.1.0 | MIT |
| `node_modules/safer-buffer` | 2.1.2 | MIT |
| `node_modules/sax` | 1.6.1 | BlueOak-1.0.0 |
| `node_modules/saxes` | 5.0.1 | ISC |
| `node_modules/scheduler` | 0.28.0 | MIT |
| `node_modules/send` | 1.2.1 | MIT |
| `node_modules/serve-static` | 2.2.1 | MIT |
| `node_modules/set-function-length` | 1.2.2 | MIT |
| `node_modules/set-function-name` | 2.0.2 | MIT |
| `node_modules/set-proto` | 1.0.0 | MIT |
| `node_modules/setimmediate` | 1.0.5 | MIT |
| `node_modules/setprototypeof` | 1.2.0 | ISC |
| `node_modules/side-channel` | 1.1.1 | MIT |
| `node_modules/side-channel-list` | 1.0.1 | MIT |
| `node_modules/side-channel-map` | 1.0.1 | MIT |
| `node_modules/side-channel-weakmap` | 1.0.2 | MIT |
| `node_modules/source-map-js` | 1.2.2 | BSD-3-Clause |
| `node_modules/statuses` | 2.0.2 | MIT |
| `node_modules/stop-iteration-iterator` | 1.1.0 | MIT |
| `node_modules/streamsearch` | 1.1.0 | не указана |
| `node_modules/string.prototype.trim` | 1.2.11 | MIT |
| `node_modules/string.prototype.trimend` | 1.0.10 | MIT |
| `node_modules/string.prototype.trimstart` | 1.0.8 | MIT |
| `node_modules/string_decoder` | 1.3.0 | MIT |
| `node_modules/superagent` | 10.4.1 | MIT |
| `node_modules/supertest` | 7.3.1 | MIT |
| `node_modules/tar-stream` | 2.2.0 | MIT |
| `node_modules/tiny-inflate` | 1.0.3 | MIT |
| `node_modules/tinyglobby` | 0.2.17 | MIT |
| `node_modules/tmp` | 0.2.7 | MIT |
| `node_modules/toidentifier` | 1.0.1 | MIT |
| `node_modules/traverse` | 0.3.10 | MIT |
| `node_modules/tslib` | 2.8.1 | 0BSD |
| `node_modules/tsx` | 4.23.15 | MIT |
| `node_modules/type-is` | 2.1.0 | MIT |
| `node_modules/typed-array-buffer` | 1.0.3 | MIT |
| `node_modules/typed-array-byte-length` | 1.0.3 | MIT |
| `node_modules/typed-array-byte-offset` | 1.0.5 | MIT |
| `node_modules/typed-array-length` | 1.0.8 | MIT |
| `node_modules/typedarray.prototype.slice` | 1.0.6 | MIT |
| `node_modules/typescript` | 7.0.2 | Apache-2.0 |
| `node_modules/unbox-primitive` | 1.1.0 | MIT |
| `node_modules/underscore` | 1.13.8 | MIT |
| `node_modules/undici-types` | 8.9.0 | MIT |
| `node_modules/unicode-properties` | 1.4.1 | MIT |
| `node_modules/unicode-trie` | 2.0.0 | MIT |
| `node_modules/unicode-trie/node_modules/pako` | 0.2.9 | MIT |
| `node_modules/unpipe` | 1.0.0 | MIT |
| `node_modules/unzipper` | 0.10.14 | MIT |
| `node_modules/unzipper/node_modules/isarray` | 1.0.0 | MIT |
| `node_modules/unzipper/node_modules/readable-stream` | 2.3.8 | MIT |
| `node_modules/unzipper/node_modules/safe-buffer` | 5.1.2 | MIT |
| `node_modules/unzipper/node_modules/string_decoder` | 1.1.1 | MIT |
| `node_modules/util-deprecate` | 1.0.2 | MIT |
| `node_modules/uuid` | 11.1.1 | MIT |
| `node_modules/vary` | 1.1.2 | MIT |
| `node_modules/vite` | 8.3.4 | MIT |
| `node_modules/which-boxed-primitive` | 1.1.1 | MIT |
| `node_modules/which-builtin-type` | 1.2.1 | MIT |
| `node_modules/which-collection` | 1.0.2 | MIT |
| `node_modules/which-typed-array` | 1.1.24 | MIT |
| `node_modules/wrappy` | 1.0.2 | ISC |
| `node_modules/xml` | 1.0.1 | MIT |
| `node_modules/xml-js` | 1.6.11 | MIT |
| `node_modules/xmlbuilder` | 10.1.1 | MIT |
| `node_modules/xmlchars` | 2.2.0 | MIT |
| `node_modules/zip-stream` | 4.1.1 | MIT |
| `node_modules/zip-stream/node_modules/archiver-utils` | 3.0.4 | MIT |
| `node_modules/zod` | 4.6.7 | MIT |
