import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import type { AppState } from "../shared/types";
import * as applications from "../server/applications";

let app: Express, db: DatabaseSync, cookie: string, managerCookie: string, state: AppState;
let raw: Record<string, unknown>, now: number;
const inputs: Record<string, unknown>[] = [];
const deps = { core: { async score(input: unknown) {
  inputs.push(structuredClone(input as Record<string, unknown>));
  return { core_result: structuredClone(raw) };
} }, clock: () => new Date(now) };

before(async () => {
  process.env.DATABASE_PATH = ":memory:";
  ({ app } = await import("../server/app"));
  const store = await import("../server/store");
  db = store.db;
  state = store.initialState({ name: "Demo", form: "ООО", ageBand: "3-5 лет", inn: "9900000001",
    stage: "operating", sector: "Производство", registered: true, result: "Прибыль", debt: "Нет", intent: "Подбор" });
  state.selections = [{ id: "selection", version: 1, createdAt: "2026-10-22", purpose: "Развитие",
    repayFrom: "Выручка", ownFunds: 0, product: "кредит", risks: [], alternatives: [], status: "ready",
    calculation: { amount: 123457, term: 3, rate: 0.24, monthlyPayment: 0, interest: 0, total: 0,
      flow: null, existing: null, maxAmount: null, dscr: null, stressDscr: null, schedule: [], source: "demo", formula: "demo" } }];
  state.documents = [{ id: "statement", category: "statement", name: "statement.csv", period: "12 месяцев",
    confirmed: true, fields: {}, createdAt: "2026-10-22", currency: "RUB", mime: "text/csv",
    records: [{ date: "2026-01-02", amount: 1234.56, counterparty: 'ООО "А,Б"', purpose: "Оплата\nдоговора" },
      { date: "2026-01-03", amount: -55.07, counterparty: "Банк", purpose: "Комиссия" }] }];
  for (const [id, role] of [["owner-v1", "client"], ["manager-v1", "manager"]])
    db.prepare("INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,?)")
      .run(id, id, "unused", JSON.stringify(state), role);
  cookie = "alfa_session=" + store.session("owner-v1");
  managerCookie = "alfa_session=" + store.session("manager-v1");
});
beforeEach(() => {
  now = Date.parse("2026-10-22T12:00:00Z"); inputs.length = 0;
  raw = { decision_id: "real-shaped", created_at: "2026-10-22T12:00:00Z", core_id: "liza",
    model_version: "v1", core: { status: "можно сейчас", stops_fired: [], missing: [],
      limit_now_rub: 200000, limit_after_rub: 300000 }, view: {} };
  db.prepare("UPDATE users SET state=? WHERE id='owner-v1'").run(JSON.stringify(state));
  applications.configureApplications(deps);
});
after(() => db.close());
function core() { return raw.core as Record<string, unknown>; }
function create() { return applications.createApplication(db, "owner-v1", { selectionId: "selection", selectionVersion: 1 }, deps).application.id; }
function snapshot(id: string) { return { application: applications.applicationOf(db, id),
  events: applications.eventsOf(db, id), dossier: applications.dossierOf(db, id),
  idempotency: db.prepare("SELECT * FROM application_idempotency").all() }; }
function post(id: string, event: applications.Event, payload: Record<string, unknown> = {}, key: string | null = crypto.randomUUID()) {
  const manager = ["request_info", "reject", "send_to_underwriting"].includes(event);
  const req = request(app).post(`/api/applications/${id}/events`).set("Cookie", manager ? managerCookie : cookie);
  if (key !== null) req.set("Idempotency-Key", key);
  return req.send({ event, expectedVersion: applications.applicationOf(db, id).version, reason: "demo", payload });
}
async function submit() { const id = create(); await post(id, "submit", { consent: true }).expect(200); return id; }

