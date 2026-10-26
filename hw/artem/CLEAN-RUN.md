# Чистый прогон жюри (Clean Jury Run)

- **Дата:** 26.10.2026
- **Ветка:** `artem/audit-v2`
- **Окружение:** macOS, клон в `~/clean-jury-run`, без Ollama (шаблоны).

---

## 1. Статус контейнеров

Все 5 сервисов поднялись и находятся в статусе `healthy`:

```text
NAME                             IMAGE                            STATUS
clean-jury-run-agent-1           clean-jury-run-agent             Up (healthy)
clean-jury-run-alfa-intellect-1  clean-jury-run-alfa-intellect    Up (healthy)
clean-jury-run-api-1             clean-jury-run-api               Up (healthy)
clean-jury-run-frontend-1        clean-jury-run-frontend          Up (healthy)
clean-jury-run-ml-model-1        clean-jury-run-ml-model          Up (healthy)
```

---

## 2. Результаты проверок из README

| Проверка | Команда | Результат |
|---|---|---|
| Healthcheck API | `curl http://localhost:8080/health` | `HTTP 200 {"status":"ok"}` |
| Healthcheck Кабинет | `curl http://localhost:4173/health` | `HTTP 200 {"status":"ok","db":"ok","team_api":"ok"}` |
| Сид менеджера | `docker compose exec -T alfa-intellect npx tsx scripts/seed-manager.ts` | 4 демо-заявки созданы, менеджер `79990000500`, клиенты `79990000501..504` |
| Smoke Кабинета | `docker compose exec -T alfa-intellect node scripts/smoke.mjs --base http://127.0.0.1:4173` | 6/6 OK (GET /, /demo, /health, регистрация, ИНН, ядро) |
| Smoke Фронта/API | `python3 scripts/smoke.py --base http://localhost` | 13/13 OK (статика, роуты, боевые CSV, ошибки 400) |
| Агент без LLM | `docker compose exec -T agent python /tmp/check_ai.py` | OK (`model=templates`, все ответы `source=template`) |
| Скоринг через API | `POST http://localhost:8080/score` | HTTP 200, получен `decision_id` |
| Скоринг через Nginx | `POST http://localhost/api/score` | HTTP 200, получен `decision_id` |

---

## 3. Дыры и расхождения с README

1. **`net/http: TLS handshake timeout` к Docker Hub при сборке:**
   - Команда: `docker compose up --build`
   - Ошибка: `failed to resolve source metadata for docker.io/library/python:3.11-slim: TLS handshake timeout`
   - Проблема: README умалчивает о блокировках Docker Hub. Без настройки `registry-mirrors` в `daemon.json` чистый запуск падает на этапе сборки.

2. **Зависание Docker daemon на macOS:**
   - Одновременная компиляция и тяжелый `npm ci` перегружают виртуалку Docker Desktop, сокет `docker.sock` перестает отвечать до перезапуска процесса.

3. **База `credit_cabinet.db` без volume в `api`:**
   - Файл SQLite лежит внутри эфемерного слоя контейнера. После `docker compose down` история досье полностью теряется.

4. **Порт 8080 открыт на `0.0.0.0`:**
   - Сервис `api` доступен извне в обход фронтенда и авторизации кабинета.

---

## 4. База досье и персистентность (Шаг 2)

### 4.1. Персистентность SQLite в Go API
- **Было:** База `credit_cabinet.db` писалась в корень контейнера `/app/credit_cabinet.db` без тома. При `docker compose down` все скоринг-логи и досье безвозвратно удалялись.
- **Сделано:**
  1. В `docker-compose.yml` для сервиса `api` задана переменная `DB_PATH=/app/data/credit_cabinet.db`.
  2. Подключен именованный volume `api_data:/app/data`.
  3. Том `api_data` зарегистрирован в корневой секции `volumes:`.
