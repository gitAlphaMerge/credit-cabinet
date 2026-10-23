import test from "node:test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  a,
  app,
  db,
  cookies,
  owner,
  other,
  manager,
  request,
  assert,
  deps,
  create,
  post,
  internal,
  info,
  queued,
  offered,
  setMode,
  scoreCalls,
  setPause,
} from "./q1-harness";

test("gate/core/BKI/limit: only a complete green dossier reaches offered, journal is system-owned", async () => {
  for (const [mode, expected] of [
    ["green", "offered"],
    ["holes", "info_requested"],
    ["stop", "rejected"],
    ["limit", "info_requested"],
    ["gate_info", "info_requested"],
    ["gate_stop", "rejected"],
    ["bki30", "info_requested"],
    ["bki90", "rejected"],
  ] as const) {
    setMode(mode);
    const id = create(),
      calls = scoreCalls;
    await post(id, "submit", { consent: true }).expect(200);
    assert.equal(a.applicationOf(db, id).status, expected, mode);
    assert.equal(scoreCalls - calls, mode.startsWith("gate_") ? 0 : 1, mode);
    const events = a.eventsOf(db, id);
    assert.deepEqual(
      events.slice(1).map((e) => e.actor_role),
      Array(events.length - 1).fill("system"),
    );
    assert.equal(a.applicationOf(db, id).version, events.length);
    if (expected === "offered") {
      assert.deepEqual(
        events.map((e) => e.event),
        ["create", "submit", "underwriter_approve", "make_offer"],
      );
      const d = a.dossierOf(db, id)!;
      assert.equal(d.readiness_n, d.readiness_m);
      assert.equal(d.compliance?.gate, "pass");
    }
  }
});

test("missing consent, stale version and invalid transitions leave application, journal and dossier unchanged", async () => {
  const id = create(),
    before = a.applicationOf(db, id),
    events = a.eventsOf(db, id);
  for (const [event, payload, version, expected] of [
    ["submit", {}, 1, 422],
    ["withdraw", {}, 99, 409],
    ["sign", { code: "0000" }, 1, 409],
  ] as const) {
    await post(id, event, payload, owner, version).expect(expected);
    assert.deepEqual(a.applicationOf(db, id), before);
    assert.deepEqual(a.eventsOf(db, id), events);
    assert.equal(a.dossierOf(db, id), undefined);
  }
});

test("idempotency: exact response replay after further events; canonical body; conflicting body/path rejected", async () => {
  const id = create(),
    key = randomUUID();
  const first = await post(
    id,
    "submit",
    { consent: true },
    owner,
    1,
    key,
  ).expect(200);
  const count = scoreCalls;
  await post(id, "sign", { code: "0000" }).expect(200);
  const journal = a.eventsOf(db, id);
  const replay = await post(
    id,
    "submit",
    { consent: true },
    owner,
    1,
    key,
  ).expect(200);
  assert.deepEqual(replay.body, first.body);
  assert.equal(scoreCalls, count);
  assert.deepEqual(a.eventsOf(db, id), journal);
  await post(id, "submit", { consent: false }, owner, 1, key).expect(422);
  const another = create();
  await post(another, "submit", { consent: true }, owner, 1, key).expect(422);
  assert.equal(a.eventsOf(db, another).length, 1);
  assert.equal(
    a.applicationRequestHash("p", { a: 1, b: { c: 2, d: 3 } }),
    a.applicationRequestHash("p", { b: { d: 3, c: 2 }, a: 1 }),
  );
});

test("idempotency: 24 concurrent same-key submits produce one cascade and identical responses", async () => {
  const id = create(),
    key = randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 24 }, () =>
      post(id, "submit", { consent: true }, owner, 1, key),
    ),
  );
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, responses[0].body);
  }
  assert.deepEqual(
    a.eventsOf(db, id).map((e) => e.event),
    ["create", "submit", "underwriter_approve", "make_offer"],
  );
  assert.equal(a.dossierOf(db, id)!.version, 1);
});

