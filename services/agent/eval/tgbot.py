"""Eval-бот в телеге: человек играет клиента по карточке и после каждого ответа агента ставит 👍 / 👎 + коммент.
Тот же прогон, что play.py, только для команды: метки людей → сверка судьи и новые тесты.

    python services/agent/eval/tgbot.py              # агент на LLM, если есть ключ, иначе шаблоны
    python services/agent/eval/tgbot.py --templates

Токен: EVAL_BOT_TOKEN в .env корня (бот от @BotFather). Живёт на ноуте: OpenRouter с сервера YC даёт 403.
Трейсы: services/agent/eval/traces/tg-<время>-<ник>-<персона>.jsonl, формат строк как у play.py.
"""
import argparse
import asyncio
import json
import random
import sys
from datetime import datetime
from pathlib import Path

AGENT = Path(__file__).resolve().parents[1]
ROOT = AGENT.parents[1]
TRACES = AGENT / "eval" / "traces"
sys.path.insert(0, str(AGENT))
sys.path.insert(0, str(AGENT / "eval"))

import data_io  # noqa: E402
import dialog  # noqa: E402
import explain_templates  # noqa: E402
import intake_rules  # noqa: E402
import llm  # noqa: E402

STATEMENT, CONTRACT, STOP = "📄 Загрузить выписку", "📝 Загрузить договор", "⏹ Закончить"


def personas() -> list[dict]:
    return [p for p in data_io.personas() if p["source"] == "deepseek"]  # ред-тим не для команды: там атаки


def scenarios() -> dict:
    return {s["id"]: s for s in json.loads((ROOT / "data" / "golden.json").read_text(encoding="utf-8"))["scenarios"]}


class Session:
    """Один разговор. phase: rate (ждём оценку ответа) → comment (ждём коммент после 👎) → client (ждём реплику)."""

    def __init__(self, persona: dict, scenario: dict, who: str, intake, explain, traces: Path = TRACES):
        self.p, self.scenario, self.who = persona, scenario, who
        self.intake, self.explain = intake, explain
        self.state = dialog.new_state(scenario["questionnaire"])
        self.statement = (ROOT / scenario["file"]).read_text(encoding="utf-8")
        traces.mkdir(parents=True, exist_ok=True)
        self.out = traces / f"tg-{datetime.now():%Y%m%d-%H%M%S}-{who}-{persona['id']}.jsonl"
        self.phase, self.ok, self.turns = "client", True, 0

    def card(self) -> str:
        p = self.p
        return (f"Ты клиент: {p['who']}\nХарактер: {p['style']}\nСтранность: {p['quirk']}\n"
                f"Секрет (выдаёшь только на прямой вопрос): {p['secret']}\n\n"
                f"Начни с чего-то вроде: «{p['first_message']}»\n"
                "Говори как живой человек, не по карточке слово в слово. "
                f"Кнопки внизу: {STATEMENT}, {CONTRACT}, {STOP}.")

    def say(self, text: str) -> str:
        """Реплика клиента → ответ агента. Кнопки загрузки превращаются во вложение, как /выписка и /договор в play.py."""
        attachment = None
        if text == STATEMENT:
            text, attachment = "Загрузил выписку", {"statement_csv": self.statement}
        elif text == CONTRACT:
            deal = self.p["need"].get("contract_with_main_customer") or {"sum_rub": 0, "months": 12}
            text, attachment = "Загрузил договор", {"contract_main_customer": deal}
        try:
            reply = dialog.turn(self.state, text, attachment, intake=self.intake, explain=self.explain)
        except Exception as e:  # сеть, ключ, кривой JSON модели: видно в трейсе, разговор не падает
            reply = f"[ошибка агента: {e}]"
            self.state["trace"].append({"user": text, "kind": "error", "reply": reply})
        self.phase, self.turns = "rate", self.turns + 1
        return reply

    def rate(self, ok: bool) -> None:
        self.ok = ok
        if ok:
            self._write("")
        else:
            self.phase = "comment"

    def comment(self, text: str) -> None:
        self._write(text)

    def _write(self, comment: str) -> None:
        row = dict(self.state["trace"][-1], persona=self.p["id"], who=self.who, ok=self.ok, comment=comment,
                   need_now=dict(self.state["need"]))
        with self.out.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        self.phase = "client"


