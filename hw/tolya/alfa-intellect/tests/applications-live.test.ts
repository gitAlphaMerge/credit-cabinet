/** S1/S4 integration, not browser e2e. Only sources/checks, signing and underwriting
 * are local mocks. GOLD financial inputs and /score are real. No fake fallback.
 * Run from repo root: bash scripts/live-core.sh
 */
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import type { Express } from "express";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppState, Selection } from "../shared/types";
import type { Application } from "../server/applications";
import { calculate } from "../server/finance";

const AT = "2026-10-22T12:00:00.000Z";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const coreRoot = resolve(process.env.CREDIT_CABINET_DIR || join(repo, "../credit-cabinet"));
const envKeys = ["TEAM_API_URL", "DATABASE_PATH", "COOKIE_SECURE", "OPENAI_API_KEY",
  "TEAM_AGENT_URL", "OFFER_RATE", "PRIORITY_AGING_K"] as const;
const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
process.env.TEAM_API_URL = "http://127.0.0.1:5000";

let unavailable: string | undefined;
let health: { core_id?: string } | undefined;
try {
  const response = await fetch(`${process.env.TEAM_API_URL}/health`, {
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) unavailable = `Live core unavailable: GET /health returned ${response.status}; run bash scripts/live-core.sh`;
  else health = await response.json() as typeof health;
} catch (error) {
  unavailable = `Live core unavailable at 127.0.0.1:5000: ${error instanceof Error ? error.message : String(error)}; run bash scripts/live-core.sh`;
}

type Band = { min: number; max: number };
type Golden = {
  id: string; file: string;
  questionnaire: { form: string; years: string; sector: string; trend: string; need: string };
  need: { purpose: string; amount_rub: number; term_months: number; repay_from: string; asked_for: string };
  expected: { status: string; instrument: string | string[]; stops_fired: string[]; missing: string[];
    flow_month_rub: Band; limit_rub: { now: Band; after_actions: Band } };
};
type Journal = { seq: number; event: string; from_status: string | null; to_status: string;
  actor_role: string; reason: string | null; payload: string };
type Card = { application: Application; events: Journal[]; dossier: null | {
  core_result: string; checks: string; holes: string; readiness_n: number; readiness_m: number } };
type Agent = ReturnType<typeof request.agent>;

describe("live Liza core: S1 and S4", { skip: unavailable, concurrency: false }, () => {
  let app: Express, db: DatabaseSync, databasePath: string;
  let gold: Golden[], manager: Agent;
  before(async () => {
    // A reachable stub or wrong core is a failure, never a skip.
    assert.equal(health?.core_id, "liza", "CORE_ID must be liza");
    gold = (JSON.parse(await readFile(join(coreRoot, "data/golden.json"), "utf8")) as { scenarios: Golden[] }).scenarios;
    assert.ok(Array.isArray(gold), "golden.json must contain scenarios");
    databasePath = join(await mkdtemp(join(tmpdir(), "alfa-live-")), "applications.sqlite");
    process.env.DATABASE_PATH = databasePath;
    process.env.COOKIE_SECURE = "false";
    process.env.OFFER_RATE = "0.24";
    process.env.PRIORITY_AGING_K = "20000";
    delete process.env.OPENAI_API_KEY;
    delete process.env.TEAM_AGENT_URL;
    const applications = await import("../server/applications");
    // Fix only the clock. The exact production HTTP adapter remains installed.
    applications.configureApplications({ core: applications.httpCoreClient, clock: () => new Date(AT) });
    assert.equal(applications.applicationsDependencies().core, applications.httpCoreClient);
    ({ app } = await import("../server/app"));
    ({ db } = await import("../server/store"));
    manager = await register("79001118700", gold.find(g => g.id === "seasonal_ok")!);
    db.prepare("UPDATE users SET role='manager' WHERE phone=?").run("79001118700");
  });
  after(() => { db?.close(); });

  async function register(phone: string, g: Golden) {
    assert.ok(g, "missing golden scenario");
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ phone, password: "Live-test-pass-918",
      profile: { name: `Synthetic ${g.id}`, form: g.questionnaire.form, registered: true,
        stage: "operating", sector: g.questionnaire.sector, ageBand: g.questionnaire.years,
        result: g.questionnaire.trend, debt: "Нет", intent: "Подбор" } }).expect(200);
    return agent;
  }

  async function fixture(id: string, phone: string) {
    const g = gold.find(item => item.id === id);
    assert.ok(g, `missing GOLD ${id}`);
    const owner = await register(phone, g);
    // Parse CSV as CSV, including quoted commas. Never expose label to /score.
    const book = new ExcelJS.Workbook();
    const sheet = await book.csv.read(Readable.from([await readFile(join(coreRoot, g.file))]), {
      map: (value: string) => value,
    });
    const headers = (sheet.getRow(1).values as string[]).slice(1);
    const label = headers.indexOf("label");
    assert.ok(label >= 0, "GOLD source must have label to remove");
    sheet.spliceColumns(label + 1, 1);
    const cleanHeaders = (sheet.getRow(1).values as string[]).slice(1);
    const records: Record<string, string | number>[] = [];
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const values = (row.values as string[]).slice(1);
      records.push(Object.fromEntries(cleanHeaders.map((key, i) =>
        [key, key === "amount" ? Number(values[i]) : values[i] ?? ""])));
    });
    assert.ok(records.length > 30);
    assert.ok(records.every(r => !("label" in r) && Number.isFinite(r.amount)));

    // Integration seed: profile/documents/selection, before create. Keep GOLD strings
    // verbatim: the UI catalogue cannot represent all historical GOLD purposes.
    // No application, dossier or transition is seeded directly.
    const user = db.prepare("SELECT id,state FROM users WHERE phone=?").get(phone) as { id: string; state: string };
    const state = JSON.parse(user.state) as AppState;
    state.profile.inn = "9900000001"; // existing all-pass local checks fixture
    // The upload UI requires its own kind column, absent in GOLD. Seeding the
    // extracted records avoids inventing classification or changing the CSV.
    state.documents.push({ id: randomUUID(), category: "statement", name: `${id}.csv`,
      period: "12 месяцев", fields: {}, records, confirmed: true, createdAt: AT,
      currency: "RUB", mime: "text/csv" });
    const selection: Selection = { id: randomUUID(), version: 1, createdAt: AT,
      purpose: g.need.purpose, repayFrom: g.need.repay_from, product: g.need.asked_for,
      ownFunds: 0, calculation: calculate({ amount: g.need.amount_rub,
        term: g.need.term_months, rate: 24, flow: null }, new Date(AT)),
      risks: [], alternatives: [], status: "integration seed" };
    state.selections.push(selection);
    db.prepare("UPDATE users SET state=? WHERE id=?").run(JSON.stringify(state), user.id);
    const created = await owner.post("/api/applications").send({ selectionId: selection.id,
      selectionVersion: selection.version }).expect(201);
    const application = created.body.application as Application;
    const card = await read(owner, application.id);
    assert.equal(card.application.status, "draft");
    assert.equal(card.application.amount, g.need.amount_rub);
    assert.equal(card.application.term_months, g.need.term_months);
    assert.deepEqual(card.events.map(e => e.event), ["create"]);
    return { owner, g, card };
  }

  async function read(agent: Agent, id: string): Promise<Card> {
    const { body } = await agent.get(`/api/applications/${id}`).expect(200);
    const card = body as Card;
    let status: string | null = null;
    for (const [i, event] of card.events.entries()) {
      assert.equal(event.seq, i + 1, "journal sequence must be continuous");
      assert.equal(event.from_status, status, "journal status chain must be continuous");
      status = event.to_status;
    }
    assert.equal(card.application.status, status);
    assert.equal(card.application.version, card.events.length);
    return card;
  }
  function post(agent: Agent, card: Card, event: string, payload = {}, key = randomUUID()) {
    return agent.post(`/api/applications/${card.application.id}/events`).set("Idempotency-Key", key)
      .send({ event, expectedVersion: card.application.version, payload });
  }
  function coreOf(card: Card, g: Golden) {
    assert.ok(card.dossier, "submit must persist a real dossier");
    const result = JSON.parse(card.dossier.core_result);
    assert.equal(result.core_id, "liza");
    assert.ok(result.decision_id);
    const core = result.core;
    assert.equal(core.status, g.expected.status);
    const instruments = Array.isArray(g.expected.instrument) ? g.expected.instrument : [g.expected.instrument];
    assert.ok(instruments.includes(core.instrument), `Unexpected instrument ${core.instrument}`);
    assert.deepEqual(core.stops_fired, g.expected.stops_fired);
    assert.deepEqual(core.missing, g.expected.missing);
    const inBand = (value: number, band: Band) => {
      assert.ok(Number.isFinite(value) && value >= band.min && value <= band.max,
        `${value} outside GOLD [${band.min}, ${band.max}]`);
    };
    inBand(core.flow_month_rub, g.expected.flow_month_rub);
    inBand(core.limit_now_rub, g.expected.limit_rub.now);
    inBand(core.limit_after_rub, g.expected.limit_rub.after_actions);
    const checks = JSON.parse(card.dossier.checks);
    for (const key of ["bki", "aml", "fns"]) {
      assert.equal(checks[key].status, "ok");
      assert.equal(checks[key].source, "синтетические данные (мок)");
    }
    return core;
  }

  test("S1 seasonal_ok: consent guard, automatic offered 400000/6, disbursed", async () => {
    const { owner, g, card: draft } = await fixture("seasonal_ok", "79001118701");
    const stranger = await register("79001118703", g);
    await stranger.get(`/api/applications/${draft.application.id}`).expect(404);
    await owner.get("/api/bank/queue").expect(403);
    await request(app).get(`/api/applications/${draft.application.id}`).expect(401);
    await post(owner, draft, "submit").expect(422);
    assert.deepEqual(await read(owner, draft.application.id), draft, "no mutation without consent");
    // Exercise outage through the real adapter, never replace it with a fake.
    const url = process.env.TEAM_API_URL;
    try {
      process.env.TEAM_API_URL = "http://127.0.0.1:1";
      await post(owner, draft, "submit", { consent: true }).expect(503);
    } finally { process.env.TEAM_API_URL = url; }
    assert.deepEqual(await read(owner, draft.application.id), draft, "core outage must not mutate draft");
    await post(owner, draft, "submit", { consent: true }).expect(200);
    const offered = await read(owner, draft.application.id);
    assert.equal(offered.application.status, "offered");
    assert.equal(offered.application.queued_at, null);
    coreOf(offered, g);
    assert.ok(offered.dossier!.readiness_m > 0);
    assert.equal(offered.dossier!.readiness_n, offered.dossier!.readiness_m);
    assert.deepEqual(JSON.parse(offered.dossier!.holes), []);
    const queue = await manager.get("/api/bank/queue").expect(200);
    assert.ok(!queue.body.some((r: { application: Application }) => r.application.id === draft.application.id));
    assert.deepEqual(await read(manager, draft.application.id), offered);
    await post(manager, draft, "send_to_underwriting", { memo: "Stale version" }).expect(409);
    assert.deepEqual(await read(owner, draft.application.id), offered);
    assert.deepEqual(offered.events.map(e => e.event),
      ["create", "submit", "underwriter_approve", "make_offer"]);
    assert.deepEqual(offered.events.slice(1).map(e => e.actor_role), ["system", "system", "system"]);
    const offer = JSON.parse(offered.events.at(-1)!.payload);
    assert.equal(offer.amount, 400000);
    assert.equal(offer.term_months, 6);
    assert.equal(offer.rate, 0.24);
    assert.equal(offer.schedule.length, 6);
    assert.ok(Math.abs(offer.schedule.reduce((sum: number, p: { principal: number }) => sum + p.principal, 0) - 400000) < 0.02);
    await post(owner, offered, "sign", { code: "bad" }).expect(422);
    assert.deepEqual(await read(owner, draft.application.id), offered);
    await post(owner, offered, "sign", { code: "0000" }).expect(200);
    const disbursed = await read(owner, draft.application.id);
    assert.equal(disbursed.application.status, "disbursed");
    assert.deepEqual(disbursed.events.map(e => e.event),
      ["create", "submit", "underwriter_approve", "make_offer", "sign", "disburse"]);
    assert.deepEqual(disbursed.events.map(e => e.actor_role),
      ["client", "system", "system", "system", "client", "system"]);
    // Fresh connection verifies committed persistence, not a full process restart.
    const reopened = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.deepEqual({ ...reopened.prepare("SELECT * FROM applications WHERE id=?").get(draft.application.id) }, disbursed.application);
      const events = reopened.prepare("SELECT * FROM application_events WHERE application_id=? ORDER BY seq").all(draft.application.id);
      assert.deepEqual(events.map(e => ({ ...e })), disbursed.events);
    } finally { reopened.close(); }
    // Start Express in a genuinely new process against the same SQLite file.
    // The parent stays open only so the independent S4 fixture can run next.
    const childSource = `
      import { once } from "node:events";
      const { app } = await import(${JSON.stringify(new URL("../server/app.ts", import.meta.url).href)});
      const { db } = await import(${JSON.stringify(new URL("../server/store.ts", import.meta.url).href)});
      const server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      try {
        const base = "http://127.0.0.1:" + server.address().port;
        const login = await fetch(base + "/api/auth/login", { method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({phone:"79001118701",password:"Live-test-pass-918"}) });
        if (login.status !== 200) throw new Error("Restart login: " + login.status);
        const cookie = login.headers.get("set-cookie");
        await login.body?.cancel();
        if (!cookie) throw new Error("Restart login missing cookie");
        const card = await fetch(base + ${JSON.stringify(`/api/applications/${draft.application.id}`)},
          {headers:{Cookie:cookie.split(";")[0]}});
        if (card.status !== 200) throw new Error("Restart card: " + card.status);
        console.log("LIVE_RESTART=" + JSON.stringify(await card.json()));
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); }
    `;
    const { stdout } = await promisify(execFile)(process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", childSource],
      { cwd: resolve(repo, "hw/tolya/alfa-intellect"), env: process.env, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    const persisted = stdout.split(/\r?\n/).find(line => line.startsWith("LIVE_RESTART="));
    assert.ok(persisted, "fresh Express process must return persisted card");
    assert.deepEqual(JSON.parse(persisted.slice("LIVE_RESTART=".length)), disbursed,
      "application, dossier, journal and offer schedule survive process restart");
  });

  test("S4 enforcement: rejected, ENFORCEMENT, absent from queue, sign 409", async () => {
    const { owner, g, card: draft } = await fixture("enforcement", "79001118702");
    const key = randomUUID();
    const submitted = await post(owner, draft, "submit", { consent: true }, key).expect(200);
    const rejected = await read(owner, draft.application.id);
    assert.equal(rejected.application.status, "rejected");
    assert.equal(rejected.application.queued_at, null);
    coreOf(rejected, g);
    assert.deepEqual(rejected.events.map(e => e.event), ["create", "submit"]);
    assert.equal(rejected.events[1].actor_role, "system");
    assert.equal(rejected.events[1].reason, "ENFORCEMENT");
    const queue = await manager.get("/api/bank/queue").expect(200);
    assert.ok(!queue.body.some((r: { application: Application }) => r.application.id === draft.application.id));
    const list = await manager.get("/api/bank/rejected").expect(200);
    assert.ok(list.body.some((a: Application & {red_reason:string;reason:string}) => a.id === draft.application.id
      && a.red_reason === "UNDERWRITING_REJECTED" && a.reason === "ENFORCEMENT"));
    await post(owner, rejected, "sign", { code: "0000" }).expect(409);
    await post(manager, rejected, "send_to_underwriting", { memo: "Must not reopen" }).expect(409);
    const replay = await post(owner, draft, "submit", { consent: true }, key).expect(200);
    assert.deepEqual(replay.body, submitted.body);
    assert.deepEqual(await read(owner, draft.application.id), rejected, "terminal guards and replay leave journal unchanged");
  });
});

after(() => {
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});
