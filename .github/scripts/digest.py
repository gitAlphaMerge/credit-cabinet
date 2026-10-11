"""Итоги дня в тг в 21:00: что каждый сделал за сегодня, табло по галочкам и MVP дня.

Очки: закрытый пункт TASK.md — 3, поправленный пункт REVIEW.md — 1, открытый PR — 2, влитый PR — 2,
коммит — 1 (не больше 5 в день, чтобы загрузка файлов по одному не накручивала).
Главное — закрытые пункты, активность вторична.

Запуск: python digest.py [--dry] [--date ГГГГ-ММ-ДД]
  --dry  — напечатать текст, в тг не слать
Окружение: GITHUB_TOKEN, GITHUB_REPOSITORY; для отправки ещё TG_BOT_TOKEN, TG_CHAT_ID, TG_THREAD.
"""
import datetime as dt
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from board import ORDER, NAMES, items, tg  # noqa: E402 — общий разбор пунктов с доской

MSK = dt.timezone(dt.timedelta(hours=3))
# github-логин → папка в hw/
LOGINS = {"alexregrets": "sasha", "Elizaveta11-me": "liza", "tolyapolya2006-png": "tolya",
          "bwrrr": "artem", "nekhaevaaa": "tonya"}
# тг-ники: у кого за день ноль, бот тегает лично
TG_NICKS = {"artem": "@BWRheal", "liza": "@lovuhoney", "tonya": "@aanekhh", "tolya": "@fudjio1337", "sasha": "@rutorsup"}
POINTS = {"task": 3, "review": 1, "pr_open": 2, "pr_merged": 2, "commit": 1}
COMMIT_CAP = 5


def gh(path, **params):
    """GET к GitHub API; возвращает распарсенный JSON."""
    url = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
                                               "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def day_bounds(day):
    """Начало и конец дня по Москве в UTC-строках для API и для git."""
    start = dt.datetime.combine(day, dt.time(0), MSK)
    return start, start + dt.timedelta(days=1)


def in_day(stamp, start, end):
    """Попадает ли ISO-время из API (с Z на конце) в сегодняшний день."""
    return stamp and start <= dt.datetime.fromisoformat(stamp.replace("Z", "+00:00")) < end


def closed_items(filename, start):
    """Пункты из hw/*/<filename>, которые закрылись в main за сегодня: сравнение с main на начало дня."""
    base = subprocess.run(["git", "rev-list", "-1", f"--before={start.isoformat()}", "HEAD"],
                          capture_output=True, text=True).stdout.strip()
    out = {n: [] for n in ORDER}
    for n in ORDER:
        p = pathlib.Path(f"hw/{n}/{filename}")
        if not p.exists():
            continue
        old_text = ""
        if base:
            old_text = subprocess.run(["git", "show", f"{base}:hw/{n}/{filename}"], capture_output=True,
                                      text=True, encoding="utf-8").stdout
        old = {t for d, t in items(old_text) if d}
        out[n] = [t for d, t in items(p.read_text(encoding="utf-8")) if d and t not in old]
    return out


def activity(start, end):
    """Коммиты по всем веткам (без мерж-коммитов, без дублей) и PR, открытые или влитые за день."""
    commits = {n: set() for n in ORDER}
    for br in gh("branches", per_page=100):
        for c in gh("commits", sha=br["name"], since=start.isoformat(), until=end.isoformat(), per_page=100):
            who = LOGINS.get((c.get("author") or {}).get("login", ""))
            if who and len(c["parents"]) < 2:
                commits[who].add(c["sha"])
    opened, merged = ({n: [] for n in ORDER} for _ in range(2))
    for pr in gh("pulls", state="all", per_page=100):
        who = LOGINS.get(pr["user"]["login"])
        if not who:
            continue
        if in_day(pr["created_at"], start, end):
            opened[who].append(f"PR #{pr['number']} {pr['title']}")
        if in_day(pr.get("merged_at"), start, end):
            merged[who].append(f"PR #{pr['number']}")
    return commits, opened, merged


def progress():
    """Галочки в TASK.md у каждого: (сделано, всего)."""
    out = {}
    for n in ORDER:
        p = pathlib.Path(f"hw/{n}/TASK.md")
        its = items(p.read_text(encoding="utf-8")) if p.exists() else []
        out[n] = (sum(d for d, _ in its), len(its))
    return out


def digest_text(day):
    """Собирает текст итогов дня."""
    start, end = day_bounds(day)
    tasks, reviews = closed_items("TASK.md", start), closed_items("REVIEW.md", start)
    commits, opened, merged = activity(start, end)
    prog = progress()
    rows = []
    for n in ORDER:
        score = (POINTS["task"] * len(tasks[n]) + POINTS["review"] * len(reviews[n])
                 + POINTS["pr_open"] * len(opened[n]) + POINTS["pr_merged"] * len(merged[n])
                 + POINTS["commit"] * min(len(commits[n]), COMMIT_CAP))
        done = []
        if tasks[n]:
            done.append("закрыл: " + "; ".join(tasks[n]))
        if opened[n]:
            done.append("; ".join(opened[n]))
        if merged[n]:
            done.append("влито: " + ", ".join(merged[n]))
        if reviews[n]:
            done.append(f"по ревью поправлено {len(reviews[n])}")
        if commits[n] and not done:
            done.append(f"коммитов {len(commits[n])}")
        rows.append((score, n, done))
    rows.sort(key=lambda r: (-r[0], ORDER.index(r[1])))

    lines = [f"📊 итоги дня · {day:%d.%m}", ""]
    if rows[0][0] > 0:
        top = [r for r in rows if r[0] == rows[0][0]]
        lines += [f"🏆 MVP дня: {', '.join(NAMES[r[1]] for r in top)} · {rows[0][0]} очк.", ""]
    for score, n, done in rows:
        d, t = prog[n]
        bar = "▓" * round(10 * d / t) + "░" * (10 - round(10 * d / t)) if t else ""
        head = f"{NAMES[n]} · {score} очк. · {bar} {d}/{t}"
        lines.append(head if done else f"{head} · за день пусто {TG_NICKS[n]}")
        lines += [f"  ▫️ {x}" for x in done]
    lines += ["", "очки: пункт задачи 3 · PR 2 · влит 2 · правка по ревью 1 · коммит 1 (до 5)",
              "⏰ чекин до 22:00: сделал / дальше / застрял"]
    return "\n".join(lines)


def main():
    """Печатает дайджест (--dry) или шлёт его в топик чекинов."""
    args = sys.argv[1:]
    day = dt.date.fromisoformat(args[args.index("--date") + 1]) if "--date" in args else dt.datetime.now(MSK).date()
    text = digest_text(day)
    if "--dry" in args:
        print(text)
        return
    tg("sendMessage", chat_id=os.environ["TG_CHAT_ID"], message_thread_id=int(os.environ["TG_THREAD"]), text=text)


if __name__ == "__main__":
    main()
