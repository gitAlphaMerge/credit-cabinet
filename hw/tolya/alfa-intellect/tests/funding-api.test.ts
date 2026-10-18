import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blankFundingRequest } from "../shared/financing";
process.env.DATABASE_PATH = join(
  await mkdtemp(join(tmpdir(), "alfa-funding-")),
  "test.sqlite",
);
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app"),
  { db } = await import("../server/store");
test("Funding vertical: stable versions, linked chat, guarded proposals, isolated demo applications and internal dossier", async () => {
  const a = request.agent(app),
    b = request.agent(app),
    profile = {
      name: "Синтетическое ООО",
      form: "ООО",
      registered: true,
      stage: "operating",
      sector: "Производство",
      ageBand: "3–5 лет",
      result: "Прибыль",
      debt: "Есть",
      intent: "Подбор",
    };
  await a
    .post("/api/auth/register")
    .send({ phone: "+79001118801", password: "Funding-test-pass18", profile })
    .expect(200);
  await b
    .post("/api/auth/register")
    .send({ phone: "+79001118802", password: "Funding-test-pass18", profile })
    .expect(200);
  const input = {
      ...blankFundingRequest(),
      amount: 1000000,
      financials: { incoming: 800000, expenses: 400000, existing: 10000 },
    },
    first = (
      await a
        .post("/api/selections")
        .send({ engine: "mvp-2", input })
        .expect(200)
    ).body;
  assert.equal(first.version, 1);
  assert.equal(first.versions.length, 1);
  assert.equal(first.assessment.selectedId, "investment");
  await b
    .post("/api/selections")
    .send({ engine: "mvp-2", input, parentId: first.id, expectedVersion: 1 })
    .expect(404);
  const second = (
    await a
      .post("/api/selections")
      .send({
        engine: "mvp-2",
        input: { ...input, amount: 500000, term: 60 },
        parentId: first.id,
        expectedVersion: 1,
      })
      .expect(200)
  ).body;
  assert.equal(second.id, first.id);
  assert.equal(second.version, 2);
  assert.equal(second.versions.length, 2);
  assert.equal(second.versions[0].calculation.amount, 1000000);
  assert.ok(
    second.calculation.monthlyPayment < first.calculation.monthlyPayment,
  );
  assert.equal((await a.get("/api/state")).body.selections.length, 1);
  await a
    .post("/api/selections")
    .send({ engine: "mvp-2", input, parentId: first.id, expectedVersion: 1 })
    .expect(409);
  const chat = (
    await a.post("/api/chats").send({ selectionId: first.id }).expect(200)
  ).body;
  assert.equal(
    (await a.post("/api/chats").send({ selectionId: first.id }).expect(200))
      .body.id,
    chat.id,
  );
  await a
    .post(`/api/chats/${chat.id}/messages`)
    .send({ text: "Измени сумму до 700 000 и срок до 36" })
    .expect(200);
  let state = (await a.get("/api/state")).body,
    proposal = state.chats
      .find((c: any) => c.id === chat.id)
      .messages.at(-1).fundingProposal;
  assert.equal(proposal.amount, 700000);
  assert.equal(proposal.term, 36);
  assert.equal(proposal.expectedVersion, 2);
  assert.equal(state.selections[0].version, 2);
  const third = (
    await a
      .post("/api/selections")
      .send({
        engine: "mvp-2",
        parentId: first.id,
        expectedVersion: 2,
        input: {
          ...second.input,
          amount: proposal.amount,
          term: proposal.term,
          productId: "overdraft",
        },
      })
      .expect(200)
  ).body;
  assert.equal(third.version, 3);
  assert.equal(third.assessment.selectedId, "overdraft");
  assert.ok(third.assessment.checks.some((c: any) => c.state === "unmet"));
  const preview = (
    await a.get(`/api/selections/${first.id}/application-preview`).expect(200)
  ).body;
  assert.equal(preview.application.rate, "Уточняется банком");
  assert.ok(!("assessment" in preview.application));
  assert.ok(!("dscr" in preview.application));
  await b.get(`/api/selections/${first.id}/application-preview`).expect(404);
  await a
    .post(`/api/selections/${first.id}/application`)
    .send({ expectedVersion: 3 })
    .expect(422);
  const application = (
    await a
      .post(`/api/selections/${first.id}/application`)
      .send({ expectedVersion: 3, acknowledgeRisks: true })
      .expect(200)
  ).body;
  assert.equal(application.status, "Демо-заявка создана");
  assert.equal(application.phone, "79001118801");
  assert.equal(application.application.version, 3);
  assert.equal(
    (
      await a
        .post(`/api/selections/${first.id}/application`)
        .send({ expectedVersion: 3, acknowledgeRisks: true })
        .expect(200)
    ).body.id,
    application.id,
  );
  await b
    .post(`/api/selections/${first.id}/application`)
    .send({ expectedVersion: 3, acknowledgeRisks: true })
    .expect(404);
  state = (await a.get("/api/state")).body;
  assert.equal(state.leads.length, 1);
  assert.ok(!JSON.stringify(state.leads).includes("internalDossier"));
  const stored = db
      .prepare("SELECT dossier FROM funding_applications WHERE id=?")
      .get(application.id) as { dossier: string },
    dossier = JSON.parse(stored.dossier);
  assert.equal(dossier.assessment.selectedId, "overdraft");
  assert.equal(dossier.calculation.amount, 700000);
  assert.equal(dossier.application.version, 3);
  assert.ok(dossier.assessment.data.length > 0);
  await a
    .post("/api/selections")
    .send({
      engine: "mvp-2",
      parentId: first.id,
      expectedVersion: 3,
      input: { ...third.input, amount: 600000 },
    })
    .expect(200);
  await a
    .post(`/api/selections/${first.id}/application`)
    .send({ expectedVersion: 3, acknowledgeRisks: true })
    .expect(409);
  assert.equal(
    JSON.parse(
      (
        db
          .prepare("SELECT dossier FROM funding_applications WHERE id=?")
          .get(application.id) as any
      ).dossier,
    ).calculation.amount,
    700000,
  );
  const malformed = await a
    .post("/api/selections")
    .send({
      engine: "mvp-2",
      input: { ...input, details: { currentRate: 232 } },
    })
    .expect(422);
  assert.ok(!/Too big|expected|Invalid input/.test(malformed.body.error));
  assert.equal((await a.get("/api/state")).body.selections.length, 1);
});
