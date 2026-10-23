import assert from "node:assert/strict";
import request from "supertest";
import { readFileSync } from "node:fs";
import {
  app,
  store,
  applications as a,
  healthyCore,
  profile,
  csv,
  seed,
} from "../../tests/qa/q2-harness";

// Distinct synthetic clients behind a trusted loopback proxy. No production limit is removed.
// Use Q2_SINGLE_IP=1 to measure the shared-IP registration rate limiter separately.
app.set("trust proxy", "loopback");
a.configureApplications({
  clock: () => new Date(),
  core: { score: async () => ({ core_result: healthyCore() }) },
});
const sequential = Number(process.env.Q2_SEQUENTIAL ?? 200);
const parallel = Number(process.env.Q2_PARALLEL ?? 50);
const rounds = Number(process.env.Q2_ROUNDS ?? 3);
for (const value of [sequential, parallel, rounds])
  assert.ok(Number.isSafeInteger(value) && value > 0);
const compose = readFileSync(
  new URL("../../../../../docker-compose.yml", import.meta.url),
  "utf8",
);
const limitMiB = Number(
  compose.match(/  alfa-intellect:[\s\S]*?mem_limit:\s*(\d+)m/)?.[1],
);
assert.ok(limitMiB > 0);
let nextId = 0,
  completed = 0,
  peak = process.memoryUsage().rss;
const errors: { round: number; path: number; step: string; error: string }[] =
  [];
const memory: {
  round: number;
  before: number;
  after: number;
  growth: number;
  peak: number;
}[] = [];
const latency: Record<string, number[]> = {};
function sample() {
  peak = Math.max(peak, process.memoryUsage().rss);
}
const sampler = setInterval(sample, 10);
async function path(round: number, mode: string) {
  const path = ++nextId,
    started = performance.now();
  const client = request.agent(app);
  const ip =
    process.env.Q2_SINGLE_IP === "1"
      ? "198.18.0.1"
      : `198.18.${Math.floor(path / 250)}.${(path % 250) + 1}`;
  let step = "register";
  const post = (url: string) => client.post(url).set("X-Forwarded-For", ip);
  async function measured<T>(name: string, operation: () => PromiseLike<T>) {
    step = name;
    const start = performance.now();
    try {
      return await operation();
    } finally {
      (latency[mode + ":" + name] ??= []).push(performance.now() - start);
      sample();
    }
  }
  try {
    await measured("register", () =>
      post("/api/auth/register")
        .send({
          phone: "790" + String(seed * 1000 + path).padStart(8, "0"),
          password: "Q2-synthetic-password",
          profile,
        })
        .expect(200),
    );
    await measured("questionnaire", async () => {
      await post("/api/lookup").send({ inn: "9900000001" }).expect(200);
      await post("/api/lookup/confirm").send({ inn: "9900000001" }).expect(200);
      await client
        .patch("/api/profile")
        .set("X-Forwarded-For", ip)
        .send({ intent: "Подбор финансирования" })
        .expect(200);
    });
    await measured("statement", async () => {
      const doc = await post("/api/documents")
        .attach("file", Buffer.from(csv()), "statement.csv")
        .expect(200);
      await post(`/api/documents/${doc.body.id}/confirm`).send({}).expect(200);
    });
    await measured("submit", async () => {
      const selection = await post("/api/selections")
        .send({
          purpose: "Кассовый разрыв",
          amount: 10000,
          term: 12,
          repayFrom: "Выручка",
        })
        .expect(200);
      const created = await post("/api/applications")
        .send({
          selectionId: selection.body.id,
          selectionVersion: selection.body.version,
        })
        .expect(201);
      const id = created.body.application.id;
      await post(`/api/applications/${id}/events`)
        .set("Idempotency-Key", `load-${path}`)
        .send({
          event: "submit",
          expectedVersion: 1,
          payload: { consent: true },
        })
        .expect(200);
      assert.equal(a.applicationOf(store.db, id).status, "offered");
      assert.equal(
        a.eventsOf(store.db, id).filter((e) => e.event === "make_offer").length,
        1,
      );
    });
    completed++;
  } catch (error) {
    errors.push({
      round,
      path,
      step,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    (latency[mode + ":total"] ??= []).push(performance.now() - started);
  }
}
const started = performance.now(),
  rssBefore = process.memoryUsage().rss;
try {
  for (let round = 1; round <= rounds; round++) {
    const before = process.memoryUsage().rss;
    for (let i = 0; i < sequential; i++) await path(round, "sequential");
    await Promise.all(
      Array.from({ length: parallel }, () => path(round, "parallel")),
    );
    sample();
    const after = process.memoryUsage().rss;
    memory.push({ round, before, after, growth: after - before, peak });
    console.log("Q2_ROUND", JSON.stringify(memory.at(-1)));
  }
  function stats(values: number[]) {
    const sorted = [...values].sort((x, y) => x - y);
    const at = (q: number) =>
      Math.round(sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] * 100) /
      100;
    return {
      n: values.length,
      p50_ms: at(0.5),
      p95_ms: at(0.95),
      max_ms: at(1),
    };
  }
  console.log(
    "Q2_LOAD",
    JSON.stringify({
      seed,
      core: "deterministic in-process fake",
      llm: "disabled",
      database: ":memory:",
      clients:
        process.env.Q2_SINGLE_IP === "1"
          ? "single IP"
          : "distinct synthetic IPs behind loopback proxy",
      sequential,
      parallel,
      rounds,
      attempted: nextId,
      completed,
      errors,
      latency: Object.fromEntries(
        Object.entries(latency).map(([k, v]) => [k, stats(v)]),
      ),
      elapsed_ms: Math.round(performance.now() - started),
      rssBefore,
      rssAfter: process.memoryUsage().rss,
      peak,
      memory,
      limitMiB,
      peakMiB: peak / 1024 ** 2,
      exceedsComposeLimit: peak > limitMiB * 1024 ** 2,
      note: "RSS includes harness and in-memory SQLite retained users/files/events. Growth alone does not prove a leak; container not measured.",
    }),
  );
  if (errors.length) process.exitCode = 1;
} finally {
  clearInterval(sampler);
  store.db.close();
}
