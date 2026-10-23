import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { publicPreview } from "../../server/preview";
import * as applications from "../../server/applications";

let app: (typeof import("../../server/app"))["app"];
let store: typeof import("../../server/store");
let lifecycle: typeof import("../../server/application-silence");
let now = new Date("2026-10-23T12:00:00Z");
const deps: applications.Dependencies = {
  clock: () => now,
  core: {
    async score() {
      return {
        core_result: {
          core: { stops_fired: [], missing: [], limit_now_rub: 400000 },
        },
      };
    },
  },
  compliance: async () => ({
    gate: "pass",
    checks: [],
    documents: [],
    reasons: [],
    holes: [],
    enrichment: {},
  }),
  bki: async () => ({
    status: "ok",
    source: "синтетические данные (мок)",
    data: {
      openLoans: 0,
      overdue30Plus12m: 0,
      overdue90Plus12m: 0,
      debtBurdenRatio: 0,
    },
  }),
  alternatives: () => [
    {
      option_id: "f1-smaller",
      kind: "smaller_amount",
      product_id: "fixture",
      product_name: "Тестовый продукт",
      amount_rub: 300000,
      term_months: 12,
      rate_annual_pct: 24,
      monthly_payment_rub: 28000,
      reason: "В пределах лимита",
    },
  ],
};
before(async () => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.AI_PROVIDER = "";
  process.env.TEAM_AGENT_URL = "";
  process.env.TEAM_API_URL = "";
  store = await import("../../server/store");
  ({ app } = await import("../../server/app"));
  applications.configureApplications(deps);
});
after(() => store.db.close());
function client(key: string, amount = 500000) {
  const state = publicPreview();
  state.profile.inn = "9900000001";
  state.selections[0].id = "f1-" + key;
  state.selections[0].calculation.amount = amount;
  state.selections[0].calculation.term = 12;
  if (state.selections[0].input) {
    state.selections[0].input.amount = amount;
    state.selections[0].input.term = 12;
  }
  state.documents = [
    {
      id: "statement",
      category: "statement",
      name: "fixture.csv",
      period: "2026",
      confirmed: true,
      fields: {},
      currency: "RUB",
      mime: "text/csv",
      createdAt: now.toISOString(),
      records: [{ date: "2026-10-22", amount: 1000 }],
    },
  ];
  const uid = "f1-client-" + key;
  store.db
    .prepare(
      "INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,'client')",
    )
    .run(uid, uid, "unused", JSON.stringify(state));
  return { uid, state, cookie: "alfa_session=" + store.session(uid) };
}
function submit(c: ReturnType<typeof client>) {
  return request(app)
    .post(`/api/selections/${c.state.selections[0].id}/application`)
    .set("Cookie", c.cookie)
    .send({ expectedVersion: 1, acknowledgeRisks: true, consent: true });
}
test("F1 visible submission enters conveyor with selected terms and retries once", async () => {
  const c = client("submit");
  const response = await submit(c);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const list = await request(app)
    .get("/api/applications")
    .set("Cookie", c.cookie)
    .expect(200);
  assert.equal(list.body.length, 1);
  const a = list.body[0];
  assert.equal(a.status, "info_requested");
  assert.equal(a.amount, 500000);
  assert.equal(a.term_months, 12);
  assert.equal(a.purpose, c.state.selections[0].purpose);
  assert.ok(a.consent_at);
  assert.equal(response.body.applicationId, a.id);
  assert.deepEqual(
    applications.eventsOf(store.db, a.id).map((e) => e.event),
    ["create", "submit"],
  );
  await submit(c).expect(200);
  assert.equal(
    (await request(app).get("/api/applications").set("Cookie", c.cookie)).body
      .length,
    1,
  );
  assert.equal(store.stateOf(c.uid).leads.length, 1);
});
test("F1 explicit disagreement is a system event and rejects forged escalation", async () => {
  const c = client("disagree");
  await submit(c).expect(200);
  const [a] = (
    await request(app).get("/api/applications").set("Cookie", c.cookie)
  ).body;
  assert.ok(a, "submission must persist a machine application");
  for (const event of ["escalate_disagreed", "escalate_silent"]) {
    await request(app)
      .post(`/api/applications/${a.id}/events`)
      .set("Cookie", c.cookie)
      .set("X-Role", "manager")
      .set("Idempotency-Key", event)
      .send({
        event,
        expectedVersion: a.version,
        payload: { client_objections: "Не согласен" },
      })
      .expect(403);
  }
  await request(app)
    .post(`/api/applications/${a.id}/disagreement`)
    .set("Cookie", c.cookie)
    .send({
      expectedVersion: a.version,
      client_objections: "Мне нужна вся сумма, альтернативы не подходят",
    })
    .expect(200);
  const last = applications.eventsOf(store.db, a.id).at(-1)!;
  assert.equal(last.reason, "CLIENT_DISAGREED");
  assert.equal(last.actor_role, "system");
  assert.equal(last.actor_id, null);
  assert.equal(
    applications
      .bankQueue(store.db, deps)
      .filter((q) => q.application.id === a.id).length,
    1,
  );
});
test("F1 silence sweep waits after a delivered nudge, then queues only once", async () => {
  const c = client("silent");
  await submit(c).expect(200);
  const [a] = (
    await request(app).get("/api/applications").set("Cookie", c.cookie)
  ).body;
  assert.ok(a, "submission must persist a machine application");
  lifecycle = await import("../../server/application-silence");
  await lifecycle.sweepSilentApplications(store.db, deps, 1000);
  assert.equal(
    applications.applicationOf(store.db, a.id).status,
    "info_requested",
  );
  assert.ok(
    store
      .stateOf(c.uid)
      .chats.some((chat) =>
        chat.messages.some(
          (m) => m.role === "assistant" && m.text.includes("заявк"),
        ),
      ),
  );
  now = new Date(now.getTime() + 999);
  await lifecycle.sweepSilentApplications(store.db, deps, 1000);
  assert.equal(
    applications.applicationOf(store.db, a.id).status,
    "info_requested",
  );
  now = new Date(now.getTime() + 1);
  await lifecycle.sweepSilentApplications(store.db, deps, 1000);
  assert.equal(applications.applicationOf(store.db, a.id).status, "queued");
  const last = applications.eventsOf(store.db, a.id).at(-1)!;
  assert.equal(last.reason, "CLIENT_SILENT");
  assert.equal(last.actor_role, "system");
  await lifecycle.sweepSilentApplications(store.db, deps, 1000);
  assert.equal(
    applications
      .eventsOf(store.db, a.id)
      .filter((e) => e.event === "escalate_silent").length,
    1,
  );
});
test("F1 offline chat objections preserve application context and enter manager queue", async () => {
  const c = client("chat");
  await submit(c).expect(200);
  const [a] = (
    await request(app).get("/api/applications").set("Cookie", c.cookie)
  ).body;
  assert.ok(a, "submission must persist a machine application");
  const chat = await request(app)
    .post("/api/chats")
    .set("Cookie", c.cookie)
    .send({ selectionId: c.state.selections[0].id })
    .expect(200);
  await request(app)
    .post(`/api/chats/${chat.body.id}/messages`)
    .set("Cookie", c.cookie)
    .send({ text: "Не согласен с альтернативами, нужна вся сумма" })
    .expect(200);
  assert.equal(applications.applicationOf(store.db, a.id).status, "queued");
  assert.equal(
    applications.eventsOf(store.db, a.id).at(-1)!.reason,
    "CLIENT_DISAGREED",
  );
});

