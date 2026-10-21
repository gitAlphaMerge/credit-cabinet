import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AppState, Selection } from "../shared/types";

export type Role = "client" | "manager" | "system";
export type Status = "draft" | "queued" | "info_requested" | "underwriting" | "approved"
  | "offered" | "signed" | "disbursed" | "rejected" | "expired" | "withdrawn";
export type Event = "create" | "submit" | "request_info" | "client_update" | "reject"
  | "send_to_underwriting" | "underwriter_approve" | "make_offer" | "sign" | "disburse"
  | "expire" | "withdraw";

// The only state-machine definition. SQL and HTTP both use this function.
export const TRANSITIONS: readonly (readonly [Status | null, Event, Role, Status])[] = [
  [null, "create", "client", "draft"],
  ["draft", "submit", "client", "queued"],
  ["draft", "submit", "system", "rejected"],
  ["queued", "request_info", "manager", "info_requested"],
  ["info_requested", "client_update", "client", "queued"],
  ["queued", "reject", "manager", "rejected"],
  ["queued", "send_to_underwriting", "manager", "underwriting"],
  ["underwriting", "underwriter_approve", "system", "approved"],
  ["approved", "make_offer", "system", "offered"],
  ["offered", "sign", "client", "signed"],
  ["signed", "disburse", "system", "disbursed"],
  ["offered", "expire", "system", "expired"],
  ["draft", "withdraw", "client", "withdrawn"],
  ["queued", "withdraw", "client", "withdrawn"],
  ["info_requested", "withdraw", "client", "withdrawn"],
  ["underwriting", "withdraw", "client", "withdrawn"],
  ["approved", "withdraw", "client", "withdrawn"],
  ["offered", "withdraw", "client", "withdrawn"],
];

export class ApplicationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function transition(status: Status | null, event: Event, role: Role): Status {
  const pair = TRANSITIONS.filter(([from, action]) => from === status && action === event);
  if (!pair.length) throw new ApplicationError(409, "Недопустимый переход заявки");
  const allowed = pair.find(([, , actor]) => actor === role);
  if (!allowed) throw new ApplicationError(403, "Недостаточно прав для перехода");
  return allowed[3];
}

export type Application = {
  id: string; user_id: string; selection_id: string; selection_version: number;
  status: Status; amount: number; term_months: number; purpose: string; version: number;
  consent_at: string | null; queued_at: string | null; created_at: string; updated_at: string;
};
export type CoreReply = {
  core_result: Record<string, unknown>; N: number; M: number; holes: string[]; checks: unknown[];
};
export type CoreClient = { score(input: unknown): Promise<CoreReply> };
export type Dependencies = { core: CoreClient; clock: () => Date };
export type Command = {
  applicationId: string; event: Event; expectedVersion: number; actorRole: Role;
  actorId: string | null; reason?: string; payload?: Record<string, unknown>;
};
type Dossier = {
  application_id: string; version: number; core_result: string; checks: string; holes: string;
  created_at: string; readiness_n: number | null; readiness_m: number | null;
};

