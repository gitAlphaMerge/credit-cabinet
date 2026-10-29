import express from "express";
import multer from "multer";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  db,
  feedbackOf,
  type Feedback,
  createUser,
  session,
  sessionUser,
  getUser,
  logout,
  stateOf,
  saveState,
  notify,
  verifyPassword,
  hashPassword,
  initialState,
  type User,
} from "./store";
import { calculate, select, forecast, catalog } from "./finance";
import { extract, fieldNames, readableFileName } from "./documents";
import {
  confirmDocumentVersion,
  creditRevision,
  documentMetadata,
} from "./document-policy";
import { createDocumentConnectorRouter } from "./document-connector";
import { createAIProvider, type AgentTurnContext } from "./ai-provider";
import { publicPreview } from "./preview";
import { findCompany, RegistryError } from "./registry";
import { cabinetRouter, syncCabinetNotices } from "./cabinet";
import type { Profile, AppState } from "../shared/types";
import { russianValidationErrors } from "../shared/facility-validation";
import { fundingRouter } from "./funding-routes";
import { applicationsRouter } from "./applications-routes";
import { mvp2Router } from "./mvp2-routes";
import { onboardingSchema, type MvpApplication } from "../shared/mvp2";
import {
  bootstrapJourney,
  restartJourney,
  cabinetAvailable,
  isGuest,
  readJourney,
  saveOnboarding,
  completeOnboarding,
  saveJourneyPosition,
  guardJourneyApi,
  readDraft,
  saveDraft,
} from "./journey";
import { checksRouter } from "./checks";
import { demoPersonasRouter, ensureDemoSchema } from "./demo-personas";
import { juryCabinet, juryDestination } from "./jury-cabinets";
import { demoPersonas } from "../shared/demo-personas";
import { agentIdentity } from "./agent-identity";
import { ensureJuryReporting } from "./jury-cabinets";
import {
  ApplicationError,
  applicationOf,
  applicationsDependencies,
  applicationRequestHash,
  dossierOf,
  executeApplicationEvent,
  visibleApplication,
  type Application,
} from "./applications";
import {
  disagreeWithApplication,
  resumeDisagreedReview,
  startSilenceSweep,
} from "./application-silence";
export const app = express();
export const stopSilenceSweep = startSilenceSweep(db, applicationsDependencies);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": req.path === "/v2/zagruzka.html" ? "SAMEORIGIN" : "DENY",
    "Referrer-Policy": "same-origin",
  });
  next();
});
app.use(express.json({ limit: "2mb" }));
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
app.use("/api", demoPersonasRouter);
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
  mvp2Answers: onboardingSchema.optional(),
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
app.get("/api/model-identity", async (_req,res) => res.json(await agentIdentity()));
app.get("/api/config", (req, res) => {
  const user = sessionUser(token(req));
  res.json({
    authenticated: !!user,
    workspaceId: user?.user_id ?? null,
    role: user ? (getUser(user.user_id)?.role ?? "client") : null,
    anonymous: user ? isGuest(user.user_id) : false,
    cabinetAvailable: user ? cabinetAvailable(user.user_id) : false,
    aiConnected:
      process.env.AI_PROVIDER === "openai"
        ? !!process.env.OPENAI_API_KEY
        : !!process.env.TEAM_AGENT_URL,
    model:
      process.env.AI_PROVIDER === "openai"
        ? process.env.AI_MODEL || "gpt-5.4-mini"
        : process.env.AGENT_LLM_MODEL || "qwen3:8b",
    fieldNames,
    catalog,
  });
});
app.post("/api/journey/session", (req, res) => {
  limit("journey:" + req.ip, 20);
  bootstrapJourney(req, res);
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
      const response = await fetch(
        new URL("/health", process.env.TEAM_API_URL),
        {
          signal: AbortSignal.timeout(2000),
        },
      );
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
    schema: 4,
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
// Вход жюри: общий логин и пароль, дефисы, пробелы и регистр не важны («git-merge alpha» = «gitmergealpha»).
// Засеянная компания (DEMO_PERSONAS=1 и scripts/seed-demo.ts) открывается как есть, иначе заводится чистая тестовая с тем же названием.
const juryKey = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
app.post("/api/auth/jury", async (req, res) => {
  limit("jury:" + req.ip, 30);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (
    juryKey(body.login) !== juryKey(process.env.JURY_LOGIN || "gitmergealpha") ||
    juryKey(body.password) !== juryKey(process.env.JURY_PASSWORD || "alphahack2026")
  ) {
    res.status(401).json({ error: "Логин или пароль не подошли" });
    return;
  }
  const persona = body.persona
    ? demoPersonas.find((p) => p.key === body.persona)
    : demoPersonas.find((p) => p.role === "client");
  if (!persona) {
    res.status(400).json({ error: "Такой тестовой компании нет" });
    return;
  }
  // Менеджер не проходит клиентский путь: заводится сразу с ролью и открывает очередь банка.
  if (persona.role === "manager") {
    ensureDemoSchema(db);
    db.prepare(
      "INSERT OR IGNORE INTO users(id,phone,password,state,role,is_demo) VALUES(?,?,?,?,'manager',1)",
    ).run(
      persona.userId,
      persona.phone,
      hashPassword(randomUUID()),
      JSON.stringify(initialState({ name: persona.company, intent: "Рабочее место менеджера" } as any)),
    );
    cookie(res, session(persona.userId));
    res.json({ ok: true, destination: "/bank" });
    return;
  }
  if (process.env.DEMO_PERSONAS === "1") {
    ensureDemoSchema(db);
    const seeded = db
      .prepare("SELECT is_demo,role FROM users WHERE id=?")
      .get(persona.userId) as { is_demo: number; role: string } | undefined;
    if (seeded?.is_demo === 1 && seeded.role === persona.role) {
      cookie(res, session(persona.userId));
      res.json({ ok: true, destination: juryDestination(persona.userId) });
      return;
    }
  }
  try {
    const uid = await juryCabinet(persona, `http://127.0.0.1:${req.socket.localPort}`);
    cookie(res, session(uid));
    res.json({ ok: true, destination: juryDestination(uid) });
    return;
  } catch (error) {
    console.error("jury cabinet:", (error as Error).message);
  }
  const client = persona;
  const id = createUser("demo-" + randomUUID(), randomUUID(), {
    name: client.company,
    form: client.form,
    stage: "operating",
    sector: client.sector,
    registered: true,
    ageBand: "3–5 лет",
    result: "Прибыль",
    debt: "Нет",
    intent: "Подобрать финансирование",
  });
  const s = stateOf(id);
  s.profile.source = "Синтетический демонстрационный сценарий";
  s.profile.registeredAt = client.registeredAt;
  s.preferences.tourDone = true;
  saveState(id, s);
  cookie(res, session(id));
  // Чистая компания начинает с анкеты: кабинет открывается после финансирования (guardJourneyPage).
  res.json({ ok: true, destination: "/apply" });
});
// Учётки жюри из JURY_ACCOUNTS="79000000001:пароль;79000000002:пароль": заводятся при старте, если их ещё нет.
for (const [index, pair] of (process.env.JURY_ACCOUNTS ?? "").split(";").filter(Boolean).entries()) {
  const [phone, password] = pair.split(":").map((x) => x.trim());
  if (!/^7\d{10}$/.test(phone) || !password || password.length < 8) continue;
  if (db.prepare("SELECT id FROM users WHERE phone=?").get(phone)) continue;
  createUser(phone, password, {
    name: "ООО «Жюри " + (index + 1) + "»",
    form: "ООО",
    stage: "operating",
    sector: "Производство",
    registered: true,
    ageBand: "3–5 лет",
    result: "Прибыль",
    debt: "Нет",
    intent: "Подобрать финансирование",
  });
}
app.post("/api/auth/logout", (req, res) => {
  logout(token(req));
  cookie(res, "", 0);
  res.json({ ok: true });
});
// Cover nested slots and trace as well as the visible message text.
export function redactExport(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[скрыто]")
      .replace(/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, "[скрыто]")
      .replace(/(?<!\d)\d{3}[ -]?\d{3}[ -]?\d{3}[ -]?\d{2}(?!\d)/g, "[скрыто]")
      .replace(/(?<!\d)\d{2} ?\d{2}[ -]?\d{6}(?!\d)/g, "[скрыто]")
      .replace(/(?<!\d)(?:\d{12}|\d{10})(?!\d)/g, "[скрыто]")
      .replace(
        /(?<!\d)(?:\+7|7|8)[ (.-]*\d{3}[ ) .-]*\d{3}[ .-]*\d{2}[ .-]*\d{2}(?!\d)/g,
        "[скрыто]",
      );
  if (Array.isArray(value)) return value.map(redactExport);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !["phone", "statement_csv", "user_id"].includes(k))
        .map(([k, v]) => [
          k,
          [
            "user",
            "id",
            "chat_id",
            "message_id",
            "created_at",
            "updated_at",
            "createdAt",
            "updatedAt",
          ].includes(k)
            ? v
            : redactExport(v),
        ]),
    );
  return value;
}
function publicFeedback(row: Feedback) {
  const { user_id, reasons, rating, ...rest } = row;
  return {
    ...rest,
    rating:
      row.kind === "conversation" && rating !== null ? Number(rating) : rating,
    reasons: JSON.parse(reasons) as string[],
  };
}
async function agentTraces(
  ids: string[],
  secret: string,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (let start = 0; start < ids.length; start += 200) {
    try {
      const url = new URL(
        "/admin/sessions",
        process.env.TEAM_AGENT_URL || "http://agent:8090",
      );
      url.searchParams.set("ids", ids.slice(start, start + 200).join(","));
      const response = await fetch(url, {
        headers: { Authorization: "Bearer " + secret },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) Object.assign(result, await response.json());
    } catch {
      /* Trace is optional when the agent is unavailable. */
    }
  }
  return result;
}
app.get(
  ["/api/admin/feedback.jsonl", "/api/admin/history.jsonl"],
  async (req, res) => {
    const secret = process.env.FEEDBACK_EXPORT_TOKEN;
    if (!secret) {
      res.sendStatus(404);
      return;
    }
    const digest = (v: string) => createHash("sha256").update(v).digest();
    if (
      !timingSafeEqual(
        digest(req.get("Authorization") || ""),
        digest("Bearer " + secret),
      )
    ) {
      res.sendStatus(401);
      return;
    }
    const since =
      req.query.since === undefined
        ? undefined
        : z.string().datetime({ offset: true }).parse(req.query.since);
    const cutoff = since ? Date.parse(since) : -Infinity;
    const chats = (
      db.prepare("SELECT id,state FROM users").all() as {
        id: string;
        state: string;
      }[]
    ).flatMap((u) =>
      (JSON.parse(u.state) as AppState).chats.map((chat) => {
        const dated = chat as typeof chat & {
          createdAt?: string;
          updatedAt?: string;
        };
        const feedback = feedbackOf(u.id, chat.id);
        const created_at =
          dated.createdAt || chat.messages[0]?.createdAt || null;
        const updated_at =
          [
            dated.updatedAt,
            created_at,
            ...chat.messages.map((m) => m.createdAt),
            ...feedback.map((f) => f.updated_at),
          ]
            .filter((v): v is string => !!v)
            .sort((a, b) => Date.parse(a) - Date.parse(b))
            .at(-1) || null;
        return {
          chat_id: chat.id,
          user: createHash("sha256").update(u.id).digest("hex"),
          title: chat.title,
          created_at,
          updated_at,
          messages: chat.messages,
          feedback: feedback.map(publicFeedback),
          status:
            (
              chat.messages.filter((m) => m.role === "assistant").at(-1) as
                { status?: string } | undefined
            )?.status || null,
        };
      }),
    );
    const history = req.path.endsWith("history.jsonl");
    const selected = chats.filter((c) =>
      history
        ? !since || (!!c.updated_at && Date.parse(c.updated_at) > cutoff)
        : c.feedback.some(
            (f) => f.rating !== null && Date.parse(f.updated_at) > cutoff,
          ),
    );
    const traces = await agentTraces(
      selected.map((c) => c.chat_id),
      secret,
    );
    const lines = selected.flatMap<unknown>((c) => {
      const agent_trace = traces[c.chat_id] ?? null;
      if (history) return [{ ...c, agent_trace }];
      return c.feedback
        .filter((f) => f.rating !== null && Date.parse(f.updated_at) > cutoff)
        .map((f) => {
          const index = c.messages.findIndex((m) => m.id === f.message_id);
          return {
            ...f,
            user: c.user,
            messages:
              f.kind === "message"
                ? c.messages.slice(0, index + 1)
                : c.messages,
            agent_trace,
          };
        });
    });
    res
      .type("application/x-ndjson")
      .send(
        lines.map((line) => JSON.stringify(redactExport(line))).join("\n") +
          (lines.length ? "\n" : ""),
      );
  },
);
app.use("/api", (req, res, next) => {
  const u = sessionUser(token(req));
  if (!u) {
    res.status(401).json({ error: "Сессия недоступна. Обновите страницу." });
    return;
  }
  res.locals.userId = u.user_id;
  next();
});
app.use("/api", guardJourneyApi);
app.post("/api/journey/restart", (req, res) => {
  limit("journey-restart:" + req.ip, 20);
  restartJourney(req, res);
});
app.get("/api/journey", (_req, res) =>
  res.json(readJourney(res.locals.userId)),
);
app.put("/api/journey/onboarding", saveOnboarding);
app.post("/api/journey/complete", completeOnboarding);
app.put("/api/journey/position", saveJourneyPosition);
app.get("/api/journey/draft/:id", readDraft);
app.put("/api/journey/draft", saveDraft);
app.get("/api/state", (_req, res) => {
  ensureJuryReporting(res.locals.userId);
  const s = stateOf(res.locals.userId);
  syncCabinetNotices(s);
  saveState(res.locals.userId, s);
  res.json(s);
});
app.use("/api/cabinet", cabinetRouter);
app.use("/api/checks", checksRouter);
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
app.use("/api", createDocumentConnectorRouter());
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
      .update(data.category)
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
    Object.assign(doc, documentMetadata(doc), {
      creditRevision: creditRevision(s),
    });
    s.documents.unshift(doc);
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
  confirmDocumentVersion(s, doc);
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
app.post("/api/applications/:id/disagreement", async (req, res) => {
  const uid = res.locals.userId;
  if (getUser(uid)?.role !== "client") {
    res.status(403).json({ error: "Возражение отправляет клиент" });
    return;
  }
  const body = z
    .object({
      expectedVersion: z.number().int().positive(),
      client_objections: z.string().trim().min(1).max(4000),
    })
    .strict()
    .parse(req.body);
  const a = visibleApplication(db, req.params.id, "client", uid);
  if (a.version !== body.expectedVersion)
    throw new ApplicationError(409, "Версия заявки изменилась");
  res.json(
    await disagreeWithApplication(
      db,
      a,
      body.client_objections,
      applicationsDependencies(),
    ),
  );
});
app.post("/api/applications/:id/events", async (req, res, next) => {
  if (req.body.event !== "client_update") return next();
  const body = z
    .object({
      event: z.literal("client_update"),
      expectedVersion: z.number().int().positive(),
      reason: z.string().max(4000).optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .parse(req.body);
  const key = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .parse(req.get("Idempotency-Key"));
  const uid = res.locals.userId;
  const deps = applicationsDependencies();
  const result = await executeApplicationEvent(
    db,
    {
      applicationId: req.params.id,
      event: body.event,
      expectedVersion: body.expectedVersion,
      actorRole: getUser(uid)!.role,
      actorId: uid,
      reason: body.reason,
      payload: body.payload,
    },
    key,
    applicationRequestHash(req.path.replace(/^\/api/, ""), req.body),
    deps,
  );
  if (applicationOf(db, req.params.id).version === result.application.version) {
    const reviewed = await resumeDisagreedReview(db, result.application, deps);
    if (reviewed.application.version !== result.application.version) {
      db.prepare(
        "UPDATE application_idempotency SET response=? WHERE key=? AND user_id=?",
      ).run(JSON.stringify(reviewed), key, uid);
      res.json(reviewed);
      return;
    }
  }
  res.json(result);
});
app.use("/api", applicationsRouter);
app.use("/api/mvp2", mvp2Router);
const feedbackSchema = z
  .object({
    kind: z.enum(["message", "conversation"]),
    message_id: z.string().min(1).max(200).nullable().optional(),
    rating: z
      .union([z.enum(["up", "down"]), z.number().int().min(1).max(7)])
      .nullable(),
    reasons: z
      .array(z.enum(["G", "L", "M", "P", "V", "F", "other"]))
      .max(7)
      .default([]),
    text: z.string().max(1000).default(""),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.kind === "message"
        ? !v.message_id || typeof v.rating === "number"
        : !!v.message_id || typeof v.rating === "string"
    )
      ctx.addIssue({ code: "custom", message: "Неверный тип оценки" });
    if (v.rating !== "down" && v.reasons.length)
      ctx.addIssue({
        code: "custom",
        message: "Причины доступны для плохого ответа",
      });
  });
app.get("/api/chats/:id/feedback", (req, res) => {
  if (!stateOf(res.locals.userId).chats.some((c) => c.id === req.params.id)) {
    res.sendStatus(404);
    return;
  }
  res.json(feedbackOf(res.locals.userId, req.params.id).map(publicFeedback));
});
app.post("/api/chats/:id/feedback", (req, res) => {
  const uid = res.locals.userId,
    chat = stateOf(uid).chats.find((c) => c.id === req.params.id);
  if (!chat) {
    res.sendStatus(404);
    return;
  }
  const value = feedbackSchema.parse(req.body);
  const message =
    value.kind === "message"
      ? chat.messages.find(
          (m) => m.id === value.message_id && m.role === "assistant",
        )
      : undefined;
  if (value.kind === "message" && !message) {
    res.sendStatus(404);
    return;
  }
  const previous = feedbackOf(uid, chat.id).find(
    (f) =>
      f.kind === value.kind &&
      (value.kind === "conversation" || f.message_id === value.message_id),
  );
  const now = new Date().toISOString();
  const mode =
    message?.mode ||
    chat.messages.filter((m) => m.role === "assistant").at(-1)?.mode ||
    null;
  db.prepare(
    `INSERT INTO feedback(id,user_id,chat_id,message_id,kind,rating,reasons,text,agent_mode,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET rating=excluded.rating,reasons=excluded.reasons,
    text=excluded.text,agent_mode=excluded.agent_mode,updated_at=excluded.updated_at`,
  ).run(
    previous?.id || randomUUID(),
    uid,
    chat.id,
    value.message_id || null,
    value.kind,
    value.rating === null ? null : String(value.rating),
    JSON.stringify([...new Set(value.reasons)]),
    value.text,
    mode,
    previous?.created_at || now,
    now,
  );
  res.json(feedbackOf(uid, chat.id).map(publicFeedback));
});
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
      businessArea: req.body.businessArea === undefined ? undefined : z.string().trim().min(1).max(64).parse(req.body.businessArea),
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
// Заявка нового пути (mvp2) тоже идёт агенту: цель, сумма, срок, решение и варианты.
// Без этого агент в кабинете с выданным кредитом заново спрашивает «На что нужны деньги?».
const agentPurposes: Record<string, string> = {
  Закупки: "закупка под контракт",
  Контракт: "закупка под контракт",
  "Текущие расходы": "кассовый разрыв",
  "Кассовый разрыв": "кассовый разрыв",
  "Оборудование/транспорт": "оборудование",
  "Ремонт/новая точка": "рост",
};
function mvpTurnContext(uid: string): AgentTurnContext | undefined {
  const row = db
    .prepare(
      "SELECT d.data FROM mvp2_dossiers d JOIN applications a ON a.id=d.application_id WHERE a.user_id=? ORDER BY a.created_at DESC LIMIT 1",
    )
    .get(uid) as { data: string } | undefined;
  if (!row) return undefined;
  let a: MvpApplication;
  try {
    a = JSON.parse(row.data) as MvpApplication;
  } catch {
    return undefined;
  }
  const q = a.questionnaire;
  return {
    need: {
      ...(agentPurposes[q.purpose] ? { purpose: agentPurposes[q.purpose] } : {}),
      ...(q.amount > 0 ? { amount_rub: q.amount } : {}),
      ...(q.term ? { term_months: q.term } : {}),
      instrument: a.recommendedProductId,
    },
    application: {
      id: a.id,
      status: a.activatedAt ? "ACTIVE" : a.decision ?? a.lifecycle,
      reasons: a.reasons,
      limit_now_rub: a.financial?.limitNow ?? a.financial?.limit,
      alternatives: (a.alternatives ?? []).map((x) => ({
        option_id: x.id,
        kind: "alternative",
        product_id: x.productId,
        product_name: x.productId,
        amount_rub: x.amount,
        term_months: x.term,
        rate_annual_pct: x.rate,
        monthly_payment_rub: x.payment,
        reason: x.reason,
      })),
    },
  };
}
function activeApplication(uid: string, selectionId?: string) {
  const rows = db
    .prepare(
      "SELECT * FROM applications WHERE user_id=? AND status IN ('info_requested','queued','offered') ORDER BY created_at DESC,id DESC",
    )
    .all(uid) as Application[];
  return selectionId
    ? rows.find((a) => a.selection_id === selectionId)
    : rows.length === 1
      ? rows[0]
      : undefined;
}
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
    // ID из авторизованной сессии, а не из профиля или тела запроса.
    const application = activeApplication(uid, chat.selectionId);
    const dossier = application && dossierOf(db, application.id);
    const core = dossier ? JSON.parse(dossier.core_result).core : undefined;
    const context = application
      ? {
          application: {
            id: application.id,
            status: application.status,
            n: dossier?.readiness_n ?? undefined,
            m: dossier?.readiness_m ?? undefined,
            holes: dossier ? JSON.parse(dossier.holes) : [],
            reasons: core?.reasons,
            stops_fired: core?.stops_fired,
            limit_now_rub: core?.limit_now_rub,
            alternatives: dossier?.alternatives,
          },
          ...(application.status === "info_requested"
            ? { mode: "objections" as const }
            : {}),
        }
      : undefined;
    const answer = await provider.reply(
      { ...s, userId: uid },
      chat.messages,
      chat.selectionId,
      context ?? mvpTurnContext(uid),
    );
    // Explicit objections work without an LLM. A model response alone cannot
    // authorize a transition or supply the customer's asserted reasons.
    if (
      application?.status === "info_requested" &&
      /не\s+соглас|не\s+подход|отказываюсь|возражаю|нуж(?:на|ен)\s+(?:вся|больш)/i.test(
        text,
      )
    ) {
      const latest = applicationOf(db, application.id);
      if (latest.status === "info_requested")
        await disagreeWithApplication(
          db,
          latest,
          text,
          applicationsDependencies(),
        );
    }
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
    const result = await r.json();
    if (r.ok) {
      const core = result?.core;
      // Ответ только с представлением допустим; переданное ядро проверяется всегда.
      const viewOnly =
        result !== null &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        !("core" in result) &&
        result.view !== null &&
        typeof result.view === "object" &&
        !Array.isArray(result.view);
      if (
        !viewOnly &&
        (!core ||
          typeof core.limit_now_rub !== "number" ||
          !Number.isFinite(core.limit_now_rub) ||
          core.limit_now_rub < 0 ||
          !Array.isArray(core.stops_fired) ||
          !core.stops_fired.every(
            (code: unknown) => typeof code === "string",
          ) ||
          !Array.isArray(core.missing) ||
          !core.missing.every((code: unknown) => typeof code === "string"))
      )
        throw new Error("Invalid team score response");
    }
    res.status(r.status).json(result);
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
    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      res.status(413).json({ error: "Файл слишком большой" });
      return;
    }
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
    if (error instanceof ApplicationError) {
      res.status(error.status).json({ error: error.message });
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
