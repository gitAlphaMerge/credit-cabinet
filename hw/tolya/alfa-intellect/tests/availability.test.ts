import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createServer } from "node:http";
process.env.DATABASE_PATH = ":memory:";
delete process.env.TEAM_API_URL;
const { app } = await import("../server/app");
const { db } = await import("../server/store");

test("Health: SQLite, необязательный Go API, отказ и таймаут", async (t) => {
  for (const path of ["/health", "/api/health"]) {
    const response = await request(app).get(path).expect(200);
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.db, "ok");
    assert.equal(response.body.team_api, "not_configured");
  }
  let hang = false;
  const upstream = createServer((req, res) => {
    if (req.url === "/score") {
      res
        .writeHead(503, { "Content-Type": "application/json" })
        .end('{"error":"upstream unavailable"}');
      return;
    }
    assert.equal(req.url, "/health");
    if (!hang) res.writeHead(200).end('{"status":"ok"}');
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", resolve),
  );
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
    delete process.env.TEAM_API_URL;
  });
  const address = upstream.address();
  assert.ok(address && typeof address !== "string");
  process.env.TEAM_API_URL = `http://127.0.0.1:${address.port}`;
  assert.equal(
    (await request(app).get("/health").expect(200)).body.team_api,
    "ok",
  );
  hang = true;
  const started = Date.now();
  assert.equal(
    (await request(app).get("/health").expect(200)).body.team_api,
    "down",
  );
  assert.ok(Date.now() - started < 3500);
  process.env.TEAM_API_URL = "http://127.0.0.1:1";
  assert.equal(
    (await request(app).get("/health").expect(200)).body.team_api,
    "down",
  );
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").send({ kind: "ooo" }).expect(200);
  delete process.env.FNS_API_KEY;
  delete process.env.DADATA_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.TEAM_AGENT_URL;
  process.env.EGR_PROVIDER = "mock";
  const lookup = await agent
    .post("/api/lookup")
    .send({ inn: "9900000001" })
    .expect(200);
  assert.equal(lookup.body.demo, true);
  assert.match(lookup.body.source, /синтетические данные \(мок\)/);
  await agent
    .post("/api/lookup/confirm")
    .send({ inn: lookup.body.inn })
    .expect(200);
  const state = (await agent.get("/api/state").expect(200)).body;
  assert.equal(state.profile.registryRecord.demo, true);
  assert.equal(state.profile.source, lookup.body.source);
  const chat = await agent.post("/api/chats").send({}).expect(200);
  const answer = await agent
    .post(`/api/chats/${chat.body.id}/messages`)
    .send({ text: "Какие документы нужны?" })
    .expect(200);
  assert.equal(
    answer.body.chats.find((c: any) => c.id === chat.body.id).messages.at(-1)
      .mode,
    "demo",
  );
  const score = await agent
    .post("/api/team-score")
    .send({
      statement_csv: "date,amount\n2026-01-01,1000",
      need: {},
      questionnaire: {},
    })
    .expect(502);
  assert.match(score.body.error, /ядро недоступно/);
  process.env.TEAM_API_URL = `http://127.0.0.1:${address.port}`;
  const upstreamFailure = await agent
    .post("/api/team-score")
    .send({
      statement_csv: "date,amount\n2026-01-01,1000",
      need: {},
      questionnaire: {},
    })
    .expect(502);
  assert.match(upstreamFailure.body.error, /ядро недоступно/);
  db.close();
  const failedDb = await request(app).get("/health").expect(200);
  assert.equal(failedDb.body.db, "fail");
  assert.equal(failedDb.body.status, "degraded");
});
