/** Run with the application stopped. Never replaces the untouched consistent backup. */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { migrateDraftAmounts } from "../server/mvp2-migration";

const [sourceArg, directoryArg] = process.argv.slice(2);
if (!sourceArg || !directoryArg)
  throw new Error(
    "Usage: tsx scripts/migrate-mvp2-drafts.ts DATABASE BACKUP_DIRECTORY",
  );
const source = resolve(sourceArg),
  directory = resolve(directoryArg);
const backup = join(directory, "before.sqlite");
const rehearsal = join(directory, "verified-copy.sqlite");
if (!existsSync(source) || existsSync(backup) || existsSync(rehearsal))
  throw new Error("Source must exist and backup targets must be new");
mkdirSync(directory, { recursive: true });
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
function snapshot(db: DatabaseSync) {
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    db.prepare("PRAGMA integrity_check").get()!.integrity_check,
    "ok",
  );
  const tables = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT IN ('migrations','sqlite_sequence') ORDER BY name",
    )
    .all();
  return tables.map(({ name, sql }) => {
    const rows = db
      .prepare(`SELECT * FROM ${quote(String(name))}`)
      .all()
      .map((row) => JSON.stringify(row))
      .sort();
    const objects = db
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') ORDER BY name",
      )
      .all(String(name));
    return {
      name,
      rows: rows.length,
      hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      objects,
      ...(name !== "applications" ? { sql } : {}),
    };
  });
}
const db = new DatabaseSync(source);
try {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  const before = snapshot(db);
  db.prepare("VACUUM INTO ?").run(backup);
  copyFileSync(backup, rehearsal);
  const copy = new DatabaseSync(rehearsal);
  try {
    copy.exec("PRAGMA foreign_keys=ON");
    assert.deepEqual(snapshot(copy), before);
    migrateDraftAmounts(copy);
    assert.deepEqual(snapshot(copy), before);
    assert.ok(
      copy.prepare("SELECT version FROM migrations WHERE version=7").get(),
    );
  } finally {
    copy.close();
  }
  console.log(
    JSON.stringify({
      stage: "backup-and-rehearsal-passed",
      backup,
      rehearsal,
      tables: before.map(({ name, rows, hash }) => ({ name, rows, hash })),
    }),
  );
  // Abort if another writer changed data during the rehearsal. The original backup stays intact.
  assert.deepEqual(snapshot(db), before);
  migrateDraftAmounts(db);
  assert.deepEqual(snapshot(db), before);
  assert.ok(db.prepare("SELECT version FROM migrations WHERE version=7").get());
  console.log(
    JSON.stringify({
      stage: "live-migration-verified",
      foreignKeys: "ok",
      rows: "unchanged",
      backup,
    }),
  );
} finally {
  db.close();
}