test("F1 scoring outage leaves one resumable draft, no success lead, and human error", async () => {
  const c = client("retry");
  let available = false;
  applications.configureApplications({
    ...deps,
    core: {
      async score(input) {
        if (!available) throw new Error("F1 simulated offline");
        return deps.core.score(input);
      },
    },
  });
  try {
    const failed = await submit(c).expect(503);
    assert.match(failed.body.error, /недоступны/);
    assert.equal(store.stateOf(c.uid).leads.length, 0);
    const [draft] = (
      await request(app).get("/api/applications").set("Cookie", c.cookie)
    ).body;
    assert.equal(draft.status, "draft");
    available = true;
    const retried = await submit(c).expect(200);
    assert.equal(retried.body.applicationId, draft.id);
    assert.equal(
      (await request(app).get("/api/applications").set("Cookie", c.cookie)).body
        .length,
      1,
    );
    assert.equal(
      applications
        .eventsOf(store.db, draft.id)
        .filter((e) => e.event === "submit").length,
      1,
    );
  } finally {
    applications.configureApplications(deps);
  }
});

test("F1 red resupply through HTTP resumes an unresolved disagreement and replays once", async () => {
  const c = client("resupply");
  store.saveState(c.uid, { ...c.state, documents: [] });
  await submit(c).expect(200);
  let [a] = (
    await request(app).get("/api/applications").set("Cookie", c.cookie)
  ).body;
  await request(app)
    .post(`/api/applications/${a.id}/disagreement`)
    .set("Cookie", c.cookie)
    .send({
      expectedVersion: a.version,
      client_objections: "Уменьшать сумму не согласен",
    })
    .expect(200);
  a = applications.applicationOf(store.db, a.id);
  const managerId = "f1-manager-resupply";
  store.db
    .prepare(
      "INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,'manager')",
    )
    .run(managerId, managerId, "unused", JSON.stringify(c.state));
  const managerCookie = "alfa_session=" + store.session(managerId);
  await request(app)
    .post(`/api/applications/${a.id}/events`)
    .set("Cookie", managerCookie)
    .set("Idempotency-Key", "f1-request")
    .send({
      event: "request_info",
      expectedVersion: a.version,
      reason: "Дослать выписку",
      payload: { hole: "statement", text: "Дослать выписку" },
    })
    .expect(200);
  a = applications.applicationOf(store.db, a.id);
  const state = store.stateOf(c.uid);
  state.documents = c.state.documents;
  store.saveState(c.uid, state);
  const update = () =>
    request(app)
      .post(`/api/applications/${a.id}/events`)
      .set("Cookie", c.cookie)
      .set("Idempotency-Key", "f1-update")
      .send({
        event: "client_update",
        expectedVersion: a.version,
        payload: { confirmed_fields: { statement: true } },
      });
  const [first, concurrent] = await Promise.all([
    update().expect(200),
    update().expect(200),
  ]);
  assert.equal(first.body.application.status, "queued");
  assert.deepEqual(concurrent.body, first.body);
  assert.equal(
    applications.eventsOf(store.db, a.id).at(-1)!.reason,
    "CLIENT_DISAGREED",
  );
  const count = applications.eventsOf(store.db, a.id).length;
  const second = await update().expect(200);
  assert.deepEqual(second.body, first.body);
  assert.equal(applications.eventsOf(store.db, a.id).length, count);
  // The client's cookie cannot acquire a system or manager role from a header.
  await request(app)
    .post(`/api/applications/${a.id}/events`)
    .set("Cookie", c.cookie)
    .set("X-Role", "manager")
    .set("Idempotency-Key", "f1-forged")
    .send({
      event: "reject",
      expectedVersion: first.body.application.version,
      reason: "Подмена",
      payload: {},
    })
    .expect(403);
});

