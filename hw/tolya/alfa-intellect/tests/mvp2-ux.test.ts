import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initialQuestionnaire,
  normalizeQuestionnaire,
  questionnaireSchema,
  questionnaireErrors,
  onboardingSchema,
} from "../shared/mvp2";
import { innError } from "../shared/inn";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "mvp2-ux-")),
  "test.sqlite",
);
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app");
const { db } = await import("../server/store");
const { httpCoreClient } = await import("../server/applications");
const { waitMvp } = await import("../server/mvp2");
const original = httpCoreClient.score;
after(() => {
  httpCoreClient.score = original;
  db.close();
});
const answers = {
  industry: "Производство",
  age: "Более 3 лет",
  purpose: "Текущие расходы",
  amountRange: "3–5 млн ₽",
  amount: 3478123,
  term: 12,
  usage: "Всё сразу",
  repayment: "Регулярная выручка",
};
const coreReply = () =>
  ({
    core_result: {
      core_id: "liza",
      core: {
        stops_fired: [],
        missing: [],
        flow_month_rub: 1000000,
        limit_now_rub: 10000000,
      },
    },
  }) as any;
async function prepare(csv = false) {
  const client = request.agent(app);
  const boot = await client.post("/api/journey/session").send({}).expect(200);
  let a = (
    await client.post("/api/journey/complete").send({ answers }).expect(200)
  ).body;
  a = (
    await client
      .post(`/api/mvp2/applications/${a.id}/registry`)
      .send({ version: a.version, inn: "9900000001" })
      .expect(200)
  ).body;
  assert.equal(a.questionnaire.consents.bki, false);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM mvp2_checks WHERE application_id=?")
      .get(a.id)!.n,
    0,
  );
  a = (
    await client
      .put(`/api/mvp2/applications/${a.id}`)
      .send({
        version: a.version,
        questionnaire: {
          ...a.questionnaire,
          companyConfirmed: true,
          authorized: true,
          consents: { registry: true, financial: true, bki: true },
          complete: csv ? "yes" : "unknown",
          loans: "no",
          leasing: "no",
          accounts: [
            { ...a.questionnaire.accounts[0], bank: csv ? "Учебный банк" : "" },
          ],
        },
      })
      .expect(200)
  ).body;
  if (csv)
    a = (
      await client
        .post(`/api/mvp2/applications/${a.id}/statements`)
        .field("version", String(a.version))
        .field("accountId", a.questionnaire.accounts[0].id)
        .attach(
          "file",
          readFileSync(
            new URL("../fixtures/mvp2-cashflow.csv", import.meta.url),
          ),
          "cash.csv",
        )
        .expect(200)
    ).body;
  return { client, a, uid: boot.body.workspaceId };
}
test("Exact onboarding amount survives backend and unknown never becomes an invented request", async () => {
  const x = await prepare();
  assert.equal(x.a.questionnaire.amount, 3478123);
  assert.equal(x.a.onboarding.amount, 3478123);
  assert.equal(
    initialQuestionnaire({ ...answers, amount: null, amountRange: "Не знаю" })
      .amount,
    0,
  );
  assert.equal(
    onboardingSchema.safeParse({ ...answers, amount: 7000001 }).success,
    false,
  );
  const unknown = request.agent(app);
  await unknown.post("/api/journey/session").send({}).expect(200);
  const draft = (
    await unknown
      .post("/api/journey/complete")
      .send({ answers: { ...answers, amount: null, amountRange: "Не знаю" } })
      .expect(200)
  ).body;
  assert.equal(draft.questionnaire.amount, 0);
  const error = await unknown
    .post(`/api/mvp2/applications/${draft.id}/submit`)
    .send({ version: draft.version })
    .expect(422);
  assert.ok(error.body.fields.amount);
});
test("INN checks length and checksum but keeps explicit synthetic registry fixtures", () => {
  assert.equal(innError("7707083893"), "");
  assert.ok(innError("7707083894"));
  assert.ok(innError("123"));
  assert.equal(innError("9900000001"), "");
  assert.equal(innError("990000000001"), "");
});
test("Hidden branches are cleared before schema validation and no longer block continuation", () => {
  const raw = {
    ...initialQuestionnaire(answers),
    loans: "no",
    debt: "bad",
    monthlyDebt: -2,
    balloon: 100000,
    balloonPeriod: "garbage",
    balloonExpected: "yes",
    leasing: "no",
    monthlyLeasing: "bad",
    future: "none",
    futureIn: "bad",
    outsideIn: "bad",
    complete: "yes",
    oldRate: "bad",
    projectCost: "bad",
  };
  const q = questionnaireSchema.parse(raw);
  assert.equal(q.debt, null);
  assert.equal(q.balloon, null);
  assert.equal(q.balloonPeriod, "");
  assert.equal(q.monthlyLeasing, null);
  assert.equal(q.futureIn, null);
  assert.equal(q.oldRate, null);
  assert.deepEqual(questionnaireErrors(q, 2), {});
  assert.deepEqual(normalizeQuestionnaire(q), q);
});
test("Active balloon requires an amount and a real future calendar date; no loan means no balloon errors", () => {
  const q = {
    ...initialQuestionnaire(answers),
    loans: "yes" as const,
    leasing: "no" as const,
    debt: 100000,
    monthlyDebt: 10000,
    balloonExpected: "yes" as const,
    balloon: 50000,
    balloonPeriod: "2027-02-30",
  };
  assert.ok(questionnaireErrors(q, 2).balloonPeriod);
  q.balloonPeriod = "2027-12-20";
  assert.deepEqual(questionnaireErrors(q, 2), {});
  assert.deepEqual(
    questionnaireErrors(normalizeQuestionnaire({ ...q, loans: "no" }), 2),
    {},
  );
});
test("Typed catalog fields and product ranges are checked both at the form and server", async () => {
  const x = await prepare();
  for (const key of ["purpose", "usage", "repayment", "neededAt"] as const) {
    const r = await x.client
      .put(`/api/mvp2/applications/${x.a.id}`)
      .send({
        version: x.a.version,
        questionnaire: { ...x.a.questionnaire, [key]: "random invalid input" },
      })
      .expect(422);
    assert.ok(r.body.fields[key]);
  }
  const q = { ...x.a.questionnaire, amount: 6000000 };
  assert.ok(questionnaireErrors(q, 4).amount);
  let a = (
    await x.client
      .put(`/api/mvp2/applications/${x.a.id}`)
      .send({ version: x.a.version, questionnaire: q })
      .expect(200)
  ).body;
  await x.client
    .post(`/api/mvp2/applications/${a.id}/submit`)
    .send({ version: a.version })
    .expect(422);
  assert.equal(
    (await x.client.get(`/api/mvp2/applications/${a.id}`)).body.lifecycle,
    "DRAFT",
  );
});
test("No CSV is a concrete missing-data result, never a score refusal; engine is not called", async () => {
  let calls = 0;
  httpCoreClient.score = async () => {
    calls++;
    return coreReply();
  };
  const x = await prepare();
  await x.client
    .post(`/api/mvp2/applications/${x.a.id}/submit`)
    .send({ version: x.a.version })
    .expect(202);
  await waitMvp(x.a.id);
  const a = (await x.client.get(`/api/mvp2/applications/${x.a.id}`)).body;
  assert.equal(a.decision, "ADDITIONAL_DATA_REQUIRED");
  assert.equal(calls, 0);
  assert.equal(a.stages[2].status, "waiting-data");
  assert.ok(a.missing.some((m: any) => m.key === "accounts"));
  assert.ok(a.missing.some((m: any) => m.key === "complete"));
  assert.equal(a.questionnaire.amount, 3478123);
});
test("Submission pins the owner application and real pipeline stage across stale positions, reload and duplicate clicks", async () => {
  let release!: () => void, started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  httpCoreClient.score = async () => {
    calls++;
    started();
    await gate;
    return coreReply();
  };
  const x = await prepare(true),
    version = x.a.version;
  try {
    await x.client
      .post(`/api/mvp2/applications/${x.a.id}/submit`)
      .send({ version })
      .expect(202);
    await start;
    let journey = (await x.client.get("/api/journey")).body;
    assert.equal(journey.applicationId, x.a.id);
    assert.equal(journey.view, "processing");
    await x.client
      .put("/api/journey/position")
      .send({ applicationId: x.a.id, section: 4, view: "dossier" })
      .expect(200);
    assert.equal((await x.client.get("/api/journey")).body.view, "processing");
    await x.client
      .post(`/api/mvp2/applications/${x.a.id}/submit`)
      .send({ version })
      .expect(202);
    assert.equal(
      (await x.client.get(`/api/mvp2/applications/${x.a.id}`)).body.lifecycle,
      "PROCESSING",
    );
    await x.client.post("/api/journey/complete").send({ answers }).expect(409);
    assert.equal(
      (await x.client.get(`/api/journey/draft/${x.a.id}`)).body,
      null,
    );
  } finally {
    release();
    await waitMvp(x.a.id);
  }
  const a = (await x.client.get(`/api/mvp2/applications/${x.a.id}`)).body;
  assert.equal(a.decision, "MANAGER_REVIEW_REQUIRED");
  assert.ok(a.stages.every((s: any) => s.status === "done"));
  assert.equal(calls, 1);
  assert.equal((await x.client.get("/api/journey")).body.view, "decision");
  await x.client
    .post(`/api/mvp2/applications/${x.a.id}/submit`)
    .send({ version })
    .expect(202);
  assert.equal((await x.client.get("/api/mvp2/applications")).body.length, 1);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM mvp2_revisions WHERE application_id=? AND core_result IS NOT NULL",
      )
      .get(x.a.id)!.n,
    1,
  );
});
test("Offline chat retry reuses the saved question instead of duplicating it or forging an answer", async () => {
  const x = await prepare(),
    path = `/api/mvp2/applications/${x.a.id}/chat`;
  await x.client
    .post(path)
    .send({ text: "Как подготовить выписку?" })
    .expect(503);
  const chat = (await x.client.post(path).send({ section: 1 })).body;
  assert.equal(chat.messages.length, 1);
  await x.client
    .post(path)
    .send({ retryMessageId: chat.messages[0].id })
    .expect(503);
  const retry = (await x.client.post(path).send({ section: 2 })).body;
  assert.equal(retry.messages.length, 1);
  assert.equal(retry.messages[0].role, "user");
});
test("Late autosaves cannot overwrite newer onboarding answers or private drafts", async () => {
  const x = await prepare();
  await x.client
    .put("/api/journey/onboarding")
    .send({ answers, step: 1, sequence: 10 })
    .expect(200);
  await x.client
    .put("/api/journey/onboarding")
    .send({ answers: { ...answers, amount: 3000000 }, step: 0, sequence: 9 })
    .expect(409);
  assert.equal(
    (await x.client.get("/api/journey")).body.onboarding.amount,
    3478123,
  );
  const payload = {
    applicationId: x.a.id,
    version: x.a.version,
    section: 0,
    questionnaire: { ...x.a.questionnaire, inn: "99000" },
  };
  await x.client
    .put("/api/journey/draft")
    .send({ ...payload, sequence: 10 })
    .expect(200);
  await x.client
    .put("/api/journey/draft")
    .send({
      ...payload,
      sequence: 9,
      questionnaire: { ...payload.questionnaire, inn: "990" },
    })
    .expect(409);
  assert.equal(
    (await x.client.get("/api/journey/draft/" + x.a.id)).body.questionnaire.inn,
    "99000",
  );
});
