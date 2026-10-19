import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { day, addDays } from "../shared/cabinet";
process.env.DATABASE_PATH = ":memory:";
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app");
const a = request.agent(app),
  b = request.agent(app),
  today = day();
test("Кабинет API: договор, план, события, контекст агента, перезагрузка и изоляция", async () => {
  const profile = {
    name: "Тест",
    form: "ООО",
    stage: "operating",
    sector: "Услуги",
    registered: true,
    ageBand: "3–5 лет",
    result: "Прибыль",
    debt: "Да",
    intent: "Подобрать финансирование",
  };
  for (const [agent, phone] of [
    [a, "+79001110001"],
    [b, "+79001110002"],
  ] as const)
    await agent
      .post("/api/auth/register")
      .send({ phone, password: "Cabinet-test-18", profile })
      .expect(200);
  await request(app).get("/api/cabinet").expect(401);
  await a.post("/api/cabinet/no-credit").send({}).expect(200);
  const before = (await a.get("/api/state")).body;
  await a.patch("/api/preferences").send({ tourDone: true });
  assert.equal((await a.get("/api/state")).body.credit, null);
  await a
    .post("/api/cabinet/facility")
    .send({
      name: "Тестовый договор",
      amount: 120000,
      balance: 100000,
      rate: 12,
      term: 12,
      firstDate: addDays(today, 3),
    })
    .expect(200);
  await a.post("/api/cabinet/no-credit").send({}).expect(409);
  await a
    .post("/api/cabinet/plan")
    .send({
      balance: 100,
      balanceDate: today,
      through: addDays(today, 29),
      source: "Подтверждённый ручной план",
      items: [],
    })
    .expect(200);
  const v = (await a.get("/api/cabinet").expect(200)).body;
  assert.ok(v.forecast.deficit > 0);
  assert.equal(v.metrics[0].value, null);
  let s = (await a.get("/api/state")).body;
  const notices = s.notifications.length;
  assert.ok(s.notifications.some((n: any) => n.type === "risk"));
  assert.equal(s.credit, null);
  assert.equal(s.chats.length, before.chats.length);
  await a.post("/api/notifications/read").send({});
  s = (await a.get("/api/state")).body;
  assert.ok(s.notifications.every((n: any) => n.read));
  assert.equal(s.notifications.length, notices);
  await a
    .post("/api/cabinet/discuss")
    .send({ chatId: s.chats[0].id, forgedAmount: 999999 })
    .expect(200);
  await a
    .post("/api/cabinet/discuss")
    .send({ chatId: s.chats[0].id })
    .expect(200);
  s = (await a.get("/api/state")).body;
  assert.equal(s.chats.length, before.chats.length);
  assert.equal(s.chats[0].cabinetContext.snapshot.facility.balance, 100000);
  const answer = await a
    .post("/api/chats/" + s.chats[0].id + "/messages")
    .send({ text: "Объясни прогноз кредитного кабинета" })
    .expect(200);
  assert.equal(answer.body.chats[0].messages.at(-1).mode, "demo");
  assert.match(answer.body.chats[0].messages.at(-1).text, /CFADS/);
  const other = (await b.get("/api/state")).body;
  assert.equal(other.cabinet, undefined);
  assert.equal(other.notifications.length, 0);
  await b
    .post("/api/cabinet/discuss")
    .send({ chatId: s.chats[0].id })
    .expect(200);
  assert.equal((await b.get("/api/state")).body.chats.length, 1);
  const payment = v.next.principal + v.next.interest;
  await a
    .post("/api/cabinet/coverage")
    .send({
      amount: payment * 1.3,
      start: today,
      end: addDays(today, 29),
      source: "Расчёт управленческого CFADS",
      methodology:
        "Операционный поток после налогов и обязательных корректировок",
    })
    .expect(200);
  assert.ok(
    Math.abs((await a.get("/api/cabinet")).body.metrics[0].value - 1.3) < 1e-9,
  );
  await a
    .post("/api/cabinet/payment")
    .send({
      id: v.next.id,
      status: "paid",
      recordedDate: today,
      source: "Проверка будущей оплаты",
    })
    .expect(422);
  await b
    .post("/api/cabinet/payment")
    .send({
      id: v.next.id,
      status: "paid",
      recordedDate: today,
      source: "Чужой платёж",
    })
    .expect(404);
  await b
    .post("/api/cabinet/facility")
    .send({
      name: "Договор Б",
      amount: 100000,
      balance: 100000,
      rate: 0,
      term: 10,
      firstDate: today,
    })
    .expect(200);
  let second = (await b.get("/api/cabinet")).body;
  const record = {
    id: second.next.id,
    status: "paid",
    recordedDate: today,
    source: "Полная оплата по платёжному поручению",
  };
  await b.post("/api/cabinet/payment").send(record).expect(200);
  await b.post("/api/cabinet/payment").send(record).expect(200);
  second = (await b.get("/api/cabinet")).body;
  assert.equal(second.facility.balance, 90000);
  assert.equal(second.facility.events[0].status, "paid");
});
