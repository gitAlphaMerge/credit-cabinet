import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
process.env.DATABASE_PATH = ":memory:";
delete process.env.OPENAI_API_KEY;
const { app } = await import("../server/app");

test("team-score accepts 150 KB JSON and reports oversized JSON as 413", async () => {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({
    phone: "+79009990001", password: "Statement-test-18",
    profile: { name: "Тест размера", form: "ООО", stage: "operating", sector: "Услуги",
      registered: true, ageBand: "3–5 лет", result: "Прибыль", debt: "Нет", intent: "" },
  }).expect(200);
  const original = globalThis.fetch;
  let forwarded: any;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    forwarded = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ view: {} }));
  }) as typeof fetch;
  try {
    const payload = { statement_csv: "я".repeat(75 * 1024), need: {}, questionnaire: {} };
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) >= 150 * 1024);
    await agent.post("/api/team-score").send(payload).expect(200);
    assert.deepEqual(forwarded, payload);
    forwarded = undefined;
    const response = await agent.post("/api/team-score").send({ ...payload,
      statement_csv: "x".repeat(2 * 1024 * 1024),
    }).expect(413);
    assert.equal(response.body.error, "Файл слишком большой");
    assert.equal(forwarded, undefined);
  } finally { globalThis.fetch = original; }
});
