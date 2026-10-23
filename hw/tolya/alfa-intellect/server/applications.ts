import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import type { DatabaseSync } from "node:sqlite";
import type { AppState, Selection } from "../shared/types";
import {
  checkCreditHistory,
  type CheckResult,
  type CreditHistory,
} from "./checks";
import {
  runComplianceGate,
  type ComplianceGate,
  type ComplianceReport,
} from "./compliance";
import {
  buildAlternatives,
  type AlternativesBuilder,
  type AlternativeOffer,
} from "./alternatives";

export type Role = "client" | "manager" | "system";
export type Status =
  | "draft"
  | "queued"
  | "info_requested"
  | "underwriting"
  | "approved"
  | "offered"
  | "signed"
  | "disbursed"
  | "rejected"
  | "expired"
  | "withdrawn";
export type Event =
  | "create"
  | "submit"
  | "request_info"
  | "client_update"
  | "reject"
  | "send_to_underwriting"
  | "underwriter_approve"
  | "make_offer"
  | "sign"
  | "disburse"
  | "expire"
  | "withdraw"
  | "accept_alternative"
  | "agent_nudge"
  | "escalate_silent"
  | "escalate_disagreed";

// The only state-machine definition. SQL and HTTP both use this function.
export const TRANSITIONS: readonly (readonly [
  Status | null,
  Event,
  Role,
  Status,
])[] = [
  [null, "create", "client", "draft"],
  ["draft", "submit", "client", "underwriting"],
  ["draft", "submit", "system", "underwriting"],
  ["draft", "submit", "system", "info_requested"],
  ["draft", "submit", "system", "rejected"],
  ["queued", "request_info", "manager", "info_requested"],
  ["info_requested", "client_update", "client", "underwriting"],
  ["info_requested", "client_update", "system", "underwriting"],
  ["info_requested", "client_update", "system", "info_requested"],
  ["info_requested", "client_update", "system", "rejected"],
  ...(["info_requested", "queued"] as const).flatMap(
    (from) =>
      [
        [from, "accept_alternative", "client", "underwriting"],
        [from, "accept_alternative", "system", "underwriting"],
        [from, "accept_alternative", "system", "info_requested"],
        [from, "accept_alternative", "system", "rejected"],
      ] as const,
  ),
  ["info_requested", "agent_nudge", "system", "info_requested"],
  ["info_requested", "escalate_silent", "system", "queued"],
  ["info_requested", "escalate_disagreed", "system", "queued"],
  ["queued", "reject", "manager", "rejected"],
  ["queued", "send_to_underwriting", "manager", "underwriting"],
  ["underwriting", "underwriter_approve", "system", "approved"],
  ["approved", "make_offer", "system", "offered"],
  ["offered", "sign", "client", "signed"],
  ["signed", "disburse", "system", "disbursed"],
  ["offered", "expire", "system", "expired"],
  ["draft", "withdraw", "client", "withdrawn"],
  ["queued", "withdraw", "client", "withdrawn"],
  ["info_requested", "withdraw", "client", "withdrawn"],
  ["underwriting", "withdraw", "client", "withdrawn"],
  ["approved", "withdraw", "client", "withdrawn"],
  ["offered", "withdraw", "client", "withdrawn"],
];

export class ApplicationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function transition(
  status: Status | null,
  event: Event,
  role: Role,
  target?: Status,
): Status {
  const pair = TRANSITIONS.filter(
    ([from, action]) => from === status && action === event,
  );
  if (!pair.length)
    throw new ApplicationError(409, "Недопустимый переход заявки");
  const allowed = pair.find(
    ([, , actor, to]) =>
      actor === role && (target === undefined || to === target),
  );
  if (!allowed)
    throw new ApplicationError(403, "Недостаточно прав для перехода");
  return allowed[3];
}

export type Application = {
  id: string;
  user_id: string;
  selection_id: string;
  selection_version: number;
  status: Status;
  amount: number;
  term_months: number;
  purpose: string;
  version: number;
  consent_at: string | null;
  queued_at: string | null;
  created_at: string;
  updated_at: string;
};
export type CoreReply = {
  core_result: Record<string, unknown>;
};
export type CoreClient = { score(input: unknown): Promise<CoreReply> };
export type Dependencies = {
  core: CoreClient;
  clock: () => Date;
  compliance: ComplianceGate;
  alternatives: AlternativesBuilder;
  bki: (inn: string) => Promise<CheckResult<CreditHistory>>;
};
type DependencyInput = Pick<Dependencies, "core" | "clock"> &
  Partial<Dependencies>;