def _token() -> str:
    env = ROOT / ".env"
    for line in env.read_text(encoding="utf-8-sig").splitlines() if env.exists() else []:
        if line.startswith("EVAL_BOT_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit("нет EVAL_BOT_TOKEN в .env корня")


def main() -> int:
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
    from telegram.ext import (Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler,
                              filters)

    ap = argparse.ArgumentParser()
    ap.add_argument("--templates", action="store_true", help="без LLM, только шаблоны")
    args = ap.parse_args()
    use_llm = llm.available() and not args.templates
    intake = llm.intake if use_llm else intake_rules.parse
    explain = llm.explain if use_llm else explain_templates.explain
    pool, golden = personas(), scenarios()
    sessions: dict[int, Session] = {}
    played: dict[int, set] = {}
    keys = ReplyKeyboardMarkup([[STATEMENT, CONTRACT], [STOP]], resize_keyboard=True)
    marks = InlineKeyboardMarkup([[InlineKeyboardButton("👍 норм", callback_data="ok"),
                                   InlineKeyboardButton("👎 плохо", callback_data="bad")]])

    async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        uid, user = update.effective_user.id, update.effective_user
        seen = played.setdefault(uid, set())
        fresh = [p for p in pool if p["id"] not in seen] or pool
        p = random.choice(fresh)
        seen.add(p["id"])
        who = (user.username or str(uid)).replace("/", "_")
        s = sessions[uid] = Session(p, golden[p["scenario"]], who, intake, explain)
        await update.message.reply_text(
            "Это тренажёр агента кредитного кабинета. Ты играешь клиента, после каждого ответа агента жмёшь "
            "👍 или 👎. На 👎 пишешь, что не так: «длинно», «непонятно», «не спросил про договор», «врёт». "
            "Эти оценки и делают агента умнее.\n\n" + s.card(), reply_markup=keys)
        await update.message.reply_text("Пиши первую реплику клиента 👇")

    async def on_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        uid, text = update.effective_user.id, update.message.text.strip()
        s = sessions.get(uid)
        if s is None:
            await update.message.reply_text("Жми /start, выдам карточку клиента")
            return
        if s.phase == "rate":
            await update.message.reply_text("Сначала оцени ответ агента кнопкой 👍 / 👎 выше")
            return
        if s.phase == "comment":
            s.comment(text)
            await update.message.reply_text("Записал. Отвечай агенту дальше как клиент")
            return
        if text == STOP:
            sessions.pop(uid)
            await update.message.reply_text(f"Спасибо! Ходов: {s.turns}. Ещё клиента: /start",
                                            reply_markup=ReplyKeyboardRemove())
            return
        await ctx.bot.send_chat_action(update.effective_chat.id, "typing")
        reply = await asyncio.to_thread(s.say, text)  # LLM и ядро синхронные, бот не должен вставать
        await update.message.reply_text(reply, reply_markup=marks)

    async def on_mark(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        q = update.callback_query
        await q.answer()
        s = sessions.get(q.from_user.id)
        if s is None or s.phase != "rate":
            return
        ok = q.data == "ok"
        s.rate(ok)
        await q.edit_message_reply_markup(None)
        await q.message.reply_text("👍 Отвечай дальше как клиент" if ok else "👎 Что не так? Одной фразой")

    app = Application.builder().token(_token()).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(on_mark))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    print(f"eval-бот: агент {'LLM ' + llm.MODEL if use_llm else 'шаблоны'}, персон {len(pool)}, трейсы в {TRACES}")
    app.run_polling()
    return 0


if __name__ == "__main__":
    sys.exit(main())
