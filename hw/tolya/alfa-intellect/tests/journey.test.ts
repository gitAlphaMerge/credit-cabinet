import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "mvp2-journey-")),
  "test.sqlite",
);
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app");
const { db, stateOf, saveState } = await import("../server/store");
const { httpCoreClient } = await import("../server/applications");
const { waitMvp } = await import("../server/mvp2");
const { cabinetAvailable, guardJourneyPage } =
  await import("../server/journey");
const original = httpCoreClient.score;
let capacity = 10000000;
before(() => {
  httpCoreClient.score = async () =>
    ({
      core_result: {
        core_id: "liza",
        core: {
          stops_fired: [],
          missing: [],
          flow_month_rub: 1000000,
          limit_now_rub: capacity,
        },
      },
    }) as any;
});
after(() => {
  httpCoreClient.score = original;
  db.close();
});
const answers = {
  industry: "Производство",
  age: "Более 3 лет",
  purpose: "Текущие расходы",
  amountRange: "1–3 млн ₽",
  term: 12,
  usage: "Всё сразу",
  repayment: "Регулярная выручка",
};
async function guest() {
  const client = request.agent(app);
  const r = await client.post("/api/journey/session").send({}).expect(200);
  return {
    client,
    uid: r.body.workspaceId,
    cookie: r.headers["set-cookie"][0].split(";")[0],
  };
}
async function prepare(
  x: Awaited<ReturnType<typeof guest>>,
  amount = 3000000,
  inn = "9900000001",
  csv = true,
) {
  let a = (
    await x.client.post("/api/journey/complete").send({ answers }).expect(200)
  ).body;
  const q = {
    ...a.questionnaire,
    amount,
    inn,
    authorized: true,
    consents: { registry: true, financial: true, bki: true },
    complete: "yes",
    loans: "no",
    leasing: "no",
  };
  q.accounts[0].bank = "Учебный банк";
  a = (
    await x.client
      .put(`/api/mvp2/applications/${a.id}`)
      .send({ version: a.version, questionnaire: q })
      .expect(200)
  ).body;
  a = (
    await x.client
      .post(`/api/mvp2/applications/${a.id}/registry`)
      .send({ version: a.version })
      .expect(200)
  ).body;
  a = (
    await x.client
      .put(`/api/mvp2/applications/${a.id}`)
      .send({
        version: a.version,
        questionnaire: { ...a.questionnaire, companyConfirmed: true },
      })
      .expect(200)
  ).body;
  if (csv)
    a = (
      await x.client
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
  return a;
}
async function submit(x: Awaited<ReturnType<typeof guest>>, a: any) {
  await x.client
    .post(`/api/mvp2/applications/${a.id}/submit`)
    .send({ version: a.version })
    .expect(202);
  await waitMvp(a.id);
  return (await x.client.get(`/api/mvp2/applications/${a.id}`)).body;
}
test("anonymous session: HttpOnly owner, idempotent bootstrap, server onboarding and reload recovery", async () => {
  const x = await guest();
  const config = (await x.client.get("/api/config")).body;
  assert.equal(config.anonymous, true);
  assert.equal(config.cabinetAvailable, false);
  assert.equal(
    (await x.client.post("/api/journey/session").send({})).body.workspaceId,
    x.uid,
  );
  await x.client
    .put("/api/journey/onboarding")
    .send({ answers, step: 1 })
    .expect(200);
  const reloaded = request.agent(app).set("Cookie", x.cookie);
  assert.equal((await reloaded.get("/api/journey")).body.onboardingStep, 1);
  assert.deepEqual(
    (await reloaded.get("/api/journey")).body.onboarding,
    answers,
  );
  const row = db
    .prepare("SELECT phone,password FROM users WHERE id=?")
    .get(x.uid)!;
  assert.match(String(row.phone), /^anonymous:/);
  assert.equal(row.password, "!anonymous-login-disabled");
});
test("old direct page URLs and cabinet/manual API paths are closed before activation", async () => {
  const x = await guest(),
    pages = express();
  pages.use(guardJourneyPage);
  pages.use((_req, res) => res.send("service page"));
  for (const url of [
    "/cabinet",
    "/cabinet-v2",
    "/efficiency",
    "/chat",
    "/profile",
    "/payments",
    "/demo",
    "/calculations",
    "/legacy-application",
  ]) {
    await request(pages)
      .get(url)
      .set("Cookie", x.cookie)
      .expect(303)
      .expect("Location", "/apply");
  }
  for (const url of [
    "/api/cabinet/facility",
    "/api/calculate",
    "/api/applications",
  ]) {
    await x.client.post(url).send({}).expect(403);
  }
  const state = stateOf(x.uid);
  (state as any).cabinet = {
    facility: { origin: "mvp2", applicationId: "forged" },
  };
  saveState(x.uid, state);
  assert.equal(cabinetAvailable(x.uid), false);
  assert.equal(
    (await x.client.get("/api/config")).body.cabinetAvailable,
    false,
  );
});
test("private draft and current section survive reload, remain owner-scoped and are not a decision", async () => {
  const x = await guest();
  let a = (await x.client.post("/api/journey/complete").send({ answers })).body;
  await x.client
    .put("/api/journey/draft")
    .send({
      applicationId: a.id,
      version: a.version,
      section: 0,
      questionnaire: { ...a.questionnaire, inn: "99000" },
    })
    .expect(200);
  await x.client
    .put("/api/journey/position")
    .send({ applicationId: a.id, section: 0, view: "questionnaire" })
    .expect(200);
  assert.equal(
    (await x.client.get(`/api/journey/draft/${a.id}`)).body.questionnaire.inn,
    "99000",
  );
  assert.equal(
    (await x.client.get(`/api/mvp2/applications/${a.id}`)).body.questionnaire
      .inn,
    "",
  );
  const other = await guest();
  await other.client.get(`/api/journey/draft/${a.id}`).expect(404);
  await x.client
    .post(`/api/mvp2/applications/${a.id}/activate`)
    .send({})
    .expect(409);
  a = (
    await x.client
      .put(`/api/mvp2/applications/${a.id}`)
      .send({ version: a.version, questionnaire: a.questionnaire })
  ).body;
  assert.equal((await x.client.get(`/api/journey/draft/${a.id}`)).body, null);
});
test("anonymous approval: signature does not unlock cabinet; activation does, once, in same session", async () => {
  const x = await guest();
  let a = await submit(x, await prepare(x));
  assert.equal(a.decision, "APPROVED");
  assert.equal(cabinetAvailable(x.uid), false);
  a = (
    await x.client
      .post(`/api/mvp2/applications/${a.id}/contract-details`)
      .send({
        version: a.version,
        details: {
          signatory: "Учебный Представитель",
          authority: "Устав",
          receivingAccount: "40702810000000000001",
          receivingBank: "Учебный банк",
        },
      })
      .expect(200)
  ).body;
  a = (
    await x.client
      .post(`/api/mvp2/applications/${a.id}/sign`)
      .send({ hash: a.contract.hash, confirmed: true })
      .expect(200)
  ).body;
  assert.equal(cabinetAvailable(x.uid), false);
  await x.client.post("/api/cabinet/select").send({ id: a.id }).expect(403);
  await x.client
    .post(`/api/mvp2/applications/${a.id}/activate`)
    .send({})
    .expect(200);
  await x.client
    .post(`/api/mvp2/applications/${a.id}/activate`)
    .send({})
    .expect(200);
  assert.equal(cabinetAvailable(x.uid), true);
  assert.equal((await x.client.get("/api/config")).body.cabinetAvailable, true);
  assert.equal(stateOf(x.uid).cabinet?.facility?.applicationId, a.id);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM mvp2_disbursements WHERE application_id=?",
      )
      .get(a.id)!.n,
    1,
  );
  const dossierBefore = db
    .prepare("SELECT data FROM mvp2_dossiers WHERE application_id=?")
    .get(a.id)!.data;
  const documentsBefore = db
    .prepare(
      "SELECT kind,signed,hash FROM mvp2_documents WHERE application_id=? ORDER BY kind,signed",
    )
    .all(a.id);
  await x.client
    .post("/api/journey/restart")
    .set("X-Journey-Workspace", x.uid)
    .send({})
    .expect(200);
  assert.equal(
    (await x.client.get("/api/config")).body.cabinetAvailable,
    false,
  );
  assert.equal(
    cabinetAvailable(x.uid),
    true,
    "Previously issued credit must remain active for its original owner",
  );
  assert.equal(
    db
      .prepare("SELECT data FROM mvp2_dossiers WHERE application_id=?")
      .get(a.id)!.data,
    dossierBefore,
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT kind,signed,hash FROM mvp2_documents WHERE application_id=? ORDER BY kind,signed",
      )
      .all(a.id),
    documentsBefore,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM mvp2_disbursements WHERE application_id=?",
      )
      .get(a.id)!.n,
    1,
  );
});
test("anonymous manager and missing-data branches never unlock service screens", async () => {
  const x = await guest();
  let a = await submit(x, await prepare(x, 3000001));
  assert.equal(a.decision, "MANAGER_REVIEW_REQUIRED");
  await x.client
    .post(`/api/mvp2/applications/${a.id}/contract`)
    .send({ version: a.version })
    .expect(409);
  assert.equal(cabinetAvailable(x.uid), false);
  const y = await guest();
  a = await submit(y, await prepare(y, 3000000, "9900000001", false));
  assert.equal(a.decision, "ADDITIONAL_DATA_REQUIRED");
  assert.deepEqual(
    a.missing.map((m: any) => m.key),
    ["accounts"],
  );
  assert.equal(cabinetAvailable(y.uid), false);
});
test("anonymous refusal/alternative and compliance refusal cannot bypass the bank pipeline", async () => {
  try {
    capacity = 1500000;
    const x = await guest();
    let a = await submit(x, await prepare(x));
    assert.equal(a.decision, "DECLINED");
    assert.equal(a.alternatives.length, 1);
    a = (
      await x.client
        .post(`/api/mvp2/applications/${a.id}/alternative`)
        .send({ version: a.version, optionId: a.alternatives[0].id })
        .expect(202)
    ).body;
    await waitMvp(a.id);
    a = (await x.client.get(`/api/mvp2/applications/${a.id}`)).body;
    assert.equal(a.decision, "APPROVED");
    assert.equal(cabinetAvailable(x.uid), false);
  } finally {
    capacity = 10000000;
  }
  const y = await guest();
  const a = await submit(y, await prepare(y, 3000000, "9900000002"));
  assert.equal(a.decision, "DECLINED");
  assert.equal(a.alternatives.length, 0);
  assert.equal(cabinetAvailable(y.uid), false);
});

