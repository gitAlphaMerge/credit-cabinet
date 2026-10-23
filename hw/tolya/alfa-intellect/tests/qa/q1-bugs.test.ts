import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  a,
  app,
  db,
  cookies,
  request,
  state,
  owner,
  manager,
  assert,
  create,
  post,
  internal,
  info,
  queued,
  setMode,
  setPause,
  saveState,
} from "./q1-harness";

test("BUG: another SQLite writer must yield a conflict, never SQLITE_BUSY as HTTP 500", async () => {
  const id = create(),
    before = a.eventsOf(db, id);
  const writer = new DatabaseSync(process.env.DATABASE_PATH!);
  writer.exec("BEGIN IMMEDIATE");
  try {
    const response = await post(id, "withdraw", {}, owner, 1);
    console.log(
      `Q1_SQLITE_CONTENTION: HTTP=${response.status} body=${JSON.stringify(response.body)}`,
    );
    assert.equal(
      response.status,
      409,
      "writer contention must be mapped to a retryable conflict",
    );
  } finally {
    writer.exec("ROLLBACK");
    writer.close();
  }
  assert.deepEqual(a.eventsOf(db, id), before);
});

test("BUG: accept_alternative caller is client only in frozen contract, internal system must not accept it", async () => {
  setMode("limit");
  const id = create();
  await post(id, "submit", { consent: true }).expect(200);
  const before = a.eventsOf(db, id);
  await assert.rejects(
    internal(id, "accept_alternative", { option_id: "q1-option" }),
    { status: 403 },
  );
  assert.deepEqual(a.eventsOf(db, id), before);
});

for (const event of [
  "agent_nudge",
  "escalate_silent",
  "escalate_disagreed",
] as const)
  test(`BUG: owned client HTTP delegation ${event} must journal system (application-states.md:156-161)`, async () => {
    const id = await info();
    if (event === "escalate_silent")
      await internal(id, "agent_nudge", { text: "fixture" });
    const before = a.eventsOf(db, id).length;
    await post(id, event, {
      text: "fixture",
      client_objections: "fixture",
    }).expect(200);
    assert.equal(a.eventsOf(db, id).length, before + 1);
    assert.equal(a.eventsOf(db, id).at(-1)!.actor_role, "system");
  });

test("BUG: request_info accepts contracted hole/text payload without undocumented top-level reason", async () => {
  const id = await queued();
  await post(
    id,
    "request_info",
    { hole: "statement", text: "Send a statement" },
    manager,
    undefined,
    undefined,
    "",
  ).expect(200);
  assert.equal(a.applicationOf(db, id).status, "info_requested");
});

for (const change of ["profile", "document"] as const)
  test(`BUG: changing ${change} during scoring invalidates stale underwriting before it can offer`, async () => {
    setMode("green");
    const id = create(),
      original = structuredClone(state);
    let release!: () => void, entered!: () => void;
    const entry = new Promise<void>((r) => (entered = r)),
      wait = new Promise<void>((r) => (release = r));
    setPause(async () => {
      entered();
      await wait;
    });
    const slow = post(id, "submit", { consent: true }, owner, 1).then((r) => r);
    await entry;
    try {
      if (change === "profile") {
        await request(app)
          .patch("/api/profile")
          .set("Cookie", cookies[owner])
          .send({ ageBand: "0 месяцев", sector: "Изменённый сектор" })
          .expect(200);
      } else {
        const uploaded = await request(app)
          .post("/api/documents")
          .set("Cookie", cookies[owner])
          .field("category", "statement")
          .attach(
            "file",
            Buffer.from(
              "date,amount,counterparty,purpose,kind\n2026-10-22,-999999,fixture,fixture,operating\n",
            ),
            "q1-changed-statement.csv",
          )
          .expect(200);
        await request(app)
          .post(`/api/documents/${uploaded.body.id}/confirm`)
          .set("Cookie", cookies[owner])
          .send({})
          .expect(200);
      }
    } finally {
      release();
      setPause(undefined);
    }
    let response;
    try {
      response = await slow;
    } finally {
      saveState(original);
    }
    console.log(
      `Q1_STALE_${change.toUpperCase()}: HTTP=${response.status} status=${a.applicationOf(db, id).status}`,
    );
    assert.equal(
      response.status,
      409,
      "stale score must be rejected after the persisted input changed",
    );
    assert.equal(a.eventsOf(db, id).length, 1);
    assert.equal(a.dossierOf(db, id), undefined);
  });
