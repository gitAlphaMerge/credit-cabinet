import { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import type { Express } from "express";
import type { AppState } from "../../shared/types";
import type { ComplianceReport } from "../../server/compliance";
import * as a from "../../server/applications";

export { a, request, assert };
export let app: Express, db: DatabaseSync, state: AppState;
export let cookies: Record<string, string>;
export const owner = "q1-owner",
  other = "q1-other",
  manager = "q1-manager";
export let mode:
  | "green"
  | "holes"
  | "stop"
  | "limit"
  | "gate_info"
  | "gate_stop"
  | "bki30"
  | "bki90" = "green";
export function setMode(value: typeof mode) {
  mode = value;
}
export let scoreCalls = 0;
export let pauseCore: undefined | (() => Promise<void>);
export function setPause(value: typeof pauseCore) {
  pauseCore = value;
}
export const deps: a.Dependencies = {
  clock: () => new Date("2026-10-23T12:00:00Z"),
  compliance: async (): Promise<ComplianceReport> => ({
    gate:
      mode === "gate_stop"
        ? "hard_stop"
        : mode === "gate_info"
          ? "info_requested"
          : "pass",
    checks: [
      {
        key: "egrul",
        status: "ok",
        source: "синтетические данные (мок)",
        managerText: "fixture",
        checkedAt: "2026-10-23T12:00:00Z",
      },
    ],
    documents: [],
    enrichment: {},
    reasons: mode === "gate_stop" ? ["COMPLIANCE_BANKRUPTCY"] : [],
    holes: mode === "gate_info" ? ["statement"] : [],
  }),
  core: {
    async score() {
      scoreCalls++;
      const result = {
        core_result: {
          core: {
            stops_fired: mode === "stop" ? ["ENFORCEMENT"] : [],
            missing: mode === "holes" ? ["contract_main_customer"] : [],
            limit_now_rub: mode === "limit" ? 100000 : 400000,
          },
        },
      };
      await pauseCore?.();
      return result;
    },
  },
  bki: async () => ({
    status: "ok",
    source: "синтетические данные (мок)",
    data: {
      openLoans: 0,
      overdue30Plus12m: mode === "bki30" ? 1 : 0,
      overdue90Plus12m: mode === "bki90" ? 1 : 0,
      debtBurdenRatio: 0,
    },
  }),
  alternatives: () => [
    {
      option_id: "q1-option",
      kind: "smaller_amount",
      product_id: "fixture",
      product_name: "fixture",
      amount_rub: 100000,
      term_months: 12,
      rate_annual_pct: 24,
      monthly_payment_rub: 10000,
      reason: "fixture",
    },
  ],
};

before(async () => {
  // Runtime database only. Keep artifacts inside the worktree; no network or fixture downloads.
  // No removal: the executor contract forbids deleting files. Report prints the retained location.
  const folder = mkdtempSync(join(process.cwd(), "tests/qa/q1-sqlite-"));
  process.env.DATABASE_PATH = join(folder, "applications.sqlite");
  console.log(`Q1_SQLITE=${process.env.DATABASE_PATH}`);
  ({ app } = await import("../../server/app"));
  const store = await import("../../server/store");
  db = store.db;
  state = store.initialState({
    name: "fixture",
    form: "ООО",
    ageBand: "fixture",
    inn: "9900000001",
    stage: "operating",
    sector: "fixture",
    registered: true,
    result: "fixture",
    debt: "fixture",
    intent: "fixture",
  });
  state.documents = [
    {
      id: "statement",
      category: "statement",
      name: "fixture",
      period: "fixture",
      confirmed: true,
      fields: {},
      createdAt: "2026-10-23",
      currency: "RUB",
      mime: "text/csv",
      records: [{ date: "2026-10-22", amount: 1000 }],
    },
  ];
  state.selections = [
    {
      id: "selection",
      version: 1,
      createdAt: "2026-10-22",
      purpose: "fixture",
      repayFrom: "fixture",
      ownFunds: 0,
      product: "fixture",
      risks: [],
      alternatives: [],
      status: "ready",
      calculation: {
        amount: 300000,
        term: 12,
        rate: 0.24,
        monthlyPayment: 0,
        interest: 0,
        total: 0,
        flow: null,
        existing: null,
        maxAmount: null,
        dscr: null,
        stressDscr: null,
        schedule: [],
        source: "demo",
        formula: "fixture",
      },
    },
  ];
  cookies = {};
  for (const [id, role] of [
    [owner, "client"],
    [other, "client"],
    [manager, "manager"],
  ]) {
    db.prepare(
      "INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,?)",
    ).run(id, id, "unused", JSON.stringify(state), role);
    cookies[id] = "alfa_session=" + store.session(id);
  }
  assert.ok(
    db
      .prepare("PRAGMA database_list")
      .all()
      .some((row) => row.file === process.env.DATABASE_PATH),
    "requires on-disk SQLite, not :memory:",
  );
});
beforeEach(() => {
  mode = "green";
  pauseCore = undefined;
  scoreCalls = 0;
  a.configureApplications(deps);
  saveState();
});
after(() => {
  db?.close();
});
export function saveState(value = state) {
  db.prepare("UPDATE users SET state=? WHERE id=?").run(
    JSON.stringify(value),
    owner,
  );
}
export function create() {
  return a.createApplication(
    db,
    owner,
    { selectionId: "selection", selectionVersion: 1 },
    deps,
  ).application.id;
}
export function post(
  id: string,
  event: a.Event,
  payload: Record<string, unknown> = {},
  actor = owner,
  version = a.applicationOf(db, id).version,
  key = randomUUID(),
  reason = "fixture",
) {
  return request(app)
    .post(`/api/applications/${id}/events`)
    .set("Cookie", cookies[actor])
    .set("Idempotency-Key", key)
    .send({ event, expectedVersion: version, reason, payload });
}
export function internal(
  id: string,
  event: a.Event,
  payload: Record<string, unknown> = {},
  role: a.Role = "system",
  version = a.applicationOf(db, id).version,
) {
  return a.transitionApplication(
    db,
    {
      applicationId: id,
      event,
      payload,
      reason: "fixture",
      actorRole: role,
      actorId: role === "system" ? null : role === "manager" ? manager : owner,
      expectedVersion: version,
    },
    deps,
  );
}
export async function info() {
  setMode("holes");
  const id = create();
  await post(id, "submit", { consent: true }).expect(200);
  return id;
}
export async function queued() {
  const id = await info();
  await internal(id, "escalate_disagreed", { client_objections: "fixture" });
  return id;
}
export async function offered() {
  setMode("green");
  const id = create();
  await post(id, "submit", { consent: true }).expect(200);
  return id;
}
