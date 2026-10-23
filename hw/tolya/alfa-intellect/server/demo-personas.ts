import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { demoPersonas } from "../shared/demo-personas";
import { db, getUser, logout, session, sessionUser } from "./store";

// Миграция изолирована от обычной авторизации и запускается только для демо.
export function ensureDemoSchema(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(users)").all();
  if (!columns.some((column) => column.name === "is_demo"))
    database.exec(
      "ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1))",
    );
}

export const demoPersonasRouter = Router();
demoPersonasRouter.use((req, res, next) => {
  if (!/^\/demo-personas(?:\/|$)/.test(req.path)) return next();
  if (process.env.DEMO_PERSONAS !== "1") {
    res.sendStatus(404);
    return;
  }
  ensureDemoSchema(db);
  next();
});
function token(cookie?: string) {
  return (
    cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("alfa_session="))
      ?.slice(13) ?? ""
  );
}
demoPersonasRouter.get("/demo-personas", (req, res) => {
  const current = sessionUser(token(req.headers.cookie));
  const personas = demoPersonas
    .filter((p) => {
      const user = db
        .prepare("SELECT is_demo,role FROM users WHERE id=?")
        .get(p.userId);
      return user?.is_demo === 1 && user.role === p.role;
    })
    .map((p) => ({
      key: p.key,
      company: p.company,
      description: p.description,
      role: p.role,
      current: p.userId === current?.user_id,
    }));
  res.json({ personas });
});
demoPersonasRouter.post("/demo-personas/switch", (req, res) => {
  const body: unknown = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("persona" in body) ||
    typeof body.persona !== "string"
  ) {
    res.status(422).json({ error: "Выберите демонстрационный профиль" });
    return;
  }
  const persona = demoPersonas.find((p) => p.key === body.persona);
  const user =
    persona &&
    db.prepare("SELECT is_demo,role FROM users WHERE id=?").get(persona.userId);
  if (
    !persona ||
    user?.is_demo !== 1 ||
    user.role !== persona.role ||
    !getUser(persona.userId)
  ) {
    res
      .status(404)
      .json({
        error:
          "Демонстрационный профиль недоступен. Запустите подготовку демо.",
      });
    return;
  }
  // Сначала создаём новую сессию, затем отзываем предыдущую. Токен не попадает в JSON.
  const nextToken = session(persona.userId);
  logout(token(req.headers.cookie));
  res.cookie("alfa_session", nextToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 7 * 86400000,
    path: "/",
  });
  res.json({
    ok: true,
    is_demo: true,
    destination: persona.role === "manager" ? "/bank" : "/application",
  });
});
