# Контракт API (Актуальная версия)

Взаимодействие клиентских сервисов (frontend, alfa-intellect, agent) со шлюзом services/api (Go) и ядром services/ml-model (Python).

- Шлюз: Go HTTP-сервис (services/api), порт 8080 (внутренняя сеть compose).
- Внешний доступ: через реверс-прокси Nginx (services/frontend), проксирующий /api/ -> http://api:8080/.
- Ядро скоринга: Python сервис ml-model (http://ml-model:5000/score, таймаут 30 с), снаружи закрыто.
- Хранилище решений: SQLite (credit_cabinet.db на томе api_data).

---

## 1. GET /health

Проверка работоспособности Go-шлюза.

### Ответ 200 OK
```json
{
  "status": "ok"
}
```

---

## 2. POST /score

Расчет кредитного лимита по выписке и анкете. При успешном скоринге решение автоматически сохраняется в SQLite (таблица dossiers).

- Заголовки: Content-Type: application/json
- Лимит тела: до 5 МБ

### Ответ 200 OK
```json
{
  "decision_id": "224678f6-82d9-4db7-936b-00cdb6db72e3",
  "model_version": "liza-0.1",
  "core": {
    "stage": 2,
    "status": "нужен менеджер",
    "limit_now_rub": 4665080
  },
  "view": {
    "status": "need_manager"
  }
}
```

### Ошибки
- 400 Bad Request: `{"error":"invalid json"}`
- 405 Method Not Allowed
- 413 Payload Too Large: `{"error":"http: request body too large"}`
- 500 Internal Server Error: `{"error":"failed to forward request"}`
- 502 Bad Gateway: `{"error":"ml service unavailable"}`

---

## 3. GET /dossier/{decision_id}

Получение неизменяемого аудиторского слепка решения скоринга из базы SQLite (credit_cabinet.db).

- Параметр пути: decision_id (UUID)

### Ответ 200 OK
```json
{
  "decision_id": "224678f6-82d9-4db7-936b-00cdb6db72e3",
  "model_version": "liza-0.1",
  "request_payload": {},
  "response_payload": {},
  "created_at": "2026-10-26T08:12:06Z"
}
```

### Ошибки
- 400 Bad Request: `{"error":"id is required"}`
- 404 Not Found: `{"error":"dossier not found"}`
- 405 Method Not Allowed
- 500 Internal Server Error: `{"error":"database query failed"}
`
