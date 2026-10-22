import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { day, addDays } from "../shared/cabinet";
process.env.DATABASE_PATH = ":memory:";
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app"),
  agent = request.agent(app);
test("Server rejects forged form values with Russian field errors and no financial writes", async () => {
  await agent
    .post("/api/auth/register")
    .send({
      phone: "+79001119988",
      password: "Validation-test18",
      profile: {
        name: "Тест",
        form: "ООО",
        stage: "operating",
        sector: "Услуги",
        registered: true,
        ageBand: "3–5 лет",
        result: "Прибыль",
        debt: "Нет",
        intent: "Подобрать финансирование",
      },
    })
    .expect(200);
  const valid = {
    name: "Оборудование",
    amount: 3000000,
    balance: 1000000,
    rate: 18,
    term: 24,
    firstDate: addDays(day(), 3),
  };
  const response = await agent
    .post("/api/cabinet/facility")
    .send({ ...valid, rate: 232, term: 22232323, issuedDate: "33333-03-31" })
    .expect(422);
  for (const key of ["rate", "term", "issuedDate"])
    assert.ok(response.body.fields[key]);
  assert.ok(!/Too big|expected|Invalid input|rate:/.test(response.body.error));
  const linked = await agent
    .post("/api/cabinet/facility")
    .send({ ...valid, balance: 4000000, contractTerm: 12 })
    .expect(422);
  assert.ok(linked.body.fields.balance);
  assert.ok(linked.body.fields.contractTerm);
  const date = await agent
    .post("/api/cabinet/facility")
    .send({ ...valid, issuedDate: addDays(day(), 1) })
    .expect(422);
  assert.ok(date.body.fields.issuedDate);
  assert.equal((await agent.get("/api/state")).body.cabinet, undefined);
  await agent.post("/api/cabinet/facility").send(valid).expect(200);
  assert.equal(
    (await agent.get("/api/state")).body.cabinet.facility.balance,
    1000000,
  );
});