test("Restart gives a fresh owner and empty onboarding without deleting dossiers or touching another visitor", async () => {
  await request(app).post("/api/journey/restart").send({}).expect(401);
  const x = await guest(),
    other = await guest();
  const a = await prepare(x, 3000000, "9900000001", false);
  await x.client
    .put("/api/journey/position")
    .send({ applicationId: a.id, view: "questionnaire", section: 2 })
    .expect(200);
  const before = db.prepare("SELECT * FROM applications WHERE id=?").get(a.id);
  const dossier = db
    .prepare("SELECT data FROM mvp2_dossiers WHERE application_id=?")
    .get(a.id)!.data;
  const stateBefore = db
    .prepare("SELECT state FROM users WHERE id=?")
    .get(x.uid)!.state;
  await x.client.post("/api/journey/restart").send({}).expect(409);
  await x.client
    .post("/api/journey/restart")
    .set("X-Journey-Workspace", other.uid)
    .send({})
    .expect(409);
  const restart = await x.client
    .post("/api/journey/restart")
    .set("X-Journey-Workspace", x.uid)
    .send({})
    .expect(200);
  assert.notEqual(restart.body.workspaceId, x.uid);
  assert.equal(restart.body.next, "/");
  assert.match(restart.headers["set-cookie"][0], /HttpOnly/);
  const config = (await x.client.get("/api/config")).body;
  assert.equal(config.anonymous, true);
  assert.equal(config.cabinetAvailable, false);
  assert.equal(config.workspaceId, restart.body.workspaceId);
  assert.equal(
    (await x.client.get("/api/state")).body.profile.mvp2Answers,
    undefined,
  );
  const fresh = (await x.client.get("/api/journey")).body;
  assert.equal(fresh.onboarding, null);
  assert.equal(fresh.onboardingStep, 0);
  assert.equal(fresh.applicationId, null);
  await request(app).get("/api/state").set("Cookie", x.cookie).expect(401);
  await x.client.get(`/api/mvp2/applications/${a.id}`).expect(404);
  await x.client.get(`/api/journey/draft/${a.id}`).expect(404);
  assert.deepEqual(
    db.prepare("SELECT * FROM applications WHERE id=?").get(a.id),
    before,
  );
  assert.equal(
    db
      .prepare("SELECT data FROM mvp2_dossiers WHERE application_id=?")
      .get(a.id)!.data,
    dossier,
  );
  assert.equal(
    db.prepare("SELECT state FROM users WHERE id=?").get(x.uid)!.state,
    stateBefore,
  );
  assert.equal(
    (await other.client.get("/api/config")).body.workspaceId,
    other.uid,
  );
  // A second click/old-tab keepalive must not rotate again or overwrite the fresh answers.
  await x.client
    .post("/api/journey/restart")
    .set("X-Journey-Workspace", x.uid)
    .send({})
    .expect(409);
  await x.client
    .put("/api/journey/onboarding")
    .set("X-Journey-Workspace", x.uid)
    .send({ answers, step: 2 })
    .expect(409);
  await x.client
    .post("/api/journey/complete")
    .set("X-Journey-Workspace", x.uid)
    .send({ answers })
    .expect(409);
  assert.deepEqual((await x.client.get("/api/journey")).body, fresh);
  const next = (
    await x.client.post("/api/journey/complete").send({ answers }).expect(200)
  ).body;
  assert.notEqual(next.id, a.id);
  assert.equal(next.company, undefined);
  assert.equal(next.questionnaire.inn, "");
});

