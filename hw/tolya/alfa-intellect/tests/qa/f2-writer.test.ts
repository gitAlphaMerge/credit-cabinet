import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { a, db, deps, owner, create, assert, scoreCalls } from "./q1-harness";

test("SQLite retry yields to the event loop and reuses a single score after the writer releases", async () => {
  const id = create();
  const writer = new DatabaseSync(process.env.DATABASE_PATH!);
  writer.exec("BEGIN IMMEDIATE");
  let released = false;
  const release = setImmediate(() => {
    writer.exec("ROLLBACK");
    released = true;
  });
  try {
    await a.transitionApplication(
      db,
      {
        applicationId: id,
        event: "submit",
        expectedVersion: 1,
        actorRole: "client",
        actorId: owner,
        payload: { consent: true },
      },
      deps,
    );
    assert.equal(released, true);
    assert.equal(scoreCalls, 1);
    assert.equal(a.applicationOf(db, id).status, "offered");
    assert.equal(a.eventsOf(db, id).length, 4);
  } finally {
    clearImmediate(release);
    if (!released) writer.exec("ROLLBACK");
    writer.close();
  }
});
