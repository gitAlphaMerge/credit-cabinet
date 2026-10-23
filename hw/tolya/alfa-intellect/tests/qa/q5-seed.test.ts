import test from "node:test";
import assert from "node:assert/strict";
import { clock, setup, realCoreTransport, validInn } from "./q5-support";

test("Q5 seed: four genuinely red cases, priority, journal replay, credentials and retry", async () => {
  const { db, api, seedManager, DEMO_CASES, verifyPassword } = await setup();
  const transport = realCoreTransport();
  const logs: string[] = [];
  const deps = { clock, core: api.httpCoreClient };
  try {
    const seeded = await seedManager(db, { ...deps, log: (s) => logs.push(s) });
    assert.equal(
      transport.calls(),
      4,
      JSON.stringify(seeded.map((a) => api.dossierOf(db, a.id))),
    );
    assert.equal(seeded.length, 4);
    assert.ok(DEMO_CASES.every((c) => validInn(c.inn)));
    const queue = api.bankQueue(db, deps);
    assert.equal(queue.length, 4);
    assert.deepEqual(
      new Set(queue.map((q) => q.application.id)),
      new Set(seeded.map((a) => a.id)),
    );
    const expected = queue
      .map((q) => ({
        id: q.application.id,
        at: q.application.queued_at!,
        priority:
          (Math.min(
            q.application.amount,
            Number(
              JSON.parse(api.dossierOf(db, q.application.id)!.core_result).core
                .limit_now_rub,
            ),
          ) *
            q.N!) /
            q.M! /
            (1 + (q.holes as unknown[]).length) +
          20000 *
            Math.max(
              0,
              (clock().getTime() - Date.parse(q.application.queued_at!)) /
                3600000,
            ),
      }))
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          a.at.localeCompare(b.at) ||
          a.id.localeCompare(b.id),
      );
    assert.deepEqual(
      queue.map((q) => q.application.id),
      expected.map((q) => q.id),
    );
    for (const q of queue) {
      assert.equal(q.application.status, "queued");
      const events = api.eventsOf(db, q.application.id);
      let status: unknown = null;
      for (const [i, e] of events.entries()) {
        assert.equal(e.seq, i + 1);
        assert.equal(e.from_status, status);
        status = api.transition(
          status as any,
          e.event as any,
          e.actor_role as any,
          e.to_status as any,
        );
      }
      assert.equal(status, q.application.status);
      const dossier = api.dossierOf(db, q.application.id)!;
      const core = JSON.parse(dossier.core_result).core;
      assert.ok(
        q.N! < q.M! || q.application.amount > core.limit_now_rub,
        "green application entered manager queue",
      );
      assert.equal(
        events.find((e) => e.event === "submit")!.actor_role,
        "system",
      );
      assert.ok(events.some((e) => e.event === "submit"));
      assert.ok(
        ["CLIENT_SILENT", "CLIENT_DISAGREED"].includes(String(q.red_reason)),
      );
      assert.ok(core.stops_fired.every((s: string) => s === "SHORT_STATEMENT"));
    }
    const byKey = (key: string) =>
      queue.find((q) => q.application.user_id === `q5-client-${key}`)!;
    assert.equal(byKey("disagreed").red_reason, "CLIENT_DISAGREED");
    assert.ok(byKey("disagreed").alternatives!.length > 0);
    assert.ok(byKey("silent").holes.includes("contract_main_customer"));
    assert.ok(byKey("document").holes.includes("statement"));
    assert.equal(byKey("borderline").N, 4);
    assert.equal(byKey("borderline").M, 5);
    assert.equal(logs.filter((s) => s.includes("пароль ")).length, 5);
    for (const line of logs.filter((s) => s.includes("пароль "))) {
      const [, phone, password] = line.match(/телефон (\d+), пароль (\S+)/)!;
      const row = db
        .prepare("SELECT password,state FROM users WHERE phone=?")
        .get(phone) as { password: string; state: string };
      assert.ok(verifyPassword(password, row.password));
      assert.ok(!row.state.includes(password));
    }
    const snapshot = () =>
      JSON.stringify(
        ["users", "applications", "application_events", "dossiers"].map((t) =>
          db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(),
        ),
      );
    const before = snapshot();
    await seedManager(db, { ...deps, log: (s) => logs.push(s) });
    assert.equal(snapshot(), before);
    assert.equal(transport.calls(), 4);
    const first = seeded[0];
    await api.transitionApplication(
      db,
      {
        applicationId: first.id,
        expectedVersion: first.version,
        event: "request_info",
        actorRole: "manager",
        actorId: "q5-manager",
        reason: "Уточнить договор",
        payload: { hole: "contract_main_customer", text: "Уточнить договор" },
      },
      deps,
    );
    const afterManager = snapshot();
    await seedManager(db, { ...deps, log: () => {} });
    assert.equal(
      snapshot(),
      afterManager,
      "repeat seed must preserve manager work",
    );
    assert.equal(logs.filter((s) => s.includes("пароль ")).length, 5);
  } finally {
    transport.restore();
  }
});

test("Q5 core outage leaves draft with no invented dossier; retry succeeds", async () => {
  const { db, api, seedManager } = await setup();
  // Independent schema cloned from migrated in-memory store, no production rows changed.
  const { DatabaseSync } = await import("node:sqlite");
  const isolated = new DatabaseSync(":memory:");
  for (const row of db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all())
    isolated.exec(String(row.sql));
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Q5 simulated offline");
  };
  try {
    await assert.rejects(
      seedManager(isolated, { clock, log: () => {} }),
      /скоринг\/ядро недоступны/,
    );
    assert.equal(
      isolated.prepare("SELECT count(*) AS n FROM dossiers").get()!.n,
      0,
    );
    assert.equal(
      isolated.prepare("SELECT status FROM applications").get()!.status,
      "draft",
    );
  } finally {
    globalThis.fetch = previous;
  }
  const transport = realCoreTransport();
  try {
    await seedManager(isolated, { clock, log: () => {} });
    assert.equal(
      api.bankQueue(isolated, { clock, core: api.httpCoreClient }).length,
      4,
    );
  } finally {
    transport.restore();
    isolated.close();
  }
});