function configNumber(name: string, fallback: number, min: number, max = Infinity) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid ${name}`);
  return n;
}
// Demo simplification: fixed scenario key rate, NOT a live central-bank quotation.
export const SCENARIO_KEY_RATE = 0.19;
export function applicationConfig() {
  return {
    OFFER_RATE: configNumber("OFFER_RATE", SCENARIO_KEY_RATE + 0.05, 0.000001, 1),
    OFFER_TTL_DAYS: configNumber("OFFER_TTL_DAYS", 7, 0),
    PRIORITY_AGING_K: configNumber("PRIORITY_AGING_K", 20_000, 0),
  };
}

export type Installment = { principal: number; interest: number; payment: number };
export function annuitySchedule(amount: number, rate: number, months: number): Installment[] {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate < 0
    || !Number.isInteger(months) || months < 1 || months > 120) {
    throw new ApplicationError(422, "Неверные условия графика");
  }
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const monthly = rate / 12;
  const payment = round(monthly === 0 ? amount / months
    : amount * monthly / (1 - Math.pow(1 + monthly, -months)));
  let balance = round(amount);
  return Array.from({ length: months }, (_, i) => {
    const interest = round(balance * monthly);
    const principal = i === months - 1 ? balance : Math.min(balance, round(payment - interest));
    balance = round(balance - principal);
    return { principal, interest, payment: round(principal + interest) };
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function validateReply(value: CoreReply): CoreReply {
  if (!value || !Number.isFinite(value.N) || !Number.isFinite(value.M) || value.M <= 0
    || value.N < 0 || value.N > value.M || !Array.isArray(value.holes)
    || !value.holes.every(h => typeof h === "string") || !Array.isArray(value.checks)
    || !value.core_result || typeof value.core_result !== "object"
    || !Array.isArray(record(value.core_result.core).stops_fired)) {
    throw new ApplicationError(503, "Ядро не вернуло необходимые данные готовности");
  }
  return value;
}
export const httpCoreClient: CoreClient = {
  async score(input) {
    const response = await fetch(new URL("/score", process.env.TEAM_API_URL || "http://127.0.0.1:8080"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error("Core unavailable"); }
    const raw = await response.json() as Record<string, unknown>;
    // N/M must be supplied by the core. Never derive readiness from local assessment.
    // The current api-contract lacks these fields; fail closed until the owner maps them.
    return validateReply({ core_result: raw, N: raw.N as number, M: raw.M as number,
      holes: record(raw.core).missing as string[], checks: (raw.checks ?? []) as unknown[] });
  },
};
let dependencies: Dependencies = { core: httpCoreClient, clock: () => new Date() };
export function configureApplications(deps: Dependencies): void { dependencies = deps; }
export function applicationsDependencies(): Dependencies { return dependencies; }

export function applicationOf(db: DatabaseSync, id: string): Application {
  const application = db.prepare("SELECT * FROM applications WHERE id=?").get(id) as Application | undefined;
  if (!application) throw new ApplicationError(404, "Заявка не найдена");
  return application;
}
export function visibleApplication(db: DatabaseSync, id: string, role: Role, actorId: string | null) {
  const application = applicationOf(db, id);
  if (role === "client" && application.user_id !== actorId) throw new ApplicationError(404, "Заявка не найдена");
  return application;
}
export function dossierOf(db: DatabaseSync, id: string) {
  return db.prepare("SELECT * FROM dossiers WHERE application_id=? ORDER BY version DESC LIMIT 1")
    .get(id) as Dossier | undefined;
}
export function eventsOf(db: DatabaseSync, id: string) {
  return db.prepare("SELECT * FROM application_events WHERE application_id=? ORDER BY seq").all(id);
}
function userState(db: DatabaseSync, id: string): AppState {
  const user = db.prepare("SELECT state FROM users WHERE id=?").get(id) as { state: string } | undefined;
  if (!user) throw new ApplicationError(404, "Клиент не найден");
  return JSON.parse(user.state);
}
function selectionOf(state: AppState, id: string, version: number) {
  const selection = state.selections.find(s => s.id === id);
  if (!selection) throw new ApplicationError(404, "Подбор не найден");
  if (selection.version === version) return selection;
  const historical = selection.versions?.find(s => s.version === version);
  if (!historical) throw new ApplicationError(409, "Версия подбора не найдена");
  return { ...selection, ...historical };
}

function coreInput(db: DatabaseSync, application: Application, payload: Record<string, unknown>) {
  const state = userState(db, application.user_id);
  const selection = selectionOf(state, application.selection_id, application.selection_version);
  const purpose: Record<string, string> = {
    "Кассовый разрыв": "кассовый разрыв", "Исполнение контракта": "закупка под контракт",
    "Закупка товаров и материалов": "закупка под контракт", "Оборудование": "оборудование",
    "Развитие": "рост",
  };
  const statement = state.documents.find(d => d.category === "statement" && d.confirmed);
  const csvCell = (v: unknown) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  // Use stored extracted records, never synthesize account operations from financial totals.
  const statementCsv = ["date,amount,counterparty,purpose", ...(statement?.records ?? [])
    .map(r => [r.date, r.amount, r.counterparty, r.purpose].map(csvCell).join(","))].join("\n");
  const confirmed: Record<string, unknown> = {};
  for (const event of db.prepare(`SELECT payload FROM application_events
      WHERE application_id=? AND event='client_update' ORDER BY seq`).all(application.id)) {
    Object.assign(confirmed, record(JSON.parse(event.payload as string).confirmed_fields));
  }
  Object.assign(confirmed, record(payload.confirmed_fields));
  return {
    statement_csv: statementCsv,
    need: { purpose: purpose[application.purpose] ?? application.purpose,
      amount_rub: application.amount, term_months: application.term_months,
      repay_from: selection.repayFrom, asked_for: selection.product },
    questionnaire: { form: state.profile.form, years: state.profile.ageBand,
      sector: state.profile.sector, trend: state.profile.result, need: application.purpose },
    confirmed_fields: confirmed,
  };
}

function checkCommand(db: DatabaseSync, command: Command, deps: Dependencies) {
  const a = visibleApplication(db, command.applicationId, command.actorRole, command.actorId);
  transition(a.status, command.event, command.actorRole);
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 1)
    throw new ApplicationError(422, "Нужна expectedVersion");
  if (command.expectedVersion !== a.version) throw new ApplicationError(409, "Версия заявки изменилась");
  const p = command.payload ?? {};
  if (command.event === "submit" && p.consent !== true)
    throw new ApplicationError(422, "Нужно согласие на обработку данных и запрос в БКИ");
  if (["request_info", "reject"].includes(command.event) && !command.reason?.trim())
    throw new ApplicationError(422, "Укажите причину");
  if (command.event === "send_to_underwriting" && (typeof p.memo !== "string" || !p.memo.trim()))
    throw new ApplicationError(422, "Нужна записка андеррайтеру");
  if (command.event === "client_update" && !Object.keys(record(p.confirmed_fields)).length)
    throw new ApplicationError(422, "Нужны новые подтверждённые данные");
  if (command.event === "sign" && p.code !== "0000") throw new ApplicationError(422, "Неверный SMS-код");
  if (command.event === "underwriter_approve" || command.event === "make_offer") {
    if (typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount <= 0 || p.amount > a.amount)
      throw new ApplicationError(422, "Сумма одобрения не может превышать сумму заявки");
  }
  if (command.event === "make_offer") {
    if (typeof p.rate !== "number" || !Number.isFinite(p.rate) || p.rate <= 0
      || !Number.isInteger(p.term_months) || Number(p.term_months) < 1 || Number(p.term_months) > 120
      || !Array.isArray(p.schedule) || p.schedule.length !== p.term_months)
      throw new ApplicationError(422, "Неверные условия оффера");
  }
  if (command.event === "expire") {
    const offer = db.prepare(`SELECT at FROM application_events WHERE application_id=?
      AND event='make_offer' ORDER BY seq DESC LIMIT 1`).get(a.id) as { at: string } | undefined;
    if (!offer || deps.clock().getTime() - Date.parse(offer.at) <= applicationConfig().OFFER_TTL_DAYS * 86_400_000)
      throw new ApplicationError(409, "Оффер ещё действует");
  }
  return a;
}

async function scoreCommand(db: DatabaseSync, command: Command, deps: Dependencies) {
  const a = checkCommand(db, command, deps);
  if (command.event !== "submit" && command.event !== "client_update") return undefined;
  try {
    const reply = validateReply(await deps.core.score(coreInput(db, a, command.payload ?? {})));
    // Contract has no transition for a newly discovered stop on client_update.
    if (command.event === "client_update" && (record(reply.core_result.core).stops_fired as unknown[]).length)
      throw new ApplicationError(409, "Новый стоп-фактор требует решения по контракту");
    return reply;
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(503, "Ядро недоступно, повторите позже");
  }
}

function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const result = fn(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
function persistTransition(db: DatabaseSync, command: Command, deps: Dependencies, reply?: CoreReply) {
  const a = checkCommand(db, command, deps), at = deps.clock().toISOString();
  let actorRole = command.actorRole, actorId = command.actorId, reason = command.reason ?? null;
  const stops = reply ? record(reply.core_result.core).stops_fired as string[] : [];
  if (command.event === "submit") {
    if (stops.length) { actorRole = "system"; actorId = null; reason = stops[0]; }
    else if (actorRole === "system") throw new ApplicationError(409, "Нет стоп-фактора ядра");
  }
  const next = transition(a.status, command.event, actorRole);
  if (reply) {
    const latest = dossierOf(db, a.id);
    db.prepare(`INSERT INTO dossiers(application_id,version,core_result,checks,holes,created_at,readiness_n,readiness_m)
      VALUES(?,?,?,?,?,?,?,?)`).run(a.id, (latest?.version ?? 0) + 1, JSON.stringify(reply.core_result),
        JSON.stringify(reply.checks), JSON.stringify(reply.holes), at, reply.N, reply.M);
  }
  const seq = (db.prepare("SELECT COALESCE(MAX(seq),0)+1 AS seq FROM application_events WHERE application_id=?")
    .get(a.id) as { seq: number }).seq;
  db.prepare(`INSERT INTO application_events(application_id,seq,event,from_status,to_status,actor_role,actor_id,reason,payload,at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(a.id, seq, command.event, a.status, next, actorRole,
      actorRole === "system" ? null : actorId, reason, JSON.stringify(command.payload ?? {}), at);
  const result = db.prepare(`UPDATE applications SET status=?,version=version+1,updated_at=?,consent_at=?,queued_at=?
    WHERE id=? AND version=?`).run(next, at, command.event === "submit" ? at : a.consent_at,
      next === "queued" ? a.queued_at ?? at : a.queued_at, a.id, command.expectedVersion);
  if (result.changes !== 1) throw new ApplicationError(409, "Версия заявки изменилась");
  return { application: applicationOf(db, a.id) };
}

