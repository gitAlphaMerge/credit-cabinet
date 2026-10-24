# Задание A: eval агента на Inspect AI (Python, UK AI Security Institute)

Сначала прочитай `hw/sasha/eval-common.md`, там цель, рамки жюри, что переиспользовать и критерии приёмки. Здесь только технология.

## Стек
- **Inspect AI** (`inspect-ai`, PyPI, исходники github.com/UKGovernmentBEIS/inspect_ai). Перед кодом
  веб-поиском проверь текущую версию и API (Task, Dataset/Sample, Solver, Scorer, epochs, model roles,
  `openai-api/<провайдер>/<модель>` с base URL, `inspect eval-set`, `inspect view`). Пиши по актуальной
  документации inspect.aisi.org.uk, не по памяти.
- Подход τ-bench / τ²-bench (Sierra): симулятор клиента + проверка конечного состояния кодом.
  Сверить с первоисточником (статья arXiv и репо sierra-research), взять метрику pass^k.

## Архитектура (папка `services/agent/eval/inspect/`)
- `requirements.txt` только для eval. `tasks.py`:
  1. `intake_task`: датасет из `eval/data/phrases-*.json` + новый `eval/data/loop-*.json`;
     solver вызывает приёмщик агента (`llm.intake` с моделью-кандидатом через env, и `intake_rules.parse`
     как baseline); scorer по слотам (exact match по каждому полю + общая точность).
  2. `dialog_task`: персоны из `eval/data/personas-*.json`; кастомный solver гоняет многоходовой диалог
     `dialog.turn` против клиента-симулятора (роль `user` = модель из другой семьи, переиспользуй
     `CLIENT_SYSTEM` из `sim.py`), до 12 ходов; scorer №1 = `graders.grade` (код, первым);
     scorer №2 = детектор петли (один и тот же вопрос слота ≥2 раз); scorer №3 = судьи из JUDGE.md
     (G/L/M/P/V/F), роль `grader` = модель третьей семьи, вызывается, только если код прошёл.
     `epochs=3` с редьюсером, дающим pass^3 (все три прогона прошли).
  3. `redteam_task`: `personas-redteam-*.json`, scorer по правилам P из JUDGE.md + страж.
- `run_matrix.py`: прогоняет задачи по списку кандидатов (`models.yaml`: имя, base_url, env-ключ,
  HF-ссылка, лицензия, параметры), собирает логи Inspect в таблицу из критерия 1 общей части,
  добавляет латентность p50/p95 и токены из логов.
- Логи `.eval` в `services/agent/eval/inspect/logs/` (в .gitignore), открываются `inspect view`.

## Почему этот стек (запиши в README)
Inspect даёт эталонную для индустрии структуру task/solver/scorer, повторы и роли моделей
(агент / клиент / судья разных семей) из коробки, единый OpenAI-совместимый провайдер и вьюер трейсов.
