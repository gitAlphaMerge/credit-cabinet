/**
 * P1 adversarial acceptance suite. Oracle copied by hand from context/p1-contract.md.
 * No transition table, priority formula, or expected result comes from production.
 *
 * Required test seam in server/applications.ts (chosen under task A's authority):
 *   configureApplications({ core, clock }): void
 *     installs the SAME dependencies used by the real app.ts HTTP routes.
 *   transitionApplication(db, command, { core, clock }): Promise<{ application }>
 *     performs exactly ONE persisted transition, including guards and version CAS;
 *     rejects with { status: HTTP_code }. System is an internal actor, never a login.
 *     HTTP routes orchestrate the synchronous underwriting/offer/disburse cascades.
 *   CoreClient.score(input): Promise<CoreReply>; clock(): Date (see types below).
 * Explicit db injection permits a genuinely fresh SQLite connection after restart.
 * The SQL connection must be used for both the status update and event insertion.
 *
 * Integration conventions, NOT additional claims about the frozen contract:
 * - CoreClient is an adapter: { core_result, N, M, holes, checks }. core_result is
 *   the untouched /score JSON. v1 computes N/M and holes with the Express checklist.
 * - consent and client_update.confirmed_fields live inside the HTTP payload.
 * - offer payload: { amount, rate, term_months, schedule }, where each schedule
 *   row has { principal, interest, payment }; rate is an annual decimal fraction.
 * - underwriter_approve payload.amount is the approved principal.
 *
 * Contract gaps to resolve with the architect (file itself is NOT modified):
 * 1. v1 resolves absent N/M: checklist metadata belongs to the persisted dossier.
 * 2. Offer/update payload field names and rate units are unspecified. Conventions
 *    above are proposed interoperability names, not a mandated amortization model.
 * 3. draft already has a create event. "No events" on failed submit means no NEW
 *    events; removing create would contradict journal replay and invariant 1.
 * 4. Aging cannot reverse two applications already queued: both gain K*t equally.
 *    Aging test compares an old small application to a NEW large arrival after
 *    46 hours. Equal queue-entry times can never change their relative priority.
 * 5. v1 resolves a newly discovered stop on client_update; M=0, automatic expiry scheduling,
 *    and recovery of a partly completed automatic cascade are unspecified.
 *    This suite does not invent those policies. Expiry is exercised internally.
 * 6. Invalid pair + invalid role precedence is unspecified: either 409 or 403;
 *    valid pair + wrong role is strictly 403. Foreign client ownership is 404.
 *
 * Coverage: 396 single-transition cases (11*12*3: 18 allowed, 378 denied),
 * 300 chains of 1..15 events with seed/step diagnostics; invariants 1, 2, 3 and
 * independent journal replay checked after EVERY attempted step and matrix cell.
 * Separate HTTP guards, cascade, queue, persistence, CAS, idempotency, core and
 * abort-trigger tests below. A missing module must fail the integration setup.
 */