function completeDependencies(deps: DependencyInput): Dependencies {
  return {
    compliance: runComplianceGate,
    alternatives: buildAlternatives,
    bki: checkCreditHistory,
    ...deps,
  };
}
export type Command = {
  applicationId: string;
  event: Event;
  expectedVersion: number;
  actorRole: Role;
  actorId: string | null;
  reason?: string;
  payload?: Record<string, unknown>;
};
type Dossier = {
  application_id: string;
  version: number;
  core_result: string;
  checks: string;
  holes: string;
  created_at: string;
  readiness_n: number | null;
  readiness_m: number | null;
  checklist_version: string | null;
  compliance?: ComplianceReport;
  alternatives?: AlternativeOffer[];
  client_objections?: string | null;
};
type ScoredDossier = CoreReply & {
  N: number;
  M: number;
  holes: string[];
  checks: Record<string, unknown>;
  checklist_version: string;
  target: "underwriting" | "info_requested" | "rejected";
  reason?: string;
  application: Application;
  evidenceHash: string;
  acceptedAlternative?: AlternativeOffer;
};
export const CHECKLIST_VERSION = "mvp2-demo-v1";

function configNumber(
  name: string,
  fallback: number,
  min: number,
  max = Infinity,
) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error(`Invalid ${name}`);
  return n;
}
// Demo simplification: fixed scenario key rate, NOT a live central-bank quotation.
export const SCENARIO_KEY_RATE = 0.19;
export function applicationConfig() {
  return {
    OFFER_RATE: configNumber(
      "OFFER_RATE",
      SCENARIO_KEY_RATE + 0.05,
      0.000001,
      1,
    ),
    OFFER_TTL_DAYS: configNumber("OFFER_TTL_DAYS", 7, 0),
    PRIORITY_AGING_K: configNumber("PRIORITY_AGING_K", 20_000, 0),
  };
}

