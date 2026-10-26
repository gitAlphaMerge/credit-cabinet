import { randomUUID, createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  managerRequestedFields,
  products,
  productIssues,
  recommend,
  initialQuestionnaire,
  questionnaireSchema,
  defaultContractDetails,
  productTerms,
  questionnaireErrors,
  normalizeQuestionnaire,
  amountBand,
  onboardingSchema,
  type MvpApplication,
  type Questionnaire,
  type OnboardingAnswers,
  type MissingField,
  type MissingDataItem,
  type Decision,
} from "../shared/mvp2";
import type { AppState, Selection } from "../shared/types";
import { day, addDays } from "../shared/cabinet";
import { makeSchedule, dateMonth } from "./cabinet";
import {
  ApplicationError,
  httpCoreClient,
  type CoreClient,
} from "./applications";
import { findCompany } from "./registry";
import { innError } from "../shared/inn";
import { industryFromOkved } from "../shared/company";
import { migrateDraftAmounts } from "./mvp2-migration";
import {
  checkCreditHistory,
  checkAml,
  checkBankruptcy,
  checkTransparentBusiness,
} from "./checks";
import { aggregateStatements, type Statement } from "./mvp2-statements";

export function migrateMvp2(db: DatabaseSync) {
  migrateDraftAmounts(db);
  db.exec(`CREATE TABLE IF NOT EXISTS mvp2_dossiers(application_id TEXT PRIMARY KEY REFERENCES applications(id),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mvp2_revisions(application_id TEXT NOT NULL REFERENCES applications(id),version INTEGER NOT NULL,snapshot TEXT NOT NULL,core_result TEXT,PRIMARY KEY(application_id,version));
    CREATE TABLE IF NOT EXISTS mvp2_checks(application_id TEXT NOT NULL REFERENCES applications(id),version INTEGER NOT NULL,data TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(application_id,version));
    CREATE TABLE IF NOT EXISTS mvp2_statements(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),account_id TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(application_id,account_id));
    CREATE TABLE IF NOT EXISTS mvp2_slots(id TEXT PRIMARY KEY,at TEXT NOT NULL,manager TEXT NOT NULL,application_id TEXT UNIQUE REFERENCES applications(id));
    CREATE TABLE IF NOT EXISTS mvp2_documents(application_id TEXT NOT NULL REFERENCES applications(id),version INTEGER NOT NULL,kind TEXT NOT NULL,signed INTEGER NOT NULL,hash TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(application_id,version,kind,signed));
    CREATE TABLE IF NOT EXISTS mvp2_disbursements(application_id TEXT PRIMARY KEY REFERENCES applications(id),operation_id TEXT UNIQUE NOT NULL,at TEXT NOT NULL,kind TEXT NOT NULL,amount REAL NOT NULL);
    INSERT OR IGNORE INTO migrations VALUES(6);`);
}
function transaction<T>(db: DatabaseSync, f: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = f();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function stateFor(db: DatabaseSync, uid: string): AppState {
  return JSON.parse(
    db.prepare("SELECT state FROM users WHERE id=?").get(uid)!.state as string,
  );
}
function saveState(db: DatabaseSync, uid: string, s: AppState) {
  db.prepare("UPDATE users SET state=? WHERE id=?").run(JSON.stringify(s), uid);
}
export function mvpGet(
  db: DatabaseSync,
  id: string,
  uid: string,
  manager = false,
): MvpApplication {
  const row = db
    .prepare(
      "SELECT d.data,a.user_id FROM mvp2_dossiers d JOIN applications a ON a.id=d.application_id WHERE a.id=?",
    )
    .get(id);
  if (!row || (!manager && row.user_id !== uid))
    throw new ApplicationError(404, "Заявка не найдена");
  const application = JSON.parse(row.data as string) as MvpApplication;
  application.missing = missingDataFor(application);
  return application;
}
const legacyStatus = (a: MvpApplication) =>
  a.lifecycle === "ACTIVE"
    ? "disbursed"
    : a.lifecycle === "SIGNED_DEMO"
      ? "signed"
      : ["CONTRACT_READY", "MANAGER_APPROVED"].includes(a.lifecycle)
        ? "offered"
        : a.lifecycle === "DRAFT"
          ? "draft"
          : ["SUBMITTED", "PROCESSING"].includes(a.lifecycle)
            ? "underwriting"
            : a.decision === "DECLINED"
              ? "rejected"
              : a.decision === "ADDITIONAL_DATA_REQUIRED"
                ? "info_requested"
                : a.decision === "MANAGER_REVIEW_REQUIRED"
                  ? "queued"
                  : "offered";
function save(
  db: DatabaseSync,
  a: MvpApplication,
  event: string,
  actor = "system",
) {
  a.missing = missingDataFor(a);
  a.updatedAt = new Date().toISOString();
  const old = db
    .prepare("SELECT status,user_id FROM applications WHERE id=?")
    .get(a.id)!;
  db.prepare(
    "INSERT OR IGNORE INTO mvp2_revisions(application_id,version,snapshot) VALUES(?,?,?)",
  ).run(a.id, a.version, JSON.stringify(a));
  db.prepare("UPDATE mvp2_dossiers SET data=? WHERE application_id=?").run(
    JSON.stringify(a),
    a.id,
  );
  if (
    ["mvp2_submit", "mvp2_decision", "mvp2_processing_error"].includes(event) &&
    db.prepare("SELECT name FROM sqlite_master WHERE name='mvp2_journey'").get()
  ) {
    const saved = db
      .prepare("SELECT data FROM mvp2_journey WHERE user_id=?")
      .get(old.user_id);
    const journey = saved ? JSON.parse(saved.data as string) : {};
    db.prepare(
      "INSERT INTO mvp2_journey VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data",
    ).run(
      old.user_id,
      JSON.stringify({
        ...journey,
        applicationId: a.id,
        onboarding: a.onboarding,
        view: ["SUBMITTED", "PROCESSING"].includes(a.lifecycle)
          ? "processing"
          : "decision",
      }),
    );
  }
  db.prepare(
    "UPDATE applications SET status=?,amount=?,term_months=?,purpose=?,version=?,updated_at=? WHERE id=?",
  ).run(
    legacyStatus(a),
    a.questionnaire.amount,
    a.questionnaire.term,
    a.questionnaire.purpose,
    a.version,
    a.updatedAt,
    a.id,
  );
  db.prepare(
    `INSERT INTO application_events(application_id,seq,event,from_status,to_status,actor_role,actor_id,reason,payload,at)
    VALUES(?,(SELECT COALESCE(MAX(seq),0)+1 FROM application_events WHERE application_id=?),?,?,?,?,NULL,NULL,?,?)`,
  ).run(
    a.id,
    a.id,
    event,
    old.status,
    legacyStatus(a),
    actor,
    JSON.stringify({
      lifecycle: a.lifecycle,
      decision: a.decision,
      version: a.version,
      ...(a.clientDeferred ? { clientDeferred: true } : {}),
      ...(a.signature ? { signature: a.signature } : {}),
    }),
    a.updatedAt,
  );
}
export function recordMvpTransition(
  db: DatabaseSync,
  a: MvpApplication,
  event: string,
) {
  save(db, a, event, "client");
}
export function deferMvpCredit(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
) {
  const a = mvpGet(db, id, uid);
  requireVersion(a, version);
  if (!a.noCredit || a.clientDeferred || a.lifecycle !== "DECIDED")
    throw new ApplicationError(409, "Этот расчёт нельзя отложить");
  a.clientDeferred = true;
  a.lifecycle = "DRAFT";
  a.decision = undefined;
  a.reasons = ["Клиент отложил заявку после расчёта без кредита."];
  a.version++;
  transaction(db, () => {
    save(db, a, "mvp2_client_deferred", "client");
    const s = stateFor(db, uid);
    syncSelection(s, a);
    saveState(db, uid, s);
  });
  return a;
}
function requireVersion(a: MvpApplication, version: number) {
  if (a.version !== version)
    throw new ApplicationError(
      409,
      "Заявка изменилась в другой вкладке. Обновите данные.",
    );
}
export function createMvp(db: DatabaseSync, uid: string, raw: unknown) {
  const onboarding = onboardingSchema.parse(raw);
  if (onboarding.amount !== undefined)
    onboarding.amountRange = amountBand(onboarding.amount);
  const existing = db
    .prepare(
      "SELECT d.data FROM mvp2_dossiers d JOIN applications a ON a.id=d.application_id WHERE a.user_id=? ORDER BY a.created_at DESC",
    )
    .all(uid)
    .map((r) => JSON.parse(r.data as string) as MvpApplication)
    .find(
      (a) => a.lifecycle === "DRAFT" && hash(a.onboarding) === hash(onboarding),
    );
  if (existing) return existing;
  const q = initialQuestionnaire(onboarding),
    id = randomUUID(),
    now = new Date().toISOString();
  const a: MvpApplication = {
    id,
    businessId: uid,
    version: 1,
    onboarding,
    recommendedProductId: recommend(onboarding),
    questionnaire: q,
    lifecycle: "DRAFT",
    reasons: [],
    missing: [],
    alternatives: [],
    stages: [],
    provenance: {},
    createdAt: now,
    updatedAt: now,
  };
  for (const k of Object.keys(onboarding))
    a.provenance[k] = { source: "ONBOARDING", confirmed: false, at: now };
  transaction(db, () => {
    db.prepare(
      `INSERT INTO applications(id,user_id,selection_id,selection_version,status,amount,term_months,purpose,version,created_at,updated_at) VALUES(?,?,?,1,'draft',?,?,?,1,?,?)`,
    ).run(id, uid, id, q.amount, q.term, q.purpose, now, now);
    db.prepare("INSERT INTO mvp2_dossiers VALUES(?,?)").run(
      id,
      JSON.stringify(a),
    );
    const state = stateFor(db, uid);
    syncSelection(state, a);
    saveState(db, uid, state);
    save(db, a, "mvp2_create", "client");
  });
  return a;
}
function syncSelection(s: AppState, a: MvpApplication) {
  const q = a.questionnaire,
    p = products.find((p) => p.id === q.productId)!;
  const c = {
    amount: q.amount,
    term: q.term,
    rate: p.rate,
    monthlyPayment: a.financial?.payment ?? 0,
    interest: 0,
    total: 0,
    flow: a.financial?.flow ?? null,
    existing: q.monthlyDebt,
    maxAmount: a.financial?.limit ?? null,
    dscr: a.financial?.dscr ?? null,
    stressDscr: null,
    schedule: [],
    source: "MVP 2: параметры заявки; до рассмотрения не финансовое решение",
    formula: "Серверная оценка /score",
  };
  const selection: Selection = {
    id: a.id,
    version: a.version,
    createdAt: a.createdAt,
    purpose: q.purpose,
    repayFrom: q.repayment,
    ownFunds: 0,
    product: p.name,
    calculation: c,
    risks: a.reasons,
    alternatives: [],
    status: a.decision ?? "DRAFT",
  };
  s.selections = [selection, ...s.selections.filter((x) => x.id !== a.id)];
}
export function updateMvp(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
  raw: unknown,
  onboardingRaw?: unknown,
) {
  const q = questionnaireSchema.parse(raw),
    a = mvpGet(db, id, uid);
  if (
    q.term !== 0 &&
    !productTerms(
      products.find((product) => product.id === q.productId)!,
    ).includes(q.term)
  )
    throw new ApplicationError(
      422,
      "Выберите срок из сетки выбранного продукта.",
    );
  const previousOnboarding = hash(a.onboarding);
  requireVersion(a, version);
  if (a.lifecycle !== "DRAFT" && a.decision !== "ADDITIONAL_DATA_REQUIRED")
    throw new ApplicationError(
      409,
      "Условия зафиксированы. Для изменения выберите новый расчёт.",
    );
  if (a.lifecycle === "PROCESSING")
    throw new ApplicationError(409, "Дождитесь проверки");
  if (a.decision === "ADDITIONAL_DATA_REQUIRED") {
    const allowed = new Set(a.missing.map((m) => m.key.split(".")[0]));
    for (const k of Object.keys(q) as (keyof Questionnaire)[])
      if (hash(q[k]) !== hash(a.questionnaire[k]) && !allowed.has(k))
        throw new ApplicationError(
          422,
          "В этой карточке можно менять только запрошенные сведения.",
        );
  }
  if (q.inn !== a.questionnaire.inn) {
    a.company = undefined;
    q.companyConfirmed = false;
  }
  if (a.company) {
    const profile = stateFor(db, uid).profile;
    const generated = defaultContractDetails(
      a.company,
      [],
      profile,
    ).receivingAccount;
    const current = defaultContractDetails(a.company, q.accounts, profile);
    if (
      (!q.receivingAccount || q.receivingAccount === generated) &&
      current.receivingAccount
    ) {
      q.receivingAccount = current.receivingAccount;
      q.receivingBank = current.receivingBank;
    }
  }
  if (onboardingRaw) {
    if (a.decision === "ADDITIONAL_DATA_REQUIRED")
      throw new ApplicationError(
        422,
        "В дозаполнении меняются только запрошенные поля.",
      );
    a.onboarding = onboardingSchema.parse(onboardingRaw);
    a.recommendedProductId = recommend(a.onboarding);
  }
  const now = new Date().toISOString();
  const changedKeys = (Object.keys(q) as (keyof Questionnaire)[]).filter(
    (key) => hash(q[key]) !== hash(a.questionnaire[key]),
  );
  const changedRequests = changedKeys.flatMap((key) =>
    key === "accounts"
      ? q.accounts
          .filter(
            (account) =>
              !a.questionnaire.accounts.some(
                (old) => old.id === account.id && hash(account) === hash(old),
              ),
          )
          .map((account) => `accounts:${account.id}:`)
      : [key],
  );
  a.missing = mergeMissingData(a.missing, [], changedRequests);
  for (const k of Object.keys(q) as (keyof Questionnaire)[])
    if (hash(q[k]) !== hash(a.questionnaire[k]))
      a.provenance[k] = { source: "USER_CONFIRMED", confirmed: true, at: now };
  a.questionnaire = q;
  a.version++;
  a.error = undefined;
  transaction(db, () => {
    save(db, a, "mvp2_edit", "client");
    const s = stateFor(db, uid);
    syncSelection(s, a);
    if (previousOnboarding !== hash(a.onboarding)) {
      s.profile.mvp2Answers = a.onboarding;
      if (
        db
          .prepare("SELECT name FROM sqlite_master WHERE name='mvp2_journey'")
          .get()
      ) {
        const row = db
          .prepare("SELECT data FROM mvp2_journey WHERE user_id=?")
          .get(uid);
        const position = row ? JSON.parse(String(row.data)) : null;
        if (
          position?.applicationId === id &&
          hash(position.onboarding) !== hash(a.onboarding)
        )
          db.prepare("UPDATE mvp2_journey SET data=? WHERE user_id=?").run(
            JSON.stringify({
              ...position,
              onboarding: a.onboarding,
              onboardingStep: 2,
              onboardingSequence: (position.onboardingSequence ?? 0) + 1,
            }),
            uid,
          );
      }
    }
    saveState(db, uid, s);
  });
  return a;
}
export async function registryMvp(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
  inn?: string,
) {
  const a = mvpGet(db, id, uid);
  requireVersion(a, version);
  if (a.lifecycle !== "DRAFT" && a.decision !== "ADDITIONAL_DATA_REQUIRED")
    throw new ApplicationError(409, "Заявка уже рассматривается");
  const requestedInn = inn ?? a.questionnaire.inn;
  if (innError(requestedInn))
    throw new ApplicationError(422, innError(requestedInn));
  // Public registration details only. BKI/AML remain consent-gated in processMvp.
  const company = await findCompany(requestedInn, {
    EGR_PROVIDER: "mock",
  });
  const fresh = mvpGet(db, id, uid);
  requireVersion(fresh, version);
  if (fresh.questionnaire.inn !== requestedInn) {
    fresh.questionnaire.inn = requestedInn;
    fresh.questionnaire.authorized = false;
    fresh.questionnaire.consents = {
      registry: false,
      financial: false,
      bki: false,
    };
  }
  fresh.company = company;
  Object.assign(
    fresh.questionnaire,
    defaultContractDetails(
      company,
      fresh.questionnaire.accounts,
      stateFor(db, uid).profile,
    ),
  );
  fresh.questionnaire.companyConfirmed = false;
  if (fresh.decision === "ADDITIONAL_DATA_REQUIRED")
    fresh.missing = mergeMissingData(
      fresh.missing,
      missingFor(fresh, statementsOf(db, id)),
      ["inn"],
    );
  fresh.provenance.company = {
    source: "REGISTRY",
    confirmed: false,
    at: new Date().toISOString(),
  };
  fresh.version++;
  save(db, fresh, "mvp2_registry", "client");
  return fresh;
}
export function statementsOf(db: DatabaseSync, id: string): Statement[] {
  const row = db
    .prepare("SELECT data FROM mvp2_dossiers WHERE application_id=?")
    .get(id);
  const active = new Set<string>(
    row
      ? JSON.parse(String(row.data))
          .questionnaire.accounts.map(
            (x: { documentId: string }) => x.documentId,
          )
          .filter(Boolean)
      : [],
  );
  return db
    .prepare("SELECT data FROM mvp2_statements WHERE application_id=?")
    .all(id)
    .map((r) => JSON.parse(r.data as string))
    .filter((s: Statement) => active.has(s.id));
}
export function attachStatement(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
  s: Omit<Statement, "id">,
) {
  const a = mvpGet(db, id, uid);
  requireVersion(a, version);
  if (!a.questionnaire.consents.financial)
    throw new ApplicationError(422, "Нужно согласие на анализ выписок.");
  if (a.lifecycle !== "DRAFT" && a.decision !== "ADDITIONAL_DATA_REQUIRED")
    throw new ApplicationError(409, "Нельзя изменить зафиксированную выписку");
  const account = a.questionnaire.accounts.find((x) => x.id === s.accountId);
  if (!account) throw new ApplicationError(422, "Расчётный счёт не найден");
  const previousDocumentId = account.documentId;
  const combinedRecords =
    statementsOf(db, id)
      .filter((x) => x.accountId !== s.accountId)
      .reduce((n, x) => n + x.records.length, 0) + s.records.length;
  if (combinedRecords > 50000)
    throw new ApplicationError(
      422,
      "Совокупная выписка по всем счетам должна содержать не более 50 000 операций.",
    );
  if (
    statementsOf(db, id).some(
      (x) => x.accountId === s.accountId && x.hash === s.hash,
    )
  )
    return a;
  if (
    statementsOf(db, id).some(
      (x) => x.hash === s.hash && x.accountId !== s.accountId,
    )
  )
    throw new ApplicationError(
      422,
      "Эта выписка уже загружена для другого счёта. Проверьте файл.",
    );
  const statement = { ...s, id: randomUUID() };
  account.documentId = statement.id;
  if (a.decision === "ADDITIONAL_DATA_REQUIRED") {
    const refreshed = missingFor(a, [
      ...statementsOf(db, id).filter((item) => item.accountId !== s.accountId),
      statement,
    ]);
    const uploaded = refreshed.some((item) => item.key === "accounts")
      ? [`accounts:${s.accountId}:`]
      : ["accounts"];
    a.missing = mergeMissingData(a.missing, refreshed, uploaded);
  }
  a.version++;
  a.provenance["accounts." + s.accountId] = {
    source: "CSV",
    confirmed: true,
    at: new Date().toISOString(),
  };
  transaction(db, () => {
    db.prepare(
      "INSERT INTO mvp2_statements VALUES(?,?,?,?) ON CONFLICT(application_id,account_id) DO UPDATE SET id=excluded.id,data=excluded.data",
    ).run(statement.id, id, s.accountId, JSON.stringify(statement));
    const state = stateFor(db, uid);
    state.documents = state.documents.filter(
      (d) => d.id !== previousDocumentId,
    );
    state.documents.push({
      id: statement.id,
      category: "statement",
      name: s.name,
      period: s.period,
      fields: { months: s.months.length },
      records: s.records,
      confirmed: true,
      createdAt: new Date().toISOString(),
      currency: "RUB",
      mime: "text/csv",
    });
    saveState(db, uid, state);
    save(db, a, "mvp2_csv", "client");
  });
  return a;
}
export { industryFromOkved } from "../shared/company";
export function removeStatement(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
  statementId: string,
) {
  const a = mvpGet(db, id, uid);
  requireVersion(a, version);
  if (a.lifecycle !== "DRAFT" && a.decision !== "ADDITIONAL_DATA_REQUIRED")
    throw new ApplicationError(409, "Нельзя изменить зафиксированную выписку");
  const existing = db
    .prepare("SELECT id FROM mvp2_statements WHERE application_id=? AND id=?")
    .get(id, statementId);
  if (!existing) throw new ApplicationError(404, "Выписка не найдена");
  for (const account of a.questionnaire.accounts)
    if (account.documentId === statementId) account.documentId = "";
  if (a.decision === "ADDITIONAL_DATA_REQUIRED")
    a.missing = mergeMissingData(
      a.missing,
      missingFor(
        a,
        statementsOf(db, id).filter((item) => item.id !== statementId),
      ),
    );
  a.version++;
  transaction(db, () => {
    db.prepare(
      "DELETE FROM mvp2_statements WHERE application_id=? AND id=?",
    ).run(id, statementId);
    const s = stateFor(db, uid);
    s.documents = s.documents.filter((d) => d.id !== statementId);
    saveState(db, uid, s);
    save(db, a, "mvp2_remove_csv", "client");
  });
  return a;
}
const criticalMissing = new Set([
  "inn",
  "companyConfirmed",
  "authorized",
  "consents",
  "accounts",
  "debtReconciled",
]);
const limitMissing = new Set([
  "customerContractAmount",
  "customerContractMonths",
  "reconciliationReference",
  "debt",
  "monthlyDebt",
  "monthlyLeasing",
]);
const genericMissingEffect =
  "Сведения уточнят расчёт и помогут банку рассмотреть заявку.";
const criticalMissingEffect =
  "После этого банк сможет продолжить проверку заявки.";

/** Return the same persisted requests, with one identity and explanation per cause. */
export function missingDataFor(a: MvpApplication): MissingDataItem[] {
  const unique = new Map<string, MissingDataItem>();
  for (const field of a.missing) {
    const id = field.id ?? `${field.key}:${hash(field.label).slice(0, 12)}`;
    const limitAfter = a.financial?.limitAfter;
    const calculatedLimit = [
      "customerContractAmount",
      "customerContractMonths",
      "reconciliationReference",
    ].includes(field.key);
    const canUseLimit = !field.effect || field.effect === genericMissingEffect;
    const limitNow = a.financial?.limitNow ?? a.financial?.limit ?? 0;
    const effect =
      calculatedLimit &&
      canUseLimit &&
      Number.isFinite(limitAfter) &&
      limitAfter! > limitNow
        ? `Расчётный лимит сейчас ${Math.round(limitNow).toLocaleString("ru-RU")} ₽. После подтверждения всех запрошенных сведений он может вырасти до ${Math.round(limitAfter!).toLocaleString("ru-RU")} ₽. Итог проверит банк.`
        : (field.effect ??
          (criticalMissing.has(field.key)
            ? criticalMissingEffect
            : genericMissingEffect));
    unique.set(id, {
      ...field,
      id,
      title: field.title ?? field.label,
      why: field.why ?? field.label,
      effect,
      status: field.status ?? "todo",
    });
  }
  const priority = (item: MissingDataItem) =>
    criticalMissing.has(item.key) ? 0 : limitMissing.has(item.key) ? 1 : 2;
  const impact = (item: MissingDataItem) =>
    [
      "customerContractAmount",
      "customerContractMonths",
      "reconciliationReference",
    ].includes(item.key)
      ? Math.max(
          0,
          (a.financial?.limitAfter ?? 0) -
            (a.financial?.limitNow ?? a.financial?.limit ?? 0),
        )
      : 0;
  return [...unique.values()].sort(
    (x, y) =>
      Number(x.status !== "todo") - Number(y.status !== "todo") ||
      priority(x) - priority(y) ||
      impact(y) - impact(x) ||
      x.section - y.section ||
      x.id.localeCompare(y.id),
  );
}

/** Keep closed requests and manager additions when automatic checks run again. */
export function mergeMissingData(
  previous: MissingField[],
  current: MissingField[],
  uploadedKeys: string[] = [],
  checked = false,
): MissingDataItem[] {
  const old = missingDataFor({ missing: previous } as MvpApplication);
  const fresh = missingDataFor({ missing: current } as MvpApplication);
  const uploaded = (item: MissingDataItem) =>
    uploadedKeys.some((key) => key === item.key || item.id.startsWith(key));
  const byId = new Map(old.map((item) => [item.id, item]));
  const freshIds = new Set(fresh.map((item) => item.id));
  for (const item of fresh) {
    const earlier = byId.get(item.id);
    byId.set(item.id, {
      ...item,
      status:
        earlier?.status === "skipped"
          ? "skipped"
          : earlier && uploaded(item)
            ? "uploaded"
            : "todo",
    });
  }
  for (const item of old) {
    if (freshIds.has(item.id)) continue;
    byId.set(item.id, {
      ...item,
      status:
        item.status === "skipped" || item.status === "accepted"
          ? item.status
          : uploaded(item) || (checked && !item.id.startsWith("manager:"))
            ? "uploaded"
            : item.status,
    });
  }
  return missingDataFor({ missing: [...byId.values()] } as MvpApplication);
}

export function missingFor(
  a: MvpApplication,
  statements: Statement[],
): MissingField[] {
  const q = normalizeQuestionnaire(a.questionnaire),
    missing: MissingField[] = [];
  const add = (key: string, label: string, section: number, id?: string) =>
    missing.push({
      key,
      label,
      section,
      id,
      why:
        section === 0
          ? "Эти сведения нужны для обязательных проверок компании и заявителя."
          : section === 1
            ? "Выписки нужны для оценки оборота и доступного лимита."
            : section === 2
              ? "Текущие платежи учитываются при расчёте долговой нагрузки."
              : section === 3
                ? "Предстоящие операции влияют на денежный поток."
                : "Условие продукта или параметры запроса требуют уточнения.",
    });
  if (!a.company) add("inn", "Найдите компанию по ИНН", 0);
  if (!q.companyConfirmed || q.registryError)
    add(
      "companyConfirmed",
      "Подтвердите сведения компании или исправьте ИНН",
      0,
    );
  if (!q.authorized) add("authorized", "Подтвердите полномочия заявителя", 0);
  if (Object.values(q.consents).some((v) => !v))
    add(
      "consents",
      "Подтвердите согласие на обработку данных и дополнительные проверки",
      0,
    );
  if (
    a.company &&
    a.company.okved &&
    industryFromOkved(a.company.okved) !== a.onboarding.industry &&
    !q.actualIndustry
  )
    add(
      "actualIndustry",
      "Уточните фактическую отрасль: она отличается от ОКВЭД",
      0,
    );
  for (const account of q.accounts) {
    const s = statements.find(
      (s) => s.id === account.documentId && s.accountId === account.id,
    );
    if (!account.bank || !s) {
      add(
        "accounts",
        `Добавьте банк и CSV для счёта ${q.accounts.indexOf(account) + 1}`,
        1,
        `accounts:${account.id}:file`,
      );
      continue;
    }
    const months = s.months.filter((m) => m < day().slice(0, 7));
    const first = months[0],
      last = months.at(-1);
    const span =
      first && last
        ? (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 +
          Number(last.slice(5)) -
          Number(first.slice(5)) +
          1
        : 0;
    if (months.length < 6 || span !== months.length)
      add(
        "accounts",
        `Счёт ${account.bank}: нужна непрерывная история не менее 6 полных месяцев; желательно 12`,
        1,
        `accounts:${account.id}:history`,
      );
    if ((months.at(-1) ?? "") < dateMonth(day(), -1).slice(0, 7))
      add(
        "accounts",
        `Счёт ${account.bank}: добавьте выписку до последнего полного месяца`,
        1,
        `accounts:${account.id}:recent`,
      );
  }
  if (q.complete === "unknown") add("complete", "Уточните полноту выписок", 1);
  if (
    q.complete === "no" &&
    (!q.outsideType || q.outsideIn === null || q.outsideOut === null)
  )
    for (const k of ["outsideType", "outsideIn", "outsideOut"])
      add(k, "Укажите неподтверждённые операции вне выписок", 1);
  if (q.loans === "unknown") add("loans", "Уточните наличие кредитов", 2);
  if (q.loans === "yes") {
    if (q.debt === null) add("debt", "Укажите остаток долга", 2);
    if (q.monthlyDebt === null)
      add("monthlyDebt", "Укажите месячный платёж по кредитам", 2);
  }
  if (q.leasing === "yes" && q.monthlyLeasing === null)
    add("monthlyLeasing", "Укажите платёж по лизингу", 2);
  if (q.leasing === "unknown")
    add("leasing", "Уточните наличие действующего лизинга", 2);
  if (q.loans === "yes" && q.balloonExpected === "yes") {
    if (!q.balloon) add("balloon", "Укажите сумму разового погашения", 2);
    if (!q.balloonPeriod)
      add("balloonPeriod", "Выберите дату разового погашения", 2);
  }
  if (q.future !== "none" && q.future !== "unknown") {
    if (["income", "both"].includes(q.future) && q.futureIn === null)
      add("futureIn", "Укажите будущее поступление", 3);
    if (["expense", "both"].includes(q.future) && q.futureOut === null)
      add("futureOut", "Укажите будущий расход", 3);
    if (!q.futurePeriod)
      add("futurePeriod", "Укажите период будущих операций", 3);
  }
  if (!q.purpose) add("purpose", "Уточните назначение средств", 4);
  if (!q.neededAt) add("neededAt", "Укажите, когда нужны средства", 4);
  if (q.productId === "INVEST" && q.projectCost === null)
    add("projectCost", "Укажите стоимость проекта", 4);
  if (["RCL", "OVERDRAFT"].includes(q.productId) && q.cycleDays === null)
    add("cycleDays", "Укажите длительность использования в днях", 4);
  if (q.productId === "NCL" && !q.tranches)
    add("tranches", "Укажите план сумм и сроков траншей", 4);
  if (q.productId === "REFI")
    for (const k of ["oldBalance", "oldRate", "oldPayment"] as const)
      if (q[k] === null)
        add(k, "Уточните параметры рефинансируемого кредита", 4);
  if (q.productId === "REFI" && q.loans !== "yes")
    add(
      "loans",
      "Для рефинансирования подтвердите наличие действующего кредита",
      2,
    );
  if (q.productId === "REFI") {
    if (q.oldBalance !== null && q.oldBalance <= 0)
      add(
        "oldBalance",
        "Укажите положительный остаток рефинансируемого кредита",
        4,
      );
    if (q.oldBalance !== null && (q.debt === null || q.debt < q.oldBalance))
      add(
        "debt",
        "Общий долг не может быть меньше остатка рефинансируемого кредита",
        2,
      );
    if (
      q.oldPayment !== null &&
      (q.monthlyDebt === null || q.monthlyDebt < q.oldPayment)
    )
      add(
        "monthlyDebt",
        "Общий платёж должен включать платёж рефинансируемого кредита",
        2,
      );
  }
  for (let section = 0; section < 5; section++)
    for (const [key, label] of Object.entries(questionnaireErrors(q, section)))
      add(key, label, section);
  return missingDataFor({ missing } as MvpApplication);
}
function unresolvedCoreFields(
  keys: string[],
  q: Questionnaire,
): MissingField[] {
  const result: MissingField[] = [];
  for (const key of keys) {
    if (key === "contract_main_customer") {
      if (!q.customerContractAmount)
        result.push({
          key: "customerContractAmount",
          label:
            "Укажите сумму договора с основным заказчиком (со слов заявителя)",
          why: "Для расчёта возможного лимита нужны условия договора с основным заказчиком.",
          section: 4,
        });
      if (!q.customerContractMonths)
        result.push({
          key: "customerContractMonths",
          label: "Укажите срок договора с основным заказчиком в месяцах",
          why: "Срок договора влияет на оценку будущих поступлений.",
          section: 4,
        });
    } else if (key === "reconciliation_act") {
      if ((q.reconciliationReference?.trim().length ?? 0) < 5)
        result.push({
          key: "reconciliationReference",
          label:
            "Укажите номер и дату акта сверки с основным заказчиком (со слов заявителя)",
          why: "Акт сверки помогает проверить расчёты с основным заказчиком.",
          section: 4,
        });
    } else
      result.push({
        key: "accounts",
        label:
          key === "statement_12m"
            ? "Нужна выписка за 12 месяцев"
            : "Ядру нужны дополнительные подтверждения. Добавьте уточнённую историю CSV; автоматический разбор иных документов не поддерживается.",
        why: "Истории операций пока недостаточно для оценки денежного потока.",
        section: 1,
      });
  }
  return result;
}
const stageLabels = [
  "Регистрация заявки",
  "Комплаенс, антифрод и БКИ",
  "Финансовый анализ CSV",
  "Скоринг",
  "Андеррайтинг",
  "Маршрутизация решения",
];
const running = new Map<string, Promise<void>>();
export function submitMvp(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
  core: CoreClient = httpCoreClient,
) {
  const a = mvpGet(db, id, uid);
  if (a.lifecycle === "PROCESSING" || a.lifecycle === "SUBMITTED") {
    resumeMvp(db, uid, id, core);
    return a;
  }
  if (
    a.lifecycle !== "DRAFT" &&
    a.decision !== "ADDITIONAL_DATA_REQUIRED" &&
    !a.error &&
    version <= a.version
  )
    return a;
  requireVersion(a, version);
  if (
    a.lifecycle !== "DRAFT" &&
    a.decision !== "ADDITIONAL_DATA_REQUIRED" &&
    !a.error
  )
    throw new ApplicationError(409, "Заявка уже подана");
  if (
    a.decision === "ADDITIONAL_DATA_REQUIRED" &&
    a.missing.some((item) => item.status === "skipped") &&
    !a.missing.some((item) => (item.status ?? "todo") === "todo")
  ) {
    a.decision = "MANAGER_REVIEW_REQUIRED";
    a.lifecycle = a.meeting ? "MEETING_SCHEDULED" : "DECIDED";
    a.reasons = [
      "Заявка передана с текущими данными. Недостающие сведения увидит менеджер.",
    ];
    a.version++;
    save(db, a, "mvp2_submit_with_missing", "client");
    return a;
  }
  a.questionnaire = questionnaireSchema.parse(a.questionnaire);
  const issues = questionnaireErrors(a.questionnaire, 4);
  if (
    a.questionnaire.loans === "yes" &&
    a.questionnaire.balloonExpected === "yes" &&
    a.questionnaire.balloonPeriod
  ) {
    const dateError = questionnaireErrors(a.questionnaire, 2).balloonPeriod;
    if (dateError) issues.balloonPeriod = dateError;
  }
  if (Object.keys(issues).length)
    throw Object.assign(
      new ApplicationError(422, Object.values(issues).join(" ")),
      { fields: issues },
    );
  a.lifecycle = "SUBMITTED";
  a.decision = undefined;
  a.error = undefined;
  a.reasons = [];
  a.alternatives = [];
  a.financial = undefined;
  a.noCredit = undefined;
  a.clientDeferred = false;
  a.version++;
  a.stages = stageLabels.map((label, i) => ({
    id: String(i),
    label,
    status: "pending",
  }));
  transaction(db, () => {
    db.prepare("INSERT OR IGNORE INTO mvp2_revisions VALUES(?,?,?,NULL)").run(
      id,
      a.version,
      JSON.stringify(a),
    );
    save(db, a, "mvp2_submit", "client");
  });
  resumeMvp(db, uid, id, core);
  return a;
}
export function resumeMvp(
  db: DatabaseSync,
  uid: string,
  id: string,
  core: CoreClient = httpCoreClient,
) {
  if (running.has(id)) return;
  const a = mvpGet(db, id, uid);
  if (!["PROCESSING", "SUBMITTED"].includes(a.lifecycle)) return;
  const job = processMvp(db, uid, id, core)
    .catch(() => {
      console.error(
        "[mvp2] Не удалось сохранить этап; рассмотрение возобновится при открытии заявки.",
      );
    })
    .finally(() => running.delete(id));
  running.set(id, job);
}
export async function waitMvp(id: string) {
  await running.get(id);
}

/** Record a client's explicit choice to continue without one requested item. */
export function skipMissingMvp(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
  missingId: string,
) {
  return transaction(db, () => {
    const a = mvpGet(db, id, uid);
    requireVersion(a, version);
    if (a.decision !== "ADDITIONAL_DATA_REQUIRED")
      throw new ApplicationError(409, "Дополнение сведений недоступно");
    const item = a.missing.find((field) => field.id === missingId);
    if (!item || item.status !== "todo")
      throw new ApplicationError(404, "Пункт запроса не найден");
    item.status = "skipped";
    if (!missingDataFor(a).some((field) => field.status === "todo")) {
      a.decision = "MANAGER_REVIEW_REQUIRED";
      a.lifecycle = a.meeting ? "MEETING_SCHEDULED" : "DECIDED";
      a.reasons = [
        "Заявка передана с текущими данными. Недостающие сведения увидит менеджер.",
      ];
    }
    a.version++;
    save(db, a, "mvp2_missing_skipped", "client");
    return a;
  });
}
async function processMvp(
  db: DatabaseSync,
  uid: string,
  id: string,
  client: CoreClient,
) {
  const a = mvpGet(db, id, uid),
    q = normalizeQuestionnaire(a.questionnaire);
  a.questionnaire = q;
  const stage = (i: number, done = false) => {
    a.lifecycle = "PROCESSING";
    a.stages[i].status = done ? "done" : "running";
    a.stages[i].at = new Date().toISOString();
    save(db, a, "mvp2_stage");
  };
  const finish = (decision: Decision, reasons: string[]) => {
    if (
      decision === "ADDITIONAL_DATA_REQUIRED" &&
      !missingDataFor(a).some((item) => item.status === "todo")
    ) {
      decision = "MANAGER_REVIEW_REQUIRED";
      reasons = [
        "Сведения переданы с текущими данными. Дальше заявку рассмотрит менеджер.",
      ];
    }
    if (
      decision === "ADDITIONAL_DATA_REQUIRED" &&
      !a.stages.some((s) => s.status === "waiting-data")
    ) {
      const waiting =
        a.stages.find((s) => s.status === "running") ??
        a.stages.find((s) => s.status === "pending");
      if (waiting) waiting.status = "waiting-data";
    }
    a.decision = decision;
    a.reasons = reasons;
    if (decision !== "ADDITIONAL_DATA_REQUIRED")
      a.missing = a.missing.map((item) => ({
        ...item,
        status: item.status === "uploaded" ? "accepted" : item.status,
      }));
    a.lifecycle =
      decision === "MANAGER_REVIEW_REQUIRED" && a.meeting
        ? "MEETING_SCHEDULED"
        : "DECIDED";
    save(db, a, "mvp2_decision");
    const s = stateFor(db, uid);
    syncSelection(s, a);
    saveState(db, uid, s);
  };
  try {
    stage(0);
    const statements = statementsOf(db, id).filter((s) =>
      q.accounts.some((x) => x.documentId === s.id),
    );
    a.missing = mergeMissingData(
      a.missing,
      missingFor(a, statements),
      [],
      true,
    );
    stage(0, true);
    stage(1);
    if (
      !a.company ||
      !q.companyConfirmed ||
      !q.authorized ||
      Object.values(q.consents).some((v) => !v)
    ) {
      finish("ADDITIONAL_DATA_REQUIRED", [
        "Для проверок нужны сведения компании и отдельные согласия.",
      ]);
      return;
    }
    const [company, aml, bankruptcy, fns, bki] = await Promise.all([
      findCompany(q.inn, { EGR_PROVIDER: "mock" }),
      checkAml(q.inn),
      checkBankruptcy(q.inn),
      checkTransparentBusiness(q.inn),
      checkCreditHistory(q.inn),
    ]);
    // Internal audit snapshot; never serialized into the public dossier or chat.
    db.prepare("INSERT OR REPLACE INTO mvp2_checks VALUES(?,?,?,?)").run(
      id,
      a.version,
      JSON.stringify({ company, aml, bankruptcy, fns, bki }),
      new Date().toISOString(),
    );
    if (
      company.status !== "ACTIVE" ||
      [aml, bankruptcy, fns, bki].some((x) => x.status === "bad")
    ) {
      stage(1, true);
      finish("DECLINED", [
        "По результатам обязательных проверок предоставление кредита сейчас недоступно. Можно проверить корректность сведений.",
      ]);
      return;
    }
    if ([aml, bankruptcy, fns, bki].some((x) => x.status === "unavailable")) {
      a.missing = mergeMissingData(a.missing, [
        {
          key: "inn",
          label: "Уточните ИНН: синтетические проверки неполны",
          section: 0,
        },
      ]);
      stage(1, true);
      finish("ADDITIONAL_DATA_REQUIRED", [
        "Недостаточно сведений для обязательных проверок.",
      ]);
      return;
    }
    stage(1, true);
    stage(2);
    const aggregate = aggregateStatements(statements);
    if (missingDataFor(a).some((item) => item.status === "todo")) {
      finish("ADDITIONAL_DATA_REQUIRED", [
        "Дополните указанные сведения. Остальная анкета сохранена.",
      ]);
      return;
    }
    stage(2, true);
    const claimed =
      (q.loans === "yes" ? (q.monthlyDebt ?? 0) : 0) +
      (q.leasing === "yes" ? (q.monthlyLeasing ?? 0) : 0);
    if (Math.abs(claimed - aggregate.debt) > 1 && !q.debtReconciled) {
      a.missing = mergeMissingData(
        a.missing,
        [
          {
            key: "debtReconciled",
            label: `В CSV найдено ${aggregate.debt.toLocaleString("ru-RU")} ₽ платежей в месяц; вы указали ${claimed.toLocaleString("ru-RU")} ₽. Подтвердите итоговую нагрузку.`,
            section: 2,
          },
          ...(q.loans === "yes"
            ? [
                {
                  key: "monthlyDebt",
                  label: "Уточните платёж по кредитам при необходимости",
                  section: 2,
                },
              ]
            : []),
          ...(q.leasing === "yes"
            ? [
                {
                  key: "monthlyLeasing",
                  label: "Уточните платёж по лизингу при необходимости",
                  section: 2,
                },
              ]
            : []),
        ],
        [],
        true,
      );
      finish("ADDITIONAL_DATA_REQUIRED", [
        "Сверьте долговые платежи с выписками.",
      ]);
      return;
    }
    stage(3);
    const registeredMonths = company.registeredAt
      ? Math.floor(
          (Date.now() - Date.parse(company.registeredAt)) / 86400000 / 30.4375,
        )
      : null;
    const years =
      registeredMonths !== null
        ? registeredMonths < 12
          ? "меньше года"
          : registeredMonths < 36
            ? "1–3"
            : "больше 3"
        : [
              "Менее 6 месяцев",
              "6–12 месяцев",
              "Зарегистрирован, ещё не работает",
            ].includes(a.onboarding.age)
          ? "меньше года"
          : a.onboarding.age === "1–3 года"
            ? "1–3"
            : "больше 3";
    const input = {
      statement_csv: aggregate.csv,
      need: {
        // Keep the real goal: /score accepts a normalized purpose plus the
        // existing optional purpose_code, including debt optimization.
        purpose_code:
          q.productId === "REFI"
            ? "do_refinance"
            : q.productId === "INVEST"
              ? "ap_machinery"
              : q.productId === "OVERDRAFT"
                ? "cg_customer_delay"
                : q.purpose === "Контракт"
                  ? "ct_materials"
                  : q.purpose === "Закупки"
                    ? "wc_seasonal_stock"
                    : "ex_capacity",
        purpose:
          q.productId === "INVEST"
            ? "оборудование"
            : q.productId === "OVERDRAFT"
              ? "кассовый разрыв"
              : q.purpose === "Контракт"
                ? "закупка под контракт"
                : "рост",
        amount_rub: q.amount,
        term_months: q.term,
        repay_from: q.repayment,
        asked_for: products.find((p) => p.id === q.productId)!.name,
      },
      questionnaire: {
        form: company.form,
        years,
        sector: a.onboarding.industry,
        trend: "не указан",
      },
      // Facts are user-confirmed, not bank-verified documents. They never
      // increase approved capacity: only limit_now_rub is used, not limit_after.
      confirmed_fields:
        q.customerContractAmount && q.customerContractMonths
          ? {
              contract_main_customer: {
                sum_rub: q.customerContractAmount,
                months: q.customerContractMonths,
              },
            }
          : {},
    };
    const reply = await client.score(input),
      raw = reply.core_result,
      core = raw.core as Record<string, unknown>;
    if (raw.core_id !== "liza")
      throw new ApplicationError(
        503,
        "Нужно подключённое ядро Лизы (CORE_ID=liza). Решение не подменяется тестовым ответом.",
      );
    if (
      !core ||
      !Array.isArray(core.stops_fired) ||
      !Array.isArray(core.missing) ||
      !Number.isFinite(Number(core.flow_month_rub)) ||
      !Number.isFinite(Number(core.limit_now_rub))
    )
      throw new Error("Invalid core response");
    db.prepare(
      "UPDATE mvp2_revisions SET core_result=? WHERE application_id=? AND version=?",
    ).run(JSON.stringify(raw), id, a.version);
    stage(3, true);
    stage(4);
    const p = products.find((p) => p.id === q.productId)!;
    // Core flow already includes debt visible in CSV. Subtract only uncovered debt.
    const uncovered = Math.max(0, claimed - aggregate.debt),
      flow = Number(core.flow_month_rub) - uncovered;
    const monthly = (amount: number, term: number, rate: number) =>
      makeSchedule(amount, rate, term, addDays(day(), 30))[0];
    const paymentOf = (amount: number, term: number) => {
      const row = monthly(amount, term, p.rate);
      return row.principal + row.interest;
    };
    const payment = paymentOf(q.amount, q.term),
      dscrMin = Number(
        (core.params as Record<string, unknown>)?.dscr_min ?? 1.25,
      );
    const affordable = (amount: number, term: number) =>
      amount <= Number(core.limit_now_rub) &&
      flow >= paymentOf(amount, term) * dscrMin;
    a.financial = {
      flow,
      payment,
      dscr: payment > 0 ? flow / payment : 0,
      limit: Math.max(
        0,
        Math.min(
          p.max,
          Number(core.limit_now_rub),
          (flow / dscrMin / payment) * q.amount,
        ),
      ),
      limitNow: Number(core.limit_now_rub),
      limitAfter: Number.isFinite(Number(core.limit_after_rub))
        ? Number(core.limit_after_rub)
        : undefined,
      months: aggregate.months.length,
      debtInCsv: aggregate.debt,
      uncoveredDebt: uncovered,
      source: "Ядро Лизы /score; каталог MVP, договорный месячный расчёт",
    };
    const needAmount = a.onboarding.amount ?? q.amount;
    const monthlyFlow = a.financial.flow;
    const cashWeeks =
      monthlyFlow > 0
        ? Math.ceil(((needAmount / monthlyFlow) * 52) / 12)
        : Infinity;
    const receivableMonths = q.customerContractMonths;
    const receivableCovers =
      q.repayment === "Оплата контракта" &&
      q.customerContractAmount !== null &&
      q.customerContractAmount >= needAmount &&
      receivableMonths !== null &&
      receivableMonths > 0 &&
      receivableMonths <= q.term;
    if (
      (cashWeeks <= Math.ceil((q.term * 52) / 12) || receivableCovers) &&
      needAmount > 0 &&
      q.term > 0
    ) {
      const weeks =
        Number.isFinite(cashWeeks) && cashWeeks <= Math.ceil((q.term * 52) / 12)
          ? cashWeeks
          : Math.ceil((receivableMonths! * 52) / 12);
      const schedule = makeSchedule(
        needAmount,
        p.rate,
        q.term,
        addDays(day(), 30),
      );
      a.noCredit = {
        weeks,
        overpayment: Math.round(
          schedule.reduce((sum, row) => sum + row.interest + row.fees, 0),
        ),
        amount: needAmount,
        term: q.term,
      };
    } else a.noCredit = undefined;
    a.provenance.financial = {
      source: "ENGINE",
      confirmed: true,
      at: new Date().toISOString(),
    };
    const stops = core.stops_fired as string[];
    if (stops.includes("SHORT_STATEMENT")) {
      a.missing = mergeMissingData(
        a.missing,
        [
          {
            key: "accounts",
            label:
              "Ядру нужна более полная выписка: загрузите 12 месяцев истории с операциями",
            section: 1,
          },
        ],
        [],
        true,
      );
      finish("ADDITIONAL_DATA_REQUIRED", [
        "Финансовая история недостаточна для расчёта ядра.",
      ]);
      return;
    }
    if (
      stops.some((s) => s !== "SHORT_STATEMENT") ||
      (core.instrument === "MANUAL" && q.productId !== "REFI")
    ) {
      stage(4, true);
      finish("DECLINED", [
        "Финансовые показатели или условия продукта не позволяют одобрить запрос.",
      ]);
      return;
    }
    // Core missing items remain concrete follow-ups, never fictitious confirmations.
    const coreFollowups = unresolvedCoreFields(core.missing as string[], q);
    if (coreFollowups.length) {
      a.missing = mergeMissingData(a.missing, coreFollowups, [], true);
      finish("ADDITIONAL_DATA_REQUIRED", [
        "Ядро выявило недостаточность подтверждённых финансовых данных.",
      ]);
      return;
    }
    if (
      productIssues(q).length ||
      !affordable(q.amount, q.term) ||
      (q.productId === "OVERDRAFT" && (q.cycleDays ?? 0) > 60)
    ) {
      // Verify each candidate through the SAME core and catalog, not a guessed amount.
      const candidate =
        Math.floor(
          Math.min(a.financial.limit * 0.95, p.max, q.amount * 0.8) / 1000,
        ) * 1000;
      if (candidate >= p.min && q.term >= p.minTerm && q.term <= p.maxTerm) {
        const next = await client.score({
            ...input,
            need: { ...input.need, amount_rub: candidate },
          }),
          c = next.core_result.core as Record<string, unknown>;
        if (
          next.core_result.core_id === "liza" &&
          Array.isArray(c.stops_fired) &&
          !c.stops_fired.length &&
          Array.isArray(c.missing) &&
          !unresolvedCoreFields(c.missing as string[], q).length &&
          candidate <= Number(c.limit_now_rub) &&
          affordable(candidate, q.term)
        )
          a.alternatives = [
            {
              id: hash({ id, version: a.version, candidate }),
              productId: q.productId,
              amount: candidate,
              term: q.term,
              rate: p.rate,
              payment: paymentOf(candidate, q.term),
              reason: "Меньшая сумма прошла повторную финансовую проверку",
            },
          ];
      }
      stage(4, true);
      finish("DECLINED", [
        ...productIssues(q),
        "Запрошенная нагрузка не проходит финансовую оценку.",
      ]);
      return;
    }
    stage(4, true);
    stage(5);
    stage(5, true);
    finish(q.amount <= 3000000 ? "APPROVED" : "MANAGER_REVIEW_REQUIRED", [
      "Обязательные проверки пройдены.",
      "Финансовая оценка подтверждает допустимость запрошенной нагрузки.",
      q.amount <= 3000000
        ? "Сумма входит в лимит автоматического решения."
        : "Сумма свыше 3 млн ₽ требует окончательного решения менеджера.",
    ]);
  } catch (e) {
    a.error =
      e instanceof ApplicationError
        ? e.message
        : "Проверки или финансовое ядро недоступны. Данные сохранены; повторите рассмотрение позже.";
    const stage = a.stages.find((s) => s.status === "running");
    if (stage) stage.status = "error";
    a.lifecycle = "DRAFT";
    a.decision = undefined;
    save(db, a, "mvp2_processing_error");
  }
}
export function meetingSlotTimes(now = new Date()): string[] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  const anchor = new Date(
    `${value("year")}-${value("month")}-${value("day")}T00:00:00Z`,
  );
  const result: string[] = [];
  for (let offset = 0, days = 0; days < 5; offset++) {
    const date = new Date(anchor.getTime() + offset * 86400000);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const before = result.length;
    const day = date.toISOString().slice(0, 10);
    for (let hour = 10; hour < 19; hour++)
      for (const minute of [0, 30]) {
        const at = `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`;
        if (Date.parse(at) > now.getTime()) result.push(at);
      }
    if (result.length > before) days++;
  }
  return result;
}
export function seedSlots(db: DatabaseSync) {
  for (const at of meetingSlotTimes())
    db.prepare(
      "INSERT OR IGNORE INTO mvp2_slots(id,at,manager) VALUES(?,?,?)",
    ).run(at, at, "Менеджер учебного банка");
}
export function bookMvp(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
  slotId: string,
) {
  return transaction(db, () => {
    const a = mvpGet(db, id, uid);
    if (a.meeting?.slotId === slotId) return a;
    requireVersion(a, version);
    if (
      a.decision !== "MANAGER_REVIEW_REQUIRED" ||
      !["DECIDED", "MEETING_SCHEDULED"].includes(a.lifecycle)
    )
      throw new ApplicationError(409, "Встреча для этой заявки недоступна");
    const slot = db
      .prepare(
        "SELECT * FROM mvp2_slots WHERE id=? AND application_id IS NULL AND at>?",
      )
      .get(slotId, "");
    if (!slot || !meetingSlotTimes().includes(String(slot.at)))
      throw new ApplicationError(409, "Слот уже занят или недоступен");
    if (a.meeting)
      db.prepare(
        "UPDATE mvp2_slots SET application_id=NULL WHERE id=? AND application_id=?",
      ).run(a.meeting.slotId, id);
    db.prepare(
      "UPDATE mvp2_slots SET application_id=? WHERE id=? AND application_id IS NULL",
    ).run(id, slotId);
    a.meeting = { slotId, at: String(slot.at), manager: String(slot.manager) };
    a.lifecycle = "MEETING_SCHEDULED";
    a.version++;
    save(db, a, "mvp2_meeting", "client");
    return a;
  });
}
export function cancelMvpMeeting(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
) {
  return transaction(db, () => {
    const a = mvpGet(db, id, uid);
    requireVersion(a, version);
    if (a.lifecycle !== "MEETING_SCHEDULED" || !a.meeting)
      throw new ApplicationError(409, "Запись для этой заявки не найдена");
    db.prepare(
      "UPDATE mvp2_slots SET application_id=NULL WHERE id=? AND application_id=?",
    ).run(a.meeting.slotId, id);
    a.meeting = undefined;
    a.lifecycle = "DECIDED";
    a.version++;
    save(db, a, "mvp2_meeting_cancelled", "client");
    return a;
  });
}
export function managerMvp(
  db: DatabaseSync,
  managerId: string,
  id: string,
  version: number,
  decision: Decision,
  reason: string,
  missingKey?: string,
) {
  const user = db.prepare("SELECT role FROM users WHERE id=?").get(managerId);
  if (user?.role !== "manager")
    throw new ApplicationError(403, "Нужна роль менеджера");
  return transaction(db, () => {
    const a = mvpGet(db, id, managerId, true);
    requireVersion(a, version);
    if (
      a.lifecycle !== "MEETING_SCHEDULED" ||
      a.decision !== "MANAGER_REVIEW_REQUIRED" ||
      !["APPROVED", "DECLINED", "ADDITIONAL_DATA_REQUIRED"].includes(
        decision,
      ) ||
      reason.trim().length < 5
    )
      throw new ApplicationError(
        422,
        "Нужно решение по записанной встрече и пояснение клиенту",
      );
    a.decision = decision;
    a.reasons = [reason];
    if (decision !== "ADDITIONAL_DATA_REQUIRED")
      a.missing = a.missing.map((item) => ({
        ...item,
        status: item.status === "uploaded" ? "accepted" : item.status,
      }));
    a.lifecycle =
      decision === "APPROVED"
        ? "MANAGER_APPROVED"
        : decision === "DECLINED"
          ? "MANAGER_DECLINED"
          : "DECIDED";
    if (decision === "ADDITIONAL_DATA_REQUIRED") {
      const field = managerRequestedFields.find((f) => f.key === missingKey);
      if (!field)
        throw new ApplicationError(
          422,
          "Выберите конкретное поле для дозапроса",
        );
      a.missing = mergeMissingData(a.missing, [
        {
          ...field,
          id: `manager:${randomUUID()}`,
          title: field.label,
          why: reason,
          effect:
            "После уточнения менеджер сможет продолжить рассмотрение заявки.",
          status: "todo",
        },
      ]);
    }
    a.version++;
    save(db, a, "mvp2_manager_decision", "manager");
    return a;
  });
}
export function acceptAlternative(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
  optionId: string,
) {
  const a = mvpGet(db, id, uid);
  requireVersion(a, version);
  const option = a.alternatives.find((x) => x.id === optionId);
  if (a.decision !== "DECLINED" || !option)
    throw new ApplicationError(409, "Альтернатива недоступна");
  a.questionnaire = {
    ...a.questionnaire,
    productId: option.productId,
    amount: option.amount,
    term: option.term,
  };
  a.version++;
  a.lifecycle = "DRAFT";
  a.decision = undefined;
  a.alternatives = [];
  a.reasons = [];
  save(db, a, "mvp2_alternative", "client");
  return submitMvp(db, uid, id, a.version);
}
export function activateMvp(db: DatabaseSync, uid: string, id: string) {
  return transaction(db, () => {
    const a = mvpGet(db, id, uid);
    if (a.lifecycle === "ACTIVE") return a;
    if (
      a.lifecycle !== "SIGNED_DEMO" ||
      !a.signature ||
      !a.contract ||
      a.signature.hash !== a.contract.hash ||
      a.signature.version !== a.contract.version
    )
      throw new ApplicationError(
        409,
        "Сначала подпишите зафиксированный договор",
      );
    const q = a.questionnaire,
      p = products.find((p) => p.id === q.productId)!,
      s = stateFor(db, uid),
      at = new Date().toISOString();
    const facility = {
      id: a.id,
      kind: p.kind,
      name: p.name,
      amount: q.amount,
      balance: p.kind === "loan" ? q.amount : 0,
      rate: p.rate,
      term: q.term,
      contractTerm: q.term,
      startDate: a.contract.date,
      asOf: day(),
      source: "Оформлено в MVP 2: синтетическое финансирование",
      quality: "synthetic" as const,
      origin: "mvp2" as const,
      applicationId: a.id,
      ...(p.kind !== "loan" ? { limit: q.amount } : {}),
      events:
        p.kind === "loan"
          ? makeSchedule(
              q.amount,
              p.rate,
              q.term,
              dateMonth(a.contract.date, 1),
            )
          : [],
    };
    const previous =
      s.cabinet?.facilities ??
      (s.cabinet?.facility ? [s.cabinet.facility] : []);
    s.cabinet = {
      ...s.cabinet,
      facility,
      facilities: [facility, ...previous.filter((f) => f.id !== facility.id)],
    };
    syncSelection(s, a);
    saveState(db, uid, s);
    db.prepare("INSERT INTO mvp2_disbursements VALUES(?,?,?,?,?)").run(
      id,
      randomUUID(),
      at,
      q.productId === "REFI"
        ? "targeted_refinancing"
        : p.kind === "loan"
          ? "synthetic_disbursement"
          : "limit_opened",
      q.amount,
    );
    a.lifecycle = "ACTIVE";
    a.activatedAt = at;
    save(db, a, "mvp2_activate", "client");
    return a;
  });
}
export function recalculateMvp(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
  terms: Pick<Questionnaire, "amount" | "term" | "productId"> &
    Partial<Pick<Questionnaire, "overdraftRepaymentDays">>,
) {
  const a = mvpGet(db, id, uid);
  requireVersion(a, version);
  if (
    !a.financial ||
    ["SIGNED_DEMO", "ACTIVE", "PROCESSING", "SUBMITTED"].includes(a.lifecycle)
  )
    throw new ApplicationError(409, "Изменение условий сейчас недоступно");
  a.questionnaire = questionnaireSchema.parse({ ...a.questionnaire, ...terms });
  a.version++;
  a.lifecycle = "DRAFT";
  a.decision = undefined;
  a.contract = undefined;
  a.alternatives = [];
  a.error = undefined;
  transaction(db, () => {
    db.prepare(
      "UPDATE mvp2_slots SET application_id=NULL WHERE application_id=?",
    ).run(id);
    a.meeting = undefined;
    save(db, a, "mvp2_recalculate", "client");
  });
  return submitMvp(db, uid, id, a.version);
}