// Exactly one transition. No DB transaction remains open across an asynchronous core call.
// Re-read and compare version under BEGIN IMMEDIATE after the call to detect races.
export async function transitionApplication(db: DatabaseSync, command: Command, deps: Dependencies) {
  const reply = await scoreCommand(db, command, deps);
  return transaction(db, () => persistTransition(db, command, deps, reply));
}

export function createApplication(db: DatabaseSync, userId: string,
  input: { selectionId: string; selectionVersion: number; parent_id?: string }, deps: Dependencies) {
  return transaction(db, () => {
    const user = db.prepare("SELECT role FROM users WHERE id=?").get(userId) as { role: Role } | undefined;
    if (user?.role !== "client") throw new ApplicationError(403, "Заявку создаёт клиент");
    const selection = selectionOf(userState(db, userId), input.selectionId, input.selectionVersion);
    if (input.parent_id) {
      const parent = visibleApplication(db, input.parent_id, "client", userId);
      if (parent.status !== "rejected") throw new ApplicationError(409, "Исходная заявка должна быть отклонена");
    }
    const amount = selection.input?.amount ?? selection.calculation.amount;
    const term = selection.input?.term ?? selection.calculation.term;
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isInteger(term) || term < 1 || term > 120)
      throw new ApplicationError(422, "Неверная сумма или срок заявки");
    const id = randomUUID(), at = deps.clock().toISOString(), status = transition(null, "create", "client");
    db.prepare(`INSERT INTO applications(id,user_id,selection_id,selection_version,status,amount,term_months,purpose,
      version,consent_at,queued_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,NULL,NULL,?,?)`)
      .run(id, userId, input.selectionId, input.selectionVersion, status, amount, term, selection.purpose, at, at);
    db.prepare(`INSERT INTO application_events(application_id,seq,event,from_status,to_status,actor_role,actor_id,reason,payload,at)
      VALUES(?,1,'create',NULL,?,'client',?,NULL,?,?)`).run(id, status, userId,
        JSON.stringify(input.parent_id ? { parent_id: input.parent_id } : {}), at);
    return { application: applicationOf(db, id) };
  });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function applicationRequestHash(path: string, body: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical({ path, body }))).digest("hex");
}
function replay(db: DatabaseSync, userId: string, key: string, hash: string): { application: Application } | undefined {
  const cached = db.prepare("SELECT request_hash,response FROM application_idempotency WHERE key=? AND user_id=?")
    .get(key, userId) as { request_hash: string; response: string } | undefined;
  if (!cached) return;
  if (cached.request_hash !== hash) throw new ApplicationError(422, "Idempotency-Key уже использован для другого запроса");
  return JSON.parse(cached.response);
}