export type Installment = {
  principal: number;
  interest: number;
  payment: number;
};
export function annuitySchedule(
  amount: number,
  rate: number,
  months: number,
): Installment[] {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 120
  ) {
    throw new ApplicationError(422, "Неверные условия графика");
  }
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const monthly = rate / 12;
  const payment = round(
    monthly === 0
      ? amount / months
      : (amount * monthly) / (1 - Math.pow(1 + monthly, -months)),
  );
  let balance = round(amount);
  return Array.from({ length: months }, (_, i) => {
    const interest = round(balance * monthly);
    const principal =
      i === months - 1 ? balance : Math.min(balance, round(payment - interest));
    balance = round(balance - principal);
    return { principal, interest, payment: round(principal + interest) };
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function validateReply(value: CoreReply): CoreReply {
  const core = record(value?.core_result?.core);
  if (
    !value?.core_result ||
    !Array.isArray(core.stops_fired) ||
    !core.stops_fired.every((s) => typeof s === "string") ||
    !Array.isArray(core.missing) ||
    !core.missing.every((s) => typeof s === "string") ||
    typeof core.limit_now_rub !== "number" ||
    !Number.isFinite(core.limit_now_rub) ||
    core.limit_now_rub < 0
  ) {
    throw new ApplicationError(
      503,
      "Ядро не вернуло необходимые данные расчёта",
    );
  }
  return value;
}
export const httpCoreClient: CoreClient = {
  async score(input) {
    const response = await fetch(
      new URL("/score", process.env.TEAM_API_URL || "http://127.0.0.1:8080"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Core unavailable");
    }
    const raw = (await response.json()) as Record<string, unknown>;
    return validateReply({ core_result: raw });
  },
};
let dependencies = completeDependencies({
  core: httpCoreClient,
  clock: () => new Date(),
});
export function configureApplications(deps: DependencyInput): void {
  dependencies = completeDependencies(deps);
}
export function applicationsDependencies(): Dependencies {
  return dependencies;
}

export function applicationOf(db: DatabaseSync, id: string): Application {
  const application = db
    .prepare("SELECT * FROM applications WHERE id=?")
    .get(id) as Application | undefined;
  if (!application) throw new ApplicationError(404, "Заявка не найдена");
  return application;
}
export function visibleApplication(
  db: DatabaseSync,
  id: string,
  role: Role,
  actorId: string | null,
) {
  const application = applicationOf(db, id);
  if (role === "client" && application.user_id !== actorId)
    throw new ApplicationError(404, "Заявка не найдена");
  return application;
}
export function dossierOf(db: DatabaseSync, id: string) {
  const dossier = db
    .prepare(
      "SELECT * FROM dossiers WHERE application_id=? ORDER BY version DESC LIMIT 1",
    )
    .get(id) as Dossier | undefined;
  if (!dossier) return;
  const metadata = record(JSON.parse(dossier.checks)._v2);
  const objection = db
    .prepare(
      `SELECT payload FROM application_events WHERE application_id=?
    AND event='escalate_disagreed' ORDER BY seq DESC LIMIT 1`,
    )
    .get(id);
  return {
    ...dossier,
    compliance: metadata.compliance as ComplianceReport | undefined,
    alternatives: (metadata.alternatives ?? []) as AlternativeOffer[],
    client_objections: objection
      ? JSON.parse(objection.payload as string).client_objections
      : null,
  };
}
function alternativeOf(
  db: DatabaseSync,
  a: Application,
  payload: Record<string, unknown>,
) {
  const option = dossierOf(db, a.id)?.alternatives?.find(
    (o) => o.option_id === payload.option_id,
  );
  if (
    !option ||
    !Number.isSafeInteger(option.amount_rub) ||
    option.amount_rub <= 0 ||
    !Number.isInteger(option.term_months) ||
    option.term_months < 1 ||
    option.term_months > 120
  )
    throw new ApplicationError(422, "Неизвестный вариант альтернативы");
  return option;
}
export function eventsOf(db: DatabaseSync, id: string) {
  return db
    .prepare(
      "SELECT * FROM application_events WHERE application_id=? ORDER BY seq",
    )
    .all(id);
}
function userState(db: DatabaseSync, id: string): AppState {
  const user = db.prepare("SELECT state FROM users WHERE id=?").get(id) as
    { state: string } | undefined;
  if (!user) throw new ApplicationError(404, "Клиент не найден");
  return JSON.parse(user.state);
}
function selectionOf(state: AppState, id: string, version: number) {
  const selection = state.selections.find((s) => s.id === id);
  if (!selection) throw new ApplicationError(404, "Подбор не найден");
  if (selection.version === version) return selection;
  const historical = selection.versions?.find((s) => s.version === version);
  if (!historical) throw new ApplicationError(409, "Версия подбора не найдена");
  return { ...selection, ...historical };
}

function coreInput(
  db: DatabaseSync,
  application: Application,
  payload: Record<string, unknown>,
  state = userState(db, application.user_id),
  acceptedAlternative?: AlternativeOffer,
) {
  const selection = selectionOf(
    state,
    application.selection_id,
    application.selection_version,
  );
  const statement = state.documents.find(
    (d) => d.category === "statement" && d.confirmed,
  );
  const csvCell = (v: unknown) =>
    '"' + String(v ?? "").replaceAll('"', '""') + '"';
  // Use stored extracted records, never synthesize account operations from financial totals.
  const statementCsv = [
    "date,amount,counterparty,purpose",
    ...(statement?.records ?? []).map((r) =>
      [r.date, r.amount, r.counterparty, r.purpose].map(csvCell).join(","),
    ),
  ].join("\n");
  const confirmed: Record<string, unknown> = {};
  for (const event of db
    .prepare(
      `SELECT payload FROM application_events
      WHERE application_id=? AND event='client_update' ORDER BY seq`,
    )
    .all(application.id)) {
    Object.assign(
      confirmed,
      record(JSON.parse(event.payload as string).confirmed_fields),
    );
  }
  Object.assign(confirmed, record(payload.confirmed_fields));
  return {
    statement_csv: statementCsv,
    need: {
      purpose: normalizedPurpose(application.purpose),
      amount_rub: application.amount,
      term_months: application.term_months,
      repay_from: selection.repayFrom,
      asked_for: acceptedAlternative?.product_id ?? selection.product,
    },
    questionnaire: {
      form: state.profile.form,
      years: state.profile.ageBand,
      sector: state.profile.sector,
      trend: state.profile.result,
      need: application.purpose,
    },
    confirmed_fields: confirmed,
  };
}

function normalizedPurpose(purpose: string) {
  const aliases: Record<string, string> = {
    "кассовый разрыв": "кассовый разрыв",
    "исполнение контракта": "закупка под контракт",
    "закупка товаров и материалов": "закупка под контракт",
    оборудование: "оборудование",
    развитие: "рост",
  };
  return aliases[purpose.trim().toLowerCase()] ?? purpose;
}

// Only scoring evidence participates: chatting or an unconfirmed upload is harmless.
function evidenceHash(
  db: DatabaseSync,
  a: Application,
  state = userState(db, a.user_id),
) {
  return applicationRequestHash("scoring-evidence", {
    profile: state.profile,
    documents: state.documents.filter((d) => d.confirmed),
    selection: selectionOf(state, a.selection_id, a.selection_version),
  });
}

function acceptedAlternativeOf(db: DatabaseSync, a: Application) {
  const dossier = dossierOf(db, a.id);
  return dossier
    ? (record(JSON.parse(dossier.checks)._v2).acceptedAlternative as
        AlternativeOffer | undefined)
    : undefined;
}

function alternativeSchedule(option: AlternativeOffer): Installment[] {
  const { products } = JSON.parse(
    readFileSync(
      process.env.PRODUCTS_CATALOG ||
        new URL("../../../../data/catalog/products.json", import.meta.url),
      "utf8",
    ),
  ) as {
    products: {
      id: string;
      bank_revolving: number;
      bank_repayment_type: string;
    }[];
  };
  const product = products.find((p) => p.id === option.product_id);
  const rate = option.rate_annual_pct / 100;
  if (
    !product ||
    (product.bank_revolving !== 1 &&
      product.bank_repayment_type.includes("annuity"))
  )
    return annuitySchedule(option.amount_rub, rate, option.term_months);
  if (
    product.bank_revolving !== 1 &&
    product.bank_repayment_type !== "equal_principal_plus_monthly_interest"
  )
    throw new ApplicationError(
      422,
      "Для продукта не определён график платежей",
    );
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  let balance = option.amount_rub;
  return Array.from({ length: option.term_months }, (_, i) => {
    const interest = round((balance * rate) / 12);
    const principal =
      i === option.term_months - 1
        ? balance
        : product.bank_revolving === 1
          ? 0
          : round(option.amount_rub / option.term_months);
    balance = round(balance - principal);
    return { principal, interest, payment: round(principal + interest) };
  });
}

function checkCommand(db: DatabaseSync, command: Command, deps: Dependencies) {
  let a = visibleApplication(
    db,
    command.applicationId,
    command.actorRole,
    command.actorId,
  );
  transition(a.status, command.event, command.actorRole);
  if (command.event === "accept_alternative" && command.actorRole !== "client")
    throw new ApplicationError(403, "Альтернативу принимает клиент");
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 1)
    throw new ApplicationError(422, "Нужна expectedVersion");
  if (command.expectedVersion !== a.version)
    throw new ApplicationError(409, "Версия заявки изменилась");
  const p = command.payload ?? {};
  if (command.event === "submit" && p.consent !== true)
    throw new ApplicationError(
      422,
      "Нужно согласие на обработку данных и запрос в БКИ",
    );
  if (
    ["request_info", "reject"].includes(command.event) &&
    !command.reason?.trim() &&
    !(
      command.event === "request_info" &&
      typeof p.hole === "string" &&
      p.hole.trim() &&
      typeof p.text === "string" &&
      p.text.trim()
    )
  )
    throw new ApplicationError(422, "Укажите причину");
  if (
    command.event === "send_to_underwriting" &&
    (typeof p.memo !== "string" || !p.memo.trim())
  )
    throw new ApplicationError(422, "Нужна записка андеррайтеру");
  if (command.event === "accept_alternative") alternativeOf(db, a, p);
  if (
    command.event === "agent_nudge" &&
    (typeof p.text !== "string" || !p.text.trim())
  )
    throw new ApplicationError(422, "Нужен текст напоминания");
  if (
    command.event === "escalate_disagreed" &&
    (typeof p.client_objections !== "string" || !p.client_objections.trim())
  )
    throw new ApplicationError(422, "Нужны тезисы клиента");
  if (command.event === "escalate_silent") {
    const events = eventsOf(db, a.id);
    const entry = events.findLast(
      (e) => e.to_status === "info_requested" && e.event !== "agent_nudge",
    );
    if (
      !entry ||
      !events.some(
        (e) => e.event === "agent_nudge" && Number(e.seq) > Number(entry.seq),
      )
    )
      throw new ApplicationError(409, "Сначала агент должен напомнить клиенту");
  }
  if (command.event === "send_to_underwriting") {
    if (p.option_id !== undefined) {
      const option = alternativeOf(db, a, p);
      a = { ...a, amount: option.amount_rub, term_months: option.term_months };
    }
    const dossier = dossierOf(db, a.id);
    const limit =
      dossier && record(JSON.parse(dossier.core_result).core).limit_now_rub;
    if (typeof limit === "number" && a.amount > limit)
      throw new ApplicationError(409, "AMOUNT_EXCEEDS_LIMIT");
    if (
      !dossier ||
      typeof limit !== "number" ||
      !Number.isFinite(limit) ||
      a.amount > limit ||
      dossier.readiness_n == null ||
      dossier.readiness_m == null ||
      dossier.readiness_m < 1 ||
      dossier.readiness_n !== dossier.readiness_m
    )
      throw new ApplicationError(
        409,
        "Нужны полное досье и сумма в пределах текущего лимита",
      );
  }
  if (command.event === "reject" && p.alternative !== undefined) {
    const alternative = record(p.alternative);
    if (
      !Number.isSafeInteger(alternative.amount) ||
      Number(alternative.amount) <= 0 ||
      !Number.isInteger(alternative.term_months) ||
      Number(alternative.term_months) < 1 ||
      Number(alternative.term_months) > 120
    )
      throw new ApplicationError(422, "Неверные условия альтернативы");
  }
  if (
    command.event === "client_update" &&
    !Object.keys(record(p.confirmed_fields)).length &&
    !(Array.isArray(p.documents) && p.documents.length)
  )
    throw new ApplicationError(422, "Нужны новые подтверждённые данные");
  if (command.event === "sign" && p.code !== "0000")
    throw new ApplicationError(422, "Неверный SMS-код");
  if (
    command.event === "underwriter_approve" ||
    command.event === "make_offer"
  ) {
    if (
      typeof p.amount !== "number" ||
      !Number.isFinite(p.amount) ||
      p.amount <= 0 ||
      p.amount > a.amount
    )
      throw new ApplicationError(
        422,
        "Сумма одобрения не может превышать сумму заявки",
      );
    const dossier = dossierOf(db, a.id);
    const core = record(dossier && JSON.parse(dossier.core_result).core);
    if (
      !dossier ||
      dossier.compliance?.gate !== "pass" ||
      typeof core.limit_now_rub !== "number" ||
      p.amount > core.limit_now_rub ||
      dossier.readiness_n !== dossier.readiness_m ||
      !dossier.readiness_m ||
      !Array.isArray(core.stops_fired) ||
      core.stops_fired.some((code) => code !== "SHORT_STATEMENT")
    )
      throw new ApplicationError(
        409,
        "Нужно проверенное полное досье и сумма в пределах лимита",
      );
  }
  if (command.event === "make_offer") {
    if (
      typeof p.rate !== "number" ||
      !Number.isFinite(p.rate) ||
      p.rate <= 0 ||
      !Number.isInteger(p.term_months) ||
      Number(p.term_months) < 1 ||
      Number(p.term_months) > 120 ||
      !Array.isArray(p.schedule) ||
      p.schedule.length !== p.term_months
    )
      throw new ApplicationError(422, "Неверные условия оффера");
  }
  if (command.event === "expire") {
    const offer = db
      .prepare(
        `SELECT at FROM application_events WHERE application_id=?
      AND event='make_offer' ORDER BY seq DESC LIMIT 1`,
      )
      .get(a.id) as { at: string } | undefined;
    if (
      !offer ||
      deps.clock().getTime() - Date.parse(offer.at) <=
        applicationConfig().OFFER_TTL_DAYS * 86_400_000
    )
      throw new ApplicationError(409, "Оффер ещё действует");
  }
  return a;
}

async function scoreCommand(
  db: DatabaseSync,
  command: Command,
  deps: Dependencies,
): Promise<ScoredDossier | undefined> {
  let a = checkCommand(db, command, deps);
  if (
    !["submit", "client_update", "accept_alternative"].includes(command.event)
  )
    return;
  const acceptedAlternative =
    command.event === "accept_alternative"
      ? alternativeOf(db, a, command.payload ?? {})
      : acceptedAlternativeOf(db, a);
  if (acceptedAlternative) {
    const option = acceptedAlternative;
    a = { ...a, amount: option.amount_rub, term_months: option.term_months };
  }
  try {
    const state = userState(db, a.user_id);
    const hash = evidenceHash(db, a, state);
    const input = coreInput(
      db,
      a,
      command.payload ?? {},
      state,
      acceptedAlternative,
    );
    const compliance = await deps.compliance({
      inn: state.profile.inn ?? "",
      now: deps.clock(),
      documents: state.documents
        .filter((d) => d.confirmed)
        .map((d) => {
          // Upload time is not a document date. Statements use their latest operation.
          const dates = (d.records ?? [])
            .map((r) => String(r.date ?? ""))
            .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
            .sort();
          const explicit = d.fields.documentDate ?? d.fields.document_date;
          return {
            category: d.category,
            confirmed: d.confirmed,
            documentDate:
              d.category === "statement"
                ? (dates.at(-1) ?? null)
                : typeof explicit === "string"
                  ? explicit
                  : null,
          };
        }),
    });
    const checks: Record<string, unknown> = Object.fromEntries(
      compliance.checks.map((c) => [c.key, c]),
    );
    checks._v2 = { compliance, alternatives: [], acceptedAlternative };
    const base = {
      checks,
      checklist_version: CHECKLIST_VERSION,
      application: a,
      evidenceHash: hash,
      acceptedAlternative,
    };
    if (compliance.gate !== "pass") {
      const holes = [...new Set(compliance.holes)];
      return {
        ...base,
        core_result: {},
        N: 0,
        M: Math.max(1, holes.length),
        holes,
        target: compliance.gate === "hard_stop" ? "rejected" : "info_requested",
        reason: compliance.reasons[0],
      };
    }
    const reply = validateReply(await deps.core.score(input));
    let bki: CheckResult<CreditHistory>;
    try {
      bki = await deps.bki(state.profile.inn ?? "");
    } catch {
      bki = {
        status: "unavailable",
        source: "синтетические данные (мок)",
        managerText: "Проверка недоступна",
      };
    }
    checks.bki = bki;
    const core = record(reply.core_result.core);
    const items: [string, boolean][] = [
      ["request", a.amount > 0 && a.term_months > 0 && !!a.purpose.trim()],
      [
        "business",
        !!state.profile.form?.trim() && !!state.profile.ageBand?.trim(),
      ],
      [
        "consent",
        command.event === "submit"
          ? command.payload?.consent === true
          : !!a.consent_at,
      ],
      [
        "statement",
        state.documents.some(
          (d) => d.category === "statement" && d.confirmed,
        ) && !(core.stops_fired as string[]).includes("SHORT_STATEMENT"),
      ],
      [
        "checks",
        compliance.checks.every((c) => c.status === "ok") &&
          bki.status === "ok" &&
          bki.data.overdue30Plus12m === 0 &&
          bki.data.overdue90Plus12m === 0,
      ],
    ];
    for (const key of ["contract_main_customer", "reconciliation_act"]) {
      if ((core.missing as string[]).includes(key)) {
        const value = input.confirmed_fields[key];
        const confirmed =
          value === true ||
          (typeof value === "string" && !!value.trim()) ||
          (typeof value === "number" && Number.isFinite(value) && value > 0) ||
          (Object.keys(record(value)).length > 0 &&
            record(value).verified !== false);
        items.push([key, confirmed]);
      }
    }
    for (const hole of compliance.holes) {
      const existing = items.find(([key]) => key === hole);
      if (existing) existing[1] = false;
      else items.push([hole, false]);
    }
    if (
      bki.status !== "ok" ||
      bki.data.overdue30Plus12m > 0 ||
      bki.data.overdue90Plus12m > 0
    )
      items.push(["bki", false]);
    const result = {
      ...reply,
      ...base,
      N: items.filter(([, complete]) => complete).length,
      M: items.length,
      holes: items.filter(([, complete]) => !complete).map(([key]) => key),
    };
    const stops = (core.stops_fired as string[]).filter(
      (code) => code !== "SHORT_STATEMENT",
    );
    if (bki.status !== "unavailable" && bki.data.overdue90Plus12m > 0)
      return { ...result, target: "rejected", reason: "BKI_OVERDUE_90_PLUS" };
    if (stops.length)
      return { ...result, target: "rejected", reason: stops[0] };
    if (result.holes.length)
      return {
        ...result,
        target: "info_requested",
        reason:
          bki.status !== "unavailable" && bki.data.overdue30Plus12m > 0
            ? "BKI_OVERDUE_30_PLUS"
            : undefined,
      };
    if (a.amount > Number(core.limit_now_rub)) {
      const alternatives = deps.alternatives({
        amount_rub: a.amount,
        term_months: a.term_months,
        purpose: normalizedPurpose(a.purpose),
        form:
          state.profile.form === "ООО" || state.profile.form === "ИП"
            ? state.profile.form
            : null,
        months_active: compliance.enrichment.monthsActive ?? null,
        limit_now_rub: Number(core.limit_now_rub),
        core_instrument:
          typeof core.instrument === "string" ? core.instrument : null,
        core_status: typeof core.status === "string" ? core.status : null,
      });
      checks._v2 = { compliance, alternatives, acceptedAlternative };
      return {
        ...result,
        target: "info_requested",
        reason: "LIMIT_EXCEEDED_ALTERNATIVES",
      };
    }
    return { ...result, target: "underwriting" };
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    console.error(
      "[applications] scoring pipeline failed",
      safeErrorMetadata(error),
    );
    throw new ApplicationError(
      503,
      "Проверки или ядро недоступны, повторите позже",
    );
  }
}

function transaction<T>(db: DatabaseSync, fn: () => T): T {
  let began = false;
  try {
    // A SQLite busy timeout would synchronously block every request in this process.
    db.exec("PRAGMA busy_timeout=0");
    db.exec("BEGIN IMMEDIATE");
    began = true;
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (began) db.exec("ROLLBACK");
    if (isSqliteContention(error)) throw new WriterConflict();
    throw error;
  }
}

class WriterConflict extends ApplicationError {
  constructor() {
    super(409, "Заявка занята другим запросом, повторите попытку");
  }
}
function isSqliteContention(error: unknown) {
  const e = record(error);
  return (
    [5, 6].includes(Number(e.errcode) & 255) ||
    (typeof e.code === "string" && /^SQLITE_(BUSY|LOCKED)(_|$)/.test(e.code))
  );
}
async function transactionWithRetry<T>(db: DatabaseSync, fn: () => T) {
  for (let attempt = 0; ; attempt++) {
    try {
      return transaction(db, fn);
    } catch (error) {
      if (!(error instanceof WriterConflict) || attempt >= 2) throw error;
      await delay(10 * (attempt + 1));
    }
  }
}
export function safeErrorMetadata(error: unknown) {
  const kind =
    error instanceof SyntaxError
      ? "SyntaxError"
      : error instanceof TypeError
        ? "TypeError"
        : error instanceof Error
          ? "Error"
          : "Unknown";
  return `code=${isSqliteContention(error) ? "SQLITE_BUSY_LOCKED" : "OPERATION_FAILED"} class=${kind}`;
}
// Strip sensitive keys at any depth while preserving evidence needed by later updates.
function eventPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(eventPayload);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !["phone", "inn", "passport", "email"].includes(key.toLowerCase()),
        )
        .map(([key, item]) => [key, eventPayload(item)]),
    );
  return value;
}
function maskEventText(value: unknown, privateName: string): unknown {
  if (Array.isArray(value))
    return value.map((item) => maskEventText(item, privateName));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        maskEventText(item, privateName),
      ]),
    );
  if (typeof value === "string") {
    const text = privateName
      ? value.replaceAll(privateName, "[имя скрыто]")
      : value;
    return text
      .replace(/\b\d{10,}\b/g, "[реквизиты скрыты]")
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[почта скрыта]");
  }
  return value;
}
function persistTransition(
  db: DatabaseSync,
  command: Command,
  deps: Dependencies,
  reply?: ScoredDossier,
) {
  const a = checkCommand(db, command, deps),
    at = deps.clock().toISOString();
  if (reply && evidenceHash(db, a) !== reply.evidenceHash)
    throw new ApplicationError(
      409,
      "Данные клиента изменились, повторите расчёт",
    );
  let actorRole = command.actorRole,
    actorId = command.actorId,
    reason =
      command.reason?.trim() ||
      (command.event === "request_info"
        ? String(command.payload?.text ?? "")
        : null);
  if (reply) {
    actorRole = "system";
    actorId = null;
    reason = reply.reason ?? null;
  }
  if (command.event === "escalate_silent") reason = "CLIENT_SILENT";
  if (command.event === "escalate_disagreed") reason = "CLIENT_DISAGREED";
  const next = transition(a.status, command.event, actorRole, reply?.target);
  if (reply) {
    const latest = dossierOf(db, a.id);
    db.prepare(
      `INSERT INTO dossiers(application_id,version,core_result,checks,holes,created_at,readiness_n,readiness_m,checklist_version)
      VALUES(?,?,?,?,?,?,?,?,?)`,
    ).run(
      a.id,
      (latest?.version ?? 0) + 1,
      JSON.stringify(reply.core_result),
      JSON.stringify(reply.checks),
      JSON.stringify(reply.holes),
      at,
      reply.N,
      reply.M,
      reply.checklist_version,
    );
  }
  const seq = (
    db
      .prepare(
        "SELECT COALESCE(MAX(seq),0)+1 AS seq FROM application_events WHERE application_id=?",
      )
      .get(a.id) as { seq: number }
  ).seq;
  db.prepare(
    `INSERT INTO application_events(application_id,seq,event,from_status,to_status,actor_role,actor_id,reason,payload,at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    a.id,
    seq,
    command.event,
    a.status,
    next,
    actorRole,
    actorRole === "system" ? null : actorId,
    reason,
    JSON.stringify(
      maskEventText(
        eventPayload(command.payload ?? {}),
        userState(db, a.user_id).profile.name ?? "",
      ),
    ),
    at,
  );
  const result = db
    .prepare(
      `UPDATE applications SET status=?,version=version+1,updated_at=?,consent_at=?,queued_at=?,amount=?,term_months=?
    WHERE id=? AND version=?`,
    )
    .run(
      next,
      at,
      command.event === "submit" ? at : a.consent_at,
      next === "queued" ? (a.queued_at ?? at) : a.queued_at,
      reply?.application.amount ?? a.amount,
      reply?.application.term_months ?? a.term_months,
      a.id,
      command.expectedVersion,
    );
  if (result.changes !== 1)
    throw new ApplicationError(409, "Версия заявки изменилась");
  return { application: applicationOf(db, a.id) };
}

// No transaction remains open across awaits. CAS and the complete cascade commit together.
function persistCascade(
  db: DatabaseSync,
  command: Command,
  deps: Dependencies,
  reply?: ScoredDossier,
) {
  let result = persistTransition(db, command, deps, reply);
  const system = (event: Event, payload: Record<string, unknown>) => {
    result = persistTransition(
      db,
      {
        applicationId: command.applicationId,
        event,
        expectedVersion: result.application.version,
        actorRole: "system",
        actorId: null,
        payload,
      },
      deps,
    );
  };
  if (
    result.application.status === "underwriting" &&
    (reply || command.event === "send_to_underwriting")
  ) {
    const amount = result.application.amount;
    system("underwriter_approve", { amount });
    const option =
      command.event === "send_to_underwriting" &&
      command.payload?.option_id !== undefined
        ? alternativeOf(db, result.application, command.payload)
        : (reply?.acceptedAlternative ??
          acceptedAlternativeOf(db, result.application));
    const rate = option
        ? option.rate_annual_pct / 100
        : applicationConfig().OFFER_RATE,
      term_months = result.application.term_months;
    system("make_offer", {
      amount,
      rate,
      term_months,
      schedule: option
        ? alternativeSchedule(option)
        : annuitySchedule(amount, rate, term_months),
    });
  }
  if (command.event === "sign")
    system("disburse", { message: "Деньги на счёте", demo: true });
  return result;
}
export async function transitionApplication(
  db: DatabaseSync,
  command: Command,
  input: DependencyInput,
) {
  const deps = completeDependencies(input);
  const reply = await scoreCommand(db, command, deps);
  return transactionWithRetry(db, () =>
    reply
      ? persistCascade(db, command, deps, reply)
      : persistTransition(db, command, deps),
  );
}

export function createApplication(
  db: DatabaseSync,
  userId: string,
  input: { selectionId: string; selectionVersion: number; parent_id?: string },
  deps: DependencyInput,
) {
  return transaction(db, () => {
    const user = db.prepare("SELECT role FROM users WHERE id=?").get(userId) as
      { role: Role } | undefined;
    if (user?.role !== "client")
      throw new ApplicationError(403, "Заявку создаёт клиент");
    const selection = selectionOf(
      userState(db, userId),
      input.selectionId,
      input.selectionVersion,
    );
    if (input.parent_id) {
      const parent = visibleApplication(db, input.parent_id, "client", userId);
      if (parent.status !== "rejected")
        throw new ApplicationError(
          409,
          "Исходная заявка должна быть отклонена",
        );
    }
    const amount = selection.input?.amount ?? selection.calculation.amount;
    const term = selection.input?.term ?? selection.calculation.term;
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !Number.isInteger(term) ||
      term < 1 ||
      term > 120
    )
      throw new ApplicationError(422, "Неверная сумма или срок заявки");
    const id = randomUUID(),
      at = deps.clock().toISOString(),
      status = transition(null, "create", "client");
    db.prepare(
      `INSERT INTO applications(id,user_id,selection_id,selection_version,status,amount,term_months,purpose,
      version,consent_at,queued_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,NULL,NULL,?,?)`,
    ).run(
      id,
      userId,
      input.selectionId,
      input.selectionVersion,
      status,
      amount,
      term,
      selection.purpose,
      at,
      at,
    );
    db.prepare(
      `INSERT INTO application_events(application_id,seq,event,from_status,to_status,actor_role,actor_id,reason,payload,at)
      VALUES(?,1,'create',NULL,?,'client',?,NULL,?,?)`,
    ).run(
      id,
      status,
      userId,
      JSON.stringify(input.parent_id ? { parent_id: input.parent_id } : {}),
      at,
    );
    return { application: applicationOf(db, id) };
  });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function applicationRequestHash(path: string, body: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical({ path, body })))
    .digest("hex");
}
function replay(
  db: DatabaseSync,
  userId: string,
  key: string,
  hash: string,
): { application: Application } | undefined {
  const cached = db
    .prepare(
      "SELECT request_hash,response FROM application_idempotency WHERE key=? AND user_id=?",
    )
    .get(key, userId) as { request_hash: string; response: string } | undefined;
  if (!cached) return;
  if (cached.request_hash !== hash)
    throw new ApplicationError(
      422,
      "Idempotency-Key уже использован для другого запроса",
    );
  return JSON.parse(cached.response);
}

// HTTP orchestration: the whole cascade and idempotency response commit together.
// Each step still appends its own event and advances the version once.
export async function executeApplicationEvent(
  db: DatabaseSync,
  command: Command,
  key: string,
  hash: string,
  input: DependencyInput,
) {
  const deps = completeDependencies(input);
  if (command.actorRole === "system" || !command.actorId)
    throw new ApplicationError(403, "Системная роль недоступна через HTTP");
  visibleApplication(
    db,
    command.applicationId,
    command.actorRole,
    command.actorId,
  );
  const userId = command.actorId;
  if (
    ["agent_nudge", "escalate_silent", "escalate_disagreed"].includes(
      command.event,
    )
  )
    throw new ApplicationError(403, "Системное событие недоступно через HTTP");
  const cached = replay(db, userId, key, hash);
  if (cached) return cached;
  const reply = await scoreCommand(db, command, deps);
  return transactionWithRetry(db, () => {
    const duplicate = replay(db, userId, key, hash);
    if (duplicate) return duplicate;
    const result = persistCascade(db, command, deps, reply);
    db.prepare(
      "INSERT INTO application_idempotency(key,user_id,request_hash,response) VALUES(?,?,?,?)",
    ).run(key, userId, hash, JSON.stringify(result));
    return result;
  });
}

export function bankQueue(db: DatabaseSync, deps: DependencyInput) {
  const now = deps.clock().getTime(),
    K = applicationConfig().PRIORITY_AGING_K;
  return (
    db
      .prepare("SELECT * FROM applications WHERE status='queued'")
      .all() as Application[]
  )
    .map((application) => {
      const dossier = dossierOf(db, application.id);
      if (!dossier || !application.queued_at)
        throw new ApplicationError(503, "Не хватает данных досье");
      const N = dossier.readiness_n,
        M = dossier.readiness_m;
      if (
        N == null ||
        M == null ||
        !Number.isFinite(N) ||
        !Number.isFinite(M) ||
        M <= 0 ||
        N < 0 ||
        N > M
      )
        throw new ApplicationError(503, "Не хватает данных полноты досье");
      const ready = N / M,
        holes = (JSON.parse(dossier.holes) as unknown[]).length;
      const hours = Math.max(
        0,
        (now - Date.parse(application.queued_at)) / 3_600_000,
      );
      const limit = record(JSON.parse(dossier.core_result).core).limit_now_rub;
      const amount = Math.min(
        application.amount,
        typeof limit === "number" ? limit : 0,
      );
      const terms = { amount, ready, holes, hours, K };
      const escalation = eventsOf(db, application.id).findLast(
        (e) => e.to_status === "queued",
      );
      return {
        application,
        priority: (amount * ready) / (1 + holes) + K * hours,
        terms,
        red_reason: escalation?.reason ?? null,
        client_objections: dossier.client_objections,
        alternatives: dossier.alternatives,
        N,
        M,
        holes: JSON.parse(dossier.holes),
        checks: JSON.parse(dossier.checks),
      };
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.application.queued_at!.localeCompare(b.application.queued_at!) ||
        a.application.id.localeCompare(b.application.id),
    );
}
