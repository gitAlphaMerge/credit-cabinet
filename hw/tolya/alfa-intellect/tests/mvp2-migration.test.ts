import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateDraftAmounts } from "../server/mvp2-migration";
test("Draft migration preserves linked rows, indexes and FK integrity without dummy money", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE migrations(version INTEGER PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('owner'); CREATE TABLE applications(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),status TEXT,amount INTEGER NOT NULL CHECK(amount>0),term_months INTEGER NOT NULL CHECK(term_months BETWEEN 1 AND 120)); CREATE INDEX applications_owner ON applications(user_id); CREATE TABLE events(application_id TEXT REFERENCES applications(id),text TEXT); INSERT INTO applications VALUES('original','owner','approved',1234567,12); INSERT INTO events VALUES('original','keep');",
    );
    const before = db.prepare("SELECT * FROM applications").all();
    migrateDraftAmounts(db);
    migrateDraftAmounts(db);
    assert.deepEqual(db.prepare("SELECT * FROM applications").all(), before);
    assert.equal(db.prepare("SELECT text FROM events").get()!.text, "keep");
    assert.ok(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='applications_owner'",
        )
        .get(),
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);
    db.exec("INSERT INTO applications VALUES('unknown','owner','draft',0,0)");
    assert.throws(() =>
      db.exec(
        "UPDATE applications SET status='underwriting' WHERE id='unknown'",
      ),
    );
    db.exec(
      "UPDATE applications SET amount=300000,term_months=12,status='underwriting' WHERE id='unknown'",
    );
    assert.equal(
      db.prepare("SELECT amount FROM applications WHERE id='unknown'").get()!
        .amount,
      300000,
    );
  } finally {
    db.close();
  }
});

test("Failed FK verification rolls the migration back without replacing the legacy table", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "PRAGMA foreign_keys=OFF; CREATE TABLE migrations(version INTEGER PRIMARY KEY); CREATE TABLE applications(id TEXT PRIMARY KEY,status TEXT,amount INTEGER NOT NULL CHECK(amount>0),term_months INTEGER NOT NULL CHECK(term_months BETWEEN 1 AND 120)); CREATE INDEX applications_queue ON applications(status); INSERT INTO applications VALUES('kept','draft',300000,12); CREATE TABLE events(application_id TEXT REFERENCES applications(id)); INSERT INTO events VALUES('missing'); PRAGMA foreign_keys=ON;",
    );
    const before = db
      .prepare("SELECT name,sql FROM sqlite_master ORDER BY name")
      .all();
    assert.throws(
      () => migrateDraftAmounts(db),
      /Foreign key validation failed/,
    );
    assert.deepEqual(
      db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all(),
      before,
    );
    assert.deepEqual(
      db.prepare("SELECT id,amount FROM applications").get(),
      Object.assign(Object.create(null), { id: "kept", amount: 300000 }),
    );
    assert.equal(
      db.prepare("SELECT version FROM migrations WHERE version=7").get(),
      undefined,
    );
    assert.equal(db.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);
  } finally {
    db.close();
  }
});