import test, { after, before, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { blankFundingRequest } from "../shared/financing";
import { statementDate } from "./statement-fixture";

const STATUSES = ["draft", "queued", "info_requested", "underwriting", "approved",
  "offered", "signed", "disbursed", "rejected", "expired", "withdrawn"] as const;
const EVENTS = ["create", "submit", "request_info", "client_update", "reject",
  "send_to_underwriting", "underwriter_approve", "make_offer", "sign", "disburse",
  "expire", "withdraw"] as const;
const ROLES = ["client", "manager", "system"] as const;
type Status = typeof STATUSES[number];
type Event = typeof EVENTS[number];
type Role = typeof ROLES[number];
type Transition = readonly [Status | null, Event, Role, Status];
const TABLE: readonly Transition[] = [
  [null, "create", "client", "draft"],
  ["draft", "submit", "client", "underwriting"],
  ["draft", "submit", "system", "rejected"],
  ["queued", "request_info", "manager", "info_requested"],
  ["info_requested", "client_update", "client", "underwriting"],
  ["info_requested", "client_update", "system", "rejected"],
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
const TERMINAL = new Set<Status>(["rejected", "disbursed", "expired", "withdrawn"]);
const HOUR = 3_600_000;
const BASE_TIME = Date.parse("2026-10-21T12:00:00.000Z");
const OLD_TIME = new Date(BASE_TIME - 9 * 24 * HOUR).toISOString();
const BASE_SEED = 0x51a7c0de;

type Application = {
  id: string; user_id: string; selection_id: string; selection_version: number;
  status: Status; version: number; amount: number; term_months: number;
  consent_at: string | null; queued_at: string | null;
};
type JournalEvent = {
  id: number; application_id: string; seq: number; event: Event;
  from_status: Status | null; to_status: Status; actor_role: Role;
  actor_id: string | null; reason: string | null; payload: string; at: string;
};
type Dossier = { application_id: string; version: number; core_result: string;
  holes: string; checks: string; created_at: string };
type CoreReply = { core_result: Record<string, unknown>; N: number; M: number;
  holes: string[]; checks: unknown[] };
type CoreClient = { score(input: unknown): Promise<CoreReply> };
type Dependencies = { core: CoreClient; clock: () => Date };
type Command = { applicationId: string; event: Event; expectedVersion: number;
  actorRole: Role; actorId: string | null; reason?: string;
  payload?: Record<string, unknown> };
type ApplicationsModule = {
  configureApplications(deps: Dependencies): void;
  transitionApplication(db: DatabaseSync, command: Command, deps: Dependencies):
    Promise<{ application: Application }>;
};
type Agent = ReturnType<typeof request.agent>;
type SelectionRef = { id: string; version: number };
type QueueRow = { application: Application; priority: number;
  terms: { amount: number; ready: number; holes: number; hours: number; K: number } };

function expected(from: Status | null, event: Event, role: Role) {
  return TABLE.find(([f, e, r]) => f === from && e === event && r === role)?.[3];
}
function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function coreReply(N = 5, M = 5, holes: string[] = []) : CoreReply {
  return {
    N, M, holes, checks: [{ code: "synthetic-check", result: "unknown" }],
    core_result: {
      decision_id: "core-fixture-opaque", created_at: OLD_TIME,
      core_id: "fixture", model_version: "adversarial-1",
      N, M,
      core: { status: "можно после шага", instrument: "овердрафт", stops_fired: [],
        reasons: ["CASH_GAP"], missing: holes, flow_month_rub: 120003,
        limit_now_rub: 1015007, limit_after_rub: 1523011,
        evidence: { months: 12, operations: 1249, opaque: "do not normalize" } },
      view: { status: "ready_after_step", numbers: { available_now: 1015007,
        available_after: 1523011, limit_delta: 508004, monthly_payment: 141839,
        dscr: 0.851234567, dscr_required: 1.25, rate_used: 0.24, term_months: 12 } },
    },
  };
}
function offerPayload(amount = 900_000) {
  const principal = amount / 12;
  return { amount, rate: 0.24, term_months: 12,
    schedule: Array.from({ length: 12 }, (_, i) => {
      const interest = (amount - i * principal) * 0.02;
      return { principal, interest, payment: principal + interest };
    }) };
}
function validPayload(event: Event): Record<string, unknown> {
  switch (event) {
    case "submit": return { consent: true };
    case "client_update": return { confirmed_fields: {
      contract_main_customer: { sum_rub: 1440000, months: 12 } } };
    case "send_to_underwriting": return { memo: "Verified synthetic dossier" };
    case "underwriter_approve": return { amount: 900_000 };
    case "make_offer": return offerPayload();
    case "sign": return { code: "0000" };
    default: return {};
  }
}

// This test executes even before the missing implementation exists.
test("test oracle: 11 statuses, 12 events, 396 cells, 18 allowed, four terminal states", () => {
  assert.equal(new Set(STATUSES).size, 11);
  assert.equal(new Set(EVENTS).size, 12);
  assert.equal(STATUSES.length * EVENTS.length * ROLES.length, 396);
  assert.equal(TABLE.filter(([from]) => from !== null).length, 18);
  assert.equal(new Set(TABLE.map(([f, e, r]) => `${f}/${e}/${r}`)).size, TABLE.length);
  for (const status of TERMINAL) assert.equal(TABLE.some(([from]) => from === status), false);
  assert.equal(expected(null, "create", "client"), "draft");
});

describe("P1 application contract against the real app and SQLite", { concurrency: false }, () => {
  let app: Express, db: DatabaseSync, module: ApplicationsModule;
  let owner: Agent, stranger: Agent, manager: Agent;
  let ownerId: string, managerId: string, selection: SelectionRef;
  let now = BASE_TIME, reply = coreReply(), coreError: Error | undefined;
  const coreInputs: unknown[] = [];
  const deps: Dependencies = {
    core: { async score(input) {
      coreInputs.push(structuredClone(input));
      if (coreError) throw coreError;
      return structuredClone(reply);
    } },
    clock: () => new Date(now),
  };
  const envNames = ["DATABASE_PATH", "OPENAI_API_KEY", "TEAM_AGENT_URL", "TEAM_API_URL",
    "COOKIE_SECURE", "PRIORITY_AGING_K", "OFFER_TTL_DAYS"] as const;
  const previousEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));
  let dbOpen = false;
  before(async () => {
    process.env.DATABASE_PATH = join(await mkdtemp(join(tmpdir(), "alfa-p1-contract-")), "test.sqlite");
    delete process.env.OPENAI_API_KEY;
    delete process.env.TEAM_AGENT_URL;
    delete process.env.TEAM_API_URL;
    process.env.COOKIE_SECURE = "false";
    process.env.PRIORITY_AGING_K = "20000";
    process.env.OFFER_TTL_DAYS = "7";
    // URL import is deliberate: no fake declarations or ts-ignore for an absent module.
    module = await import(new URL("../server/applications.ts", import.meta.url).href);
    assert.equal(typeof module.configureApplications, "function", "missing dependency injection seam");
    assert.equal(typeof module.transitionApplication, "function", "missing single-transition seam");
    module.configureApplications(deps);
    ({ app } = await import("../server/app"));
    ({ db } = await import("../server/store"));
    dbOpen = true;
    owner = request.agent(app); stranger = request.agent(app); manager = request.agent(app);
    const profile = { name: "Синтетическое ООО", form: "ООО", registered: true, inn: "9900000001",
      stage: "operating", sector: "Производство", ageBand: "3-5 лет",
      result: "Прибыль", debt: "Есть", intent: "Подбор" };
    for (const [agent, phone] of [[owner, "79001118901"], [stranger, "79001118902"],
      [manager, "79001118903"]] as const) {
      await agent.post("/api/auth/register").send({ phone,
        password: "P1-test-pass-918", profile }).expect(200);
    }
    ownerId = (db.prepare("SELECT id FROM users WHERE phone=?").get("79001118901") as { id: string }).id;
    // v1 underwriting requires a confirmed statement and three passing local checks.
    const ownerState = JSON.parse((db.prepare("SELECT state FROM users WHERE id=?").get(ownerId) as { state: string }).state);
    ownerState.profile.inn = "9900000001";
    ownerState.documents.push({ id: "p1-statement", category: "statement", name: "demo.csv", period: "12 месяцев",
      fields: {}, confirmed: true, createdAt: OLD_TIME, currency: "RUB", mime: "text/csv",
      records: [{ date: statementDate(now), amount: 1000 }] });
    db.prepare("UPDATE users SET state=? WHERE id=?").run(JSON.stringify(ownerState), ownerId);
    managerId = (db.prepare("SELECT id FROM users WHERE phone=?").get("79001118903") as { id: string }).id;
    // Test fixture only; production must not expose a public role-upgrade endpoint.
    db.prepare("UPDATE users SET role='manager' WHERE id=?").run(managerId);
    selection = await select(owner);
  });
  beforeEach(() => {
    now = BASE_TIME; reply = coreReply(); coreError = undefined; coreInputs.length = 0;
  });
  after(() => {
    if (dbOpen) db.close();
    for (const key of envNames) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  async function select(agent = owner, amount = 1_000_000): Promise<SelectionRef> {
    const response = await agent.post("/api/selections").send({ engine: "mvp-2",
      input: { ...blankFundingRequest(), amount, term: 12,
        financials: { incoming: 800000, expenses: 400000, existing: 10000 } } }).expect(200);
    return { id: response.body.id, version: response.body.version };
  }
  async function create(amount = 1_000_000) {
    const ref = await select(owner, amount);
    const response = await owner.post("/api/applications")
      .send({ selectionId: ref.id, selectionVersion: ref.version }).expect(201);
    const application = response.body.application as Application;
    assert.ok(application.id); assert.equal(application.status, "draft");
    assert.equal(application.amount, amount);
    const events = journal(application.id);
    assert.equal(events.length, 1); assert.equal(events[0].event, "create");
    invariants(application.id, "HTTP create");
    return application;
  }
  function row(id: string, connection = db): Application {
    const result = connection.prepare("SELECT * FROM applications WHERE id=?").get(id);
    assert.ok(result, `missing application ${id}`);
    return result as unknown as Application;
  }
  function journal(id: string, connection = db): JournalEvent[] {
    return connection.prepare("SELECT * FROM application_events WHERE application_id=? ORDER BY seq")
      .all(id) as unknown as JournalEvent[];
  }
  function dossiers(id: string, connection = db): Dossier[] {
    return connection.prepare("SELECT * FROM dossiers WHERE application_id=? ORDER BY version")
      .all(id) as unknown as Dossier[];
  }
  function snapshot(id: string, connection = db) {
    return { application: row(id, connection), events: journal(id, connection),
      dossiers: dossiers(id, connection) };
  }
  function replay(events: JournalEvent[], label: string): Status {
    assert.ok(events.length, `${label}: empty journal`);
    let status: Status | null = null;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      assert.ok(status === null || !TERMINAL.has(status), `${label}: event after terminal at ${i}`);
      assert.equal(event.seq, i + 1, `${label}: seq hole`);
      assert.equal(event.from_status, status, `${label}: broken from/to chain`);
      const target: Status | undefined = TABLE.find(([f,e,r,to]) => f === status && e === event.event && r === event.actor_role && to === event.to_status)?.[3]
        ?? (["submit", "client_update"].includes(event.event) && event.actor_role === "system"
          && ((status === "draft" && event.event === "submit") || (status === "info_requested" && event.event === "client_update"))
          && ["underwriting", "info_requested"].includes(event.to_status) ? event.to_status : undefined)
        ?? (status === "info_requested" && (event.event as string) === "escalate_disagreed" && event.actor_role === "system" ? "queued" : undefined);
      assert.ok(target, `${label}: forbidden replay ${status}/${event.event}/${event.actor_role}`);
      assert.equal(event.to_status, target, `${label}: oracle disagrees with journal`);
      status = target;
    }
    assert.ok(status); return status;
  }
  function invariants(id: string, label: string, connection = db) {
    const events = journal(id, connection), application = row(id, connection);
    assert.equal(application.status, events.at(-1)?.to_status, `${label}: cache != last to_status`);
    assert.equal(application.status, replay(events, label), `${label}: cache != replay`);
  }
  function command(id: string, event: Event, actorRole: Role): Command {
    refreshStatement(event);
    return { applicationId: id, event, expectedVersion: row(id).version, actorRole,
      actorId: actorRole === "client" ? ownerId : actorRole === "manager" ? managerId : null,
      reason: event === "submit" && actorRole === "system" ? "STOP_FIXTURE" : "Synthetic reason",
      payload: validPayload(event) };
  }
  function post(agent: Agent, id: string, event: Event, options: {
    expectedVersion?: number; key?: string; reason?: string;
    payload?: Record<string, unknown> } = {}) {
    refreshStatement(event);
    return agent.post(`/api/applications/${id}/events`)
      .set("Idempotency-Key", options.key ?? randomUUID())
      .send({ event, expectedVersion: options.expectedVersion ?? row(id).version,
        reason: options.reason ?? "Synthetic reason", payload: options.payload ?? validPayload(event) });
  }
  // Random chains advance the clock by eight days per step. Refresh only the
  // positive statement fixture before operations that rerun compliance.
  function refreshStatement(event: Event) {
    if (event !== "submit" && event !== "client_update" && event !== "send_to_underwriting") return;
    const state = JSON.parse((db.prepare("SELECT state FROM users WHERE id=?").get(ownerId) as { state: string }).state);
    state.documents.find((d: { id: string }) => d.id === "p1-statement").records =
      [{ date: statementDate(now), amount: 1000 }];
    db.prepare("UPDATE users SET state=? WHERE id=?").run(JSON.stringify(state), ownerId);
  }
  function stopReply() {
    reply = coreReply();
    (reply.core_result.core as Record<string, unknown>).stops_fired = ["STOP_FIXTURE"];
  }
  // Seed legal histories to reach transient statuses without disabling HTTP cascades.
  // Each tested operation still goes through production transition/HTTP code.
  function seed(status: Status, options: { id?: string; amount?: number; queuedAt?: string;
    core?: CoreReply } = {}): string {
    const id = options.id ?? randomUUID();
    const paths: Record<Status, [Event, Role][]> = {
      draft: [], queued: [["submit", "system"], ["escalate_disagreed" as Event, "system"]],
      info_requested: [["submit", "system"]],
      underwriting: [["submit", "system"]],
      approved: [["submit", "system"], ["underwriter_approve", "system"]],
      offered: [["submit", "system"], ["underwriter_approve", "system"], ["make_offer", "system"]],
      signed: [["submit", "system"], ["underwriter_approve", "system"], ["make_offer", "system"], ["sign", "client"]],
      disbursed: [["submit", "system"], ["underwriter_approve", "system"], ["make_offer", "system"], ["sign", "client"], ["disburse", "system"]],
      rejected: [["submit", "system"]],
      expired: [["submit", "system"], ["underwriter_approve", "system"], ["make_offer", "system"], ["expire", "system"]],
      withdrawn: [["withdraw", "client"]],
    };
    const path: [Event, Role][] = [["create", "client"], ...paths[status]];
    const queuedAt = status === "queued" ? options.queuedAt ?? OLD_TIME : null;
    const consentAt = status !== "draft" && status !== "withdrawn" ? OLD_TIME : null;
    db.prepare(`INSERT INTO applications
      (id,user_id,selection_id,selection_version,status,amount,term_months,purpose,
       version,consent_at,queued_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, ownerId, selection.id, selection.version, status, options.amount ?? 1_000_000,
        12, "Оборудование", path.length, consentAt, queuedAt, OLD_TIME, OLD_TIME);
    let from: Status | null = null;
    for (let index = 0; index < path.length; index++) {
      const [event, role] = path[index];
      const to: Status = event === "submit" ? (status === "rejected" ? "rejected" : status === "queued" || status === "info_requested" ? "info_requested" : "underwriting")
        : (event as string) === "escalate_disagreed" ? "queued" : expected(from, event, role)!;
      db.prepare(`INSERT INTO application_events
        (application_id,seq,event,from_status,to_status,actor_role,actor_id,reason,payload,at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, index + 1, event, from, to, role,
          role === "system" ? null : role === "manager" ? managerId : ownerId,
          event === "submit" && role === "system" ? "STOP_FIXTURE" : "Fixture reason",
          JSON.stringify(validPayload(event)), OLD_TIME);
      from = to;
    }
    if (consentAt) {
      const value = options.core ?? coreReply();
      db.prepare(`INSERT INTO dossiers(application_id,version,core_result,checks,holes,created_at,readiness_n,readiness_m,checklist_version)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(id, 1, JSON.stringify(value.core_result),
          JSON.stringify({ _v2: { compliance: { gate: "pass", checks: [], documents: [], reasons: [], holes: [], enrichment: {} }, alternatives: [] } }), JSON.stringify(value.holes), OLD_TIME, value.N, value.M, "mvp2-demo-v1");
    }
    invariants(id, `seed ${status}`);
    return id;
  }
  async function assertSingle(id: string, event: Event, role: Role, label: string) {
    const before = snapshot(id), target = expected(before.application.status, event, role);
    if ((event === "submit" || event === "client_update") && role === "system") stopReply();
    else reply = coreReply();
    let result: { application: Application } | undefined, failure: unknown;
    try { result = await module.transitionApplication(db, command(id, event, role), deps); }
    catch (error) { failure = error; }
    const offer = before.events.findLast(e => e.event === "make_offer");
    if (target && ["sign", "disburse"].includes(event) && offer &&
      now - Date.parse(offer.at) > Number(process.env.OFFER_TTL_DAYS ?? 7) * 24 * HOUR) {
      assert.equal((failure as { status?: number })?.status, 409, `${label}: expired offer must fail`);
      assert.deepEqual(dossiers(id), before.dossiers, `${label}: expiration cannot rescore`);
      if (event === "sign") {
        assert.equal(row(id).status, "expired", label);
        assert.equal(row(id).version, before.application.version + 1, label);
        assert.equal(journal(id).length, before.events.length + 1, label);
        assert.equal(journal(id).at(-1)?.event, "expire", label);
        assert.equal(journal(id).at(-1)?.actor_role, "system", label);
      } else assert.deepEqual(snapshot(id), before, `${label}: expired disbursement cannot mutate`);
      invariants(id, label);
      return;
    }
    if (target) {
      assert.equal(failure, undefined, `${label}: allowed transition threw ${String(failure)}`);
      const automatic = (event === "submit" || event === "client_update") && role === "client";
      const finalTarget = automatic ? "offered" : target;
      const steps = automatic ? 3 : 1;
      assert.equal(result?.application.status, finalTarget, `${label}: wrong return status`);
      assert.equal(row(id).status, finalTarget, `${label}: wrong stored status`);
      assert.equal(row(id).version, before.application.version + steps, `${label}: version must advance once`);
      assert.equal(journal(id).length, before.events.length + steps, `${label}: exactly one new event`);
      const first = journal(id)[before.events.length];
      assert.equal(first.event, event, label); assert.equal(first.actor_role, automatic ? "system" : role, label);
      assert.equal(first.from_status, before.application.status, label);
      assert.equal(first.to_status, target, label);
    } else {
      assert.ok(failure, `${label}: forbidden transition succeeded`);
      const status = (failure as { status?: number }).status;
      const pairExists = TABLE.some(([from, e]) => from === before.application.status && e === event);
      assert.ok(pairExists ? status === 403 : status === 403 || status === 409,
        `${label}: expected ${pairExists ? "403" : "403/409"}, got ${status}`);
      assert.deepEqual(snapshot(id), before, `${label}: rejected operation mutated state/journal/dossier`);
    }
    invariants(id, label);
  }

  describe("complete status x event x role table", () => {
    for (const status of STATUSES) for (const event of EVENTS) for (const role of ROLES) {
      test(`${status} / ${event} / ${role}`, async () => {
        await assertSingle(seed(status), event, role, `${status}/${event}/${role}`);
      });
    }
  });

  describe("300 deterministic random chains, invariants 1-3 after every step", () => {
    for (let chain = 0; chain < 300; chain++) {
      const seedValue = (BASE_SEED + chain) >>> 0;
      test(`seed=${seedValue}`, async () => {
        const random = mulberry32(seedValue), id = seed("draft");
        const length = 1 + Math.floor(random() * 15), trace: string[] = [];
        for (let step = 0; step < length; step++) {
          const status = row(id).status, candidates = TABLE.filter(([from]) => from === status);
          let event: Event, role: Role;
          if (candidates.length && random() < 0.7) {
            const choice = candidates[Math.floor(random() * candidates.length)];
            event = choice[1]; role = choice[2];
          } else {
            event = EVENTS[Math.floor(random() * EVENTS.length)];
            role = ROLES[Math.floor(random() * ROLES.length)];
          }
          now += 8 * 24 * HOUR; // valid expire is always older than the seven-day TTL
          trace.push(`${status}/${event}/${role}`);
          await assertSingle(id, event, role,
            `seed=${seedValue} step=${step + 1}/${length} trace=${trace.join(" -> ")}`);
        }
      });
    }
  });

  test("HTTP happy path: fresh dossier, synchronous offered/disbursed, journal replay, schedule sums", async () => {
    const created = await create(), id = created.id;
    const beforeSubmit = snapshot(id);
    const offered = await post(owner, id, "submit").expect(200);
    assert.equal(offered.body.application.status, "offered");
    assert.equal(row(id).consent_at, new Date(now).toISOString());
    assert.equal(row(id).queued_at, null);
    assert.equal(row(id).version, beforeSubmit.application.version + 3);
    assert.deepEqual(journal(id).slice(1).map(e => [e.event, e.actor_role]),
      [["submit", "system"], ["underwriter_approve", "system"], ["make_offer", "system"]]);
    const offer = JSON.parse(journal(id).find(e => e.event === "make_offer")!.payload);
    assert.ok(Number.isFinite(offer.amount) && offer.amount > 0 && offer.amount <= created.amount);
    const approval = JSON.parse(journal(id).find(e => e.event === "underwriter_approve")!.payload);
    assert.equal(approval.amount, offer.amount);
    assert.ok(Number.isFinite(offer.rate) && offer.rate > 0);
    assert.ok(Number.isInteger(offer.term_months) && offer.term_months > 0);
    assert.ok(Array.isArray(offer.schedule)); assert.equal(offer.schedule.length, offer.term_months);
    let principal = 0, interest = 0, payment = 0;
    for (const installment of offer.schedule) {
      for (const key of ["principal", "interest", "payment"]) assert.ok(Number.isFinite(installment[key]));
      assert.ok(installment.principal >= 0 && installment.interest >= 0 && installment.payment > 0);
      assert.ok(Math.abs(installment.payment - installment.principal - installment.interest) <= 0.011);
      principal += installment.principal; interest += installment.interest; payment += installment.payment;
    }
    assert.ok(interest > 0, "a positive-rate offer cannot have zero total interest");
    assert.ok(Math.abs(principal - offer.amount) <= 0.01 * offer.term_months);
    assert.ok(Math.abs(payment - offer.amount - interest) <= 0.02 * offer.term_months);
    const beforeSign = snapshot(id);
    const signed = await post(owner, id, "sign", { payload: { code: "0000" } }).expect(200);
    assert.equal(signed.body.application.status, "disbursed");
    assert.equal(row(id).version, beforeSign.application.version + 2);
    assert.deepEqual(journal(id).slice(beforeSign.events.length).map(e => [e.event, e.actor_role]),
      [["sign", "client"], ["disburse", "system"]]);
    invariants(id, "happy path final");
    const detail = (await owner.get(`/api/applications/${id}`).expect(200)).body;
    assert.equal(detail.application.status, row(id).status);
    assert.deepEqual(detail.events.map((e: JournalEvent) => [e.seq, e.event, e.to_status]),
      journal(id).map(e => [e.seq, e.event, e.to_status]));
    assert.ok(detail.dossier);
  });

  test("race: two HTTP operations with one expectedVersion, exactly one 200 and one 409", async () => {
    const id = seed("queued");
    const before = snapshot(id), version = before.application.version;
    const results = await Promise.all([
      post(manager, id, "request_info", { expectedVersion: version, reason: "Need evidence" }),
      post(manager, id, "reject", { expectedVersion: version, reason: "Risk decision" }),
    ]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(row(id).version, version + 1);
    assert.equal(journal(id).length, before.events.length + 1);
    const winner = results.find(r => r.status === 200)!;
    assert.equal(row(id).status, winner.body.application.status);
    invariants(id, "CAS race");
  });

  test("idempotency: identical response with stale original version; conflicting body is 422", async () => {
    const id = (await create()).id, before = snapshot(id), key = randomUUID();
    const options = { expectedVersion: before.application.version, key };
    const first = await post(owner, id, "submit", options).expect(200);
    const afterFirst = snapshot(id), calls = coreInputs.length;
    const second = await post(owner, id, "submit", options).expect(200);
    assert.deepEqual(second.body, first.body);
    assert.deepEqual(snapshot(id), afterFirst);
    assert.equal(coreInputs.length, calls, "retry must not rescore");
    assert.equal(afterFirst.events.length, before.events.length + 3);
    await post(owner, id, "submit", { ...options, payload: { consent: false } }).expect(422);
    assert.deepEqual(snapshot(id), afterFirst);
    invariants(id, "idempotent submit");
  });

  test("atomicity: SQLite abort during event insert rolls back application and dossier; same request can retry", async () => {
    const id = (await create()).id, before = snapshot(id), key = randomUUID();
    // UUID comes from our app; bind it into a trigger only after validating SQL-safe text.
    assert.match(id, /^[a-zA-Z0-9_-]+$/);
    db.exec(`CREATE TEMP TRIGGER p1_abort_event BEFORE INSERT ON application_events
      WHEN NEW.application_id = '${id}' AND NEW.event = 'submit'
      BEGIN SELECT RAISE(ABORT, 'P1_INJECTED_EVENT_WRITE_FAILURE'); END`);
    try {
      await post(owner, id, "submit", { key, expectedVersion: before.application.version }).expect(500);
      assert.deepEqual(snapshot(id), before, "aborted event left a half-written transition");
    } finally {
      db.exec("DROP TRIGGER p1_abort_event");
    }
    await post(owner, id, "submit", { key, expectedVersion: before.application.version }).expect(200);
    assert.equal(row(id).status, "offered");
    assert.equal(row(id).version, before.application.version + 3);
    assert.equal(journal(id).length, before.events.length + 3);
    invariants(id, "atomic retry");
  });

  test("core stop: system rejection with exact reason code bypasses queue", async () => {
    const id = (await create()).id, before = snapshot(id);
    stopReply();
    const result = await post(owner, id, "submit").expect(200);
    assert.equal(result.body.application.status, "rejected");
    assert.equal(row(id).queued_at, null);
    const added = journal(id).slice(before.events.length);
    assert.equal(added.length, 1);
    assert.equal(added[0].event, "submit"); assert.equal(added[0].actor_role, "system");
    assert.equal(added[0].reason, "STOP_FIXTURE"); assert.equal(added[0].to_status, "rejected");
    const queue = (await manager.get("/api/bank/queue").expect(200)).body as QueueRow[];
    assert.ok(!queue.some(r => r.application.id === id));
    const rejected = (await manager.get("/api/bank/rejected").expect(200)).body;
    assert.ok(Array.isArray(rejected));
    assert.ok(rejected.some((r: Application | { application: Application }) =>
      ("application" in r ? r.application.id : r.id) === id));
    invariants(id, "stop bypass");
  });

  test("core unavailable: 503, draft/create journal unchanged, retry is possible", async () => {
    const id = (await create()).id, before = snapshot(id), key = randomUUID();
    coreError = new Error("SYNTHETIC_CORE_UNAVAILABLE");
    await post(owner, id, "submit", { key }).expect(503);
    assert.deepEqual(snapshot(id), before);
    assert.equal(row(id).status, "draft");
    assert.equal(journal(id).length, 1, "create remains; failed submit contributes zero events");
    coreError = undefined;
    await post(owner, id, "submit", { key }).expect(200);
    assert.equal(row(id).status, "offered");
    invariants(id, "core outage retry");
  });

  test("core evidence is preserved byte-for-byte; checklist ignores raw N/M and unknown missing hints", async () => {
    const id = (await create()).id;
    reply = coreReply(7, 11, ["one", "two", "three"]);
    const raw = JSON.stringify(reply.core_result);
    await post(owner, id, "submit").expect(200);
    assert.equal(coreInputs.length, 1);
    const dossier = dossiers(id).at(-1)!;
    assert.equal(dossier.core_result, raw);
    const checks = JSON.parse(dossier.checks);
    for (const key of ["bki", "aml", "fns"]) assert.equal(checks[key].status, "ok");
    const { checkCreditHistory } = await import("../server/checks");
    const { runComplianceGate } = await import("../server/compliance");
    const compliance = await runComplianceGate({ inn: "9900000001", now: new Date(now),
      documents: [{ category: "statement", confirmed: true, documentDate: statementDate(now) }] });
    assert.deepEqual(checks.bki, await checkCreditHistory("9900000001"));
    assert.deepEqual(checks._v2.compliance, compliance);
    for (const check of compliance.checks) assert.deepEqual(checks[check.key], check);
    assert.deepEqual(JSON.parse(dossier.holes), []);
    assert.equal(row(id).status, "offered");
    const queue = (await manager.get("/api/bank/queue").expect(200)).body as QueueRow[];
    assert.ok(!queue.some(r => r.application.id === id));
  });

  test("queue: six hand-calculated priorities, all terms, both tie-breakers, status filter", async () => {
    // All numbers below are literal expected results, not production formula imports.
    const cases = [
      { id: "queue-high", amount: 1_000_000, N: 1, M: 1, holes: [], hours: 0, priority: 1_000_000 },
      { id: "queue-old", amount: 100_000, N: 1, M: 1, holes: [], hours: 20, priority: 500_000 },
      { id: "queue-tie-z", amount: 920_000, N: 1, M: 1, holes: ["a"], hours: 2, priority: 500_000 },
      { id: "queue-tie-a", amount: 920_000, N: 1, M: 1, holes: ["a"], hours: 2, priority: 500_000 },
      { id: "queue-fraction", amount: 900_000, N: 2, M: 3, holes: ["a", "b"], hours: 3, priority: 260_000 },
      { id: "queue-zero", amount: 5_000_000, N: 0, M: 5, holes: [], hours: 1, priority: 20_000 },
    ];
    for (const [i, c] of cases.entries()) seed("queued", {
      id: c.id, amount: c.amount, queuedAt: new Date(now - c.hours * HOUR).toISOString(),
      core: coreReply(c.N, c.M, c.holes),
    });
    const excluded = STATUSES.filter(s => s !== "queued").map(s => seed(s));
    const all = (await manager.get("/api/bank/queue").expect(200)).body as QueueRow[];
    assert.ok(Array.isArray(all));
    assert.ok(all.every(r => r.application.status === "queued"));
    assert.ok(all.every(r => !excluded.includes(r.application.id)));
    const actual = all.filter(r => cases.some(c => c.id === r.application.id));
    assert.deepEqual(actual.map(r => r.application.id),
      ["queue-high", "queue-old", "queue-tie-a", "queue-tie-z", "queue-fraction", "queue-zero"]);
    for (const c of cases) {
      const item = actual.find(r => r.application.id === c.id)!;
      assert.equal(item.priority, c.priority, c.id);
      assert.equal(item.terms.amount, Math.min(c.amount, 1015007), c.id);
      assert.equal(item.terms.ready, c.N / c.M, c.id);
      assert.equal(item.terms.holes, c.holes.length, c.id);
      assert.equal(item.terms.hours, c.hours, c.id);
      assert.equal(item.terms.K, 20_000, c.id);
    }
  });

  test("aging: old small request outranks a new large arrival after 46h; equal-age ordering cannot flip", async () => {
    // 100000 + 20000*N > 1000000 iff N > 45. At 46h old-small = 1,020,000.
    const small = seed("queued", { amount: 100_000, queuedAt: new Date(now).toISOString(), core: coreReply(1, 1, []) });
    const large = seed("queued", { amount: 1_000_000, queuedAt: new Date(now).toISOString(), core: coreReply(1, 1, []) });
    const get = async () => (await manager.get("/api/bank/queue").expect(200)).body as QueueRow[];
    let items = await get();
    assert.equal(items.find(r => r.application.id === small)!.priority, 100_000);
    assert.equal(items.find(r => r.application.id === large)!.priority, 1_000_000);
    now += 46 * HOUR;
    const fresh = seed("queued", { amount: 1_000_000, queuedAt: new Date(now).toISOString(), core: coreReply(1, 1, []) });
    items = await get();
    assert.equal(items.find(r => r.application.id === small)!.priority, 1_020_000);
    assert.equal(items.find(r => r.application.id === large)!.priority, 1_920_000);
    assert.equal(items.find(r => r.application.id === fresh)!.priority, 1_000_000);
    assert.ok(items.findIndex(r => r.application.id === small) < items.findIndex(r => r.application.id === fresh));
    assert.ok(items.findIndex(r => r.application.id === large) < items.findIndex(r => r.application.id === small));
  });

  test("access: foreign application hidden; role guards, no session, no system-role forgery", async () => {
    const id = (await create()).id, before = snapshot(id);
    await stranger.get(`/api/applications/${id}`).expect(404);
    await post(stranger, id, "withdraw").expect(404);
    const strangerList = (await stranger.get("/api/applications").expect(200)).body;
    assert.ok(Array.isArray(strangerList));
    assert.ok(!strangerList.some((r: Application) => r.id === id));
    await stranger.post("/api/applications").send({ selectionId: row(id).selection_id,
      selectionVersion: row(id).selection_version }).expect(404);
    await manager.get(`/api/applications/${id}`).expect(200);
    await owner.get("/api/bank/queue").expect(403);
    await owner.get("/api/bank/rejected").expect(403);
    for (const path of ["/api/applications", `/api/applications/${id}`, "/api/bank/queue", "/api/bank/rejected"]) {
      await request(app).get(path).expect(401);
    }
    await request(app).post("/api/applications").send({ selectionId: selection.id, selectionVersion: 1 }).expect(401);
    await request(app).post(`/api/applications/${id}/events`).set("Idempotency-Key", randomUUID())
      .send({ event: "withdraw", expectedVersion: row(id).version }).expect(401);
    assert.deepEqual(snapshot(id), before);
    const queued = seed("queued"), queuedBefore = snapshot(queued);
    for (const event of ["request_info", "reject", "send_to_underwriting"] as const) {
      await post(owner, queued, event).expect(403);
      assert.deepEqual(snapshot(queued), queuedBefore);
    }
    const offered = seed("offered"), offeredBefore = snapshot(offered);
    await post(manager, offered, "sign").expect(403);
    assert.deepEqual(snapshot(offered), offeredBefore);
    const uw = seed("underwriting"), uwBefore = snapshot(uw);
    for (const agent of [owner, manager]) {
      await post(agent, uw, "underwriter_approve", { payload: { amount: 900000, actorRole: "system" } }).expect(403);
      assert.deepEqual(snapshot(uw), uwBefore);
    }
    const ownList = (await owner.get("/api/applications").expect(200)).body as Application[];
    assert.ok(ownList.some(r => r.id === id));
  });

  test("HTTP guards: consent, reason, memo, SMS and expectedVersion cannot be omitted or forged", async () => {
    const cases: { status: Status; event: Event; agent: Agent; payload: Record<string, unknown>; reason?: string }[] = [
      { status: "draft", event: "submit", agent: owner, payload: {} },
      { status: "draft", event: "submit", agent: owner, payload: { consent: false } },
      { status: "queued", event: "request_info", agent: manager, payload: {}, reason: "" },
      { status: "queued", event: "reject", agent: manager, payload: {}, reason: "" },
      { status: "queued", event: "send_to_underwriting", agent: manager, payload: {} },
      { status: "offered", event: "sign", agent: owner, payload: { code: "9999" } },
    ];
    for (const c of cases) {
      const id = seed(c.status), before = snapshot(id);
      const result = await post(c.agent, id, c.event, { payload: c.payload, reason: c.reason });
      assert.ok([400, 403, 409, 422].includes(result.status), `guard ${c.event}: ${result.status}`);
      assert.deepEqual(snapshot(id), before, `invalid guard ${c.event}`);
    }
    const id = seed("draft"), before = snapshot(id);
    const missing = await owner.post(`/api/applications/${id}/events`).set("Idempotency-Key", randomUUID())
      .send({ event: "withdraw" });
    assert.ok([400, 422].includes(missing.status)); assert.deepEqual(snapshot(id), before);
    await post(owner, id, "withdraw", { expectedVersion: before.application.version + 1 }).expect(409);
    assert.deepEqual(snapshot(id), before);
  });

  test("expiry boundary and underwriting amount guard leave journal/version unchanged", async () => {
    const id = seed("offered");
    now = Date.parse(OLD_TIME) + 7 * 24 * HOUR;
    const before = snapshot(id);
    await assert.rejects(module.transitionApplication(db, command(id, "expire", "system"), deps),
      (error: unknown) => (error as { status: number }).status === 409);
    assert.deepEqual(snapshot(id), before, "exactly seven days is not longer than TTL");
    now += 1;
    await module.transitionApplication(db, command(id, "expire", "system"), deps);
    assert.equal(row(id).status, "expired"); invariants(id, "expiry");
    const uw = seed("underwriting"), uwBefore = snapshot(uw);
    await assert.rejects(module.transitionApplication(db, { ...command(uw, "underwriter_approve", "system"),
      payload: { amount: row(uw).amount + 1 } }, deps), (error: unknown) =>
      [409, 422].includes((error as { status: number }).status));
    assert.deepEqual(snapshot(uw), uwBefore);
  });

  // LAST: close the original connection, bypass ESM cache, and exercise fresh service.
  test("restart: new store/module imports on same DATABASE_PATH retain application, journal and dossier", async () => {
    const id = (await create()).id;
    await post(owner, id, "submit").expect(200);
    const before = snapshot(id), withdraw = command(id, "withdraw", "client");
    db.close(); dbOpen = false;
    const query = `?restart=${randomUUID()}`;
    const freshStore = await import(new URL(`../server/store.ts${query}`, import.meta.url).href) as { db: DatabaseSync };
    try {
      const fresh = await import(new URL(`../server/applications.ts${query}`, import.meta.url).href) as ApplicationsModule;
      assert.notEqual(freshStore.db, db);
      assert.deepEqual(snapshot(id, freshStore.db), before);
      invariants(id, "after reopen", freshStore.db);
      await fresh.transitionApplication(freshStore.db, withdraw, deps);
      assert.equal(row(id, freshStore.db).status, "withdrawn");
      assert.equal(row(id, freshStore.db).version, before.application.version + 1);
      assert.equal(journal(id, freshStore.db).length, before.events.length + 1);
      invariants(id, "fresh module can write", freshStore.db);
    } finally { freshStore.db.close(); }
  });
});
