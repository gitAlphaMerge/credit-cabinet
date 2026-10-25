import type { DatabaseSync } from "node:sqlite";
/** Only drafts may hold unchosen amount/term. All existing columns, rows and dependent objects survive. */
export function migrateDraftAmounts(db: DatabaseSync) {
  if (db.prepare("SELECT version FROM migrations WHERE version=7").get())
    return;
  const original = String(
    db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='applications'",
      )
      .get()?.sql ?? "",
  );
  const schema = original
    .replace(
      /CREATE TABLE\s+(?:applications|"applications")\s*\(/i,
      "CREATE TABLE applications_mvp2_draft_next (",
    )
    .replace(
      /CHECK\s*\(\s*amount\s*>\s*0\s*\)/i,
      "CHECK(amount>=0 AND (status='draft' OR amount>0))",
    )
    .replace(
      /CHECK\s*\(\s*term_months\s+BETWEEN\s+1\s+AND\s+120\s*\)/i,
      "CHECK((term_months BETWEEN 1 AND 120) OR (status='draft' AND term_months=0))",
    );
  if (
    !schema.includes("applications_mvp2_draft_next") ||
    !schema.includes("amount>=0") ||
    !schema.includes("status='draft' AND term_months=0")
  )
    throw new Error("Unsupported applications schema for draft migration");
  const objects = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE tbl_name='applications' AND type IN ('index','trigger') AND sql IS NOT NULL",
    )
    .all();
  const foreignKeys = db.prepare("PRAGMA foreign_keys").get()?.foreign_keys;
  db.exec("PRAGMA foreign_keys=OFF");
  if (db.prepare("PRAGMA foreign_keys").get()?.foreign_keys)
    throw new Error("Draft migration requires a separate transaction");
  try {
    db.exec("BEGIN IMMEDIATE");
    db.exec(schema);
    db.exec(
      "INSERT INTO applications_mvp2_draft_next SELECT * FROM applications",
    );
    if (
      db
        .prepare(
          "SELECT * FROM applications EXCEPT SELECT * FROM applications_mvp2_draft_next LIMIT 1",
        )
        .get() ||
      db
        .prepare(
          "SELECT * FROM applications_mvp2_draft_next EXCEPT SELECT * FROM applications LIMIT 1",
        )
        .get()
    )
      throw new Error("Application copy verification failed");
    db.exec("DROP TABLE applications");
    db.exec("ALTER TABLE applications_mvp2_draft_next RENAME TO applications");
    for (const object of objects) db.exec(String(object.sql));
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Foreign key validation failed");
    db.exec("INSERT INTO migrations VALUES(7)");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec(foreignKeys ? "PRAGMA foreign_keys=ON" : "PRAGMA foreign_keys=OFF");
  }
}
