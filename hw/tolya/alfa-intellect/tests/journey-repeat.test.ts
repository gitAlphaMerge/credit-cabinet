import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "mvp2-repeat-")),
  "test.sqlite",
);
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app");
const { db } = await import("../server/store");
const { waitMvp } = await import("../server/mvp2");
const { httpCoreClient } = await import("../server/applications");
const original = httpCoreClient.score;
after(() => {
  httpCoreClient.score = original;
  db.close();
});
const answers = {
  industry: "Производство",
  age: "Более 3 лет",
  purpose: "Текущие расходы",
  amount: 1000000,
  amountRange: "1–3 млн ₽",
  term: 12,
  usage: "Всё сразу",
  repayment: "Регулярная выручка",
};
test("one device can submit 25 successive journeys without deleting cookies or old applications", async () => {
  const client = request.agent(app);
  await client.post("/api/journey/session").send({}).expect(200);
  const ids = new Set<string>(),
    owners = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const a = (
      await client.post("/api/journey/complete").send({ answers }).expect(200)
    ).body;
    assert.ok(!ids.has(a.id));
    assert.ok(!owners.has(a.businessId));
    ids.add(a.id);
    owners.add(a.businessId);
    const retry = (
      await client.post("/api/journey/complete").send({ answers }).expect(200)
    ).body;
    assert.equal(retry.id, a.id, "Retry created another draft");
    await client
      .post(`/api/mvp2/applications/${a.id}/submit`)
      .send({ version: a.version })
      .expect(202);
    await waitMvp(a.id);
    const result = (
      await client.get(`/api/mvp2/applications/${a.id}`).expect(200)
    ).body;
    assert.equal(result.decision, "ADDITIONAL_DATA_REQUIRED");
  }
  assert.equal(ids.size, 25);
  assert.equal(owners.size, 25);
  for (const id of ids)
    assert.ok(
      db
        .prepare(
          "SELECT application_id FROM mvp2_dossiers WHERE application_id=?",
        )
        .get(id),
    );
  assert.equal((await client.get("/api/mvp2/applications")).body.length, 1);
});
test("a new completed onboarding preserves entered answers while the previous pipeline finishes independently", async () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (entered = r));
  httpCoreClient.score = async () => {
    entered();
    await gate;
    return {
      core_result: {
        core_id: "liza",
        core: {
          stops_fired: [],
          missing: [],
          flow_month_rub: 1000000,
          limit_now_rub: 10000000,
        },
      },
    } as any;
  };
  const client = request.agent(app);
  const uid = (await client.post("/api/journey/session").send({}).expect(200))
    .body.workspaceId;
  let a = (
    await client.post("/api/journey/complete").send({ answers }).expect(200)
  ).body;
  a = (
    await client
      .post(`/api/mvp2/applications/${a.id}/registry`)
      .send({ version: a.version, inn: "9900000001" })
      .expect(200)
  ).body;
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
          complete: "yes",
          loans: "no",
          leasing: "no",
          accounts: [{ ...a.questionnaire.accounts[0], bank: "Учебный банк" }],
        },
      })
      .expect(200)
  ).body;
  a = (
    await client
      .post(`/api/mvp2/applications/${a.id}/statements`)
      .field("version", String(a.version))
      .field("accountId", a.questionnaire.accounts[0].id)
      .attach(
        "file",
        readFileSync(new URL("../fixtures/mvp2-cashflow.csv", import.meta.url)),
        "cash.csv",
      )
      .expect(200)
  ).body;
  let next: any;
  try {
    await client
      .post(`/api/mvp2/applications/${a.id}/submit`)
      .send({ version: a.version })
      .expect(202);
    await started;
    const changed = { ...answers, amount: 2000000 };
    await client
      .put("/api/journey/onboarding")
      .send({ answers: changed, step: 2, sequence: 10 })
      .expect(200);
    next = (
      await client
        .post("/api/journey/complete")
        .send({ answers: changed, sequence: 10 })
        .expect(200)
    ).body;
    assert.notEqual(next.id, a.id);
    assert.notEqual(next.businessId, uid);
    assert.equal(next.questionnaire.amount, 2000000);
    assert.equal(next.company, undefined);
    assert.equal(next.questionnaire.accounts[0].documentId, "");
    await client.get(`/api/mvp2/applications/${a.id}`).expect(404);
    await client
      .put("/api/journey/onboarding")
      .set("X-Journey-Workspace", uid)
      .send({ answers, step: 0, sequence: 99 })
      .expect(409);
  } finally {
    release();
    await waitMvp(a.id);
    httpCoreClient.score = original;
  }
  const old = JSON.parse(
    String(
      db
        .prepare("SELECT data FROM mvp2_dossiers WHERE application_id=?")
        .get(a.id)!.data,
    ),
  );
  assert.equal(old.decision, "APPROVED");
  assert.equal(
    old.questionnaire.accounts[0].documentId,
    a.questionnaire.accounts[0].documentId,
  );
  const position = (await client.get("/api/journey")).body;
  assert.equal(position.applicationId, next.id);
  assert.equal(position.view, "recommendation");
  assert.equal(position.onboarding.amount, 2000000);
  assert.equal(
    (
      await client
        .post("/api/journey/complete")
        .send({ answers: { ...answers, amount: 2000000 }, sequence: 10 })
        .expect(200)
    ).body.id,
    next.id,
  );
});