test("real /score shape without N/M: HTTP adapter, local checklist and S1 to disbursed", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(raw), { status: 200 }));
  applications.configureApplications({ ...deps, core: applications.httpCoreClient });
  const id = await submit(), d = applications.dossierOf(db, id)!;
  assert.equal(d.readiness_n, 5); assert.equal(d.readiness_m, 5);
  assert.equal((d as unknown as { checklist_version: string }).checklist_version, "mvp2-demo-v1");
  assert.deepEqual(JSON.parse(d.holes), []);
  assert.deepEqual(JSON.parse(d.core_result), raw);
  const checks = JSON.parse(d.checks);
  assert.deepEqual(Object.values(checks).map((c: any) => c.status), ["ok", "ok", "ok"]);
  await post(id, "send_to_underwriting", { memo: "Verified" }).expect(200);
  await post(id, "sign", { code: "0000" }).expect(200);
  assert.equal(applications.applicationOf(db, id).status, "disbursed");
});
test("SHORT_STATEMENT queues for request_info; ENFORCEMENT and mixed stops reject", async () => {
  for (const stops of [["SHORT_STATEMENT"], ["ENFORCEMENT"], ["SHORT_STATEMENT", "ENFORCEMENT"]]) {
    core().stops_fired = stops;
    const id = await submit();
    assert.equal(applications.applicationOf(db, id).status, stops.length === 1 && stops[0] === "SHORT_STATEMENT" ? "queued" : "rejected");
    if (stops[0] === "SHORT_STATEMENT") assert.ok(JSON.parse(applications.dossierOf(db, id)!.holes).includes("statement"));
    if (stops.includes("ENFORCEMENT")) assert.equal(applications.eventsOf(db, id).at(-1)!.reason, "ENFORCEMENT");
    else await post(id, "request_info").expect(200);
  }
});
test("underwriting over limit or incomplete dossier: 409 with no writes", async () => {
  core().limit_now_rub = 123456;
  let id = await submit(), before = snapshot(id);
  await post(id, "send_to_underwriting", { memo: "Verified" }).expect(409);
  assert.deepEqual(snapshot(id), before);
  core().limit_now_rub = 200000; core().missing = ["contract_main_customer"];
  id = await submit(); before = snapshot(id);
  await post(id, "send_to_underwriting", { memo: "Verified" }).expect(409);
  assert.deepEqual(snapshot(id), before);
});
test("checklist: bad/unavailable/unknown checks and missing profile/statement remain holes", async () => {
  for (const inn of ["9900000011", "9900000022", "7712345678", ""]) {
    const s = structuredClone(state); s.profile.inn = inn; s.profile.ageBand = ""; s.documents[0].confirmed = false;
    db.prepare("UPDATE users SET state=? WHERE id='owner-v1'").run(JSON.stringify(s));
    const id = await submit(), d = applications.dossierOf(db, id)!;
    assert.equal(d.readiness_n, 2); assert.equal(d.readiness_m, 5);
    assert.deepEqual(JSON.parse(d.holes), ["business", "statement", "checks"]);
  }
});
test("reject alternative is returned to client and parent_id creates a new draft", async () => {
  const id = await submit(), alternative = { amount: 100000, term_months: 3 };
  await post(id, "reject", { alternative }).expect(200);
  const detail = await request(app).get(`/api/applications/${id}`).set("Cookie", cookie).expect(200);
  assert.deepEqual(detail.body.alternative, alternative);
  assert.deepEqual(JSON.parse(applications.eventsOf(db, id).at(-1)!.payload as string).alternative, alternative);
  const created = await request(app).post("/api/applications").set("Cookie", cookie)
    .send({ selectionId: "selection", selectionVersion: 1, parent_id: id }).expect(201);
  assert.equal(created.body.application.status, "draft"); assert.notEqual(created.body.application.id, id);
  assert.equal(JSON.parse(applications.eventsOf(db, created.body.application.id)[0].payload as string).parent_id, id);
});
test("new hard stop on client_update persists new dossier and system rejection atomically", async () => {
  const id = await submit(); await post(id, "request_info").expect(200);
  core().stops_fired = ["ENFORCEMENT"];
  await post(id, "client_update", { confirmed_fields: { reconciliation_act: true } }).expect(200);
  assert.equal(applications.applicationOf(db, id).status, "rejected");
  assert.equal(applications.dossierOf(db, id)!.version, 2);
  assert.deepEqual(JSON.parse(applications.dossierOf(db, id)!.core_result), raw);
  const last = applications.eventsOf(db, id).at(-1)!;
  assert.equal(last.actor_role, "system"); assert.equal(last.reason, "ENFORCEMENT");
  const rejected = await request(app).get("/api/bank/rejected").set("Cookie", managerCookie).expect(200);
  assert.ok(rejected.body.some((a: any) => a.id === id));
});
test("PII keys are stripped recursively from application_events payload", async () => {
  const id = create();
  await post(id, "submit", { consent: true, phone: "secret-phone", inn: "secret-inn",
    passport: "secret-passport", email: "secret-email", nested: [{ phone: "nested-secret", keep: "yes" }] }).expect(200);
  const payload = JSON.parse(applications.eventsOf(db, id).at(-1)!.payload as string);
  assert.deepEqual(payload, { consent: true, nested: [{ keep: "yes" }] });
});
test("mutant: exact kopeck schedule for nonround principal", async () => {
  const id = await submit(); await post(id, "send_to_underwriting", { memo: "Verified" }).expect(200);
  const event = applications.eventsOf(db, id).find(e => e.event === "make_offer")!;
  assert.deepEqual(JSON.parse(event.payload as string).schedule, [
    { principal: 40340.15, interest: 2469.14, payment: 42809.29 },
    { principal: 41146.95, interest: 1662.34, payment: 42809.29 },
    { principal: 41969.90, interest: 839.40, payment: 42809.30 },
  ]);
});
test("mutant: absent Idempotency-Key rejects with no writes or core call", async () => {
  const id = create(), before = snapshot(id);
  const response = await post(id, "submit", { consent: true }, null);
  assert.ok([400, 422].includes(response.status));
  assert.deepEqual(snapshot(id), before); assert.equal(inputs.length, 0);
});
test("mutant: PRIORITY_AGING_K configuration affects literal manual priority", async () => {
  const previous = process.env.PRIORITY_AGING_K;
  try {
    process.env.PRIORITY_AGING_K = "1234";
    const id = await submit(); now += 2.5 * 3600000;
    const row = applications.bankQueue(db, deps).find(r => r.application.id === id)!;
    assert.equal(row.terms.K, 1234); assert.equal(row.priority, 126542);
  } finally { if (previous === undefined) delete process.env.PRIORITY_AGING_K; else process.env.PRIORITY_AGING_K = previous; }
});
test("mutant: core receives exact confirmed statement CSV with escaping", async () => {
  await submit();
  assert.equal(inputs[0].statement_csv, 'date,amount,counterparty,purpose\n"2026-01-02","1234.56","ООО ""А,Б""","Оплата\nдоговора"\n"2026-01-03","-55.07","Банк","Комиссия"');
});
test("mutant: two info cycles accumulate confirmed fields and close conditional holes", async () => {
  core().missing = ["contract_main_customer", "reconciliation_act", "unrecognized-core-hint"];
  const id = await submit();
  assert.equal(applications.dossierOf(db, id)!.readiness_m, 7);
  const contract = { sum_rub: 1440000, months: 12 };
  await post(id, "request_info").expect(200);
  await post(id, "client_update", { confirmed_fields: { contract_main_customer: contract } }).expect(200);
  assert.deepEqual(JSON.parse(applications.dossierOf(db, id)!.holes), ["reconciliation_act"]);
  await post(id, "request_info").expect(200);
  await post(id, "client_update", { confirmed_fields: { reconciliation_act: { verified: true } } }).expect(200);
  assert.deepEqual(inputs.at(-1)!.confirmed_fields, { contract_main_customer: contract, reconciliation_act: { verified: true } });
  const d = applications.dossierOf(db, id)!;
  assert.equal(d.readiness_n, 7); assert.equal(d.readiness_m, 7); assert.deepEqual(JSON.parse(d.holes), []);
  assert.deepEqual(JSON.parse(d.core_result), raw);
});
