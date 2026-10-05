"""Доска задач в тг: одно закреплённое сообщение, которое бот перерисовывает из hw/*/TASK.md,
и уведомление в отдельный топик, когда в задачах появились новые пункты или закрылись старые.

Запуск: python board.py <sha до пуша>   (пустой sha — только перерисовать доску)
Секреты: TG_BOT_TOKEN, TG_CHAT_ID, TG_BOARD_THREAD, TG_BOARD_MSG (id сообщения доски), TG_TASKS_THREAD.
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

NAMES = {"artem": "Артём", "liza": "Лиза", "tonya": "Тоня", "tolya": "Толя", "sasha": "Саша"}
ORDER = ["artem", "liza", "tonya", "tolya", "sasha"]
ITEM = re.compile(r"^- \[([ xX])\] (.+)$")


def items(text):
    """Пункты задачи: (сделан?, название). Короткий пункт получает в префикс свой раздел «## …»."""
    out, section = [], ""
    for line in text.splitlines():
        if line.startswith("## "):
            section = re.sub(r"^## (\d+\.\s*)?", "", line).split("—")[0].strip()
        m = ITEM.match(line)
        if m:
            title = re.sub(r"`", "", m.group(2)).strip()
            for sep in (" — ", ": "):
                head = title.split(sep)[0]
                if sep in title and len(head) >= 12:
                    title = head
                    break
            if len(title) < 25 and section:
                title = f"{section}: {title}"
            out.append((m.group(1) != " ", title if len(title) <= 70 else title[:68] + "…"))
    return out


def tg(method, **params):
    """Вызов Telegram Bot API; возвращает result."""
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{os.environ['TG_BOT_TOKEN']}/{method}",
        json.dumps(params).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["result"]


def board_text():
    """Текст доски: у каждого прогресс и открытые пункты; закрытые — счётчиком, чтобы не раздувать."""
    lines = ["📋 доска задач · обновляется сама из репо", ""]
    for n in ORDER:
        p = pathlib.Path(f"hw/{n}/TASK.md")
        if not p.exists():
            continue
        its = items(p.read_text(encoding="utf-8"))
        done = sum(d for d, _ in its)
        head = p.read_text(encoding="utf-8").splitlines()[0]
        deadline = head.split("—")[-1].strip() if "—" in head else ""
        lines.append(f"{NAMES[n]} · {done}/{len(its)} · {deadline}")
        lines += [f"  ▫️ {t}" for d, t in its if not d]
        lines.append("")
    lines.append("подробно: gitAlphaMerge/credit-cabinet → hw/<имя>/TASK.md")
    return "\n".join(lines)


def changes(before):
    """Сравнивает задачи до и после пуша: какие пункты добавились и какие закрылись."""
    new, closed = [], []
    for n in ORDER:
        path = f"hw/{n}/TASK.md"
        p = pathlib.Path(path)
        now = dict((t, d) for d, t in items(p.read_text(encoding="utf-8"))) if p.exists() else {}
        try:
            old_text = subprocess.run(["git", "show", f"{before}:{path}"], capture_output=True,
                                      text=True, encoding="utf-8", check=True).stdout
        except subprocess.CalledProcessError:
            old_text = ""
        old = dict((t, d) for d, t in items(old_text))
        new += [f"{NAMES[n]}: {t}" for t, d in now.items() if t not in old and not d]
        closed += [f"{NAMES[n]}: {t}" for t, d in now.items() if d and not old.get(t, False)]
    return new, closed


def main():
    """Перерисовывает доску и, если задачи поменялись, пишет об этом в топик задач."""
    chat = os.environ["TG_CHAT_ID"]
    text = board_text()
    msg_id = os.environ.get("TG_BOARD_MSG")
    if msg_id:
        try:
            tg("editMessageText", chat_id=chat, message_id=int(msg_id), text=text)
        except urllib.error.HTTPError as e:
            if "not modified" not in e.read().decode():
                raise
    else:
        sent = tg("sendMessage", chat_id=chat, message_thread_id=int(os.environ["TG_BOARD_THREAD"]), text=text)
        print(f"BOARD_MESSAGE_ID={sent['message_id']} — положи в секрет TG_BOARD_MSG и закрепи сообщение")
    before = sys.argv[1] if len(sys.argv) > 1 else ""
    if not before or set(before) == {"0"} or not os.environ.get("TG_TASKS_THREAD"):
        return
    new, closed = changes(before)
    parts = []
    if new:
        parts.append("🆕 новые задачи\n" + "\n".join(f"• {x}" for x in new))
    if closed:
        parts.append("✅ закрыто\n" + "\n".join(f"• {x}" for x in closed))
    if parts:
        tg("sendMessage", chat_id=chat, message_thread_id=int(os.environ["TG_TASKS_THREAD"]),
           text="\n\n".join(parts) + "\n\nдоска в штабе обновлена")


if __name__ == "__main__":
    import urllib.error  # noqa: E402 — нужен в main для разбора ошибки «not modified»
    main()
