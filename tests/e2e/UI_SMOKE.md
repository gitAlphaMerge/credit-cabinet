# Q3: браузерный смоук

Запускать на отдельной локальной демо-БД. Скрипт реально подаёт заявление и меняет статусы заявок менеджера. Пакеты не устанавливает, HTTP не подменяет, LLM не нужна. Использует Node 24, глобальный WebSocket и Chrome DevTools Protocol.

Нужен работающий локальный стенд с UI и API под одним BASE_URL. Для клиента: существующий аккаунт, завершённое обучение, два независимых сохранённых подбора без уже созданного lead, по одному на ширину. Для менеджера: аккаунт с role=manager в БД. Подготовить по две независимые красные заявки для каждого действия: request_info с дырой и доступным select, send_to_underwriting с полным досье и альтернативой в пределах лимита, reject. Это шесть отдельных заявок, по одной на действие и ширину. Заявки менеджера создаются через штатный submit и system escalation, не через подмену HTTP-ответов. На 1440 сценарий использует оставшиеся queued заявки после 390. Для повторного запуска нужен чистый стенд с теми же фикстурами.

Из корня репозитория в PowerShell:

```powershell
$env:BASE_URL = 'http://127.0.0.1:3000'
$env:CHROME_PATH = 'C:\path\to\chrome.exe'
$env:CLIENT_PHONE = 'телефон локального клиента'
$env:CLIENT_PASSWORD = 'пароль локального клиента'
$env:MANAGER_PHONE = 'телефон локального менеджера'
$env:MANAGER_PASSWORD = 'пароль локального менеджера'
node tests/e2e/ui_smoke.mjs
```

CHROME_PATH необязателен: поиск в `%LOCALAPPDATA%/ms-playwright/chromium-*/chrome-win*/chrome.exe`. BASE_URL допускает только loopback. Аккаунты не выводятся в JSON, текст ввода сохраняется только как длина. Скрипт не читает .env. Chrome запускается без видимого окна, каждый сценарий получает отдельный browser context.

Для 390 и 1440: клиент проходит лендинг, вход, кабинет, историю подборов, результат, оформление. Проверяется наличие v2-заявки и submit в журнале, одного зелёного текста недостаточно. Менеджер проходит лендинг, вход, очередь, досье и реальное действие. Кнопки активируются через Tab/Enter, поля набираются через CDP Input.insertText с Ctrl+A. DOM используется для чтения, ожиданий, аудита и выбора подходящей тестовой заявки. DOM click/focus/value assignments и мышь не используются. Проверка табуляции доказывает достижимость целевых контролов, но семантическую логичность порядка нужно дополнительно оценить руками.

На каждом шаге PNG, горизонтальный overflow, имена видимых контролов, alt картинок, связность aria-invalid/aria-describedby и положительные tabindex. В JSON сохраняются все console.error, Runtime.exceptionThrown, HTTP >=400 и Network.loadingFailed. Консольная таблица и `tests/e2e/out/ui-smoke.json` содержат результат; exit 1 при любой ошибке, недостающем шаге или нарушении доступности. Скриншоты охватывают только страницу изолированного Chrome, не рабочий стол.

Известный красный сценарий: клиентский submit сейчас вызывает legacy `/selections/:id/application` и не создаёт v2 `/applications`. Это намеренно проваливает смоук. Отсутствие подходящих fixture-заявок тоже провал, а не skip. Ошибка отдельного сценария не блокирует остальные роли и ширины.

Проверено в песочнице только `node --check tests/e2e/ui_smoke.mjs`. Браузерный запуск и визуальная проверка PNG остаются архитектору по условиям TASK.md.

Тесты UI из `hw/tolya/alfa-intellect`:

```powershell
npx tsc --noEmit
npx tsx --test tests/qa/q3-manager.test.tsx tests/qa/q3-screens.test.tsx tests/qa/q3-server.test.tsx
```

При sandbox ENOMEM у tsx доступен локальный загрузчик на уже установленном esbuild, без установки зависимостей:

```powershell
node --import ./tests/qa/q3-loader.ts --test tests/qa/q3-manager.test.tsx tests/qa/q3-screens.test.tsx tests/qa/q3-server.test.tsx
```

Тесты детерминированные, генератора случайных данных нет, seed неприменим. `BUG:` в server-файле намеренно красный. Зелёная часть для пяти повторов: `node --import ./tests/qa/q3-loader.ts --test --test-skip-pattern="BUG:" tests/qa/q3-manager.test.tsx tests/qa/q3-screens.test.tsx tests/qa/q3-server.test.tsx`. Мутации выполняются в памяти, по одной; продакшен-файлы не записываются. Полный регресс: `npm test`; при ENOMEM аналогично `node --import ./tests/qa/q3-loader.ts --test tests/*.test.ts tests/*.test.tsx`.
