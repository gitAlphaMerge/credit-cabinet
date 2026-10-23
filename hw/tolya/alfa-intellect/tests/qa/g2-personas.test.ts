import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startRealCore } from "./g2-support";
import { demoPersonas } from "../../shared/demo-personas";

process.env.DATABASE_PATH = ":memory:";
process.env.AI_PROVIDER = "";
process.env.TEAM_AGENT_URL = "";
delete process.env.DEMO_PERSONAS;

test("G2: persona endpoints are absent unless explicitly enabled", async () => {
  const { app, stopSilenceSweep } = await import("../../server/app");
  try {
    await request(app).get("/api/demo-personas").expect(404);
    await request(app)
      .post("/api/demo-personas/switch")
      .send({ persona: "manager" })
      .expect(404);
  } finally {
    stopSilenceSweep();
  }
});

test("G2: server sessions switch only to allowlisted users marked is_demo", async () => {
  const { app } = await import("../../server/app");
  const { db, createUser, initialState, session, sessionUser } =
    await import("../../server/store");
  const { ensureDemoSchema } = await import("../../server/demo-personas");
  process.env.DEMO_PERSONAS = "1";
  ensureDemoSchema(db);
  const profile = {
    name: "Обычный клиент",
    form: "ИП",
    stage: "operating",
    sector: "Торговля",
    registered: true,
    ageBand: "5–10 лет",
    result: "Прибыль",
    debt: "Нет",
    intent: "Кассовый разрыв",
  };
  const ordinary = createUser("79990000699", "test-password-only", profile);
  const p = demoPersonas[0];
  db.prepare(
    "INSERT INTO users(id,phone,password,state,role,is_demo) VALUES(?,?,?,?,?,0)",
  ).run(
    p.userId,
    p.phone,
    "not-a-login",
    JSON.stringify(initialState(profile)),
    p.role,
  );
  try {
    for (const value of [
      ordinary,
      "79990000699",
      "unknown",
      "__proto__",
      "constructor",
    ])
      await request(app)
        .post("/api/demo-personas/switch")
        .send({ persona: value })
        .expect(404);
    for (const body of [
      {},
      { persona: 1 },
      { persona: p.key, userId: ordinary },
      { persona: p.key, is_demo: true },
      { persona: p.key, role: "manager" },
    ])
      await request(app)
        .post("/api/demo-personas/switch")
        .send(body)
        .expect(422);
    await request(app)
      .post("/api/demo-personas/switch")
      .send({ persona: p.key })
      .expect(404);
    const unavailable = await request(app)
      .get("/api/demo-personas")
      .expect(200);
    assert.equal(unavailable.body.personas.length, 0);
    db.prepare("UPDATE users SET is_demo=1 WHERE id=?").run(p.userId);
    const agent = request.agent(app);
    const oldToken = session(ordinary);
    const switched = await agent
      .post("/api/demo-personas/switch")
      .set("Cookie", `alfa_session=${oldToken}`)
      .send({ persona: p.key })
      .expect(200);
    assert.equal(switched.body.is_demo, true);
    assert.equal(switched.body.destination, "/application");
    assert.equal(sessionUser(oldToken), undefined);
    const cookie = switched.headers["set-cookie"][0];
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.doesNotMatch(JSON.stringify(switched.body), /token|password/);
    const config = await agent.get("/api/config").expect(200);
    assert.equal(config.body.workspaceId, p.userId);
    assert.equal(config.body.role, "client");
    const list = await agent.get("/api/demo-personas").expect(200);
    assert.deepEqual(
      list.body.personas.map((x: any) => [x.key, x.current]),
      [[p.key, true]],
    );
    await agent.get("/api/bank/queue").set("X-Role", "manager").expect(403);
    await request(app)
      .post("/api/demo-personas/switch")
      .set("Origin", "https://evil.invalid")
      .send({ persona: p.key })
      .expect(403);
    process.env.COOKIE_SECURE = "true";
    const secure = await request(app)
      .post("/api/demo-personas/switch")
      .send({ persona: p.key })
      .expect(200);
    assert.match(secure.headers["set-cookie"][0], /Secure/);
    delete process.env.COOKIE_SECURE;
    process.env.DEMO_PERSONAS = "true";
    await agent.get("/api/demo-personas").expect(404);
    await agent
      .post("/api/demo-personas/switch")
      .send({ persona: p.key })
      .expect(404);
  } finally {
    db.prepare("DELETE FROM sessions WHERE user_id IN (?,?)").run(
      ordinary,
      p.userId,
    );
    db.prepare("DELETE FROM users WHERE id IN (?,?)").run(ordinary, p.userId);
    delete process.env.DEMO_PERSONAS;
    delete process.env.COOKIE_SECURE;
  }
});