// HTTP orchestration: the whole cascade and idempotency response commit together.
// Each step still appends its own event and advances the version once.
export async function executeApplicationEvent(db: DatabaseSync, command: Command, key: string,
  hash: string, deps: Dependencies) {
  if (command.actorRole === "system" || !command.actorId) throw new ApplicationError(403, "Системная роль недоступна через HTTP");
  visibleApplication(db, command.applicationId, command.actorRole, command.actorId);
  const cached = replay(db, command.actorId, key, hash);
  if (cached) return cached;
  const reply = await scoreCommand(db, command, deps);
  return transaction(db, () => {
    const duplicate = replay(db, command.actorId!, key, hash);
    if (duplicate) return duplicate;
    let result = persistTransition(db, command, deps, reply);
    const system = (event: Event, payload: Record<string, unknown>) => {
      result = persistTransition(db, { applicationId: command.applicationId, event,
        expectedVersion: result.application.version, actorRole: "system", actorId: null, payload }, deps);
    };
    if (command.event === "send_to_underwriting") {
      // Mock policy: approve the requested principal, never more than requested.
      const amount = result.application.amount;
      system("underwriter_approve", { amount });
      const rate = applicationConfig().OFFER_RATE, term_months = result.application.term_months;
      system("make_offer", { amount, rate, term_months, schedule: annuitySchedule(amount, rate, term_months) });
    }
    if (command.event === "sign") system("disburse", { message: "Деньги на счёте", demo: true });
    db.prepare("INSERT INTO application_idempotency(key,user_id,request_hash,response) VALUES(?,?,?,?)")
      .run(key, command.actorId!, hash, JSON.stringify(result));
    return result;
  });
}

