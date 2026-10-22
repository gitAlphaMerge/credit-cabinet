import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import type { AppState } from "../shared/types";
import type { ComplianceReport } from "../server/compliance";
import type { CheckResult, CreditHistory } from "../server/checks";
import type { AlternativeOffer } from "../server/alternatives";
import * as a from "../server/applications";
let app: Express,
  db: DatabaseSync,
  state: AppState,
  cookie: string,
  manager: string;
let gate: ComplianceReport,
  stops: string[],
  missing: string[],
  history: CheckResult<CreditHistory>;
let calls: string[],
  amount = 300000;
const options: AlternativeOffer[] = [300000, 200000].map((amount_rub, i) => ({
  option_id: `option-${i}`,
  kind: "smaller_amount",
  product_id: "fixture",
  product_name: "fixture",
  amount_rub,
  term_months: 12,
  rate_annual_pct: 24,
  monthly_payment_rub: 28000,
  reason: "fixture",
}));
const deps: a.Dependencies = {
  clock: () => new Date("2026-10-23T12:00:00Z"),
  compliance: async (input) => {
    calls.push("gate");
    assert.equal(input.now.toISOString(), "2026-10-23T12:00:00.000Z");
    assert.equal(input.documents[0].documentDate, "2026-10-22");
    return structuredClone(gate);
  },
  core: {
    async score(input: any) {
      calls.push("core");
      assert.equal(input.need.amount_rub, amount);
      return {
        core_result: {
          core: { stops_fired: stops, missing, limit_now_rub: 400000 },
        },
      };
    },
  },
  bki: async () => {
    calls.push("bki");
    return structuredClone(history);
  },
  alternatives: () => {
    calls.push("alternatives");
    return structuredClone(options);
  },
};
before(async () => {
  process.env.DATABASE_PATH = ":memory:";
  ({ app } = await import("../server/app"));
  const store = await import("../server/store");
  db = store.db;
  state = store.initialState({
    name: "fixture",
    form: "ООО",
    ageBand: "Demo text",
    inn: "9900000001",
    stage: "operating",
    sector: "Demo text",
    registered: true,
    result: "Demo text",
    debt: "Demo text",
    intent: "Demo text",
  });
  state.documents = [
    {
      id: "statement",
      category: "statement",
      name: "fixture",
      period: "Demo text",
      confirmed: true,
      fields: {},
      createdAt: "2026-10-23",
      currency: "RUB",
      mime: "text/csv",
      records: [{ date: "2026-10-22", amount: 1000 }],
    },
  ];
  state.selections = [
    {
      id: "selection",
      version: 1,
      createdAt: "2026-10-22",
      purpose: "Demo text",
      repayFrom: "Demo text",
      ownFunds: 0,
      product: "Demo text",
      risks: [],
      alternatives: [],
      status: "ready",
      calculation: {
        amount: 300000,
        term: 12,
        rate: 0.24,
        monthlyPayment: 0,
        interest: 0,
        total: 0,
        flow: null,
        existing: null,
        maxAmount: null,
        dscr: null,
        stressDscr: null,
        schedule: [],
        source: "demo",
        formula: "demo",
      },
    },
  ];
  for (const [id, role] of [
    ["v2-owner", "client"],
    ["v2-manager", "manager"],
  ])
    db.prepare(
      "INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,?)",
    ).run(id, id, "unused", JSON.stringify(state), role);
  cookie = "alfa_session=" + store.session("v2-owner");
  manager = "alfa_session=" + store.session("v2-manager");
});
beforeEach(() => {
  calls = [];
  stops = [];
  missing = [];
  amount = 300000;
  gate = {
    gate: "pass",
    checks: [
      {
        key: "aml",
        status: "ok",
        managerText: "Mock passed",
        source: "синтетические данные (мок)",
        checkedAt: "2026-10-23T12:00:00.000Z",
      },
    ],
    documents: [],
    reasons: [],
    holes: [],
    enrichment: {},
  };
  history = {
    source: "синтетические данные (мок)",
    status: "ok",
    data: {
      openLoans: 0,
      overdue30Plus12m: 0,
      overdue90Plus12m: 0,
      debtBurdenRatio: 0,
    },
  };
  a.configureApplications(deps);
});
after(() => db.close());
function create() {
  state.selections[0].calculation.amount = amount;
  db.prepare("UPDATE users SET state=? WHERE id='v2-owner'").run(
    JSON.stringify(state),
  );
  return a.createApplication(
    db,
    "v2-owner",
    { selectionId: "selection", selectionVersion: 1 },
    deps,
  ).application.id;
}
function post(
  id: string,
  event: a.Event,
  payload: Record<string, unknown> = {},
  session = cookie,
  version = a.applicationOf(db, id).version,
  key = crypto.randomUUID(),
) {
  return request(app)
    .post(`/api/applications/${id}/events`)
    .set("Cookie", session)
    .set("Idempotency-Key", key)
    .send({ event, expectedVersion: version, payload });
}
async function submit() {
  const id = create();
  await post(id, "submit", { consent: true }).expect(200);
  return id;
}
async function internal(id: string, event: a.Event, payload = {}) {
  return a.transitionApplication(
    db,
    {
      applicationId: id,
      event,
      expectedVersion: a.applicationOf(db, id).version,
      actorRole: "system",
      actorId: null,
      payload,
    },
    deps,
  );
}
test("S1: automatic system offer, signing, exact replay without second dossier", async () => {
  const id = create(),
    key = crypto.randomUUID();
  const first = await post(
    id,
    "submit",
    { consent: true },
    cookie,
    1,
    key,
  ).expect(200);
  assert.equal(first.body.application.status, "offered");
  assert.deepEqual(calls, ["gate", "core", "bki"]);
  const events = a.eventsOf(db, id);
  assert.deepEqual(
    events.slice(1).map((e) => [e.to_status, e.actor_role]),
    [
      ["underwriting", "system"],
      ["approved", "system"],
      ["offered", "system"],
    ],
  );
  const second = await post(
    id,
    "submit",
    { consent: true },
    cookie,
    1,
    key,
  ).expect(200);
  assert.deepEqual(second.body, first.body);
  assert.equal(a.dossierOf(db, id)!.version, 1);
  assert.equal(calls.length, 3);
  await post(id, "sign", { code: "0000" }).expect(200);
  assert.equal(a.applicationOf(db, id).status, "disbursed");
});
test("gate blocks core and persists report; bankruptcy rejects", async () => {
  for (const status of ["info_requested", "hard_stop"] as const) {
    calls = [];
    gate.gate = status;
    gate.holes = ["compliance"];
    gate.reasons = ["COMPLIANCE_BANKRUPTCY"];
    const id = await submit();
    assert.equal(
      a.applicationOf(db, id).status,
      status === "hard_stop" ? "rejected" : "info_requested",
    );
    assert.deepEqual(calls, ["gate"]);
    assert.deepEqual(a.dossierOf(db, id)!.compliance, gate);
    if (status === "hard_stop")
      assert.equal(a.eventsOf(db, id).at(-1)!.reason, "COMPLIANCE_BANKRUPTCY");
  }
});
test("S4 and BKI90 reject, never build alternatives, visible only in rejected", async () => {
  for (const stop of ["ENFORCEMENT", "BKI_OVERDUE_90_PLUS"]) {
    calls = [];
    stops = stop === "ENFORCEMENT" ? [stop] : [];
    if (stop !== "ENFORCEMENT" && history.status !== "unavailable")
      history.data.overdue90Plus12m = 1;
    const id = await submit();
    assert.equal(a.applicationOf(db, id).status, "rejected");
    assert.equal(a.eventsOf(db, id).at(-1)!.reason, stop);
    assert.ok(!calls.includes("alternatives"));
    assert.ok(!a.bankQueue(db, deps).some((r) => r.application.id === id));
    const rejected = await request(app)
      .get("/api/bank/rejected")
      .set("Cookie", manager)
      .expect(200);
    assert.ok(
      rejected.body.some(
        (r: any) =>
          r.id === id &&
          r.red_reason === "UNDERWRITING_REJECTED" &&
          r.reason === stop,
      ),
    );
  }
});
test("D: stored option required; accepted amount/term rescored, foreign option makes no writes", async () => {
  amount = 900000;
  const id = await submit();
  assert.equal(a.applicationOf(db, id).status, "info_requested");
  assert.deepEqual(a.dossierOf(db, id)!.alternatives, options);
  assert.equal(
    a.eventsOf(db, id).at(-1)!.reason,
    "LIMIT_EXCEEDED_ALTERNATIVES",
  );
  const before = a.eventsOf(db, id);
  await post(id, "accept_alternative", { option_id: "foreign" }).expect(422);
  assert.deepEqual(a.eventsOf(db, id), before);
  amount = 300000;
  calls = [];
  await post(id, "accept_alternative", { option_id: "option-0" }).expect(200);
  assert.equal(a.applicationOf(db, id).status, "offered");
  assert.equal(a.applicationOf(db, id).amount, amount);
  assert.deepEqual(calls, ["gate", "core", "bki"]);
  assert.equal(a.dossierOf(db, id)!.version, 2);
});
test("red queue: nudge guard, objections, capped priority, manager cannot exceed limit", async () => {
  amount = 900000;
  const id = await submit();
  await assert.rejects(internal(id, "escalate_silent"), { status: 409 });
  await internal(id, "agent_nudge", { text: "Demo text" });
  await internal(id, "escalate_silent");
  const row = a.bankQueue(db, deps).find((r) => r.application.id === id)!;
  assert.equal(row.red_reason, "CLIENT_SILENT");
  assert.equal(row.terms.amount, 400000);
  assert.deepEqual(row.alternatives, options);
  const denied = await post(
    id,
    "send_to_underwriting",
    { memo: "verified" },
    manager,
  ).expect(409);
  assert.equal(denied.body.error, "AMOUNT_EXCEEDS_LIMIT");
  const other = await submit();
  await assert.rejects(internal(other, "escalate_disagreed"), { status: 422 });
  await internal(other, "escalate_disagreed", {
    client_objections: "Demo text",
  });
  const second = a.bankQueue(db, deps).find((r) => r.application.id === other)!;
  assert.equal(second.red_reason, "CLIENT_DISAGREED");
  assert.equal(second.client_objections, "Demo text");
  assert.equal(a.dossierOf(db, other)!.client_objections, "Demo text");
  await post(id, "request_info", {}, manager).expect(422);
});
test("nudge must belong to the latest info cycle; owner HTTP delegation cannot approve", async () => {
  missing = ["contract_main_customer"];
  const id = await submit();
  await post(id, "agent_nudge", { text: "Demo text" }).expect(200);
  await post(id, "client_update", {
    confirmed_fields: { unrelated: true },
  }).expect(200);
  await post(id, "escalate_silent").expect(409);
  await post(id, "underwriter_approve", { amount: 300000 }).expect(409);
});
test("race: parallel client updates commit one cascade, one 409", async () => {
  missing = ["contract_main_customer"];
  const id = await submit(),
    version = a.applicationOf(db, id).version;
  missing = [];
  const responses = await Promise.all([
    post(
      id,
      "client_update",
      { confirmed_fields: { contract_main_customer: true } },
      cookie,
      version,
    ),
    post(
      id,
      "client_update",
      { confirmed_fields: { contract_main_customer: true } },
      cookie,
      version,
    ),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(a.dossierOf(db, id)!.version, 2);
  assert.equal(
    a.eventsOf(db, id).filter((e) => e.event === "make_offer").length,
    1,
  );
});
test("offer write failure rolls back the entire automatic cascade and dossier", async () => {
  const id = create(),
    before = a.applicationOf(db, id),
    events = a.eventsOf(db, id);
  assert.match(id, /^[a-f0-9-]+$/);
  db.exec(`CREATE TEMP TRIGGER v2_abort_offer BEFORE INSERT ON application_events
    WHEN NEW.application_id='${id}' AND NEW.event='make_offer'
    BEGIN SELECT RAISE(ABORT,'V2_OFFER_FAILURE'); END`);
  try {
    await post(id, "submit", { consent: true }).expect(500);
    assert.deepEqual(a.applicationOf(db, id), before);
    assert.deepEqual(a.eventsOf(db, id), events);
    assert.equal(a.dossierOf(db, id), undefined);
  } finally {
    db.exec("DROP TRIGGER v2_abort_offer");
  }
  await post(id, "submit", { consent: true }).expect(200);
  assert.equal(a.applicationOf(db, id).status, "offered");
});
test("latest dossier invalidates old options; queued option acceptance reruns gate", async () => {
  amount = 900000;
  const id = await submit();
  missing = ["contract_main_customer"];
  await post(id, "client_update", {
    confirmed_fields: { unrelated: true },
  }).expect(200);
  await post(id, "accept_alternative", { option_id: "option-0" }).expect(422);
  missing = [];
  const queued = await submit();
  await internal(queued, "escalate_disagreed", {
    client_objections: "Discuss terms",
  });
  gate.gate = "hard_stop";
  gate.reasons = ["COMPLIANCE_BANKRUPTCY"];
  amount = 300000;
  calls = [];
  await post(queued, "accept_alternative", { option_id: "option-0" }).expect(
    200,
  );
  assert.equal(a.applicationOf(db, queued).status, "rejected");
  assert.deepEqual(calls, ["gate"]);
});
test("manager updates, foreign delegation and terminal escalation cannot bypass roles", async () => {
  missing = ["contract_main_customer"];
  const id = await submit();
  const before = a.eventsOf(db, id);
  await post(
    id,
    "client_update",
    { confirmed_fields: { contract_main_customer: true } },
    manager,
  ).expect(403);
  await post(id, "agent_nudge", { text: "Nudge" }, manager).expect(403);
  assert.deepEqual(a.eventsOf(db, id), before);
  missing = [];
  const offered = await submit();
  await assert.rejects(
    internal(offered, "escalate_disagreed", { client_objections: "No" }),
    { status: 409 },
  );
});
test("invariants: gate x stop x BKI x amount x completeness", async () => {
  for (const g of ["pass", "info_requested", "hard_stop"] as const)
    for (const stop of [false, true])
      for (const bki of [0, 30, 90])
        for (const excessive of [false, true])
          for (const incomplete of [false, true]) {
            calls = [];
            gate.gate = g;
            gate.holes = g === "pass" ? [] : ["compliance"];
            gate.reasons = g === "hard_stop" ? ["COMPLIANCE_BANKRUPTCY"] : [];
            stops = stop ? ["ENFORCEMENT"] : [];
            missing = incomplete ? ["contract_main_customer"] : [];
            if (history.status !== "unavailable") {
              history.data.overdue30Plus12m = bki > 0 ? 1 : 0;
              history.data.overdue90Plus12m = bki === 90 ? 1 : 0;
            }
            amount = excessive ? 900000 : 300000;
            const id = await submit();
            const offered = a.applicationOf(db, id).status === "offered";
            assert.equal(
              offered,
              g === "pass" && !stop && bki === 0 && !excessive && !incomplete,
              JSON.stringify({ g, stop, bki, excessive, incomplete }),
            );
            assert.equal(calls.includes("core"), g === "pass");
            for (const e of a.eventsOf(db, id)) {
              assert.ok(e.actor_role);
              if (e.actor_role === "system") assert.ok(e.reason || e.event);
            }
            if (bki === 30 && g === "pass" && !stop)
              assert.ok(JSON.parse(a.dossierOf(db, id)!.holes).includes("bki"));
          }
});
test("unavailable BKI and compliance tails cannot be approved, even on existing checklist keys", async () => {
  history = {
    status: "unavailable",
    source: "синтетические данные (мок)",
    managerText: "Unavailable",
  };
  const unavailable = await submit();
  assert.equal(a.applicationOf(db, unavailable).status, "info_requested");
  assert.ok(JSON.parse(a.dossierOf(db, unavailable)!.holes).includes("bki"));
  history = {
    status: "ok",
    source: "синтетические данные (мок)",
    data: {
      openLoans: 0,
      overdue30Plus12m: 0,
      overdue90Plus12m: 0,
      debtBurdenRatio: 0,
    },
  };
  gate.holes = ["statement"];
  const tail = await submit();
  assert.equal(a.applicationOf(db, tail).status, "info_requested");
  assert.ok(JSON.parse(a.dossierOf(db, tail)!.holes).includes("statement"));
  assert.deepEqual(a.dossierOf(db, tail)!.compliance, gate);
});
