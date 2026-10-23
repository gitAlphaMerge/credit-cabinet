import test, { after } from "node:test";
import assert from "node:assert/strict";
import { customer, healthyCore, store } from "./q2-harness";

const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
  store.db.close();
});

test("150 KiB request reaches team core, valid response passes unchanged, oversized request is 413", async () => {
  const owner = await customer();
  const result = { ...healthyCore(), view: { title: "Расчёт" } };
  let forwarded: unknown;
  globalThis.fetch = async (_url, init) => {
    forwarded = JSON.parse(String(init?.body));
    return Response.json(result);
  };
  const payload = {
    statement_csv: "я".repeat(75 * 1024),
    need: {},
    questionnaire: {},
  };
  const response = await owner.agent
    .post("/api/team-score")
    .set("Cookie", owner.cookie)
    .send(payload)
    .expect(200);
  assert.deepEqual(response.body, result);
  assert.deepEqual(forwarded, payload);
  forwarded = undefined;
  await owner.agent
    .post("/api/team-score")
    .set("Cookie", owner.cookie)
    .send({ ...payload, statement_csv: "x".repeat(2 * 1024 * 1024) })
    .expect(413);
  assert.equal(forwarded, undefined);
});

test("team score malformed JSON and upstream failure return a safe 502", async () => {
  const owner = await customer();
  for (const response of [
    new Response("SECRET_F4"),
    Response.json({ secret: "SECRET_F4" }, { status: 500 }),
    Response.json("SECRET_F4"),
  ]) {
    globalThis.fetch = async () => response;
    const actual = await owner.agent
      .post("/api/team-score")
      .set("Cookie", owner.cookie)
      .send({
        statement_csv: "date,amount\n2026-10-22,1",
        need: {},
        questionnaire: {},
      })
      .expect(502);
    assert.doesNotMatch(JSON.stringify(actual.body), /SECRET_F4/);
  }
});

test("team score accepts view-only responses and validates any supplied core", async () => {
  const owner = await customer();
  const payload = {
    statement_csv: "date,amount\n2026-10-22,1",
    need: {},
    questionnaire: {},
  };
  for (const view of [{}, { title: "Расчёт" }]) {
    globalThis.fetch = async () => Response.json({ view });
    const response = await owner.agent
      .post("/api/team-score")
      .set("Cookie", owner.cookie)
      .send(payload)
      .expect(200);
    assert.deepEqual(response.body, { view });
  }
  for (const result of [
    {},
    "invalid",
    null,
    [],
    { view: null },
    { view: "invalid" },
    { view: [] },
    { view: {}, core: null },
    { view: {}, core: {} },
    ...["1000000", -1].map((limit) => ({
      view: {},
      core: { ...healthyCore().core, limit_now_rub: limit },
    })),
  ]) {
    globalThis.fetch = async () => Response.json(result);
    await owner.agent
      .post("/api/team-score")
      .set("Cookie", owner.cookie)
      .send(payload)
      .expect(502);
  }
});
