# Контракт API · черновик 11.10

Как сайт разговаривает с окошком `services/ml-model/app.py`. Поменял поле, поменяй здесь и в `translate.py`.
Окошко без памяти (решение 7.10): всё, что нужно для ответа, едет в каждом запросе.

---

## GET /health

```json
{
  "status": "ok",
  "core_id": "stub",
  "model_version": "stub-reference-0.1"
}
```

---

## POST /score

`Content-Type: application/json`, тело до 5 МБ, выписка до 50 000 строк.

### Запрос

```json
{
  "statement_csv": "date,amount,counterparty,purpose\n2025-10-01,-19.00,Банк,Комиссия ...\n...",
  "need": {
    "purpose": "кассовый разрыв",
    "amount_rub": 1500000,
    "term_months": 12,
    "repay_from": "оплата по договору",
    "asked_for": "кредит"
  },
  "questionnaire": {
    "form": "ООО",
    "need": "кассовый разрыв",
    "sector": "стройка",
    "years": "больше 3",
    "trend": "в плюс"
  },
  "confirmed_fields": {
    "contract_main_customer": {
      "sum_rub": 1440000,
      "months": 12
    }
  },
  "history": [
    {
      "role": "agent",
      "text": "..."
    },
    {
      "role": "user",
      "text": "..."
    }
  ]
}
```

| Поле | Обязательно | Что это |
| --- | --- | --- |
| `statement_csv` | да | выписка текстом, колонки `date, amount, counterparty, purpose`; приход плюсом, расход минусом |
| `need.purpose` | да | одна из 5 нужд: кассовый разрыв, закупка под контракт, оборудование, сезон, рост |
| `need.amount_rub`, `need.term_months` | да | сколько и на сколько месяцев (1–120) |
| `need.asked_for` | нет | что клиент просил («кредит»): нужно, чтобы сказать «лучше лизинг» |
| `questionnaire.form`, `questionnaire.years` | да | ИП / ООО; возраст бизнеса |
| `confirmed_fields` | нет | данные, подтверждённые документом. Только они двигают «лимит после шага» |
| `history` | нет | разговор целиком, для агента; ядро его не читает |

### Ответ 200

```json
{
  "decision_id": "uuid",
  "created_at": "2026-10-11T13:00:00+00:00",
  "core_id": "stub",
  "model_version": "stub-reference-0.1",
  "core": {
    "status": "можно после шага",
    "instrument": "овердрафт",
    "stops_fired": [],
    "reasons": [
      "CONCENTRATION_ONE_CUSTOMER",
      "STRESS_NEGATIVE_FLOW",
      "CASH_GAP"
    ],
    "missing": [
      "contract_main_customer",
      "reconciliation_act"
    ],
    "flow_month_rub": 120000,
    "limit_now_rub": 1015000,
    "limit_after_rub": 1523000,
    "evidence": {
      "months": 12,
      "operations": 1248,
      "flow_by_month": {
        "2025-10": -413406
      }
    }
  },
  "view": {
    "status": "ready_after_step",
    "status_text": "можно после шага",
    "instrument": "овердрафт",
    "numbers": {
      "available_now": 1015000,
      "available_after": 1523000,
      "limit_delta": 508000,
      "monthly_payment": 141839,
      "dscr": 0.85,
      "dscr_required": 1.25,
      "rate_used": 0.24,
      "term_months": 12
    },
    "reasons": [
      {
        "code": "CASH_GAP",
        "text": "Есть месяцы, когда расходы больше поступлений"
      }
    ],
    "next_steps": [
      {
        "code": "contract_main_customer",
        "text": "Загрузите договор с главным заказчиком",
        "confirms": "что оплата по договору придёт"
      }
    ],
    "monthly_flow": [
      {
        "month": "2025-10",
        "flow": -413406
      }
    ]
  }
}
```

`core` — это ответ ядра как есть: его же проверяет `data/check_golden.py`.

`view` — готов для сайта: сайт сам ничего не считает.

**Статусы для сайта:** `ready` · `ready_after_step` · `other_instrument` · `need_manager`.

---

### Ошибки

Всегда `{"error": "текст для клиента"}`, без внутренностей сервера.

| Код | Когда |
| --- | --- |
| 400 | не JSON, кривая длина |
| 411 / 413 / 415 | нет длины / слишком большой / не JSON |
| 422 | не хватает полей, нет колонок в выписке, временный расчёт не знает эту выписку |
| 500 | ядро упало: «не получилось посчитать, попробуйте ещё раз или позовите менеджера» |

---

### Договор и «после шага» (`view.contract`)

Договор приходит либо подтверждённым (`confirmed_fields.contract_main_customer`), либо со слов (`need.contract_with_main_customer`).

Окошко урезает его до истории: в месяц не больше, чем самый крупный плательщик приносил по этой выписке (`guards.py`).

```json
"contract": {
  "basis": "confirmed",
  "claimed_month_rub": 999999999,
  "cap_month_rub": 796456,
  "cap_payer": "ООО «ГенПодряд-Центр»",
  "capped": true
}
```

Сайт обязан показать `basis`:

* `client_said` = «если подтвердите договор», а не готовая цифра.
* `capped: true` = «договор больше, чем заказчик платил раньше, считаем по истории».

---

## Открыто

* **Потолок грубый:** договор на миллиард даёт «после шага» 4,4 млн против 1,5 млн у честного, потому что поток уже включает платежи этого заказчика. Сколько из договора новых денег, решают Лиза и Толя, правило уезжает в `stop-rules.md` и ядро.
* **Выписка:** дата строго ГГГГ-ММ-ДД, сумма числом («-1 234,56» понимаем), текст до 1000 символов, иначе 422 с номером строки.
* **Поля для Go-шлюза** (маскирование ИНН и ФИО, лимиты частоты) и **для LLM-агента** (`agent_message`, `next_question`, `chips`): после тренировки.
* **Папка для андеррайтера (`dossier`):** пока не собирается.