test("G2: seed refuses normal-user collisions and unavailable core without replacing existing data", async () => {
  const { db, createUser, initialState } = await import("../../server/store");
  const { seedDemo } = await import("../../scripts/seed-demo");
  const profile = {
    name: "Обычный бизнес",
    form: "ИП",
    stage: "operating",
    sector: "Торговля",
    registered: true,
    ageBand: "5–10 лет",
    result: "Прибыль",
    debt: "Нет",
    intent: "Кассовый разрыв",
  };
  const ordinary = createUser(
    demoPersonas[0].phone,
    "test-password-only",
    profile,
  );
  const snapshot = () =>
    JSON.stringify(
      ["users", "applications", "application_events", "dossiers"].map((table) =>
        db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    );
  try {
    const before = snapshot();
    await assert.rejects(seedDemo(db, { log: () => {} }), /DEMO_PERSONAS=1/);
    assert.equal(snapshot(), before);
    process.env.DEMO_PERSONAS = "1";
    await assert.rejects(
      seedDemo(db, { log: () => {} }),
      /занят обычной учётной записью/,
    );
    assert.equal(snapshot(), before);
    db.prepare("UPDATE users SET phone=? WHERE id=?").run(
      "79990000697",
      ordinary,
    );
    const state = initialState({ ...profile, name: demoPersonas[0].company });
    db.prepare(
      "INSERT INTO users(id,phone,password,state,role,is_demo) VALUES(?,?,?,?,?,1)",
    ).run(
      demoPersonas[0].userId,
      demoPersonas[0].phone,
      "existing-hash",
      JSON.stringify(state),
      "client",
    );
    const beforeOutage = snapshot();
    await assert.rejects(
      seedDemo(db, {
        reset: true,
        clock: () => new Date("2026-10-24T12:00:00Z"),
        core: {
          score: async () => {
            throw new Error("offline");
          },
        },
        log: () => {},
      }),
      /недоступны/,
    );
    assert.equal(snapshot(), beforeOutage);
  } finally {
    db.prepare("DELETE FROM users WHERE id IN (?,?)").run(
      ordinary,
      demoPersonas[0].userId,
    );
    delete process.env.DEMO_PERSONAS;
  }
});

test(
  "G2: all five personas use real HTTP/core, repeated seed is stable and reset restores only demo data",
  { timeout: 60000 },
  async () => {
    const { app } = await import("../../server/app");
    const { db, createUser, stateOf } = await import("../../server/store");
    const { seedDemo } = await import("../../scripts/seed-demo");
    const {
      configureApplications,
      httpCoreClient,
      eventsOf,
      dossierOf,
      applicationsDependencies,
    } = await import("../../server/applications");
    const oldDeps = applicationsDependencies();
    const core = await startRealCore();
    const oldUrl = process.env.TEAM_API_URL;
    process.env.TEAM_API_URL = core.url;
    process.env.DEMO_PERSONAS = "1";
    const clock = () => new Date("2026-10-24T12:00:00Z");
    configureApplications({ core: httpCoreClient, clock });
    try {
      const logs: string[] = [];
      const applications = await seedDemo(db, {
        clock,
        log: (line) => {
          logs.push(line);
          console.log(`G2_SEED ${line}`);
        },
      });
      assert.equal(applications.length, 5);
      const snapshot = () =>
        JSON.stringify(
          ["users", "applications", "application_events", "dossiers"].map((t) =>
            db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(),
          ),
        );
      const initial = snapshot();
      await seedDemo(db, { clock, log: () => {} });
      assert.equal(
        snapshot(),
        initial,
        "repeated seed changes neither rows nor credentials",
      );
      const limits = new Set<number>();
      for (const p of demoPersonas) {
        const agent = request.agent(app);
        const switched = await agent
          .post("/api/demo-personas/switch")
          .send({ persona: p.key })
          .expect(200);
        const config = await agent.get("/api/config").expect(200);
        assert.equal(config.body.workspaceId, p.userId);
        assert.equal(config.body.role, p.role);
        if (p.role === "manager") {
          assert.equal(switched.body.destination, "/bank");
          const queue = await agent.get("/api/bank/queue").expect(200);
          assert.deepEqual(
            queue.body.map((row: any) => row.application.user_id),
            ["g2-review"],
          );
          const rejected = await agent.get("/api/bank/rejected").expect(200);
          assert.ok(
            rejected.body.some((row: any) => row.user_id === "g2-young"),
          );
          continue;
        }
        const list = await agent.get("/api/applications").expect(200);
        assert.equal(list.body.length, 1);
        assert.equal(list.body[0].status, p.expectedStatus);
        const detail = await agent
          .get(`/api/applications/${list.body[0].id}`)
          .expect(200);
        assert.equal(detail.body.application.status, p.expectedStatus);
        const dossier = dossierOf(db, list.body[0].id)!;
        const scored = JSON.parse(dossier.core_result).core;
        limits.add(scored.limit_now_rub);
        assert.equal(stateOf(p.userId).profile.name, p.company);
        assert.ok(
          detail.body.events.some(
            (e: any) => e.event === "submit" && e.actor_role === "system",
          ),
        );
        if (p.branch === "green") {
          assert.equal(dossier.readiness_n, dossier.readiness_m);
          assert.ok(
            !detail.body.events.some((e: any) => e.actor_role === "manager"),
          );
        }
        if (p.branch === "alternatives") {
          assert.ok(list.body[0].amount > scored.limit_now_rub);
          assert.ok(dossier.alternatives!.length > 0);
          assert.ok(list.body[0].amount < scored.limit_now_rub * 2);
        }
        if (p.branch === "manager_document") {
          const event = detail.body.events.findLast(
            (e: any) => e.event === "request_info",
          );
          assert.equal(event.actor_role, "manager");
          assert.equal(JSON.parse(event.payload).return_to_manager, true);
          assert.ok(dossier.holes.includes("contract_main_customer"));
        }
        if (p.branch === "young") {
          assert.ok(scored.stops_fired.includes("TOO_YOUNG"));
          assert.equal(dossier.age?.source, "registry");
          assert.ok(dossier.age!.months! < 12);
        }
        console.log(
          `G2_PERSONA ${p.key} | ${p.expectedStatus} | ${detail.body.application.status} | limit=${scored.limit_now_rub} | flow=${scored.flow_month_rub}`,
        );
      }
      assert.equal(
        limits.size,
        5,
        "different visible statements produce different limits",
      );
      assert.ok(logs.every((line) => !/пароль\s+\S|password/i.test(line)));
      const green = applications.find((a) => a.user_id === "g2-green")!;
      const agent = request.agent(app);
      await agent
        .post("/api/demo-personas/switch")
        .send({ persona: "green" })
        .expect(200);
      await agent
        .post(`/api/applications/${green.id}/events`)
        .set("Idempotency-Key", "g2-sign")
        .send({ event: "sign", expectedVersion: green.version, payload: {} })
        .expect(200);
      assert.ok(eventsOf(db, green.id).some((e) => e.event === "disburse"));
      const beforeFailure = snapshot();
      await assert.rejects(
        seedDemo(db, {
          reset: true,
          clock,
          core: {
            score: async () => {
              throw new Error("offline");
            },
          },
          log: () => {},
        }),
      );
      assert.equal(
        snapshot(),
        beforeFailure,
        "unavailable core must not destroy existing demo",
      );
      const ordinary = createUser(
        "79990000698",
        "test-password-only",
        stateOf("g2-green").profile,
      );
      const ordinaryBefore = db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(ordinary);
      await seedDemo(db, { reset: true, clock, log: () => {} });
      assert.deepEqual(
        db.prepare("SELECT * FROM users WHERE id=?").get(ordinary),
        ordinaryBefore,
      );
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM applications WHERE user_id LIKE 'g2-%'",
          )
          .get()!.n,
        5,
      );
      for (const p of demoPersonas.filter((p) => p.role === "client"))
        assert.equal(
          db
            .prepare("SELECT status FROM applications WHERE user_id=?")
            .get(p.userId)!.status,
          p.expectedStatus,
        );
      const resetSnapshot = snapshot();
      await seedDemo(db, { clock, log: () => {} });
      assert.equal(snapshot(), resetSnapshot);
    } finally {
      configureApplications(oldDeps);
      if (oldUrl === undefined) delete process.env.TEAM_API_URL;
      else process.env.TEAM_API_URL = oldUrl;
      delete process.env.DEMO_PERSONAS;
      await core.stop();
    }
  },
);
