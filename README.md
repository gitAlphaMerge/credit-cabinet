# Credit Cabinet

Скелет микросервисной архитектуры сервиса кредитного кабинета.

## Сервисы и лимиты памяти
- api (Go API): порт 8080, mem_limit: 64m
- ml-model (Python-модель, заглушка): порт 5000, mem_limit: 384m
- frontend (Nginx): порт ${FRONTEND_PORT:-80}, mem_limit: 64m

Суммарно выделено 512M оперативной памяти (в рамках лимита сервера <= 600M).

---

## Как поднять за 2 минуты

### 1. Требования
- Docker и Docker Compose.

### 2. Запуск
В корне репозитория выполните:
```bash
docker compose up --build -d
```
Сборка и старт всех трех контейнеров занимают до одной минуты.

### 3. Проверка работы

- Проверить статус контейнеров:
  ```bash
  docker compose ps
  ```

- Healthcheck Go API:
  ```bash
  curl http://localhost:8080/health
  ```

- Скоринг Go API:
  ```bash
  curl -X POST http://localhost:8080/score
  ```

- Фронтенд: открыть в браузере http://localhost (или порт из FRONTEND_PORT).

- Контроль лимитов памяти:
  ```bash
  docker stats --no-stream
  ```

---

## Остановка
```bash
docker compose down
```