export function bankQueue(db: DatabaseSync, deps: Dependencies) {
  const now = deps.clock().getTime(), K = applicationConfig().PRIORITY_AGING_K;
  return (db.prepare("SELECT * FROM applications WHERE status IN ('queued','info_requested')").all() as Application[])
    .map(application => {
      const dossier = dossierOf(db, application.id);
      if (!dossier || !application.queued_at) throw new ApplicationError(503, "Не хватает данных досье");
      const core = JSON.parse(dossier.core_result);
      const N = dossier.readiness_n ?? core.N, M = dossier.readiness_m ?? core.M;
      if (!Number.isFinite(N) || !Number.isFinite(M) || M <= 0 || N < 0 || N > M)
        throw new ApplicationError(503, "Ядро не вернуло N/M");
      const ready = N / M, holes = (JSON.parse(dossier.holes) as unknown[]).length;
      const hours = Math.max(0, (now - Date.parse(application.queued_at)) / 3_600_000);
      const terms = { amount: application.amount, ready, holes, hours, K };
      return { application, priority: application.amount * ready / (1 + holes) + K * hours, terms };
    }).sort((a, b) => b.priority - a.priority
      || a.application.queued_at!.localeCompare(b.application.queued_at!)
      || a.application.id.localeCompare(b.application.id));
}
