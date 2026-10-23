import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  app,
  store,
  applications as a,
  customer,
  prepare,
  submit,
  snapshot,
  healthyCore,
  configure,
  noLeak,
  seed,
} from "./q2-harness";
import { findCompany, RegistryError } from "../../server/registry";
import { runComplianceGate } from "../../server/compliance";
import request from "supertest";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  store.db.close();
});
const message = `seed=${seed}`;

for (const fault of [
  "offline",
  "500",
  "invalid-json",
  "missing",
  "string-limit",
  "negative-limit",
  "delayed-30s",
] as const) {
  test(`core ${fault}: 503, no partial writes, same-key recovery and single offer`, async () => {
    configure();
    const owner = await customer(),
      id = await prepare(owner),
      before = snapshot(id);
    const logs: string[] = [],
      error = console.error;
    console.error = (...args) => {
      logs.push(args.join(" "));
    };
    let observedSignal: AbortSignal | undefined;
    globalThis.fetch = async (_url, init) => {
      observedSignal = init?.signal as AbortSignal;
      if (fault === "offline") throw new Error("ECONNREFUSED");
      if (fault === "delayed-30s")
        return new Promise<Response>((resolve, reject) => {
          // Simulates an upstream exceeding the 30-second client deadline.
          const timer = setTimeout(
            () => resolve(Response.json(healthyCore())),
            31_000,
          );
          observedSignal!.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(observedSignal!.reason);
            },
            { once: true },
          );
        });
      if (fault === "500") return Response.json(healthyCore(), { status: 500 });
      if (fault === "invalid-json")
        return new Response("SECRET_Q2 invalid-json");
      const value = healthyCore();
      if (fault === "missing") return Response.json({});
      if (fault === "string-limit")
        (value.core as any).limit_now_rub = "1000000";
      if (fault === "negative-limit") value.core.limit_now_rub = -1;
      return Response.json(value);
    };
    try {
      const start = performance.now();
      const response = await submit(owner, id).expect(503);
      assert.ok(performance.now() - start < 35_000, message);
      assert.ok(observedSignal instanceof AbortSignal, message);
      noLeak(response.body);
      assert.equal(typeof response.body.error, "string", message);
      assert.deepEqual(snapshot(id), before, message);
      assert.equal(snapshot(id).application.status, "draft", message);
      if (["offline", "500", "invalid-json", "delayed-30s"].includes(fault))
        assert.ok(
          logs.some((line) => line.includes("scoring pipeline failed")),
          message,
        );
      globalThis.fetch = async () => Response.json(healthyCore());
      await submit(owner, id).expect(200);
      const successful = snapshot(id);
      assert.equal(successful.application.status, "offered", message);
      assert.equal(
        successful.events.filter((e) => e.event === "make_offer").length,
        1,
        message,
      );
      await submit(owner, id).expect(200);
      assert.deepEqual(snapshot(id), successful, message);
    } finally {
      console.error = error;
      globalThis.fetch = originalFetch;
    }
  });
}

for (const fault of ["500", "timeout"] as const) {
  test(`compliance ${fault}: safe 503, core never called, unchanged draft, retry`, async () => {
    const owner = await customer(),
      id = await prepare(owner),
      before = snapshot(id);
    let calls = 0;
    a.configureApplications({
      core: {
        score: async () => {
          calls++;
          return { core_result: healthyCore() };
        },
      },
      clock: () => new Date(),
      compliance: async () => {
        throw new Error(fault);
      },
    });
    const error = console.error,
      logs: string[] = [];
    console.error = (...args) => {
      logs.push(args.join(" "));
    };
    try {
      const response = await submit(owner, id).expect(503);
      noLeak(response.body);
      assert.equal(calls, 0, message);
      assert.deepEqual(snapshot(id), before, message);
      assert.ok(
        logs.some((line) => line.includes("scoring pipeline failed")),
        message,
      );
      a.configureApplications({
        core: { score: async () => ({ core_result: healthyCore() }) },
        clock: () => new Date(),
      });
      await submit(owner, id).expect(200);
      assert.equal(snapshot(id).application.status, "offered", message);
    } finally {
      console.error = error;
    }
  });
  test(`registry adapter ${fault}: injected transport returns safe RegistryError`, async () => {
    const injected: typeof fetch = async (_url, init) => {
      assert.ok(init?.signal instanceof AbortSignal, message);
      if (fault === "timeout")
        throw new DOMException("SECRET_Q2", "TimeoutError");
      return new Response("SECRET_Q2", { status: 500 });
    };
    await assert.rejects(
      findCompany(
        "9900000001",
        { EGR_PROVIDER: "api-fns", FNS_API_KEY: "synthetic" },
        injected,
      ),
      (error: unknown) => {
        assert.ok(error instanceof RegistryError, message);
        noLeak(error.message);
        return error.status >= 500 && error.status < 600;
      },
    );
  });
}

