import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import {
  db,
  initialState,
  session,
  sessionUser,
  getUser,
  stateOf,
  saveState,
  logout,
} from "./store";
import {
  onboardingSchema,
  questionnaireInputSchema,
  initialQuestionnaire,
  type MvpApplication,
} from "../shared/mvp2";
import { createMvp, updateMvp } from "./mvp2";

db.exec(`CREATE TABLE IF NOT EXISTS mvp2_guests(user_id TEXT PRIMARY KEY REFERENCES users(id));
CREATE TABLE IF NOT EXISTS mvp2_journey(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL);`);
db.exec(
  `CREATE TABLE IF NOT EXISTS mvp2_draft_buffers(application_id TEXT PRIMARY KEY REFERENCES applications(id),version INTEGER NOT NULL,data TEXT NOT NULL);`,
);
function ownedDraft(req: Request, res: Response) {
  return db
    .prepare(
      "SELECT d.data FROM mvp2_dossiers d JOIN applications a ON a.id=d.application_id WHERE a.id=? AND a.user_id=?",
    )
    .get(String(req.params.id ?? req.body.applicationId), res.locals.userId);
}
export function readDraft(req: Request, res: Response) {
  const owner = ownedDraft(req, res);
  if (!owner) {
    res.status(404).json({ error: "Заявка не найдена" });
    return;
  }
  const a = JSON.parse(owner.data as string),
    row = db
      .prepare(
        "SELECT version,data FROM mvp2_draft_buffers WHERE application_id=?",
      )
      .get(a.id);
  res.json(
    row && row.version === a.version ? JSON.parse(row.data as string) : null,
  );
}
const draftQuestionnaire = questionnaireInputSchema.extend({
  inn: z.string().regex(/^\d{0,12}$/),
  amount: z.number().min(0).max(1e12).nullable(),
  term: z.number().int().min(0).max(120).nullable(),
});
export function saveDraft(req: Request, res: Response) {
  const value = z
    .object({
      applicationId: z.string().uuid(),
      version: z.number().int().positive(),
      questionnaire: draftQuestionnaire,
      onboarding: onboardingDraft.optional(),
      section: z.number().int().min(0).max(4),
      sequence: z.number().int().nonnegative().optional(),
    })
    .strict()
    .parse(req.body);
  const owner = ownedDraft(req, res);
  if (!owner) {
    res.status(404).json({ error: "Заявка не найдена" });
    return;
  }
  const a = JSON.parse(owner.data as string);
  if (
    a.version !== value.version ||
    !(a.lifecycle === "DRAFT" || a.decision === "ADDITIONAL_DATA_REQUIRED")
  ) {
    res.status(409).json({ error: "Черновик уже изменился" });
    return;
  }
  const previous = db
    .prepare(
      "SELECT version,data FROM mvp2_draft_buffers WHERE application_id=?",
    )
    .get(a.id);
  const oldBuffer =
    previous?.version === value.version
      ? JSON.parse(String(previous.data))
      : null;
  if (
    oldBuffer &&
    ((value.sequence === undefined && oldBuffer.sequence !== undefined) ||
      (value.sequence !== undefined &&
        ((oldBuffer.sequence ?? -1) > value.sequence ||
          (oldBuffer.sequence === value.sequence &&
            JSON.stringify(oldBuffer) !== JSON.stringify(value)))))
  ) {
    res
      .status(409)
      .json({ error: "Сохранён более новый черновик. Обновите данные." });
    return;
  }
  db.prepare(
    "INSERT INTO mvp2_draft_buffers VALUES(?,?,?) ON CONFLICT(application_id) DO UPDATE SET version=excluded.version,data=excluded.data",
  ).run(a.id, value.version, JSON.stringify(value));
  res.json({ ok: true });
}
export function journeyToken(req: Request) {
  return (
    req.headers.cookie
      ?.split(/;\s*/)
      .find((x) => x.startsWith("alfa_session="))
      ?.slice(13) || ""
  );
}
export function isGuest(uid: string) {
  return !!db.prepare("SELECT 1 FROM mvp2_guests WHERE user_id=?").get(uid);
}
/** Never authorize service screens from mutable profile/cabinet/frontend flags. */
export function cabinetAvailable(uid: string) {
  const rows = db
    .prepare(
      `SELECT d.data FROM mvp2_dossiers d JOIN applications a ON a.id=d.application_id JOIN mvp2_disbursements x ON x.application_id=a.id WHERE a.user_id=?`,
    )
    .all(uid);
  return rows.some((row) => {
    const a = JSON.parse(row.data as string);
    return (
      a.lifecycle === "ACTIVE" &&
      a.signature?.hash &&
      a.signature.hash === a.contract?.hash &&
      a.signature.version === a.contract?.version
    );
  });
}
export function readJourney(uid: string) {
  const saved = db
    .prepare("SELECT data FROM mvp2_journey WHERE user_id=?")
    .get(uid);
  return saved
    ? JSON.parse(saved.data as string)
    : {
        onboarding: null,
        onboardingStep: 0,
        view: "recommendation",
        section: 0,
        applicationId: null,
      };
}
function writeJourney(uid: string, data: unknown) {
  db.prepare(
    "INSERT INTO mvp2_journey VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data",
  ).run(uid, JSON.stringify(data));
}
function newGuestSession(previousToken?: string) {
  const owner = randomUUID();
  const state = initialState({
    name: "Мой бизнес",
    form: "ООО",
    stage: "operating",
    registered: true,
    sector: "Не указан",
    ageBand: "Не указан",
    result: "Не указан",
    debt: "Не уверен",
    intent: "Оформление кредита",
  });
  state.preferences.tourDone = true;
  db.exec("BEGIN IMMEDIATE");
  try {
    // Storage owner, not a customer account: no phone, password or login step.
    db.prepare(
      "INSERT INTO users(id,phone,password,state) VALUES(?,?,?,?)",
    ).run(
      owner,
      `anonymous:${owner}`,
      "!anonymous-login-disabled",
      JSON.stringify(state),
    );
    db.prepare("INSERT INTO mvp2_guests VALUES(?)").run(owner);
    const token = session(owner);
    if (previousToken) logout(previousToken);
    db.exec("COMMIT");
    return { owner, token };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function guestCookie(res: Response, token: string) {
  res.cookie("alfa_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 7 * 86400000,
    path: "/",
  });
}
export function bootstrapJourney(req: Request, res: Response) {
  let owner = sessionUser(journeyToken(req))?.user_id;
  if (!owner) {
    const fresh = newGuestSession();
    owner = fresh.owner;
    guestCookie(res, fresh.token);
  }
  res.json({ ok: true, workspaceId: owner });
}
/** Start a separate journey; retain all dossiers, events, documents and active credits. */
export function restartJourney(req: Request, res: Response) {
  if (getUser(res.locals.userId)?.role === "manager") {
    res
      .status(403)
      .json({ error: "Перезапуск доступен в клиентском интерфейсе." });
    return;
  }
  if (req.get("X-Journey-Workspace") !== res.locals.userId) {
    res.status(409).json({
      error: "Сессия изменилась. Обновите страницу перед перезапуском.",
    });
    return;
  }
  const fresh = newGuestSession(journeyToken(req));
  guestCookie(res, fresh.token);
  res.json({ ok: true, workspaceId: fresh.owner, next: "/" });
}
const draftShape = Object.fromEntries(
  Object.entries(onboardingSchema.shape).map(([k, v]) => [
    k,
    k === "term"
      ? v
      : k === "amount"
        ? z.number().int().min(0).max(1e12).nullable().optional()
        : v.or(z.literal("")),
  ]),
);
const onboardingDraft = z.object(draftShape);
export function saveOnboarding(req: Request, res: Response) {
  const value = z
    .object({
      answers: onboardingDraft,
      step: z.number().int().min(0).max(2),
      sequence: z.number().int().nonnegative().optional(),
    })
    .strict()
    .parse(req.body);
  const uid = res.locals.userId;
  const previous = readJourney(uid);
  if (
    (value.sequence === undefined &&
      previous.onboardingSequence !== undefined) ||
    (value.sequence !== undefined &&
      ((previous.onboardingSequence ?? 0) > value.sequence ||
        ((previous.onboardingSequence ?? -1) === value.sequence &&
          (JSON.stringify(previous.onboarding) !==
            JSON.stringify(value.answers) ||
            previous.onboardingStep !== value.step))))
  ) {
    res
      .status(409)
      .json({ error: "Сохранены более новые ответы. Обновите страницу." });
    return;
  }
  writeJourney(uid, {
    ...previous,
    onboarding: value.answers,
    onboardingStep: value.step,
    ...(value.sequence !== undefined
      ? { onboardingSequence: value.sequence }
      : {}),
  });
  res.json({ ok: true });
}
export function completeOnboarding(req: Request, res: Response) {
  const answers = onboardingSchema.parse(req.body.answers);
  let uid = res.locals.userId;
  let position = readJourney(uid);
  let fresh: ReturnType<typeof newGuestSession> | undefined;
  const sequence = z
    .number()
    .int()
    .nonnegative()
    .optional()
    .parse(req.body.sequence);
  if (
    sequence !== undefined &&
    (sequence !== position.onboardingSequence ||
      JSON.stringify(position.onboarding) !== JSON.stringify(answers))
  ) {
    res.status(409).json({
      error:
        "Ответы изменились. Сохраните актуальные ответы и повторите подбор.",
    });
    return;
  }
  const existing = readJourney(uid).applicationId;
  let draft: MvpApplication | undefined;
  if (existing) {
    const saved = db
      .prepare(
        "SELECT d.data FROM mvp2_dossiers d JOIN applications a ON a.id=d.application_id WHERE a.id=? AND a.user_id=?",
      )
      .get(existing, uid);
    if (saved && JSON.parse(saved.data as string).lifecycle !== "DRAFT") {
      if (getUser(uid)?.role === "manager") {
        res
          .status(403)
          .json({ error: "Новый подбор доступен в клиентском интерфейсе." });
        return;
      }
      // A repeated pass is a separate anonymous workspace, never an edit of a
      // submitted dossier. Keep entered answers and revoke the old cookie only
      // after the new application has been created successfully.
      fresh = newGuestSession();
      uid = fresh.owner;
      position = { onboardingSequence: sequence ?? 0 };
    } else if (saved) draft = JSON.parse(saved.data as string);
  }
  const next = initialQuestionnaire(answers);
  const a =
      draft && JSON.stringify(draft.onboarding) !== JSON.stringify(answers)
        ? updateMvp(
            db,
            uid,
            draft.id,
            draft.version,
            {
              ...draft.questionnaire,
              purpose: answers.purpose,
              amount: next.amount,
              term: answers.term,
              usage: answers.usage,
              repayment: answers.repayment,
              productId: next.productId,
            },
            answers,
          )
        : createMvp(db, uid, answers),
    s = stateOf(uid);
  s.profile.mvp2Answers = a.onboarding;
  saveState(uid, s);
  writeJourney(uid, {
    ...position,
    onboarding: a.onboarding,
    onboardingStep: 2,
    applicationId: a.id,
    view: "recommendation",
    section: 0,
  });
  if (fresh) {
    logout(journeyToken(req));
    guestCookie(res, fresh.token);
  }
  res.json(a);
}
export function saveJourneyPosition(req: Request, res: Response) {
  const data = z
    .object({
      applicationId: z.string().uuid(),
      view: z.enum([
        "recommendation",
        "catalog",
        "intro",
        "questionnaire",
        "dossier",
        "supplement",
        "processing",
        "decision",
        "meeting",
        "details",
        "contract",
        "receive",
        "funded",
        "chat",
        "scenario",
      ]),
      section: z.number().int().min(0).max(4),
    })
    .strict()
    .parse(req.body);
  const application = db
    .prepare("SELECT id FROM applications WHERE id=? AND user_id=?")
    .get(data.applicationId, res.locals.userId);
  if (!application) {
    res.status(404).json({ error: "Заявка не найдена" });
    return;
  }
  const dossier = db
    .prepare("SELECT data FROM mvp2_dossiers WHERE application_id=?")
    .get(data.applicationId);
  const a = dossier ? JSON.parse(dossier.data as string) : null;
  if (a && ["SUBMITTED", "PROCESSING"].includes(a.lifecycle))
    data.view = "processing";
  else if (
    a &&
    (a.error ||
      (a.decision &&
        [
          "recommendation",
          "catalog",
          "intro",
          "questionnaire",
          "dossier",
          "processing",
        ].includes(data.view)))
  )
    data.view = "decision";
  writeJourney(res.locals.userId, {
    ...readJourney(res.locals.userId),
    ...data,
  });
  res.json({ ok: true });
}
export function guardJourneyApi(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const uid = res.locals.userId;
  // An old tab or a queued autosave must never write into a newly restarted journey.
  const expected = req.get("X-Journey-Workspace");
  if (expected && expected !== uid) {
    res.status(409).json({
      error: "В другой вкладке начат новый проход. Обновите страницу.",
    });
    return;
  }
  const participant =
    isGuest(uid) ||
    !!db
      .prepare(
        "SELECT a.id FROM applications a JOIN mvp2_dossiers d ON d.application_id=a.id WHERE a.user_id=? LIMIT 1",
      )
      .get(uid);
  if (
    getUser(uid)?.role === "manager" ||
    !participant ||
    cabinetAvailable(uid)
  ) {
    next();
    return;
  }
  // Guests cannot manufacture an active credit through old calculator/demo/manual routes.
  if (
    /^\/(?:mvp2(?:\/|$)|journey(?:\/|$)|state$|config$|preferences$|consultations$|chats\/[^/]+\/feedback$)/.test(
      req.path,
    )
  ) {
    next();
    return;
  }
  res.status(403).json({
    error: "Кредитный кабинет доступен после получения финансирования",
    next: "/apply",
  });
}
export function guardJourneyPage(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.path.startsWith("/api/") || /\.[a-z0-9]+$/i.test(req.path)) {
    next();
    return;
  }
  const uid = sessionUser(journeyToken(req))?.user_id;
  if (req.path === "/bank" && uid && getUser(uid)?.role === "manager") {
    next();
    return;
  }
  if (["/", "/onboarding", "/apply", "/jury", "/login", "/about", "/cfa"].includes(req.path)) {
    next();
    return;
  }
  if (
    uid &&
    cabinetAvailable(uid) &&
    ["/cabinet", "/chat"].includes(req.path)
  ) {
    next();
    return;
  }
  res.redirect(303, uid ? "/apply" : "/onboarding");
}