- **Верификация:**
  - Создана запись через `POST /score` -> получен `decision_id: 224678f6-82d9-4db7-936b-00cdb6db72e3`.
  - Выполнен полный цикл остановки и удаления контейнеров: `docker compose down` -> `docker compose up -d`.
  - Запрос `GET http://localhost:8080/dossier/224678f6-82d9-4db7-936b-00cdb6db72e3` вернул `HTTP 200 OK` с полным телом запроса и ответа скоринга.

### 4.2. Архитектурный анализ владения досье (Go vs Express Толи)
В кодовой базе выявлена коллизия термина **«Досье»**:

| Параметр | Go API (`services/api/main.go`) | Express Кабинет (`hw/tolya/alfa-intellect`) |
|---|---|---|
| **Эндпоинт** | `GET /dossier/{decision_id}` | `GET /api/dossier/:id` (где `:id` — `application_id`) |
| **Сущность** | Неизменяемый технический лог скоринга ядра | Бизнес-досье кредитной заявки клиента |
| **Ключ** | `decision_id` (UUID скоринга) | `application_id` (ID заявки в кабинете) |
| **Данные** | `request_payload`, `response_payload`, `model_version` | Статус заявки, чек-листы N/M, дыры (`holes`), альтернативы, журнал событий |
| **Хранилище** | `credit_cabinet.db` (`api_data`) | `alfa.sqlite` (`alfa_data`) |

**Рекомендация по владельцу:**
1. Код Толи (`alfa-intellect`) не модифицируется: за кабинетом остаётся роль владельца **бизнес-досье** заявки клиента.
2. Эндпоинт в Go API концептуально является **аудит-логом скоринга** (`scoring-log` / `decision-record`). Для исключения путаницы у жюри в OpenAPI и документации зафиксировано: Go API отвечает за сохранение неизменяемого слепка скорингового решения, а кабинет Толи — за состояние кредитного досье предпринимателя.

---

## 5. Безопасность стыков (Шаг 3)

### 5.1. Сетевая изоляция ядра (порт 8080)
- **Уязвимость:** Порт 8080 сервиса `api` был выставлен на `0.0.0.0:8080`. Ядро скоринга было доступно напрямую с любого хоста мимо фронтенда, WAF и аутентификации кабинета.
- **Устранение:** Из `docker-compose.yml` удалена секция `ports: ["8080:8080"]` у сервиса `api`. Сервис изолирован во внутренней подсети compose и доступен только через `http://api:8080` для доверенных сервисов (`frontend`, `alfa-intellect`, `agent`).
- **Верификация:**
  - Внешний запрос `curl http://localhost:8080/health` -> `Failed to connect / Connection refused`.
  - Запрос через реверс-прокси Nginx `POST http://localhost/api/score` -> `HTTP 200 OK`.

### 5.2. Аудит логов на утечки ПДн и коммерческой тайны
- Проинспектированы логи `api` и `ml-model`: тела финансовых выписок, контрагенты, назначения платежей и персональные данные в stdout/stderr не выводятся; фиксируются только HTTP-метод, URI, статус ответа и технические логи инициализации.

### 5.3. Аудит `.gitignore`
- В `.gitignore` добавлены правила исключения локальных SQLite баз (`*.db`, `*.db-journal`, `*.sqlite`, `*.sqlite3`), предотвращающие случайную фиксацию конфиденциальных тестовых выписок в Git.

---

## 6. Актуализация контракта API (Шаг 4)

Проведена сверка context/api-contract.md с кодом services/api/main.go и спецификацией docs/openapi.yaml:
1. Устранено устаревшее упоминание Caddy: шлюз проксируется через production Nginx (services/frontend/nginx.conf).
2. Синхронизирован GET /health: зафиксирован реальный формат ответа Go API {"status":"ok"} вместо фиктивного stub-ответа.
3. Документирован эндпоинт GET /dossier/{decision_id}: описаны параметры пути, схема возвращаемого снимка решения и статус-коды ошибок (400, 404, 405, 500).
4. Синхронизированы статус-коды /score: зафиксированы ошибки парсинга (400), метод (405), лимит размера выписки 5 МБ (413) и таймаут ядра скоринга (502).