test("file SQLite: 24 unique-key submits with one version have one winner and 23 conflicts", async () => {
  const id = create();
  const responses = await Promise.all(
    Array.from({ length: 24 }, () =>
      post(id, "submit", { consent: true }, owner, 1),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [
    200,
    ...Array(23).fill(409),
  ]);
  assert.equal(a.applicationOf(db, id).version, 4);
  assert.equal(
    a.eventsOf(db, id).filter((e) => e.event === "make_offer").length,
    1,
  );
  assert.equal(a.dossierOf(db, id)!.version, 1);
});

test("file SQLite: 24 mixed events with one version have exactly one winner, no duplicate journal entries", async () => {
  const id = await queued(),
    before = a.eventsOf(db, id).length,
    version = a.applicationOf(db, id).version;
  const responses = await Promise.all(
    Array.from({ length: 24 }, (_, i) =>
      i % 2
        ? post(id, "reject", {}, manager, version)
        : post(id, "withdraw", {}, owner, version),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [
    200,
    ...Array(23).fill(409),
  ]);
  assert.equal(a.eventsOf(db, id).length, before + 1);
  assert.equal(a.applicationOf(db, id).version, version + 1);
});

test("CAS: in-flight score loses to a committed withdraw over a separate SQLite connection", async () => {
  const id = create();
  let release!: () => void, entered!: () => void;
  const entry = new Promise<void>((r) => (entered = r)),
    wait = new Promise<void>((r) => (release = r));
  setPause(async () => {
    entered();
    await wait;
  });
  const slow = post(id, "submit", { consent: true }, owner, 1).then((r) => r);
  await entry;
  const second = new DatabaseSync(process.env.DATABASE_PATH!);
  try {
    await a.transitionApplication(
      second,
      {
        applicationId: id,
        event: "withdraw",
        expectedVersion: 1,
        actorRole: "client",
        actorId: owner,
      },
      deps,
    );
  } finally {
    second.close();
    release();
    setPause(undefined);
  }
  const result = await slow;
  assert.equal(result.status, 409);
  assert.deepEqual(
    a.eventsOf(db, id).map((e) => e.event),
    ["create", "withdraw"],
  );
  assert.equal(a.dossierOf(db, id), undefined);
});

test("atomic rollback: offer failure leaves no cascade, dossier or replay-cache residue; same key can retry", async () => {
  const id = create(),
    key = randomUUID(),
    before = a.applicationOf(db, id);
  db.exec(
    `CREATE TEMP TRIGGER q1_fail_offer BEFORE INSERT ON application_events WHEN NEW.application_id='${id}' AND NEW.event='make_offer' BEGIN SELECT RAISE(ABORT,'Q1_OFFER_FAILURE'); END`,
  );
  try {
    await post(id, "submit", { consent: true }, owner, 1, key).expect(500);
    assert.deepEqual(a.applicationOf(db, id), before);
    assert.equal(a.eventsOf(db, id).length, 1);
    assert.equal(a.dossierOf(db, id), undefined);
    assert.equal(
      db.prepare("SELECT * FROM application_idempotency WHERE key=?").get(key),
      undefined,
    );
  } finally {
    db.exec("DROP TRIGGER q1_fail_offer");
  }
  await post(id, "submit", { consent: true }, owner, 1, key).expect(200);
});

test("IDOR: every application route and bank route refuses foreign mutation/disclosure", async () => {
  const id = await info(),
    before = a.eventsOf(db, id);
  await request(app)
    .get(`/api/applications/${id}`)
    .set("Cookie", cookies[other])
    .expect(404);
  for (const event of [
    "submit",
    "client_update",
    "accept_alternative",
    "agent_nudge",
    "escalate_silent",
    "escalate_disagreed",
    "request_info",
    "send_to_underwriting",
    "reject",
    "underwriter_approve",
    "make_offer",
    "sign",
    "disburse",
    "expire",
    "withdraw",
    "create",
  ] as const)
    await post(
      id,
      event,
      {
        consent: true,
        code: "0000",
        confirmed_fields: { contract_main_customer: true },
        text: "fixture",
        client_objections: "fixture",
        option_id: "q1-option",
      },
      other,
    ).expect(404);
  const list = await request(app)
    .get("/api/applications")
    .set("Cookie", cookies[other])
    .expect(200);
  assert.ok(!list.body.some((v: { id: string }) => v.id === id));
  await request(app)
    .post("/api/applications")
    .set("Cookie", cookies[other])
    .send({ selectionId: "selection", selectionVersion: 1, parent_id: id })
    .expect(404);
  for (const actor of [owner, other])
    for (const path of ["/api/bank/queue", "/api/bank/rejected"])
      await request(app).get(path).set("Cookie", cookies[actor]).expect(403);
  await request(app).get(`/api/applications/${id}`).expect(401);
  assert.deepEqual(a.eventsOf(db, id), before);
});

test("HTTP ignores payload actorRole, reads live database role, rejects forged top-level role", async () => {
  const id = await queued(),
    before = a.eventsOf(db, id);
  await post(id, "reject", { actorRole: "manager", actorId: manager }).expect(
    403,
  );
  await request(app)
    .post(`/api/applications/${id}/events`)
    .set("Cookie", cookies[owner])
    .set("Idempotency-Key", randomUUID())
    .send({
      event: "reject",
      expectedVersion: a.applicationOf(db, id).version,
      actorRole: "manager",
      reason: "fixture",
    })
    .expect(422);
  db.prepare("UPDATE users SET role='client' WHERE id=?").run(manager);
  try {
    await post(id, "reject", {}, manager).expect(404);
  } finally {
    db.prepare("UPDATE users SET role='manager' WHERE id=?").run(manager);
  }
  assert.deepEqual(a.eventsOf(db, id), before);
});

test("manager queue excludes info, offered and rejected; includes only queued", async () => {
  const q = await queued();
  await info();
  const terminal = await offered();
  const rejected = await queued();
  await post(rejected, "reject", {}, manager).expect(200);
  const queue = await request(app)
    .get("/api/bank/queue")
    .set("Cookie", cookies[manager])
    .expect(200);
  assert.ok(queue.body.some((r: any) => r.application.id === q));
  assert.ok(queue.body.every((r: any) => r.application.status === "queued"));
  assert.ok(
    !queue.body.some((r: any) =>
      [terminal, rejected].includes(r.application.id),
    ),
  );
});

test("nudge is required in latest info cycle; system approval cannot bypass incomplete dossier", async () => {
  const id = await info();
  await assert.rejects(internal(id, "escalate_silent"), { status: 409 });
  await internal(id, "agent_nudge", { text: "fixture" });
  await internal(id, "escalate_silent");
  await post(
    id,
    "request_info",
    { hole: "statement", text: "fixture" },
    manager,
  ).expect(200);
  await assert.rejects(internal(id, "escalate_silent"), { status: 409 });
  await internal(id, "agent_nudge", { text: "fixture" });
  await internal(id, "escalate_silent");
  const events = a.eventsOf(db, id);
  await post(id, "send_to_underwriting", { memo: "fixture" }, manager).expect(
    409,
  );
  await assert.rejects(
    internal(id, "underwriter_approve", { amount: 300000 }),
    { status: 409 },
  );
  assert.deepEqual(a.eventsOf(db, id), events);
});
