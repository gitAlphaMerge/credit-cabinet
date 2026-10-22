import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { AppState, Profile } from "../shared/types";
const file = process.env.DATABASE_PATH || "var/alfa.sqlite";
if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,phone TEXT UNIQUE NOT NULL,password TEXT NOT NULL,state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL); CREATE TABLE IF NOT EXISTS usage(user_id TEXT NOT NULL,day TEXT NOT NULL,calls INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day)); INSERT OR IGNORE INTO migrations VALUES(1);",
);
// NULL message_id needs a separate partial index: SQLite treats NULLs as distinct.
db.exec(`CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), chat_id TEXT NOT NULL,
  message_id TEXT, kind TEXT NOT NULL CHECK(kind IN ('message','conversation')),
  rating TEXT, reasons TEXT NOT NULL DEFAULT '[]', text TEXT NOT NULL DEFAULT '',
  agent_mode TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id,message_id,kind));
  CREATE UNIQUE INDEX IF NOT EXISTS feedback_conversation ON feedback(user_id,chat_id) WHERE kind='conversation';
  INSERT OR IGNORE INTO migrations VALUES(3);`);
// Migration 4 is atomic, including the role column on existing databases.
db.exec("BEGIN IMMEDIATE");
try {
  if (!db.prepare("SELECT version FROM migrations WHERE version=4").get()) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'client'
      CHECK(role IN ('client','manager'));
      CREATE TABLE applications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        selection_id TEXT NOT NULL, selection_version INTEGER NOT NULL,
        status TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
        term_months INTEGER NOT NULL CHECK(term_months BETWEEN 1 AND 120), purpose TEXT NOT NULL,
        version INTEGER NOT NULL CHECK(version>0), consent_at TEXT, queued_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX applications_owner ON applications(user_id,created_at);
      CREATE INDEX applications_queue ON applications(status,queued_at,id);
      CREATE TABLE application_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id TEXT NOT NULL REFERENCES applications(id), seq INTEGER NOT NULL CHECK(seq>0),
        event TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
        actor_role TEXT NOT NULL CHECK(actor_role IN ('client','manager','system')),
        actor_id TEXT REFERENCES users(id), reason TEXT, payload TEXT NOT NULL, at TEXT NOT NULL,
        UNIQUE(application_id,seq));
      CREATE TABLE dossiers (
        application_id TEXT NOT NULL REFERENCES applications(id), version INTEGER NOT NULL,
        core_result TEXT NOT NULL, checks TEXT NOT NULL, holes TEXT NOT NULL, created_at TEXT NOT NULL,
        readiness_n REAL, readiness_m REAL, PRIMARY KEY(application_id,version));
      CREATE TABLE application_idempotency (
        key TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
        request_hash TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(key,user_id));
      INSERT INTO migrations VALUES(4);`);
  }
  // v1 metadata belongs to the dossier, never to the untouched core JSON.
  if (!db.prepare("SELECT version FROM migrations WHERE version=5").get()) {
    db.exec(`ALTER TABLE dossiers ADD COLUMN checklist_version TEXT;
      INSERT INTO migrations VALUES(5);`);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
export type Feedback = {
  id: string; user_id: string; chat_id: string; message_id: string | null;
  kind: "message" | "conversation"; rating: string | null; reasons: string;
  text: string; agent_mode: string | null; created_at: string; updated_at: string;
};
export function feedbackOf(user: string, chat: string): Feedback[] {
  return db.prepare("SELECT * FROM feedback WHERE user_id=? AND chat_id=? ORDER BY created_at,id").all(user,chat) as Feedback[];
}
export function hashPassword(p: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
}
export function verifyPassword(p: string, hash: string) {
  const [salt, value] = hash.split(":");
  const expected = Buffer.from(value, "hex");
  const actual = scryptSync(p, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function initialState(profile: Profile): AppState {
  return {
    profile: { ...profile, onboardedAt: new Date().toISOString() },
    documents: [],
    chats: [{ id: randomUUID(), title: "Знакомство с бизнесом", messages: [],
      ...{createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()} }],
    selections: [],
    credit: null,
    notifications: [],
    leads: [],
    preferences: { split: 60, tourDone: false },
    financials: {},
  };
}
export type User = {
  id: string;
  phone: string;
  password: string;
  state: string;
  role: "client" | "manager";
};
export function createUser(phone: string, password: string, profile: Profile) {
  const id = randomUUID();
  db.prepare("INSERT INTO users(id,phone,password,state) VALUES(?,?,?,?)").run(
    id,
    phone,
    hashPassword(password),
    JSON.stringify(initialState(profile)),
  );
  return id;
}
export function getUser(id: string) {
  return db.prepare("SELECT * FROM users WHERE id=?").get(id) as
    User | undefined;
}
export function stateOf(id: string): AppState {
  return JSON.parse(getUser(id)!.state);
}
export function saveState(id: string, state: AppState) {
  const previous = stateOf(id);
  const now = new Date().toISOString();
  for (const chat of state.chats) {
    const old = previous.chats.find(c => c.id === chat.id);
    const dated = chat as typeof chat & { createdAt?: string; updatedAt?: string };
    dated.createdAt ||= chat.messages[0]?.createdAt || now;
    if (!old || JSON.stringify(old) !== JSON.stringify(chat)) dated.updatedAt = now;
  }
  db.prepare("UPDATE users SET state=? WHERE id=?").run(
    JSON.stringify(state),
    id,
  );
}
export function session(id: string) {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    createHash("sha256").update(token).digest("hex"),
    id,
    Date.now() + 7 * 86400000,
  );
  return token;
}
export function sessionUser(token: string) {
  return db
    .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
    .get(createHash("sha256").update(token).digest("hex"), Date.now()) as
    { user_id: string } | undefined;
}
export function logout(token: string) {
  db.prepare("DELETE FROM sessions WHERE token=?").run(
    createHash("sha256").update(token).digest("hex"),
  );
}
export function notify(
  state: AppState,
  key: string,
  title: string,
  body: string,
  href: string,
) {
  if (!state.notifications.some((n) => n.key === key))
    state.notifications.unshift({
      id: randomUUID(),
      key,
      title,
      body,
      href,
      read: false,
      createdAt: new Date().toISOString(),
    });
}
