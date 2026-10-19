"""Core adapter through the shared API, using only the standard library."""
import json
import os
import urllib.error
import urllib.request


def decide(statement_csv, need, questionnaire, confirmed_fields=None) -> dict:
    request = urllib.request.Request(
        os.getenv("AGENT_CORE_URL", "http://api:8080").rstrip("/") + "/score",
        data=json.dumps({"statement_csv": statement_csv, "need": need,
                         "questionnaire": questionnaire,
                         "confirmed_fields": confirmed_fields or {}}, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            decision = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Ядро не смогло выполнить расчёт: HTTP {error.code}") from error
    except (urllib.error.URLError, OSError) as error:
        raise RuntimeError("Ядро недоступно: ошибка соединения или истёк таймаут 30 секунд") from error
    except (ValueError, UnicodeError) as error:
        raise RuntimeError("Ядро вернуло некорректный JSON") from error
    if not isinstance(decision, dict) or not all(isinstance(decision.get(k), dict) for k in ("core", "view")):
        raise RuntimeError("Ядро вернуло ответ без core и view")
    return decision