test("Restart during scoring leaves the old pipeline intact but cannot restore it into the new journey", async () => {
  const previous = httpCoreClient.score;
  let resolve!: (value: any) => void;
  let called!: () => void;
  const entered = new Promise<void>((r) => {
    called = r;
  });
  httpCoreClient.score = async () => {
    called();
    return await new Promise<any>((r) => {
      resolve = r;
    });
  };
  const x = await guest();
  let a: any;
  try {
    a = await prepare(x);
    await x.client
      .post(`/api/mvp2/applications/${a.id}/submit`)
      .send({ version: a.version })
      .expect(202);
    await entered;
    await x.client
      .post("/api/journey/restart")
      .set("X-Journey-Workspace", x.uid)
      .send({})
      .expect(200);
    resolve({
      core_result: {
        core_id: "liza",
        core: {
          stops_fired: [],
          missing: [],
          flow_month_rub: 1000000,
          limit_now_rub: 10000000,
        },
      },
    });
    await waitMvp(a.id);
    assert.equal(
      JSON.parse(
        String(
          db
            .prepare("SELECT data FROM mvp2_dossiers WHERE application_id=?")
            .get(a.id)!.data,
        ),
      ).decision,
      "APPROVED",
    );
    assert.equal((await x.client.get("/api/journey")).body.applicationId, null);
    assert.deepEqual((await x.client.get("/api/mvp2/applications")).body, []);
  } finally {
    if (resolve)
      resolve({
        core_result: {
          core_id: "liza",
          core: {
            stops_fired: [],
            missing: [],
            flow_month_rub: 1000000,
            limit_now_rub: 10000000,
          },
        },
      });
    if (a) await waitMvp(a.id);
    httpCoreClient.score = previous;
  }
});
