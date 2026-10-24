import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import request from "supertest";
import {
  products,
  initialQuestionnaire,
  recommend,
  type OnboardingAnswers,
  type MvpApplication,
  type ProductId,
} from "../shared/mvp2";
import { parseStatement, aggregateStatements } from "../server/mvp2-statements";
import { cabinetSnapshot } from "../shared/cabinet";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "alfa-mvp2-test-")),
  "test.sqlite",
);
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app");
const { db, stateOf, createUser, session } = await import("../server/store");
const { httpCoreClient } = await import("../server/applications");
const { waitMvp } = await import("../server/mvp2");
const original = httpCoreClient.score;
const answers: OnboardingAnswers = {
  industry: "Производство",
  age: "Более 3 лет",
  purpose: "Текущие расходы",
  amountRange: "1–3 млн ₽",
  term: 12,
  usage: "Всё сразу",
  repayment: "Регулярная выручка",
};
let serial = 0;
const scoreCalls: unknown[] = [];
before(() => {
  httpCoreClient.score = async (input: any) => {
    scoreCalls.push(input);
    const negative = input.statement_csv.includes("NEGATIVE");
    return {
      core_result: {
        core_id: "liza",
        core: {
          status: "можно подавать",
          stops_fired: negative ? ["NO_FREE_CASHFLOW"] : [],
          missing: input.statement_csv.includes("CONCENTRATED")
            ? ["contract_main_customer", "reconciliation_act"]
            : [],
          flow_month_rub: 1000000,
          limit_now_rub: input.statement_csv.includes("LOWLIMIT")
            ? 1500000
            : 10000000,
        },
      },
    };
  };
});
after(() => {
  httpCoreClient.score = original;
  db.close();
});
export function syntheticCsv(marker = "", debt = 0) {
  const rows = ["date,amount,counterparty,purpose,kind"];
  const today = new Date();
  for (let i = 12; i >= 1; i--) {
    const month = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 10),
    )
      .toISOString()
      .slice(0, 10);
    for (let n = 0; n < 4; n++)
      rows.push(
        `${month},500000,ООО Заказчик ${n},Оплата товаров ${marker},operating`,
      );
    rows.push(`${month},-500000,ООО Поставщик,Оплата материалов,operating`);
    if (debt) rows.push(`${month},-${debt},Банк,Погашение кредита,debt`);
  }
  return rows.join("\n");
}
async function owner() {
  const phone = "7900777" + String(++serial).padStart(4, "0");
  const uid = createUser(phone, "Synthetic-test-123", {
    name: "Учебный бизнес",
    form: "ООО",
    stage: "operating",
    registered: true,
    sector: "Производство",
    ageBand: "Более 3 лет",
    result: "Не указан",
    debt: "Нет",
    intent: "Подбор",
    mvp2Answers: answers,
  });
  const agent = request.agent(app);
  agent.set("Cookie", `alfa_session=${session(uid)}`);
  return { agent, uid };
}
async function draft(
  options: {
    amount?: number;
    productId?: ProductId;
    inn?: string;
    industry?: string;
    marker?: string;
    csv?: boolean;
    debt?: number;
    manualDebt?: number;
  } = {},
) {
  const { agent, uid } = await owner();
  let a: MvpApplication = (
    await agent
      .post("/api/mvp2/applications")
      .send({
        onboarding: {
          ...answers,
          industry: options.industry ?? answers.industry,
        },
      })
      .expect(201)
  ).body;
  let q = {
    ...a.questionnaire,
    amount: options.amount ?? 3000000,
    productId: options.productId ?? "WORKING",
    inn: options.inn ?? "9900000001",
    consents: { registry: true, financial: true, bki: true },
    authorized: true,
    complete: "yes",
    loans: options.manualDebt || options.productId === "REFI" ? "yes" : "no",
    leasing: "no",
    debt:
      options.productId === "REFI" ? 3000000 : options.manualDebt ? 200000 : 0,
    monthlyDebt:
      options.productId === "REFI" ? 150000 : (options.manualDebt ?? 0),
    debtReconciled: options.productId === "REFI",
    neededAt: "До месяца",
    projectCost: 7000000,
    cycleDays: 30,
    tranches: "По 500 000 ₽ ежемесячно",
    oldBalance: 3000000,
    oldRate: 25,
    oldPayment: 150000,
  } as MvpApplication["questionnaire"];
  q.accounts[0].bank = "Учебный банк";
  a = (
    await agent
      .put(`/api/mvp2/applications/${a.id}`)
      .send({ version: a.version, questionnaire: q })
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
        questionnaire: { ...a.questionnaire, companyConfirmed: true },
      })
      .expect(200)
  ).body;
  if (options.csv !== false)
    a = (
      await agent
        .post(`/api/mvp2/applications/${a.id}/statements`)
        .field("version", String(a.version))
        .field("accountId", "account-1")
        .attach(
          "file",
          Buffer.from(syntheticCsv(options.marker, options.debt)),
          "statement.csv",
        )
        .expect(200)
    ).body;
  return { agent, uid, a };
}
async function submit(
  agent: ReturnType<typeof request.agent>,
  a: MvpApplication,
) {
  await agent
    .post(`/api/mvp2/applications/${a.id}/submit`)
    .send({ version: a.version })
    .expect(202);
  await waitMvp(a.id);
  return (await agent.get(`/api/mvp2/applications/${a.id}`).expect(200))
    .body as MvpApplication;
}
async function contract(
  agent: ReturnType<typeof request.agent>,
  a: MvpApplication,
) {
  return (
    await agent
      .post(`/api/mvp2/applications/${a.id}/contract-details`)
      .send({
        version: a.version,
        details: {
          signatory: "Синтетический Представитель",
          authority: "Устав учебной организации",
          receivingAccount: "40702810000000000001",
          receivingBank: "Учебный банк",
        },
      })
      .expect(200)
  ).body as MvpApplication;
}
test("catalog has exactly six fixed products; onboarding selection is not a score", () => {
  assert.equal(products.length, 6);
  assert.equal(products.find((p) => p.id === "WORKING")!.rate, 23.5);
  assert.equal(
    recommend({ ...answers, usage: "Многократная выборка и возврат" }),
    "RCL",
  );
  assert.equal(initialQuestionnaire(answers).term, 12);
});
test("CSV normalizes Russian dates/headers, rejects malformed input, preserves separate account transactions", () => {
  const s = parseStatement(
    Buffer.from(
      "дата;сумма;контрагент;назначение\n10.01.2025;1 234,50;Покупатель;Оплата",
    ),
    "a.csv",
    "1",
  );
  assert.equal(s.records[0].amount, 1234.5);
  assert.throws(
    () =>
      parseStatement(
        Buffer.from("date,amount,counterparty,purpose\n2025-02-30,100,x,x"),
        "x.csv",
        "1",
      ),
    /Строка/,
  );
  assert.throws(() => parseStatement(Buffer.from("x"), "x.pdf", "1"), /CSV/);
  const one = { ...s, id: "a" },
    two = { ...s, id: "b", hash: "another", accountId: "2" };
  assert.equal(aggregateStatements([one, two]).records.length, 2);
  assert.equal(aggregateStatements([one, one]).records.length, 1);
});
test("exactly 3m: real persisted pipeline, separate signature/activation, one disbursement and existing cabinet", async () => {
  const x = await draft();
  let a = await submit(x.agent, x.a);
  assert.equal(a.decision, "APPROVED");
  assert.ok(a.stages.every((s) => s.status === "done"));
  await x.agent
    .post(`/api/mvp2/applications/${a.id}/activate`)
    .send({})
    .expect(409);
  await x.agent
    .post(`/api/applications/${a.id}/events`)
    .set("Idempotency-Key", "bypass")
    .send({ event: "sign", expectedVersion: a.version })
    .expect(409);
  a = await contract(x.agent, a);
  const unsigned = await x.agent
    .get(`/api/mvp2/applications/${a.id}/documents/contract`)
    .expect(200);
  assert.match(unsigned.headers["content-type"], /pdf/);
  await x.agent
    .post(`/api/mvp2/applications/${a.id}/sign`)
    .send({ hash: "a".repeat(64), confirmed: true })
    .expect(409);
  a = (
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/sign`)
      .send({ hash: a.contract!.hash, confirmed: true })
      .expect(200)
  ).body;
  assert.equal(a.lifecycle, "SIGNED_DEMO");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM mvp2_disbursements WHERE application_id=?",
      )
      .get(a.id)!.n,
    0,
  );
  await Promise.all([
    x.agent
      .post(`/api/mvp2/applications/${a.id}/activate`)
      .send({})
      .expect(200),
    x.agent
      .post(`/api/mvp2/applications/${a.id}/activate`)
      .send({})
      .expect(200),
  ]);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM mvp2_disbursements WHERE application_id=?",
      )
      .get(a.id)!.n,
    1,
  );
  const s = stateOf(x.uid),
    snapshot = cabinetSnapshot(s);
  assert.equal(snapshot.facility?.id, a.id);
  assert.equal(snapshot.facility?.balance, 3000000);
  const expected = snapshot.facility!.events;
  assert.equal(expected.at(-1)!.balance, 0);
  assert.equal(
    Math.round(expected.reduce((n, r) => n + r.principal, 0)),
    3000000,
  );
  const { contractSchedule } = await import("../server/mvp2-contracts");
  assert.deepEqual(
    contractSchedule(a).map(({ id, ...r }) => r),
    expected.map(({ id, ...r }) => r),
  );
  const signed = await x.agent
    .get(`/api/mvp2/applications/${a.id}/documents/contract`)
    .expect(200);
  assert.notEqual(unsigned.headers.etag, signed.headers.etag);
  const other = await owner();
  await other.agent
    .get(`/api/mvp2/applications/${a.id}/documents/contract`)
    .expect(404);
  await other.agent.get(`/api/mvp2/applications/${a.id}`).expect(404);
});
test("3,000,001: manager route cannot sign/activate, slot persists, manager role required", async () => {
  const x = await draft({ amount: 3000001 });
  let a = await submit(x.agent, x.a);
  assert.equal(a.decision, "MANAGER_REVIEW_REQUIRED");
  await x.agent
    .post(`/api/mvp2/applications/${a.id}/contract`)
    .send({ version: a.version })
    .expect(409);
  await x.agent
    .post(`/api/mvp2/applications/${a.id}/activate`)
    .send({})
    .expect(409);
  const slots = (await x.agent.get("/api/mvp2/slots").expect(200)).body;
  a = (
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/meeting`)
      .send({ version: a.version, slotId: slots[0].id })
      .expect(200)
  ).body;
  assert.equal(
    (await x.agent.get(`/api/mvp2/applications/${a.id}`)).body.meeting.slotId,
    slots[0].id,
  );
  await x.agent
    .post(`/api/mvp2/manager/${a.id}/decision`)
    .send({
      version: a.version,
      decision: "APPROVED",
      reason: "Проверено на встрече",
    })
    .expect(403);
  const manager = await owner();
  db.prepare("UPDATE users SET role='manager' WHERE id=?").run(manager.uid);
  a = (
    await manager.agent
      .post(`/api/mvp2/manager/${a.id}/decision`)
      .send({
        version: a.version,
        decision: "APPROVED",
        reason: "Проверено на учебной встрече",
      })
      .expect(200)
  ).body;
  assert.equal(a.lifecycle, "MANAGER_APPROVED");
  a = await contract(x.agent, a);
  assert.equal(a.lifecycle, "CONTRACT_READY");
});
test("missing CSV asks only for accounts; supplement reruns pipeline without repeating company", async () => {
  const x = await draft({ csv: false });
  let a = await submit(x.agent, x.a);
  assert.equal(a.decision, "ADDITIONAL_DATA_REQUIRED");
  assert.deepEqual(
    a.missing.map((m) => m.key),
    ["accounts"],
  );
  await x.agent
    .put(`/api/mvp2/applications/${a.id}`)
    .send({
      version: a.version,
      questionnaire: { ...a.questionnaire, amount: 1000000 },
    })
    .expect(422);
  a = (
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/statements`)
      .field("version", String(a.version))
      .field("accountId", "account-1")
      .attach("file", Buffer.from(syntheticCsv()), "statement.csv")
      .expect(200)
  ).body;
  a = await submit(x.agent, a);
  assert.equal(a.decision, "APPROVED");
  assert.equal(a.company?.inn, "9900000001");
});
test("manager requests a concrete field; supplementation preserves the booked meeting", async () => {
  const x = await draft({ amount: 3000001 });
  let a = await submit(x.agent, x.a);
  const slots = (await x.agent.get("/api/mvp2/slots")).body;
  a = (
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/meeting`)
      .send({
        version: a.version,
        slotId: slots[0].id,
      })
      .expect(200)
  ).body;
  const meeting = a.meeting;
  const manager = await owner();
  db.prepare("UPDATE users SET role='manager' WHERE id=?").run(manager.uid);
  await manager.agent
    .post(`/api/mvp2/manager/${a.id}/decision`)
    .send({
      version: a.version,
      decision: "ADDITIONAL_DATA_REQUIRED",
      reason: "Уточните деятельность",
    })
    .expect(422);
  a = (
    await manager.agent
      .post(`/api/mvp2/manager/${a.id}/decision`)
      .send({
        version: a.version,
        decision: "ADDITIONAL_DATA_REQUIRED",
        reason: "Уточните деятельность",
        missingKey: "actualIndustry",
      })
      .expect(200)
  ).body;
  assert.deepEqual(
    a.missing.map((x) => x.key),
    ["actualIndustry"],
  );
  a = (
    await x.agent
      .put(`/api/mvp2/applications/${a.id}`)
      .send({
        version: a.version,
        questionnaire: {
          ...a.questionnaire,
          actualIndustry: "Производство оборудования",
        },
      })
      .expect(200)
  ).body;
  a = await submit(x.agent, a);
  assert.equal(a.lifecycle, "MEETING_SCHEDULED");
  assert.deepEqual(a.meeting, meeting);
});
test("compliance block outranks missing financial data; no raw flags or alternatives exposed", async () => {
  const x = await draft({ inn: "9900000002", csv: false });
  const a = await submit(x.agent, x.a);
  assert.equal(a.decision, "DECLINED");
  assert.equal(a.alternatives.length, 0);
  assert.doesNotMatch(
    JSON.stringify(a),
    /FNS_UNRELIABLE|overdue90|requiresReview/,
  );
});
test("financial rejection offers only recalculated alternative and accepting creates new evaluation", async () => {
  const x = await draft({ marker: "LOWLIMIT" });
  let a = await submit(x.agent, x.a);
  assert.equal(a.decision, "DECLINED");
  assert.equal(a.alternatives.length, 1);
  const version = a.version;
  a = (
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/alternative`)
      .send({ version, optionId: a.alternatives[0].id })
      .expect(202)
  ).body;
  assert.equal(a.lifecycle, "SUBMITTED");
  await waitMvp(a.id);
  a = (await x.agent.get(`/api/mvp2/applications/${a.id}`)).body;
  assert.equal(a.decision, "APPROVED");
  assert.ok(a.version > version);
});
test("credit and leasing payments already in CSV are not deducted twice", async () => {
  const x = await draft({ debt: 100000, manualDebt: 100000 });
  const a = await submit(x.agent, x.a);
  assert.equal(a.financial?.uncoveredDebt, 0);
  assert.equal(a.financial?.flow, 1000000);
  const y = await draft({ debt: 100000, manualDebt: 200000 });
  let b = await submit(y.agent, y.a);
  assert.equal(b.decision, "ADDITIONAL_DATA_REQUIRED");
  assert.ok(b.missing.some((m) => m.key === "debtReconciled"));
  b = (
    await y.agent
      .put(`/api/mvp2/applications/${b.id}`)
      .send({
        version: b.version,
        questionnaire: { ...b.questionnaire, debtReconciled: true },
      })
      .expect(200)
  ).body;
  b = await submit(y.agent, b);
  assert.equal(b.financial?.uncoveredDebt, 100000);
  assert.equal(b.financial?.flow, 900000);
});
test("all six products use catalog rates; limits open without fictitious debt or annuities", async () => {
  for (const product of products) {
    const x = await draft({ productId: product.id, amount: 1000000 });
    let a = await submit(x.agent, x.a);
    assert.equal(a.decision, "APPROVED", product.id);
    a = await contract(x.agent, a);
    a = (
      await x.agent
        .post(`/api/mvp2/applications/${a.id}/sign`)
        .send({ hash: a.contract!.hash, confirmed: true })
    ).body;
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/activate`)
      .send({})
      .expect(200);
    const f = stateOf(x.uid).cabinet!.facility!;
    assert.equal(f.rate, product.rate);
    assert.equal(f.balance, product.kind === "loan" ? 1000000 : 0);
    assert.equal(f.events.length, product.kind === "loan" ? 12 : 0);
  }
});
test("core outages do not produce an approval; answers persist and retry is available", async () => {
  const saved = httpCoreClient.score;
  try {
    httpCoreClient.score = async () => {
      throw new Error("offline");
    };
    const x = await draft();
    const a = await submit(x.agent, x.a);
    assert.equal(a.decision, undefined);
    assert.equal(a.lifecycle, "DRAFT");
    assert.ok(a.error);
    assert.equal(a.questionnaire.amount, 3000000);
  } finally {
    httpCoreClient.score = saved;
  }
});
test("core follow-ups ask concrete structured facts and do not boost current capacity", async () => {
  const x = await draft({ marker: "CONCENTRATED" });
  let a = await submit(x.agent, x.a);
  assert.equal(a.decision, "ADDITIONAL_DATA_REQUIRED");
  assert.deepEqual(
    a.missing.map((x) => x.key).sort(),
    [
      "customerContractAmount",
      "customerContractMonths",
      "reconciliationReference",
    ].sort(),
  );
  const limit = a.financial!.limit;
  a = (
    await x.agent
      .put(`/api/mvp2/applications/${a.id}`)
      .send({
        version: a.version,
        questionnaire: {
          ...a.questionnaire,
          customerContractAmount: 12000000,
          customerContractMonths: 12,
          reconciliationReference: "Акт № 1 от 01.10.2026",
        },
      })
      .expect(200)
  ).body;
  a = await submit(x.agent, a);
  assert.equal(a.decision, "APPROVED");
  assert.equal(a.financial!.limit, limit);
  assert.equal(a.provenance.customerContractAmount.source, "USER_CONFIRMED");
});
test("industry conflict asks a specific field, preserves registry and rejects stale edits", async () => {
  const x = await draft({ industry: "IT" });
  let a = await submit(x.agent, x.a);
  assert.equal(a.decision, "ADDITIONAL_DATA_REQUIRED");
  assert.ok(a.missing.some((m) => m.key === "actualIndustry"));
  a = (
    await x.agent
      .put(`/api/mvp2/applications/${a.id}`)
      .send({
        version: a.version,
        questionnaire: {
          ...a.questionnaire,
          actualIndustry: "Производство с собственным IT-продуктом",
        },
      })
      .expect(200)
  ).body;
  await x.agent
    .put(`/api/mvp2/applications/${a.id}`)
    .send({ version: a.version - 1, questionnaire: a.questionnaire })
    .expect(409);
  a = await submit(x.agent, a);
  assert.equal(a.company?.okved, "31.09");
  assert.equal(a.onboarding.industry, "IT");
  assert.equal(a.decision, "APPROVED");
});
test("two accounts in one bank, duplicate upload protection, and internal transfer elimination", async () => {
  const x = await draft({ csv: false });
  let a = x.a;
  a = (
    await x.agent
      .put(`/api/mvp2/applications/${a.id}`)
      .send({
        version: a.version,
        questionnaire: {
          ...a.questionnaire,
          accounts: [
            ...a.questionnaire.accounts,
            { id: "second", bank: "Учебный банк", number: "2", documentId: "" },
          ],
        },
      })
      .expect(200)
  ).body;
  const source = syntheticCsv();
  a = (
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/statements`)
      .field("version", String(a.version))
      .field("accountId", "account-1")
      .attach("file", Buffer.from(source), "one.csv")
      .expect(200)
  ).body;
  await x.agent
    .post(`/api/mvp2/applications/${a.id}/statements`)
    .field("version", String(a.version))
    .field("accountId", "second")
    .attach("file", Buffer.from(source), "same.csv")
    .expect(422);
  a = (
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/statements`)
      .field("version", String(a.version))
      .field("accountId", "second")
      .attach(
        "file",
        Buffer.from(source.replaceAll("500000", "600000")),
        "two.csv",
      )
      .expect(200)
  ).body;
  const repeated = (
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/statements`)
      .field("version", String(a.version))
      .field("accountId", "second")
      .attach(
        "file",
        Buffer.from(source.replaceAll("500000", "600000")),
        "two.csv",
      )
      .expect(200)
  ).body;
  assert.equal(repeated.version, a.version);
  a = await submit(x.agent, a);
  assert.equal(a.decision, "APPROVED");
  assert.equal(a.questionnaire.accounts.length, 2);
  assert.ok((scoreCalls.at(-1) as any).statement_csv.includes("600000"));
  const one = parseStatement(
    Buffer.from(
      source + "\n2026-09-22,-50000,Свой счёт,Между своими счетами,transfer",
    ),
    "one.csv",
    "one",
  );
  const two = parseStatement(
    Buffer.from(
      source.replaceAll("500000", "600000") +
        "\n2026-09-22,50000,Свой счёт,Между своими счетами,transfer",
    ),
    "two.csv",
    "two",
  );
  assert.equal(
    aggregateStatements([
      { ...one, id: "1" },
      { ...two, id: "2" },
    ]).records.length,
    120,
  );
  const forged = parseStatement(
    Buffer.from(
      "date,amount,counterparty,purpose,kind\n2026-09-01,-50000,Поставщик,Оплата товара,transfer",
    ),
    "forged.csv",
    "forged",
  );
  assert.equal(
    aggregateStatements([{ ...forged, id: "forged" }]).records.length,
    1,
  );
});
test("server recalculation creates new version and cannot bypass a compliance block", async () => {
  const x = await draft();
  let a = await submit(x.agent, x.a),
    version = a.version;
  a = (
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/recalculate`)
      .send({
        version,
        terms: { amount: 3000001, term: 12, productId: "WORKING" },
      })
      .expect(202)
  ).body;
  assert.equal(a.lifecycle, "SUBMITTED");
  await waitMvp(a.id);
  a = (await x.agent.get(`/api/mvp2/applications/${a.id}`)).body;
  assert.equal(a.decision, "MANAGER_REVIEW_REQUIRED");
  assert.ok(a.version > version);
  const y = await draft({ inn: "9900000002" });
  const blocked = await submit(y.agent, y.a);
  await y.agent
    .post(`/api/mvp2/applications/${blocked.id}/recalculate`)
    .send({
      version: blocked.version,
      terms: { amount: 300000, term: 12, productId: "WORKING" },
    })
    .expect(409);
});
test("contextual chat uses the existing provider/session with sanitized facts in all four decisions; no fake fallback", async () => {
  const previous = process.env.TEAM_AGENT_URL,
    previousProvider = process.env.AI_PROVIDER;
  let received: any,
    broken = false;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    received = JSON.parse(body);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        broken
          ? {}
          : { text: "Ответ тестового транспорта, не финансовая оценка" },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  process.env.TEAM_AGENT_URL = `http://127.0.0.1:${addr.port}`;
  delete process.env.AI_PROVIDER;
  try {
    for (const options of [
      {},
      { amount: 3000001 },
      { csv: false },
      { inn: "9900000002" },
    ]) {
      const x = await draft(options);
      const a = await submit(x.agent, x.a);
      const chat = (
        await x.agent
          .post(`/api/mvp2/applications/${a.id}/chat`)
          .send({ section: 4 })
          .expect(200)
      ).body;
      await x.agent
        .post(`/api/mvp2/applications/${a.id}/chat`)
        .send({
          text: `Объясни результат для ${a.company!.name}, ИНН ${a.company!.inn}, счёт 40702810000000000001`,
        })
        .expect(200);
      assert.equal(received.session_id, chat.id);
      assert.equal(received.card.application.status, a.decision);
      assert.match(received.text, /Контекст приложения/);
      assert.doesNotMatch(
        JSON.stringify(received),
        /9900000001|9900000002|40702810000000000001|Мок Мастерская|Мок Архив/,
      );
    }
    const x = await draft();
    const a = await submit(x.agent, x.a);
    broken = true;
    await x.agent
      .post(`/api/mvp2/applications/${a.id}/chat`)
      .send({ text: "Объясни решение" })
      .expect(503);
    assert.equal(
      stateOf(x.uid)
        .chats.find(
          (c) => c.selectionId === a.id && c.title === "Обсуждение заявки",
        )!
        .messages.filter((m) => m.role === "assistant").length,
      0,
    );
  } finally {
    if (previous === undefined) delete process.env.TEAM_AGENT_URL;
    else process.env.TEAM_AGENT_URL = previous;
    if (previousProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousProvider;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test(
  "live unchanged Liza core: automatic, manager and refinancing financial adapter",
  { skip: !process.env.MVP2_LIVE_CORE_URL },
  async () => {
    const saved = httpCoreClient.score,
      url = process.env.TEAM_API_URL;
    try {
      httpCoreClient.score = original;
      process.env.TEAM_API_URL = process.env.MVP2_LIVE_CORE_URL;
      for (const [amount, product, decision] of [
        [3000000, "WORKING", "APPROVED"],
        [3000001, "WORKING", "MANAGER_REVIEW_REQUIRED"],
        [1000000, "REFI", "APPROVED"],
      ] as const) {
        const x = await draft({ amount, productId: product });
        const a = await submit(x.agent, x.a);
        assert.equal(
          a.decision,
          decision,
          JSON.stringify({
            product,
            reasons: a.reasons,
            error: a.error,
            missing: a.missing,
          }),
        );
        assert.ok(a.financial!.flow > 0);
        const row = db
          .prepare(
            "SELECT core_result FROM mvp2_revisions WHERE application_id=? AND core_result IS NOT NULL ORDER BY version DESC",
          )
          .get(a.id)!;
        assert.equal(JSON.parse(row.core_result as string).core_id, "liza");
      }
    } finally {
      httpCoreClient.score = saved;
      if (url === undefined) delete process.env.TEAM_API_URL;
      else process.env.TEAM_API_URL = url;
    }
  },
);
