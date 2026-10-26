import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { makeSchedule } from "../server/cabinet";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "anticredit-")),
  "test.sqlite",
);
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app");
const { db, createUser, session } = await import("../server/store");
const { httpCoreClient } = await import("../server/applications");
const { waitMvp } = await import("../server/mvp2");
const original = httpCoreClient.score;

const onboarding = {
  industry: "Производство",
  age: "Более 3 лет",
  purpose: "Текущие расходы",
  amountRange: "1–3 млн ₽",
  term: 12,
  usage: "Всё сразу",
  repayment: "Регулярная выручка",
};
function csv() {
  const rows = ["date,amount,counterparty,purpose,kind"];
  const today = new Date();
  for (let i = 12; i >= 1; i--) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 10),
    )
      .toISOString()
      .slice(0, 10);
    rows.push(`${date},500000,ООО Покупатель,Оплата,operating`);
    rows.push(`${date},-100000,ООО Поставщик,Закупка,operating`);
  }
  return rows.join("\n");
}
async function evaluated(flow: number) {
  httpCoreClient.score = async () =>
    ({
      core_result: {
        core_id: "liza",
        core: {
          status: "можно подавать",
          stops_fired: [],
          missing: [],
          flow_month_rub: flow,
          limit_now_rub: 10000000,
        },
      },
    }) as any;
  const uid = createUser(
    `7900888${String(Math.round(Math.random() * 9999)).padStart(4, "0")}`,
    "Synthetic-test-123",
    {
      name: "Учебный бизнес",
      form: "ООО",
      stage: "operating",
      registered: true,
      sector: "Производство",
      ageBand: "Более 3 лет",
      result: "Не указан",
      debt: "Нет",
      intent: "Подбор",
    },
  );
  const agent = request.agent(app);
  agent.set("Cookie", `alfa_session=${session(uid)}`);
  let a = (
    await agent.post("/api/mvp2/applications").send({ onboarding }).expect(201)
  ).body;
  a = (
    await agent
      .put(`/api/mvp2/applications/${a.id}`)
      .send({
        version: a.version,
        questionnaire: {
          ...a.questionnaire,
          amount: 3000000,
          productId: "WORKING",
          inn: "9900000001",
          consents: { registry: true, financial: true, bki: true },
          authorized: true,
          complete: "yes",
          loans: "no",
          leasing: "no",
          neededAt: "До месяца",
          accounts: [{ ...a.questionnaire.accounts[0], bank: "Учебный банк" }],
        },
      })
      .expect(200)
  ).body;
  a = (
    await agent
      .post(`/api/mvp2/applications/${a.id}/registry`)
      .send({ version: a.version })
      .expect(200)
  ).body;
  a = (
    await agent
      .put(`/api/mvp2/applications/${a.id}`)
      .send({
        version: a.version,
        questionnaire: {
          ...a.questionnaire,
          companyConfirmed: true,
        },
      })
      .expect(200)
  ).body;
  a = (
    await agent
      .post(`/api/mvp2/applications/${a.id}/statements`)
      .field("version", String(a.version))
      .field("accountId", "account-1")
      .attach("file", Buffer.from(csv()), "statement.csv")
      .expect(200)
  ).body;
  await agent
    .post(`/api/mvp2/applications/${a.id}/submit`)
    .send({ version: a.version })
    .expect(202);
  await waitMvp(a.id);
  a = (await agent.get(`/api/mvp2/applications/${a.id}`).expect(200)).body;
  return { agent, a };
}

test("cash flow covers need: card estimate, chat answer, deferred draft and event", async () => {
  try {
    const { agent, a } = await evaluated(1000000);
    assert.ok(a.noCredit);
    assert.equal(a.noCredit.amount, 3000000);
    assert.equal(a.noCredit.weeks, 13);
    assert.equal(
      a.noCredit.overpayment,
      Math.round(
        makeSchedule(3000000, 23.5, 12, "2026-11-26").reduce(
          (n, row) => n + row.interest + row.fees,
          0,
        ),
      ),
    );
    assert.ok(a.noCredit.overpayment > 0);
    const chat = (
      await agent
        .post(`/api/mvp2/applications/${a.id}/chat`)
        .send({ text: "Дайте кредит" })
        .expect(200)
    ).body;
    assert.match(
      chat.messages.at(-1).text,
      /Кредит может не понадобиться.*переплата/,
    );
    assert.doesNotMatch(chat.messages.at(-1).text, /оформите сейчас/i);
    const deferred = (
      await agent
        .post(`/api/mvp2/applications/${a.id}/defer-credit`)
        .send({ version: a.version })
        .expect(200)
    ).body;
    assert.equal(deferred.lifecycle, "DRAFT");
    assert.equal(deferred.clientDeferred, true);
    assert.equal(
      (
        db
          .prepare("SELECT status FROM applications WHERE id=?")
          .get(a.id) as any
      ).status,
      "draft",
    );
    assert.equal(
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM applications WHERE id=?")
          .get(a.id) as any
      ).n,
      1,
    );
    assert.equal(
      (
        db
          .prepare(
            "SELECT event FROM application_events WHERE application_id=? ORDER BY seq DESC LIMIT 1",
          )
          .get(a.id) as any
      ).event,
      "mvp2_client_deferred",
    );
  } finally {
    httpCoreClient.score = original;
  }
});

test("cash flow cannot cover need: no anticredit card", async () => {
  try {
    const { a } = await evaluated(10000);
    assert.equal(a.noCredit, undefined);
  } finally {
    httpCoreClient.score = original;
  }
});
