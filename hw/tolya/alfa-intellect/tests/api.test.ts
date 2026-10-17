import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  await mkdtemp(join(tmpdir(), "alfa-api-")),
  "test.sqlite",
);
delete process.env.OPENAI_API_KEY;
delete process.env.DADATA_API_KEY;
delete process.env.FNS_API_KEY;
const { app } = await import("../server/app");
const { db } = await import("../server/store");
const a = request.agent(app),
  b = request.agent(app);
const profile = {
  name: "Тест ООО",
  form: "ООО",
  registered: true,
  stage: "operating",
  sector: "Производство",
  ageBand: "3–5 лет",
  result: "Прибыль",
  debt: "Нет",
  intent: "Подобрать финансирование",
};
test("Сквозной API: сессия, изоляция, документ, чат, версии, досье, демокредит", async () => {
  await request(app).get("/api/state").expect(401);
  const shortPassword = await request(app)
    .post("/api/auth/register")
    .send({ phone: "+79009993333", password: "1234567", profile })
    .expect(422);
  assert.match(shortPassword.body.error, /не менее 8 символов/);
  await request(app)
    .post("/api/auth/register")
    .send({ phone: "+79009993333", password: "Eight888", profile })
    .expect(200);
  assert.equal((await request(app).get("/api/config")).body.workspaceId, null);
  await a
    .post("/api/auth/register")
    .send({ phone: "+7 900 111-22-33", password: "Test-password-123", profile })
    .expect(200);
  await b
    .post("/api/auth/register")
    .send({
      phone: "+7 900 444-55-66",
      password: "Another-password-123",
      profile: { ...profile, name: "Другое ООО" },
    })
    .expect(200);
  assert.equal((await a.get("/api/state")).body.credit, null);
  const countBefore = (
    db.prepare("SELECT COUNT(*) AS n FROM users").get() as any
  ).n;
  for (const kind of ["ooo", "ip", "idea"]) {
    const preview = await request(app)
      .get("/api/public-demo?kind=" + kind)
      .expect(200);
    assert.equal(preview.headers["set-cookie"], undefined);
    assert.equal(preview.body.profile.registered, kind !== "idea");
  }
  const publicCalculation = await request(app)
    .post("/api/public-demo/calculate")
    .send({ kind: "ip", amount: 2500000, term: 48 })
    .expect(200);
  assert.equal(publicCalculation.body.calculation.amount, 2500000);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM users").get() as any).n,
    countBefore,
  );
  assert.equal((await a.get("/api/state")).body.credit, null);
  await a.patch("/api/preferences").send({ tourDone: true }).expect(200);
  assert.deepEqual((await a.get("/api/state")).body.financials, {});
  assert.equal((await a.get("/api/state")).body.credit, null);
  const owner = (await a.get("/api/config")).body.workspaceId;
  assert.equal(typeof owner, "string");
  assert.notEqual(owner, (await b.get("/api/config")).body.workspaceId);
  const row = db
    .prepare("SELECT password FROM users WHERE phone=?")
    .get("79001112233") as any;
  assert.ok(!row.password.includes("Test-password"));
  assert.ok(row.password.includes(":"));
  await a.patch("/api/profile").send({ name: "Обновлённое ООО" }).expect(200);
  assert.equal((await b.get("/api/state")).body.profile.name, "Другое ООО");
  await a
    .patch("/api/profile")
    .send({ registryRecord: { name: "silently overwritten" } })
    .expect(422);
  await a.post("/api/lookup").send({ inn: "123" }).expect(422);
  const lookup = await a
    .post("/api/lookup")
    .send({ inn: "7712345678" })
    .expect(503);
  assert.match(lookup.body.error, /ключ/);
  await a.post("/api/lookup/confirm").send({ inn: "7712345678" }).expect(409);
  const originalFetch = globalThis.fetch;
  process.env.FNS_API_KEY = "test-key-not-real";
  let found;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              ЮЛ: {
                ИНН: "7712345678",
                НаимСокрЮЛ: "ООО «Проверка API»",
                Статус: "Действующее",
              },
            },
          ],
        }),
      )) as typeof fetch;
    found = (
      await a.post("/api/lookup").send({ inn: "7712345678" }).expect(200)
    ).body;
    assert.equal(found.demo, false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FNS_API_KEY;
  }
  assert.equal(
    (await a.get("/api/state")).body.profile.name,
    "Обновлённое ООО",
  );
  await a
    .post("/api/lookup/confirm")
    .send({ ...found, name: "Подмена браузером" })
    .expect(200);
  assert.equal(
    (await a.get("/api/state")).body.profile.name,
    "ООО «Проверка API»",
  );
  const document = await a
    .post("/api/documents")
    .field("category", "balance")
    .attach(
      "file",
      Buffer.from(
        "category,balance\nperiod,2026-Q3\ncurrency,RUB\nassets,1000\nliabilities,400\nequity,600\n",
      ),
      "balance.csv",
    )
    .expect(200);
  assert.equal(document.body.confirmed, false);
  await b.get("/api/documents/" + document.body.id + "/download").expect(404);
  await b
    .post("/api/documents/" + document.body.id + "/confirm")
    .send({})
    .expect(404);
  await a
    .post("/api/documents/" + document.body.id + "/confirm")
    .send({})
    .expect(200);
  await a
    .post("/api/documents/" + document.body.id + "/confirm")
    .send({})
    .expect(200);
  let s = (await a.get("/api/state")).body;
  assert.equal(s.notifications.length, 1);
  assert.equal(s.documents.filter((d: any) => d.confirmed).length, 1);
  const selection = await a
    .post("/api/selections")
    .send({
      purpose: "Оборудование",
      amount: 3000000,
      term: 36,
      flow: 420000,
      existing: 0,
      repayFrom: "Деятельность",
      ownFunds: 100000,
    })
    .expect(200);
  await b.get("/api/dossier/" + selection.body.id).expect(404);
  const version = await a
    .post("/api/selections")
    .send({
      purpose: "Оборудование",
      amount: 2500000,
      term: 48,
      flow: 420000,
      existing: 0,
      parentId: selection.body.id,
    })
    .expect(200);
  assert.equal(version.body.version, 2);
  assert.ok(
    version.body.calculation.monthlyPayment <
      selection.body.calculation.monthlyPayment,
  );
  const chat = await a
    .post("/api/chats")
    .send({ selectionId: selection.body.id })
    .expect(200);
  await b
    .post("/api/chats/" + chat.body.id + "/messages")
    .send({ text: "Привет" })
    .expect(404);
  await a
    .post("/api/chats/" + chat.body.id + "/messages")
    .send({ text: "Объясни расчёт" })
    .expect(200);
  s = (await a.get("/api/state")).body;
  const messages = s.chats.find((c: any) => c.id === chat.body.id).messages;
  assert.equal(messages[1].mode, "demo");
  assert.equal(messages[1].calculation.amount, 3000000);
  await a
    .post("/api/leads")
    .send({ selectionId: selection.body.id, phone: "+7 900 111-22-33" })
    .expect(200);
  await a
    .post("/api/leads")
    .send({ selectionId: selection.body.id, phone: "+7 900 111-22-33" })
    .expect(200);
  assert.equal((await a.get("/api/state")).body.leads.length, 1);
  await a
    .post("/api/consultations")
    .send({ phone: "+7 900 111-22-33", note: "Обсудить условия для проекта" })
    .expect(200);
  await a
    .post("/api/consultations")
    .send({ phone: "+7 900 111-22-33", note: "Обсудить условия для проекта" })
    .expect(200);
  assert.equal(
    (await a.get("/api/state")).body.leads.filter(
      (l: any) => l.selectionId === "consultation",
    ).length,
    1,
  );
  await a.post("/api/credit/demo").send({}).expect(200);
  assert.equal((await a.get("/api/state")).body.credit.demo, true);
  const f = await a
    .post("/api/credit/forecast")
    .send({ stress: true })
    .expect(200);
  assert.equal(f.body.available, true);
  await a
    .post("/api/forecast-assumptions")
    .send({ balance: 0, incoming: 0, expenses: 500000 })
    .expect(200);
  const deficit = await a
    .post("/api/credit/forecast")
    .send({ stress: false })
    .expect(200);
  assert.ok(deficit.body.after < 0);
  await a.post("/api/credit/forecast").send({ stress: false }).expect(200);
  assert.equal(
    (await a.get("/api/state")).body.notifications.filter((n: any) =>
      n.key.startsWith("deficit:"),
    ).length,
    1,
  );
  await a.post("/api/auth/logout").send({}).expect(200);
  await a.get("/api/state").expect(401);
  assert.equal((await a.get("/api/config")).body.workspaceId, null);
  await a
    .post("/api/auth/login")
    .send({ phone: "+7 900 111-22-33", password: "wrong" })
    .expect(401);
  await a
    .post("/api/auth/login")
    .send({ phone: "+7 900 111-22-33", password: "Test-password-123" })
    .expect(200);
  assert.equal((await a.get("/api/state")).body.selections.length, 2);
  assert.equal((await a.get("/api/config")).body.workspaceId, owner);
  await a
    .post("/api/preferences")
    .set("Origin", "https://evil.example")
    .send({ split: 65 })
    .expect(403);
});
