import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applicationHelp, referenceAnswer } from "../shared/application-help";
import { questionnaireErrors } from "../shared/mvp2";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "mvp2-ui3-unit-")),
  "test.sqlite",
);
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app");
const { db } = await import("../server/store");
after(() => db.close());
const answers = {
  industry: "Производство",
  age: "Более 3 лет",
  purpose: "Текущие расходы",
  amountRange: "1–3 млн ₽",
  amount: 1000000,
  term: 12,
  usage: "Всё сразу",
  repayment: "Регулярная выручка",
};
async function create() {
  const c = request.agent(app);
  await c.post("/api/journey/session").send({}).expect(200);
  const a = (
    await c.post("/api/journey/complete").send({ answers }).expect(200)
  ).body;
  return { c, a };
}
test("Each contextual hint produces a cited reference, not a fabricated LLM answer or decision", async () => {
  const { c, a } = await create();
  const path = `/api/mvp2/applications/${a.id}/chat`;
  for (const hint of applicationHelp) {
    const section = hint.sections[0];
    await c
      .post(path)
      .send({ section, activeField: "inn", validationFields: ["inn"] })
      .expect(200);
    const reply = await c
      .post(path)
      .send({ section, promptId: hint.id, text: hint.question })
      .expect(200);
    const m = reply.body.messages.at(-1);
    assert.equal(m.mode, "application-reference");
    assert.match(m.text, /Источник:/);
    assert.match(m.text, /Это справка, не новое решение/);
    assert.equal(reply.body.messages.at(-2).text, hint.question);
  }
  const before = (await c.post(path).send({ section: 0 })).body.messages.length;
  await c
    .post(path)
    .send({ section: 0, promptId: "company", text: "Измени кредитное решение" })
    .expect(422);
  assert.equal(
    (await c.post(path).send({ section: 0 })).body.messages.length,
    before,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usage").get()!.n, 0);
  const offline = await c
    .post(path)
    .send({ text: "Расскажи индивидуально о моём бизнесе" })
    .expect(503);
  assert.match(offline.body.error, /сохранён/);
  const saved = (await c.post(path).send({ section: 1 })).body;
  const user = saved.messages.at(-1);
  await c.post(path).send({ retryMessageId: user.id }).expect(503);
  assert.equal(
    (await c.post(path).send({ section: 1 })).body.messages.length,
    before + 1,
  );
});
test("Reference answers use only persisted terms and preserve unavailable-data states", async () => {
  const { a } = await create();
  assert.match(referenceAnswer("terms", a, 4)!, /1\s000\s000/);
  assert.match(referenceAnswer("decision", a, 0)!, /Решения.*пока нет/);
  assert.match(referenceAnswer("missing", a, 0)!, /запроса.*пока нет/);
  a.questionnaire.amount = 0;
  assert.match(referenceAnswer("terms", a, 4)!, /не выбрана/);
  assert.equal(questionnaireErrors(a.questionnaire, 2).loans, undefined);
  assert.equal(questionnaireErrors(a.questionnaire, 2).leasing, undefined);
});
test("CSV cards expose literal period totals; removal is versioned, owner-scoped and does not retain active figures", async () => {
  const { c, a } = await create();
  const path = `/api/mvp2/applications/${a.id}`;
  let current = (
    await c
      .put(path)
      .send({
        version: a.version,
        questionnaire: {
          ...a.questionnaire,
          consents: { registry: true, financial: true, bki: true },
          accounts: [
            { ...a.questionnaire.accounts[0], bank: "Один банк" },
            { id: "second", bank: "Один банк", number: "", documentId: "" },
          ],
        },
      })
      .expect(200)
  ).body;
  const upload = async (accountId: string, csv: string) => {
    current = (
      await c
        .post(path + "/statements")
        .field("version", String(current.version))
        .field("accountId", accountId)
        .attach("file", Buffer.from(csv), "cash.csv")
        .expect(200)
    ).body;
  };
  await upload(
    current.questionnaire.accounts[0].id,
    "date,amount,counterparty,purpose\n2026-01-15,200000,Клиент,Продажа\n2026-02-15,300000,Клиент,Продажа\n2026-02-16,-120000,Поставщик,Закупка",
  );
  await upload(
    "second",
    "date,amount,counterparty,purpose\n2026-01-16,123000,Клиент,Продажа\n2026-02-16,-23000,Поставщик,Закупка",
  );
  const list = (await c.get(path + "/statements")).body;
  assert.equal(list.length, 2);
  const first = list.find((s: any) => s.operations === 3);
  assert.equal(first.extracted.inflow, 500000);
  assert.equal(first.extracted.outflow, 120000);
  assert.equal(first.months.length, 2);
  assert.match(first.extracted.source, /за указанный период/);
  const other = await create();
  await other.c
    .delete(path + "/statements/" + first.id)
    .send({ version: current.version })
    .expect(404);
  await c
    .delete(path + "/statements/" + first.id)
    .send({ version: current.version - 1 })
    .expect(409);
  current = (
    await c
      .delete(path + "/statements/" + first.id)
      .send({ version: current.version })
      .expect(200)
  ).body;
  assert.equal(current.questionnaire.accounts[0].documentId, "");
  assert.equal((await c.get(path + "/statements")).body.length, 1);
  assert.equal(
    db.prepare("SELECT id FROM mvp2_statements WHERE id=?").get(first.id),
    undefined,
  );
  const accountId = current.questionnaire.accounts[1].id;
  current = (
    await c
      .put(path)
      .send({
        version: current.version,
        questionnaire: {
          ...current.questionnaire,
          accounts: current.questionnaire.accounts.filter(
            (x: any) => x.id !== accountId,
          ),
        },
      })
      .expect(200)
  ).body;
  assert.deepEqual((await c.get(path + "/statements")).body, []);
});