test("local compliance unavailable source: persisted info_requested, core skipped, recovery", async () => {
  const owner = await customer(),
    id = await prepare(owner);
  let calls = 0;
  const unavailable = await runComplianceGate({
    inn: "1234567890",
    documents: [],
    now: new Date(),
  });
  assert.equal(unavailable.gate, "info_requested", message);
  assert.ok(
    unavailable.reasons.includes("COMPLIANCE_SOURCE_UNAVAILABLE"),
    message,
  );
  a.configureApplications({
    clock: () => new Date(),
    core: {
      score: async () => {
        calls++;
        return { core_result: healthyCore() };
      },
    },
    compliance: async () => unavailable,
  });
  await submit(owner, id).expect(200);
  assert.equal(calls, 0, message);
  const info = snapshot(id);
  assert.equal(info.application.status, "info_requested", message);
  assert.ok(
    Number(info.dossier!.readiness_n) < Number(info.dossier!.readiness_m),
    message,
  );
  assert.equal(info.events.at(-1)?.reason, unavailable.reasons[0], message);
  a.configureApplications({
    clock: () => new Date(),
    core: { score: async () => ({ core_result: healthyCore() }) },
  });
  await owner.agent
    .post(`/api/applications/${id}/events`)
    .set("Cookie", owner.cookie)
    .set("Idempotency-Key", `recover-${id}`)
    .send({
      event: "client_update",
      expectedVersion: info.application.version,
      payload: { confirmed_fields: { restored: true } },
    })
    .expect(200);
  assert.equal(snapshot(id).application.status, "offered", message);
});

test("BKI transport throws: persists incomplete dossier, recovery completes", async () => {
  const owner = await customer(),
    id = await prepare(owner);
  a.configureApplications({
    clock: () => new Date(),
    core: { score: async () => ({ core_result: healthyCore() }) },
    bki: async () => {
      throw new Error("timeout");
    },
  });
  await submit(owner, id).expect(200);
  const failed = snapshot(id);
  assert.equal(failed.application.status, "info_requested", message);
  assert.ok(JSON.parse(failed.dossier!.holes).includes("bki"), message);
  a.configureApplications({
    clock: () => new Date(),
    core: { score: async () => ({ core_result: healthyCore() }) },
  });
  await owner.agent
    .post(`/api/applications/${id}/events`)
    .set("Cookie", owner.cookie)
    .set("Idempotency-Key", `recover-${id}`)
    .send({
      event: "client_update",
      expectedVersion: failed.application.version,
      payload: { confirmed_fields: { restored: true } },
    })
    .expect(200);
  assert.equal(snapshot(id).application.status, "offered", message);
});

test("LLM disabled: chat uses demo and full application still offers", async () => {
  globalThis.fetch = async () => Response.json(healthyCore());
  configure();
  try {
    const owner = await customer();
    const chat = await request(app)
      .post("/api/chats")
      .set("Cookie", owner.cookie)
      .send({})
      .expect(200);
    const answer = await owner.agent
      .post(`/api/chats/${chat.body.id}/messages`)
      .set("Cookie", owner.cookie)
      .send({ text: "Какие документы нужны?" })
      .expect(200);
    assert.equal(
      answer.body.chats.find((c: any) => c.id === chat.body.id).messages.at(-1)
        .mode,
      "demo",
      message,
    );
    const id = await prepare(owner);
    await submit(owner, id).expect(200);
    assert.equal(snapshot(id).application.status, "offered", message);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
