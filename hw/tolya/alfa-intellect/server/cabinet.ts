import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  cabinetSnapshot,
  facilityOf,
  validDate,
  day,
  daysBetween,
  type Facility,
} from "../shared/cabinet";
import type { AppState } from "../shared/types";
import { stateOf, saveState } from "./store";
import { facilityErrors } from "../shared/facility-validation";

const date = z.string().refine(validDate, "Некорректная календарная дата"),
  money = z.number().finite().min(0).max(1e12);
const dateMonth = (first: string, i: number) => {
  const d = new Date(first + "T00:00:00Z"),
    m = d.getUTCMonth() + i;
  const target = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0));
  target.setUTCDate(Math.min(d.getUTCDate(), target.getUTCDate()));
  return day(target);
};
export function makeSchedule(
  balance: number,
  rate: number,
  months: number,
  first: string,
): Facility["events"] {
  const r = rate / 1200,
    payment =
      r === 0
        ? balance / months
        : (balance * r) / (1 - Math.pow(1 + r, -months));
  let remaining = balance;
  return Array.from({ length: months }, (_, i) => {
    const interest = Math.round(remaining * r * 100) / 100,
      principal =
        i === months - 1
          ? remaining
          : Math.min(remaining, Math.round((payment - interest) * 100) / 100);
    remaining = Math.round((remaining - principal) * 100) / 100;
    return {
      id: randomUUID(),
      date: dateMonth(first, i),
      principal,
      interest,
      fees: 0,
      balance: remaining,
      status: "planned",
    };
  });
}
export function syncCabinetNotices(s: AppState, today = day()) {
  const snapshot = cabinetSnapshot(s, today),
    candidates = [
      ...snapshot.signals.map((x) => ({ ...x, key: "v2:" + x.key })),
      ...s.documents.map((d) => ({
        key: "v2:doc:" + d.id,
        title: d.confirmed
          ? "Документ подтверждён"
          : "Документ требует проверки",
        body: d.name + " · " + d.period,
        type: "data" as const,
        href: "profile",
        date: d.createdAt,
      })),
      ...s.selections.slice(0, 30).map((x) => ({
        key: "v2:selection:" + x.id,
        title:
          x.version > 1
            ? "Финансовый расчёт обновлён"
            : "Подбор финансирования завершён",
        body: x.purpose + " · версия " + x.version,
        type: "result" as const,
        href: "financing",
        date: x.createdAt,
      })),
    ];
  const active = new Set(candidates.map((c) => c.key));
  s.notifications.forEach((n) => {
    if (n.key.startsWith("v2:")) n.active = active.has(n.key);
  });
  for (const c of candidates) {
    // Upgrade existing document notices instead of duplicating the legacy event.
    const legacy = c.key.startsWith("v2:doc:")
      ? s.notifications.find((n) => n.key === "document:" + c.key.slice(7))
      : undefined;
    const n = s.notifications.find((n) => n.key === c.key) || legacy;
    if (legacy && n !== legacy) legacy.active = false;
    if (n) {
      if (n.title !== c.title || n.body !== c.body) n.read = false;
      Object.assign(n, {
        key: c.key,
        title: c.title,
        body: c.body,
        href: c.href,
        type: c.type,
        active: true,
      });
    } else
      s.notifications.unshift({
        id: randomUUID(),
        key: c.key,
        title: c.title,
        body: c.body,
        href: c.href,
        type: c.type,
        active: true,
        read: false,
        createdAt: c.date.length === 10 ? c.date + "T09:00:00+03:00" : c.date,
      });
  }
  return snapshot;
}
export const cabinetRouter = Router();
cabinetRouter.post("/payment", (req, res) => {
  const p = z
      .object({
        id: z.string(),
        status: z.enum(["paid", "overdue"]),
        recordedDate: date,
        source: z.string().trim().min(5).max(180),
      })
      .strict()
      .parse(req.body),
    s = stateOf(res.locals.userId),
    c = facilityOf(s),
    e = c?.events.find((e) => e.id === p.id);
  if (!c || !e) {
    res.status(404).json({ error: "Обязательство не найдено" });
    return;
  }
  if (e.status === "paid") {
    res.json(s);
    return;
  }
  if (
    p.recordedDate > day() ||
    (p.status === "paid" && p.recordedDate < e.date) ||
    p.recordedDate < c.asOf ||
    (p.status === "overdue" && e.date >= day()) ||
    c.events.some((x) => x.status !== "paid" && x.date < e.date)
  ) {
    res.status(422).json({
      error:
        "Подтверждайте обязательства по порядку. Дата факта — не ранее даты остатка и не позже сегодня; просрочка требует прошедшей договорной даты.",
    });
    return;
  }
  e.status = p.status;
  if (p.status === "paid") {
    e.settledAt = p.recordedDate;
    c.balance = Math.max(0, Math.round((c.balance - e.principal) * 100) / 100);
    c.asOf = p.recordedDate;
  }
  c.source +=
    "; исполнение со слов пользователя: " + p.source + " на " + p.recordedDate;
  s.cabinet = { ...s.cabinet, facility: c };
  syncCabinetNotices(s);
  saveState(res.locals.userId, s);
  res.json(s);
});
cabinetRouter.get("/", (_req, res) => {
  const s = stateOf(res.locals.userId);
  const result = syncCabinetNotices(s);
  saveState(res.locals.userId, s);
  res.json(result);
});
cabinetRouter.post("/no-credit", (_req, res) => {
  const s = stateOf(res.locals.userId);
  if (s.cabinet?.facility || s.credit) {
    res.status(409).json({
      error:
        "Сначала уточните существующие обязательства. Они не удаляются этим действием.",
    });
    return;
  }
  s.cabinet = { ...s.cabinet, noCreditConfirmedAt: new Date().toISOString() };
  saveState(res.locals.userId, s);
  res.json(s);
});
cabinetRouter.post("/facility", (req, res) => {
  const p = z
    .object({
      name: z.string().trim().min(1).max(100),
      amount: money.positive(),
      balance: money,
      rate: z.number().finite().min(0).max(100),
      term: z.number().int().min(1).max(120),
      firstDate: date,
      issuedDate: date.optional(),
      contractTerm: z.number().int().min(1).max(120).optional(),
      documentId: z.string().optional(),
    })
    .strict()
    .parse(req.body);
  const s = stateOf(res.locals.userId);
  if (s.cabinet?.facility) {
    res.status(409).json({
      error:
        "Кредит уже добавлен. В MVP поддерживается один договор; данные не перезаписываются.",
    });
    return;
  }
  const fields = facilityErrors(p);
  if (Object.keys(fields).length) {
    res.status(422).json({
      error: "Проверьте выделенные поля.",
      fields,
    });
    return;
  }
  const doc = p.documentId
    ? s.documents.find(
        (d) =>
          d.id === p.documentId && d.category === "schedule" && d.confirmed,
      )
    : undefined;
  if (p.documentId && !doc) {
    res.status(422).json({
      error: "Выберите подтверждённый документ графика из профиля.",
      fields: {
        documentId: "Выберите подтверждённый график из документов бизнеса.",
      },
    });
    return;
  }
  let events = makeSchedule(p.balance, p.rate, p.term, p.firstDate);
  if (doc) {
    events = (doc.records || []).map((r, i) => ({
      id: doc.id + ":" + i,
      date: String(r.date),
      principal: Number(r.principal),
      interest: Number(r.interest),
      fees: Number(r.fees || 0),
      balance: Number(r.balance),
      status: "planned",
    }));
    let remaining = p.balance;
    if (
      !events.length ||
      events.some((e, i) => {
        const okay =
          validDate(e.date) &&
          e.date >= day() &&
          (!i || e.date > events[i - 1].date) &&
          [e.principal, e.interest, e.balance].every(
            (n) => Number.isFinite(n) && n >= 0,
          ) &&
          Math.abs(remaining - e.principal - e.balance) < 1;
        remaining = e.balance;
        return !okay;
      }) ||
      Math.abs(remaining) > 1
    ) {
      res.status(422).json({
        error:
          "График должен содержать оставшиеся будущие платежи с последовательным остатком долга и погашением до нуля. Проверьте исходный остаток.",
      });
      return;
    }
  }
  s.cabinet = {
    ...s.cabinet,
    facility: {
      id: randomUUID(),
      kind: "loan",
      name: p.name,
      amount: p.amount,
      balance: p.balance,
      rate: p.rate,
      term: events.length,
      contractTerm: p.contractTerm,
      issuedAt: p.issuedDate,
      startDate: day(),
      asOf: day(),
      source: doc
        ? doc.name + " · подтверждённый оставшийся график"
        : "Договорные параметры со слов пользователя; расчётный аннуитетный график без комиссий",
      quality: doc ? "document" : "manual",
      events,
    },
    noCreditConfirmedAt: undefined,
  };
  syncCabinetNotices(s);
  saveState(res.locals.userId, s);
  res.json(s);
});
cabinetRouter.post("/plan", (req, res) => {
  const p = z
    .object({
      balance: money,
      balanceDate: date,
      through: date,
      source: z.string().trim().min(3).max(180),
      items: z
        .array(
          z
            .object({
              date,
              amount: z.number().finite().min(-1e12).max(1e12),
              label: z.string().trim().min(1).max(100),
            })
            .strict(),
        )
        .max(100),
    })
    .strict()
    .parse(req.body);
  if (
    p.balanceDate > day() ||
    daysBetween(p.balanceDate, day()) > 7 ||
    p.through <= day() ||
    daysBetween(day(), p.through) > 90 ||
    p.items.some((i) => i.date < p.balanceDate || i.date > p.through)
  ) {
    res.status(422).json({
      error:
        "Остаток нужен за последние 7 дней, план — до будущей даты (не далее 90 дней); операции должны попадать в период.",
    });
    return;
  }
  const s = stateOf(res.locals.userId);
  s.cabinet = {
    ...s.cabinet,
    plan: {
      ...p,
      confirmedAt: new Date().toISOString(),
      items: p.items.map((i) => ({ ...i, id: randomUUID() })),
    },
  };
  syncCabinetNotices(s);
  saveState(res.locals.userId, s);
  res.json(s);
});
cabinetRouter.post("/coverage", (req, res) => {
  const p = z
    .object({
      amount: z.number().finite().min(-1e12).max(1e12),
      start: date,
      end: date,
      source: z.string().trim().min(3).max(180),
      methodology: z.string().trim().min(20).max(800),
    })
    .strict()
    .parse(req.body);
  if (p.end < p.start || daysBetween(p.start, p.end) > 366) {
    res
      .status(422)
      .json({ error: "Период CFADS: от 1 до 367 календарных дней." });
    return;
  }
  const s = stateOf(res.locals.userId);
  s.cabinet = {
    ...s.cabinet,
    coverage: {
      ...p,
      previousValue:
        s.cabinet?.coverage?.start === p.start &&
        s.cabinet?.coverage?.end === p.end
          ? (cabinetSnapshot(s).metrics[0].value ?? undefined)
          : undefined,
      confirmedAt: new Date().toISOString(),
    },
  };
  syncCabinetNotices(s);
  saveState(res.locals.userId, s);
  res.json(s);
});
cabinetRouter.post("/discuss", (req, res) => {
  const s = stateOf(res.locals.userId),
    snapshot = cabinetSnapshot(s),
    id = z.string().optional().parse(req.body.chatId);
  let chat =
    s.chats.find((c) => c.id === id) || s.chats.find((c) => !c.selectionId);
  if (!chat) {
    chat = {
      id: randomUUID(),
      title: "Обсуждение кредитного кабинета",
      messages: [],
    };
    s.chats.unshift(chat);
  }
  // Trusted server snapshot, never arbitrary client-provided amounts.
  chat.cabinetContext = { capturedAt: new Date().toISOString(), snapshot };
  saveState(res.locals.userId, s);
  res.json({ chatId: chat.id });
});
