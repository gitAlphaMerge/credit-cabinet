import express from "express";
import multer from "multer";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  db,
  createUser,
  session,
  sessionUser,
  logout,
  stateOf,
  saveState,
  notify,
  verifyPassword,
  type User,
} from "./store";
import { calculate, select, forecast, catalog } from "./finance";
import { extract, fieldNames, readableFileName } from "./documents";
import { createAIProvider } from "./ai-provider";
import { publicPreview } from "./preview";
import { findCompany, RegistryError } from "./registry";
import { cabinetRouter, syncCabinetNotices } from "./cabinet";
import type { Profile, AppState } from "../shared/types";
import { russianValidationErrors } from "../shared/facility-validation";
import { fundingRouter } from "./funding-routes";
export const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
  });
  next();
});
app.use(express.json({ limit: "100kb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("origin") &&
    new URL(req.get("origin")!).host !== req.get("host")
  ) {
    res.status(403).json({ error: "Недопустимый источник запроса" });
    return;
  }
  next();
});
const limits = new Map<string, { n: number; until: number }>();
const limit = (key: string, max: number) => {
  const x = limits.get(key);
  if (!x || x.until < Date.now()) {
    limits.set(key, { n: 1, until: Date.now() + 60000 });
    return;
  }
  if (++x.n > max)
    throw new Error("Слишком много запросов. Попробуйте через минуту.");
};
const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => /^7\d{10}$/.test(v), "Телефон в формате +7 и 10 цифр");
const profileSchema = z.object({
  name: z.string().max(160).default("Мой бизнес"),
  form: z.enum(["ИП", "ООО", "АО", "Другое", "Не зарегистрирован"]),
  stage: z.enum(["operating", "planning"]),
  sector: z.string().min(1).max(160),
  registered: z.boolean(),
  ageBand: z.string().max(80),
  result: z.string().max(100),
  debt: z.string().max(80),
  intent: z.string().max(160),
  preparation: z.string().max(160).optional(),
});
function token(req: express.Request) {
  return (
    req.headers.cookie
      ?.split("; ")
      .find((x) => x.startsWith("alfa_session="))
      ?.slice(13) || ""
  );
}
function cookie(res: express.Response, value: string, maxAge = 7 * 86400000) {
  res.cookie("alfa_session", value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge,
    path: "/",
  });
}
app.get("/api/config", (req, res) => {
  const user = sessionUser(token(req));
  res.json({
    authenticated: !!user,
    workspaceId: user?.user_id ?? null,
    aiConnected: !!process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL || "gpt-5.4-mini",
    fieldNames,
    catalog,
  });
});
app.get(["/health", "/api/health"], async (_req, res) => {
  let database = "ok";
  try {
    db.prepare("SELECT 1").get();
  } catch {
    database = "fail";
  }
  let team_api = "not_configured";
  if (process.env.TEAM_API_URL) {
    try {
      const response = await fetch(new URL("/health", process.env.TEAM_API_URL), {
        signal: AbortSignal.timeout(2000),
      });
      team_api = response.ok ? "ok" : "down";
      await response.body?.cancel();
    } catch {
      team_api = "down";
    }
  }
  res.set("Cache-Control", "no-store").json({
    status: database === "ok" ? "ok" : "degraded",
    db: database,
    team_api,
    storage: "sqlite",
    schema: 2,
  });
});
app.get("/api/public-demo", (req, res) => {
  const kind = z.enum(["ooo", "ip", "idea"]).parse(req.query.kind ?? "ooo");
  res.json(publicPreview(kind));
});
app.post("/api/public-demo/calculate", (req, res) => {
  limit("public-preview:" + req.ip, 30);
  const input = z
    .object({
      kind: z.enum(["ooo", "ip", "idea"]),
      amount: z.number().min(10000).max(1e8),
      term: z.number().int().min(1).max(120),
    })
    .strict()
    .parse(req.body);
  const state = publicPreview(input.kind);
  res.json({
    ...state.selections[0],
    ...select(
      {
        purpose: "Оборудование",
        amount: input.amount,
        term: input.term,
        flow: state.financials.freeFlow ?? null,
        existing: 0,
      },
      state.profile,
    ),
  });
});
app.post("/api/auth/register", (req, res) => {
  limit("register:" + req.ip, 10);
  const phone = phoneSchema.parse(req.body.phone),
    password = z
      .string()
      .min(8, "Пароль должен содержать не менее 8 символов")
      .max(128, "Пароль не должен превышать 128 символов")
      .parse(req.body.password),
    profile = profileSchema.parse(req.body.profile);
  if (db.prepare("SELECT id FROM users WHERE phone=?").get(phone)) {
    res
      .status(409)
      .json({ error: "Этот телефон уже зарегистрирован. Войдите в аккаунт." });
    return;
  }
  const id = createUser(phone, password, profile);
  cookie(res, session(id));
  res.json({ ok: true });
});
app.post("/api/auth/login", (req, res) => {
  limit("login:" + req.ip, 10);
  const phone = phoneSchema.parse(req.body.phone),
    password = z.string().min(1).max(128).parse(req.body.password);
  const u = db.prepare("SELECT * FROM users WHERE phone=?").get(phone) as
    User | undefined;
  if (!u || !verifyPassword(password, u.password)) {
    res.status(401).json({ error: "Телефон или пароль не подошли" });
    return;
  }
  cookie(res, session(u.id));
  res.json({ ok: true });
});
app.post("/api/auth/demo", (req, res) => {
  limit("demo:" + req.ip, 10);
  const kind = z.enum(["ooo", "ip", "idea"]).parse(req.body.kind ?? "ooo");
  const id = createUser("demo-" + randomUUID(), randomUUID(), {
    name:
      kind === "ooo"
        ? "ООО «ТехноПлюс»"
        : kind === "ip"
          ? "ИП Алексей Демонстрационный"
          : "Проект «Новая мастерская»",
    form: kind === "ooo" ? "ООО" : kind === "ip" ? "ИП" : "Не зарегистрирован",
    stage: kind === "idea" ? "planning" : "operating",
    sector: kind === "ip" ? "Услуги для бизнеса и маркетинг" : "Производство",
    registered: kind !== "idea",
    ageBand: "3–5 лет",
    result: "Прибыль",
    debt: "Нет",
    intent: "Подобрать финансирование",
  });
  const s = stateOf(id);
  s.profile.source = "Синтетический демонстрационный сценарий";
  s.profile.registeredAt = kind === "idea" ? undefined : "2021-03-12";
  s.preferences.tourDone = true;
  saveState(id, s);
  cookie(res, session(id));
  res.json({ ok: true });
});
app.post("/api/auth/logout", (req, res) => {
  logout(token(req));
  cookie(res, "", 0);
  res.json({ ok: true });
});
app.use("/api", (req, res, next) => {
  const u = sessionUser(token(req));
  if (!u) {
    res.status(401).json({ error: "Войдите в аккаунт" });
    return;
  }
  res.locals.userId = u.user_id;
  next();
});
app.get("/api/state", (_req, res) => {
  const s = stateOf(res.locals.userId);
  syncCabinetNotices(s);
  saveState(res.locals.userId, s);
  res.json(s);
});
app.use("/api/cabinet", cabinetRouter);
app.patch("/api/profile", (req, res) => {
  const s = stateOf(res.locals.userId);
  const patch = z
    .object({
      name: z.string().min(1).max(160).optional(),
      sector: z.string().max(160).optional(),
      activity: z.string().max(160).optional(),
      region: z.string().max(100).optional(),
      ageBand: z.string().max(80).optional(),
      result: z.string().max(100).optional(),
      debt: z.string().max(80).optional(),
      intent: z.string().max(160).optional(),
    })
    .strict()
    .parse(req.body);
  s.profile = { ...s.profile, ...patch };
  saveState(res.locals.userId, s);
  res.json(s);
});
app.patch("/api/preferences", (req, res) => {
  const s = stateOf(res.locals.userId);
  Object.assign(
    s.preferences,
    z
      .object({
        split: z.number().min(40).max(75).optional(),
        tourDone: z.boolean().optional(),
      })
      .parse(req.body),
  );
  saveState(res.locals.userId, s);
  res.json(s);
});
const lookupCandidates = new Map<string, { data: any; expires: number }>();
function lookupResponse(res: express.Response, data: any) {
  lookupCandidates.set(res.locals.userId, {
    data,
    expires: Date.now() + 10 * 60000,
  });
  res.json(data);
}
app.post("/api/lookup", async (req, res) => {
  limit("lookup:" + res.locals.userId, 10);
  lookupCandidates.delete(res.locals.userId);
  const inn = z
    .string()
    .regex(/^(\d{10}|\d{12})$/, "ИНН: 10 или 12 цифр")
    .parse(req.body.inn);
  try {
    lookupResponse(res, await findCompany(inn));
  } catch (e) {
    if (!(e instanceof RegistryError)) throw e;
    res.status(e.status).json({ error: e.message });
  }
});
app.post("/api/lookup/confirm", (req, res) => {
  const s = stateOf(res.locals.userId);
  const candidate = lookupCandidates.get(res.locals.userId);
  if (
    !candidate ||
    candidate.expires < Date.now() ||
    candidate.data.inn !== req.body.inn
  ) {
    res.status(409).json({
      error: "Сначала выполните поиск по ИНН и подтвердите свежий результат.",
    });
    return;
  }
  const p = z
    .object({
      name: z.string().max(160),
      inn: z.string().regex(/^(\d{10}|\d{12})$/),
      form: z.string().max(40),
      activity: z.string().max(160).optional(),
      region: z.string().max(100).optional(),
      registeredAt: z.string().optional(),
      source: z.string().max(100),
      demo: z.boolean().optional(),
      status: z.string().optional(),
      okved: z.string().optional(),
    })
    .parse(candidate.data);
  s.profile = {
    ...s.profile,
    ...p,
    registryRecord: { ...p, confirmedAt: new Date().toISOString() },
  };
  saveState(res.locals.userId, s);
  res.json(s);
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});
app.post("/api/documents", upload.single("file"), async (req, res) => {
  limit("uploads:" + res.locals.userId, 15);
  if (!req.file) {
    res.status(400).json({ error: "Выберите файл" });
    return;
  }
  const data = await extract(
    req.file.buffer,
    req.file.originalname,
    req.body.category || undefined,
  );
  const s = stateOf(res.locals.userId),
    id = createHash("sha256")
      .update(res.locals.userId)
      .update(req.file.buffer)
      .digest("hex");
  let doc = s.documents.find((d) => d.id === id);
  if (!doc) {
    doc = {
      id,
      ...data,
      name: readableFileName(req.file.originalname),
      mime: req.file.mimetype,
      confirmed: false,
      createdAt: new Date().toISOString(),
    };
    s.documents.push(doc);
    db.prepare("INSERT OR IGNORE INTO files VALUES(?,?,?,?,?)").run(
      id,
      res.locals.userId,
      doc.name,
      doc.mime,
      req.file.buffer,
    );
    saveState(res.locals.userId, s);
  }
  res.json(doc);
});
app.post("/api/documents/:id/confirm", (req, res) => {
  const s = stateOf(res.locals.userId),
    doc = s.documents.find((d) => d.id === req.params.id);
  if (!doc) {
    res.status(404).json({ error: "Документ не найден" });
    return;
  }
  doc.confirmed = true;
  s.documents = s.documents.filter(
    (d) => d.id === doc.id || d.category !== doc.category || !d.confirmed,
  );
  if (doc.category === "statement")
    Object.assign(s.financials, {
      freeFlow: doc.fields.freeFlow,
      existing: doc.fields.existingPayments ?? 0,
      freeFlowSource: doc.name + " · " + doc.period,
      ...("lastBalance" in doc.fields
        ? { balance: doc.fields.lastBalance }
        : {}),
    });
  notify(
    s,
    "v2:doc:" + doc.id,
    "Документ подтверждён",
    doc.name + " · " + doc.period,
    "profile",
  );
  saveState(res.locals.userId, s);
  res.json(s);
});
app.get("/api/documents/:id/download", (req, res) => {
  const f = db
    .prepare("SELECT * FROM files WHERE id=? AND user_id=?")
    .get(req.params.id, res.locals.userId) as any;
  if (!f) {
    res.status(404).json({ error: "Файл не найден" });
    return;
  }
  res
    .type("application/octet-stream")
    .set(
      "Content-Disposition",
      "attachment; filename*=UTF-8''" + encodeURIComponent(f.name),
    )
    .send(Buffer.from(f.data));
});
app.use("/api", fundingRouter);
app.post("/api/chats", (req, res) => {
  const s = stateOf(res.locals.userId);
  const selectionId = req.body.selectionId
    ? z.string().parse(req.body.selectionId)
    : undefined;
  if (selectionId && !s.selections.some((x) => x.id === selectionId)) {
    res.status(404).json({ error: "Подбор не найден" });
    return;
  }
  let chat = selectionId
    ? s.chats.find((c) => c.selectionId === selectionId)
    : undefined;
  if (!chat) {
    chat = {
      id: randomUUID(),
      title: selectionId ? "Обсуждение подбора" : "Новый диалог",
      selectionId,
      messages: [],
    };
    s.chats.unshift(chat);
    saveState(res.locals.userId, s);
  }
  res.json(chat);
});
app.patch("/api/chats/:id", (req, res) => {
  const s = stateOf(res.locals.userId),
    chat = s.chats.find((c) => c.id === req.params.id);
  if (!chat) {
    res.status(404).json({ error: "Диалог не найден" });
    return;
  }
  chat.title = z.string().min(1).max(80).parse(req.body.title);
  saveState(res.locals.userId, s);
  res.json(s);
});
const busy = new Set<string>();
app.post("/api/chats/:id/messages", async (req, res) => {
  const uid = res.locals.userId;
  if (busy.has(uid)) {
    res.status(409).json({ error: "Дождитесь завершения текущего ответа" });
    return;
  }
  limit("chat:" + uid, 12);
  const s = stateOf(uid),
    chat = s.chats.find((c) => c.id === req.params.id);
  if (!chat) {
    res.status(404).json({ error: "Диалог не найден" });
    return;
  }
  const text = z.string().trim().min(1).max(4000).parse(req.body.text);
  chat.messages.push({
    id: randomUUID(),
    role: "user",
    text,
    createdAt: new Date().toISOString(),
  });
  if (chat.messages.length === 1) chat.title = text.slice(0, 48);
  saveState(uid, s);
  busy.add(uid);
  try {
    const provider = createAIProvider(process.env, () => {
          const day = new Date().toISOString().slice(0, 10);
          const n = db
            .prepare("SELECT calls FROM usage WHERE user_id=? AND day=?")
            .get(uid, day) as any;
          if ((n?.calls ?? 0) >= Number(process.env.AI_DAILY_CALL_LIMIT || 20))
            throw new Error("Дневной лимит ИИ-запросов исчерпан");
          db.prepare(
            "INSERT INTO usage VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET calls=calls+1",
          ).run(uid, day);
        });
    const answer = await provider.reply(s, chat.messages, chat.selectionId);
    const current = stateOf(uid),
      currentChat = current.chats.find((c) => c.id === chat.id)!;
    currentChat.messages.push({
      id: randomUUID(),
      role: "assistant",
      createdAt: new Date().toISOString(),
      ...answer,
    });
    saveState(uid, current);
    res.json(current);
  } catch {
    res.status(502).json({
      error:
        "ИИ не ответил или достигнут лимит. Сообщение сохранено; повторите позже.",
    });
  } finally {
    busy.delete(uid);
  }
});
app.post("/api/financials", (req, res) => {
  const s = stateOf(res.locals.userId);
  const p = z
    .object({
      field: z.enum([
        "incoming",
        "expenses",
        "freeFlow",
        "existing",
        "balance",
      ]),
      value: z.number().finite().min(0).max(1e9),
    })
    .parse(req.body);
  s.financials[p.field] = p.value;
  if (["incoming", "expenses", "balance"].includes(p.field))
    s.financials.forecastSource =
      "Предположения, подтверждённые пользователем " +
      new Date().toISOString().slice(0, 10);
  s.financials[p.field + "Source"] =
    "Подтверждено пользователем " + new Date().toISOString().slice(0, 10);
  saveState(res.locals.userId, s);
  res.json(s);
});
app.post("/api/selections", (req, res) => {
  const s = stateOf(res.locals.userId);
  const result = select(req.body, s.profile);
  const statement = s.documents.find(
    (d) => d.category === "statement" && d.confirmed,
  );
  result.calculation.source =
    "Ставка: синтетический каталог demo-1 от 16.10.2026. Поток: " +
    (statement && Number(req.body.flow) === Number(statement.fields.freeFlow)
      ? statement.name + " · " + statement.period
      : "сведения пользователя для этого сценария, не проверены документом") +
    ".";
  const parentId = req.body.parentId ? String(req.body.parentId) : undefined;
  const parent = parentId
    ? s.selections.find((x) => x.id === parentId)
    : undefined;
  if (parentId && !parent) {
    res.status(404).json({ error: "Исходный подбор не найден" });
    return;
  }
  const item = {
    ...result,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    version: parent ? parent.version + 1 : 1,
    parentId,
  };
  s.selections.unshift(item);
  saveState(res.locals.userId, s);
  res.json(item);
});
app.post("/api/leads", (req, res) => {
  const s = stateOf(res.locals.userId),
    selectionId = z.string().parse(req.body.selectionId),
    phone = phoneSchema.parse(req.body.phone);
  if (!s.selections.some((x) => x.id === selectionId)) {
    res.status(404).json({ error: "Подбор не найден" });
    return;
  }
  const existing = s.leads.find((x) => x.selectionId === selectionId);
  if (!existing)
    s.leads.push({
      id: randomUUID(),
      selectionId,
      phone,
      createdAt: new Date().toISOString(),
    });
  notify(
    s,
    "lead:" + selectionId,
    "Демозаявка сохранена",
    "Досье сохранено локально. В банк ничего не отправлено.",
    "financing",
  );
  saveState(res.locals.userId, s);
  res.json(s);
});
app.post("/api/consultations", (req, res) => {
  const s = stateOf(res.locals.userId);
  const phone = phoneSchema.parse(req.body.phone);
  const note = z.string().trim().min(5).max(1000).parse(req.body.note);
  const existing = s.leads.find(
    (l) =>
      l.selectionId === "consultation" && l.note === note && l.phone === phone,
  );
  if (!existing)
    s.leads.push({
      id: randomUUID(),
      selectionId: "consultation",
      phone,
      note,
      createdAt: new Date().toISOString(),
    });
  notify(
    s,
    "consultation:" +
      createHash("sha256")
        .update(phone + note)
        .digest("hex"),
    "Обращение сохранено",
    "Демонстрационное обращение сохранено локально. Сотруднику банка не отправлялось.",
    "cabinet",
  );
  saveState(res.locals.userId, s);
  res.json(s);
});
app.get("/api/dossier/:id", (req, res) => {
  const s = stateOf(res.locals.userId),
    selection = s.selections.find((x) => x.id === req.params.id);
  if (!selection) {
    res.status(404).json({ error: "Подбор не найден" });
    return;
  }
  const dossier = {
    demo: true,
    createdAt: new Date().toISOString(),
    profile: s.profile,
    selection,
    documents: s.documents.filter((d) => d.confirmed),
    financials: s.financials,
    limitations:
      "Демонстрационные условия, решение за банком. Не является банковской заявкой.",
  };
  res
    .set("Content-Disposition", 'attachment; filename="dossier.json"')
    .json(dossier);
});
app.post("/api/credit/demo", (req, res) => {
  const s = stateOf(res.locals.userId);
  if (!s.credit) {
    const paid = 8;
    const started = new Date();
    started.setUTCMonth(started.getUTCMonth() - paid);
    const calculation = calculate(
      {
        amount: 3000000,
        term: 36,
        rate: 22,
        flow: 420000,
        existing: 0,
      },
      started,
    );
    s.credit = {
      id: randomUUID(),
      calculation,
      paid,
      demo: true,
      balance: calculation.schedule[paid - 1].balance,
      source: "Синтетический тестовый договор",
    };
    Object.assign(s.financials, {
      balance: 850000,
      incoming: 1200000,
      expenses: 780000,
      freeFlow: 420000,
      forecastSource: "Синтетические предположения демосценария",
    });
    const p = calculation.schedule[paid];
    notify(
      s,
      "payment:" + s.credit.id,
      "Ближайший платёж по демографику",
      `${p.date} · ${p.payment} ₽`,
      "cabinet",
    );
    saveState(res.locals.userId, s);
  }
  res.json(s);
});
app.post("/api/forecast-assumptions", (req, res) => {
  const values = z
    .object({
      balance: z.number().finite().min(0).max(1e9),
      incoming: z.number().finite().min(0).max(1e9),
      expenses: z.number().finite().min(0).max(1e9),
    })
    .strict()
    .parse(req.body);
  const s = stateOf(res.locals.userId);
  Object.assign(s.financials, values, {
    forecastSource:
      "Предположения, подтверждённые пользователем " +
      new Date().toISOString().slice(0, 10),
  });
  saveState(res.locals.userId, s);
  res.json(s);
});
app.post("/api/credit/forecast", (req, res) => {
  const s = stateOf(res.locals.userId);
  if (!s.credit) {
    res.status(404).json({ error: "Нет кредита" });
    return;
  }
  const stress = z.boolean().parse(req.body.stress);
  const { balance, incoming, expenses } = s.financials;
  if ([balance, incoming, expenses].some((x) => typeof x !== "number")) {
    res.json({ available: false, source: "Недостаточно данных" });
    return;
  }
  const after = forecast(
    Number(balance),
    Number(incoming),
    Number(expenses),
    s.credit.calculation.monthlyPayment,
    stress,
  );
  if (after < 0)
    notify(
      s,
      "deficit:" + s.credit.id + ":" + stress,
      "Возможный дефицит",
      `По заданным предположениям после платежа ${after} ₽. Это прогноз, не банковский остаток.`,
      "cabinet",
    );
  saveState(res.locals.userId, s);
  res.json({
    available: true,
    after,
    stress,
    source: s.financials.forecastSource || "Сведения пользователя",
    date: s.credit.calculation.schedule[s.credit.paid].date,
  });
});
app.post("/api/notifications/read", (req, res) => {
  const s = stateOf(res.locals.userId);
  s.notifications.forEach((n) => {
    if (!req.body.id || n.id === req.body.id) n.read = true;
  });
  saveState(res.locals.userId, s);
  res.json(s);
});
app.post("/api/team-score", async (req, res) => {
  const payload = z
    .object({
      statement_csv: z.string().max(500000),
      need: z.record(z.string(), z.unknown()),
      questionnaire: z.record(z.string(), z.unknown()),
      confirmed_fields: z.record(z.string(), z.unknown()).optional(),
    })
    .parse(req.body);
  try {
    const url = new URL(
      "/score",
      process.env.TEAM_API_URL || "http://127.0.0.1:8080",
    );
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    if (r.status >= 500) {
      await r.body?.cancel();
      throw new Error("Team API unavailable");
    }
    res.status(r.status).json(await r.json());
  } catch {
    res.status(502).json({
      error:
        "Командное ядро недоступно. Локальный демонстрационный расчёт работает отдельно.",
    });
  }
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Маршрут не найден" }),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof z.ZodError) {
      const fields = russianValidationErrors(error.issues);
      res.status(422).json({
        error: Object.values(fields).join(" "),
        fields,
      });
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(413).json({
        error:
          "Файл слишком большой (максимум 8 МБ) или неверный формат загрузки",
      });
      return;
    }
    res.status(400).json({
      error:
        error instanceof Error &&
        /[А-Яа-яЁё]/.test(error.message) &&
        !/SQLITE|constraint|parse|unexpected|zip|central directory/i.test(
          error.message,
        )
          ? error.message
          : "Не удалось обработать запрос. Проверьте данные.",
    });
  },
);