test("F1 customer reply in an unlinked single-application chat cancels silence escalation", async () => {
  const c = client("reply");
  await submit(c).expect(200);
  const [a] = (
    await request(app).get("/api/applications").set("Cookie", c.cookie)
  ).body;
  const { sweepSilentApplications } =
    await import("../../server/application-silence");
  await sweepSilentApplications(store.db, deps, 1000);
  now = new Date(now.getTime() + 100);
  const chat = await request(app)
    .post("/api/chats")
    .set("Cookie", c.cookie)
    .send({})
    .expect(200);
  await request(app)
    .post(`/api/chats/${chat.body.id}/messages`)
    .set("Cookie", c.cookie)
    .send({ text: "Уточню документы сегодня" })
    .expect(200);
  now = new Date(now.getTime() + 1000);
  await sweepSilentApplications(store.db, deps, 1000);
  assert.equal(
    applications.applicationOf(store.db, a.id).status,
    "info_requested",
  );
});

test("F1 configured server timer delivers a nudge and escalates without a manual sweep", async () => {
  const c = client("timer");
  await submit(c).expect(200);
  const [a] = (
    await request(app).get("/api/applications").set("Cookie", c.cookie)
  ).body;
  const { startSilenceSweep } =
    await import("../../server/application-silence");
  const previous = process.env.APPLICATION_SWEEP_MS;
  const timeout = process.env.APPLICATION_SILENCE_MS;
  process.env.APPLICATION_SWEEP_MS = "5";
  process.env.APPLICATION_SILENCE_MS = "1";
  const stop = startSilenceSweep(store.db, () => ({
    ...deps,
    clock: () => new Date(),
  }));
  try {
    const deadline = Date.now() + 2000;
    while (
      applications.applicationOf(store.db, a.id).status !== "queued" &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(applications.applicationOf(store.db, a.id).status, "queued");
    assert.deepEqual(
      applications
        .eventsOf(store.db, a.id)
        .slice(-2)
        .map((e) => e.event),
      ["agent_nudge", "escalate_silent"],
    );
  } finally {
    await stop();
    if (previous === undefined) delete process.env.APPLICATION_SWEEP_MS;
    else process.env.APPLICATION_SWEEP_MS = previous;
    if (timeout === undefined) delete process.env.APPLICATION_SILENCE_MS;
    else process.env.APPLICATION_SILENCE_MS = timeout;
  }
});
