import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import {
  emptyOnboarding,
  restoreOnboarding,
  onboardingStepValid,
} from "../shared/onboarding-state";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "mvp2-onboarding-")),
  "qa.sqlite",
);
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app");
const answers = {
  ...emptyOnboarding,
  industry: "Производство",
  age: "Более 3 лет",
  purpose: "Текущие расходы",
  amount: 1000000,
  amountRange: "1–3 млн ₽",
  usage: "Всё сразу",
  repayment: "Регулярная выручка",
};

test("restore uses the saved explicit screen, not completeness; damaged future position is clamped", () => {
  for (const step of [0, 1, 2])
    assert.equal(
      restoreOnboarding({ onboarding: answers, onboardingStep: step }).step,
      step,
    );
  assert.equal(
    restoreOnboarding({
      onboarding: { ...answers, age: "" },
      onboardingStep: 2,
    }).step,
    0,
  );
  assert.equal(
    restoreOnboarding({
      onboarding: { ...answers, amount: null },
      onboardingStep: 2,
    }).step,
    1,
  );
  assert.equal(
    restoreOnboarding({ onboarding: null, onboardingStep: 2 }).step,
    0,
  );
  assert.deepEqual(restoreOnboarding({}).answers, emptyOnboarding);
  for (const amount of [299999, 7000001, NaN, 1.5, null])
    assert.equal(onboardingStepValid({ ...answers, amount }, 1), false);
  assert.equal(
    onboardingStepValid(
      { ...answers, amount: null, amountRange: "Не знаю" },
      1,
    ),
    true,
  );
});
test("older and equal conflicting autosaves cannot replace answers; complete preserves the sequence barrier", async () => {
  const client = request.agent(app);
  await client.post("/api/journey/session").send({}).expect(200);
  const snapshot = { answers, step: 2, sequence: 12 };
  await client.put("/api/journey/onboarding").send(snapshot).expect(200);
  for (const sequence of [11, 12])
    await client
      .put("/api/journey/onboarding")
      .send({
        answers: { ...answers, purpose: "Кассовый разрыв" },
        step: 0,
        sequence,
      })
      .expect(409);
  await client.put("/api/journey/onboarding").send(snapshot).expect(200);
  await client
    .post("/api/journey/complete")
    .send({ answers, sequence: 11 })
    .expect(409);
  const a = (
    await client
      .post("/api/journey/complete")
      .send({ answers, sequence: 12 })
      .expect(200)
  ).body;
  const retry = (
    await client
      .post("/api/journey/complete")
      .send({ answers, sequence: 12 })
      .expect(200)
  ).body;
  assert.equal(retry.id, a.id);
  await client
    .put("/api/journey/onboarding")
    .send({ ...snapshot, step: 0, sequence: 11 })
    .expect(409);
  const position = (await client.get("/api/journey").expect(200)).body;
  assert.equal(position.applicationId, a.id);
  assert.equal(position.onboardingSequence, 12);
  assert.equal(position.onboardingStep, 2);
  assert.equal((await client.get("/api/mvp2/applications")).body.length, 1);
  const buffer = {
    applicationId: a.id,
    version: a.version,
    questionnaire: a.questionnaire,
    section: 1,
    sequence: 10,
  };
  await client.put("/api/journey/draft").send(buffer).expect(200);
  await client
    .put("/api/journey/draft")
    .send({ ...buffer, section: 0 })
    .expect(409);
  await client
    .put("/api/journey/draft")
    .send({ ...buffer, sequence: 9 })
    .expect(409);
  await client.put("/api/journey/draft").send(buffer).expect(200);
});
test("editing the recommendation and re-entering onboarding retain one application and business data", async () => {
  const client = request.agent(app);
  await client.post("/api/journey/session").send({}).expect(200);
  let a = (
    await client.post("/api/journey/complete").send({ answers }).expect(200)
  ).body;
  const id = a.id;
  const edited = { ...answers, purpose: "Оборудование/транспорт" };
  a = (
    await client
      .put(`/api/mvp2/applications/${id}`)
      .send({
        version: a.version,
        onboarding: edited,
        questionnaire: {
          ...a.questionnaire,
          productId: "INVEST",
          purpose: edited.purpose,
          accounts: [
            { ...a.questionnaire.accounts[0], bank: "Сохранённый банк" },
          ],
        },
      })
      .expect(200)
  ).body;
  const p = (await client.get("/api/journey")).body;
  assert.equal(p.onboarding.purpose, edited.purpose);
  assert.equal(
    (await client.get("/api/state")).body.profile.mvp2Answers.purpose,
    edited.purpose,
  );
  const again = { ...edited, amount: 2000000 };
  await client
    .put("/api/journey/onboarding")
    .send({ answers: again, step: 2, sequence: p.onboardingSequence + 1 })
    .expect(200);
  a = (
    await client
      .post("/api/journey/complete")
      .send({ answers: again, sequence: p.onboardingSequence + 1 })
      .expect(200)
  ).body;
  assert.equal(a.id, id);
  assert.equal(a.questionnaire.accounts[0].bank, "Сохранённый банк");
  assert.equal(a.questionnaire.amount, 2000000);
  assert.equal((await client.get("/api/mvp2/applications")).body.length, 1);
});
