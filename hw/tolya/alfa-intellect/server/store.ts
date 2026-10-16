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
    profile,
    documents: [],
    chats: [{ id: randomUUID(), title: "Знакомство с бизнесом", messages: [] }],
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
};
export function createUser(phone: string, password: string, profile: Profile) {
  const id = randomUUID();
  db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
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
