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
