import { Router } from "express";
import { z } from "zod";
import { db, getUser } from "./store";
import {
  ApplicationError,
  applicationRequestHash,
  applicationsDependencies,
  bankQueue,
  createApplication,
  dossierOf,
  eventsOf,
  executeApplicationEvent,
  visibleApplication,
  safeErrorMetadata,
  userState,
  type Event,
} from "./applications";

export const applicationsRouter = Router();
// Mounted after app.ts session authentication. Role always comes from the database.
applicationsRouter.use((req, res, next) => {
  if (!/^\/(applications(?:\/|$)|bank(?:\/|$))/.test(req.path)) return next();
  const user = getUser(res.locals.userId);
  if (!user) {
    res.status(401).json({ error: "Войдите в аккаунт" });
    return;
  }
  res.locals.applicationRole = user.role;
  if (req.path.startsWith("/bank/") && user.role !== "manager") {
    res.status(403).json({ error: "Доступно менеджеру" });
    return;
  }
  next();
});
const createSchema = z
  .object({
    selectionId: z.string().min(1).max(128),
    selectionVersion: z.number().int().positive(),
    parent_id: z.string().min(1).max(128).optional(),
  })
  .strict();
applicationsRouter.post("/applications", (req, res) => {
  const result = createApplication(
    db,
    res.locals.userId,
    createSchema.parse(req.body),
    applicationsDependencies(),
  );
  res.status(201).json(result);
});
applicationsRouter.get("/applications", (_req, res) => {
  if (res.locals.applicationRole !== "client")
    throw new ApplicationError(403, "Список доступен клиенту");
  res.json(
    db
      .prepare(
        "SELECT * FROM applications WHERE user_id=? ORDER BY created_at,id",
      )
      .all(res.locals.userId),
  );
});
applicationsRouter.get("/applications/:id", (req, res) => {
  const application = visibleApplication(
    db,
    req.params.id,
    res.locals.applicationRole,
    res.locals.userId,
  );
  const events = eventsOf(db, application.id);
  const rejection = events.findLast((e) => e.event === "reject");
  const alternative = rejection
    ? (JSON.parse(rejection.payload as string).alternative ?? null)
    : null;
  res.json({
    application,
    events,
    dossier: dossierOf(db, application.id) ?? null,
    alternative,
  });
});
const eventSchema = z
  .object({
    event: z.enum([
      "create",
      "submit",
      "request_info",
      "client_update",
      "reject",
      "send_to_underwriting",
      "underwriter_approve",
      "make_offer",
      "sign",
      "disburse",
      "expire",
      "withdraw",
      "accept_alternative",
      "agent_nudge",
      "escalate_silent",
      "escalate_disagreed",
    ]),
    expectedVersion: z.number().int().positive(),
    reason: z.string().max(4000).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
applicationsRouter.post("/applications/:id/events", async (req, res) => {
  const key = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .parse(req.get("Idempotency-Key"));
  const body = eventSchema.parse(req.body);
  const result = await executeApplicationEvent(
    db,
    {
      applicationId: req.params.id,
      event: body.event as Event,
      expectedVersion: body.expectedVersion,
      actorRole: res.locals.applicationRole,
      actorId: res.locals.userId,
      reason: body.reason,
      payload: body.payload,
    },
    key,
    applicationRequestHash(req.path, req.body),
    applicationsDependencies(),
  );
  res.json(result);
});
applicationsRouter.get("/bank/queue", (_req, res) =>
  res.json(bankQueue(db, applicationsDependencies())),
);
applicationsRouter.get("/bank/rejected", (_req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM applications WHERE status='rejected' ORDER BY updated_at,id",
    )
    .all();
  res.json(
    rows.map((a) => {
      const decision = eventsOf(db, a.id as string).findLast(
        (e) => e.to_status === "rejected",
      );
      return {
        ...a,
        client_name: userState(db, a.user_id as string).profile.name ?? null,
        red_reason: "UNDERWRITING_REJECTED",
        reason: decision?.reason ?? null,
      };
    }),
  );
});
// Продуктивность менеджера: только реальные события журнала за 7 дней (по Москве), без подмешанных цифр.
applicationsRouter.get("/bank/stats", (_req, res) => {
  const DAY = 86_400_000,
    day = (ms: number) =>
      new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
  const now = Date.now(),
    keys = Array.from({ length: 7 }, (_, i) => day(now - (6 - i) * DAY));
  const rows = db
    .prepare(
      `SELECT e.event, e.at, a.queued_at FROM application_events e
       JOIN applications a ON a.id=e.application_id
       WHERE e.actor_role='manager' AND e.at>=?
         AND e.event IN ('send_to_underwriting','reject','request_info')`,
    )
    .all(new Date(now - 8 * DAY).toISOString()) as {
    event: string;
    at: string;
    queued_at: string | null;
  }[];
  const days = keys.map((date) => ({
    date,
    forwarded: 0,
    rejected: 0,
    requested: 0,
  }));
  const waits: number[] = [];
  for (const r of rows) {
    const bucket = days.find((d) => d.date === day(Date.parse(r.at)));
    if (!bucket) continue;
    if (r.event === "send_to_underwriting") bucket.forwarded++;
    else if (r.event === "reject") bucket.rejected++;
    else bucket.requested++;
    const wait = r.queued_at ? Date.parse(r.at) - Date.parse(r.queued_at) : NaN;
    if (Number.isFinite(wait) && wait >= 0) waits.push(wait / 60_000);
  }
  res.json({
    days,
    avgMinutes: waits.length
      ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
      : null,
  });
});
// Keep application errors local; the legacy app error handler maps generic failures to 400.
applicationsRouter.use(
  (
    error: unknown,
    _req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }
    const status = error instanceof ApplicationError ? error.status : 500;
    if (status === 500)
      console.error(
        "[applications] transaction failed",
        safeErrorMetadata(error),
      );
    res.status(status).json({
      error:
        error instanceof ApplicationError
          ? error.message
          : "Не удалось сохранить заявку",
    });
  },
);
