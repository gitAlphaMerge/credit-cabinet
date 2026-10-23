/** Intentional red oracles: v2-contract.md, case p9, inputs section 4/5. */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import {
  a,
  fixture,
  offerOf,
  AT,
  buildAlternatives,
  golden,
  liveInstrumentAssertion,
} from "./q4-review-harness";
import { runComplianceGate } from "../../server/compliance";
import type { DatabaseSync } from "node:sqlite";
import type { Express } from "express";

let db: DatabaseSync, app: Express, session: (uid: string) => string;
before(async () => {
  process.env.DATABASE_PATH = ":memory:";
  ({ app } = await import("../../server/app"));
  ({ db, session } = await import("../../server/store"));
});
after(() => db?.close());

for (const changed of ["profile", "statement"] as const) {
  test(`BUG: #1 ${changed} changed during core cannot commit stale pass`, async () => {
    const f = fixture(db);
    let entered!: () => void, resume!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    const paused = new Promise<void>((r) => {
      resume = r;
    });
    const original = f.deps.core.score;
    f.deps.core.score = async (input) => {
      entered();
      await paused;
      return original(input);
    };
    const pending = f.submit();
    await started;
    if (changed === "profile") f.state.profile.inn = "9900000042";
    else f.state.documents[0].records = [{ date: "2020-01-01", amount: 1 }];
    f.save();
    resume();
    await pending.catch((error) => {
      assert.equal(error.status, 409);
    });
    assert.notEqual(
      a.applicationOf(db, f.id).status,
      "offered",
      "stale evidence must not yield an offer",
    );
    assert.equal(
      a.eventsOf(db, f.id).filter((e) => e.event === "make_offer").length,
      0,
    );
  });
}

for (const field of ["asked_for", "rate", "repayment"] as const) {
  test(`BUG: #4 accepted alternative preserves ${field}`, async () => {
    const f = fixture(db, 900000, "кассовый разрыв");
    await f.submit();
    const selected = a.dossierOf(db, f.id)!.alternatives![0];
    await a.transitionApplication(
      db,
      f.command("accept_alternative", { option_id: selected.option_id }),
      f.deps,
    );
    assert.equal(a.applicationOf(db, f.id).status, "offered");
    if (field === "asked_for")
      assert.equal(f.seen.at(-1).need.asked_for, selected.product_id);
    if (field === "rate")
      assert.equal(offerOf(db, f.id).rate, selected.rate_annual_pct / 100);
    // Catalog line is revolving: monthly interest only, separate principal repayment.
    if (field === "repayment")
      assert.equal(
        offerOf(db, f.id).schedule[0].payment,
        selected.monthly_payment_rub,
      );
  });
}

test("BUG: #7 extra unconfirmed old statement cannot block confirmed fresh evidence", async () => {
  const base = {
    inn: "9900000001",
    now: AT,
    documents: [
      { category: "statement", confirmed: true, documentDate: "2026-10-22" },
    ],
  };
  const clean = await runComplianceGate(base);
  assert.equal(clean.gate, "pass");
  const extra = await runComplianceGate({
    ...base,
    documents: [
      ...base.documents,
      { category: "statement", confirmed: false, documentDate: "2020-01-01" },
    ],
  });
  assert.equal(extra.gate, clean.gate);
  assert.deepEqual(extra.reasons, clean.reasons);
});

// Proposed oracle: inputs section 4 permits enrichment, but does not mandate precedence.
// REPORT.md deliberately leaves #8 unverified pending the architect's decision.
test("BUG: #8 candidate oracle - registry age takes precedence over editable age", async () => {
  const f = fixture(db);
  await f.submit();
  assert.equal(f.gate.enrichment.monthsActive, 79);
  assert.notEqual(
    f.seen[0].questionnaire.years,
    "до года",
    "registry says 79 months, profile says under one year",
  );
});

for (const [ui, canonical] of [
  ["Развитие", "рост"],
  ["Исполнение контракта", "закупка под контракт"],
]) {
  test(`BUG: #9 equivalent purpose ${ui} produces same real catalogue alternatives`, async () => {
    const make = async (purpose: string) => {
      const f = fixture(db, 900000, purpose);
      f.deps.alternatives = buildAlternatives;
      await f.submit();
      assert.equal(f.seen[0].need.purpose, canonical);
      return a.dossierOf(db, f.id)!.alternatives;
    };
    const expected = await make(canonical);
    assert.ok(expected!.length > 0, "positive catalogue control");
    assert.deepEqual(await make(ui), expected);
  });
}

test("BUG: #11 real chat handler must attach owned application and objections mode", async (t) => {
  const f = fixture(db, 900000);
  await f.submit();
  a.configureApplications(f.deps);
  for (const [key, value] of [
    ["TEAM_AGENT_URL", "http://q4-agent.invalid"],
    ["AI_PROVIDER", "team-agent"],
  ]) {
    const previous = process.env[key];
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
    process.env[key] = value;
  }
  let payload: any;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      payload = JSON.parse(String(init.body));
      return Response.json({
        text: "Обсудим условия?",
        objections_summary: "Не согласен",
      });
    },
  );
  const cookie = "alfa_session=" + session(f.uid);
  const created = await request(app)
    .post("/api/chats")
    .set("Cookie", cookie)
    .send({ selectionId: "q4-selection" })
    .expect(200);
  await request(app)
    .post(`/api/chats/${created.body.id}/messages`)
    .set("Cookie", cookie)
    .send({ text: "Не согласен с альтернативами, нужен больший лимит" })
    .expect(200);
  assert.equal(payload.card.application?.id, f.id);
  assert.equal(payload.card.application?.status, "info_requested");
  assert.equal(payload.mode, "objections");
});

test("BUG: #12 application journal must not retain private text inside objections", async () => {
  const f = fixture(db, 900000);
  await f.submit();
  const secret =
    "ИНН 771234567890 телефон 79991234567 Синтетиков Тест Тестович";
  const command = f.command("escalate_disagreed", {
    client_objections: secret,
  });
  command.actorRole = "system";
  command.actorId = null;
  await a.transitionApplication(db, command, f.deps);
  const journal = JSON.stringify(a.eventsOf(db, f.id));
  const matches = [
    "771234567890",
    "79991234567",
    "Синтетиков Тест Тестович",
  ].filter((marker) => journal.includes(marker));
  console.log(
    "Q4_PII_SCAN=application_events.payload " + JSON.stringify(matches),
  );
  assert.deepEqual(
    matches,
    [],
    "application_events.payload retains private objection text",
  );
});

test("BUG: #15 real live oracle accepts a member of golden instrument array", () => {
  const scenario = golden.scenarios.find((g: any) =>
    Array.isArray(g.expected.instrument),
  );
  assert.ok(scenario, "new golden actually uses arrays");
  assert.doesNotThrow(() =>
    liveInstrumentAssertion(
      scenario.expected.instrument[0],
      scenario.expected.instrument,
    ),
  );
});
