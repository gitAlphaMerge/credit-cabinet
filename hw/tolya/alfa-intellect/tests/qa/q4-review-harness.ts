/** Q4 fixtures only; all bank decisions and persistence use production code. */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import type { AppState } from "../../shared/types";
import type { ComplianceReport } from "../../server/compliance";
import * as a from "../../server/applications";
import { calculate } from "../../server/finance";
import { buildAlternatives } from "../../server/alternatives";

export { a, buildAlternatives };
export const AT = new Date("2026-10-23T12:00:00Z");
export const golden = JSON.parse(
  readFileSync(
    new URL("../../../../../data/golden.json", import.meta.url),
    "utf8",
  ),
);
export const catalog = JSON.parse(
  readFileSync(
    new URL("../../../../../data/catalog/products.json", import.meta.url),
    "utf8",
  ),
).products;
export const product = catalog.find((p: any) => p.id === "ALFA_RCL_UNSEC");
export function fixture(
  db: DatabaseSync,
  amount = 300000,
  purpose = "Развитие",
) {
  const uid = crypto.randomUUID();
  const state: AppState = {
    profile: {
      name: "Синтетиков Тест Тестович",
      form: "ООО",
      inn: "9900000001",
      ageBand: "до года",
      stage: "operating",
      sector: "торговля",
      registered: true,
      result: "в плюс",
      debt: "нет",
      intent: "подбор",
    },
    documents: [
      {
        id: "fresh",
        category: "statement",
        name: "q4.csv",
        period: "год",
        confirmed: true,
        fields: {},
        createdAt: AT.toISOString(),
        currency: "RUB",
        mime: "text/csv",
        records: [
          {
            date: "2026-10-22",
            amount: 100000,
            counterparty: "Синтетика",
            purpose: "выручка",
          },
        ],
      },
    ],
    selections: [
      {
        id: "q4-selection",
        version: 1,
        createdAt: AT.toISOString(),
        purpose,
        repayFrom: "выручка",
        product: "кредит",
        ownFunds: 0,
        risks: [],
        alternatives: [],
        status: "ready",
        calculation: calculate({ amount, term: 12, rate: 24, flow: null }, AT),
      },
    ],
    chats: [],
    credit: null,
    notifications: [],
    leads: [],
    financials: {},
    preferences: { split: 60, tourDone: true },
  };
  db.prepare(
    "INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,?)",
  ).run(uid, uid, "unused", JSON.stringify(state), "client");
  const seen: any[] = [];
  const gate: ComplianceReport = {
    gate: "pass",
    checks: [],
    documents: [],
    reasons: [],
    holes: [],
    enrichment: {
      form: "ООО",
      monthsActive: 79,
      registeredAt: "2020-03-12",
      okved: "31.09",
    },
  };
  const deps: a.Dependencies = {
    clock: () => AT,
    compliance: async () => structuredClone(gate),
    bki: async () => ({
      status: "ok",
      source: "синтетические данные (мок)",
      data: {
        openLoans: 0,
        overdue30Plus12m: 0,
        overdue90Plus12m: 0,
        debtBurdenRatio: 0,
      },
    }),
    core: {
      score: async (input: any) => {
        seen.push(structuredClone(input));
        return {
          core_result: {
            core: {
              stops_fired: [],
              missing: [],
              limit_now_rub: 400000,
              instrument: "ALFA_LUMP_UNSEC",
              status: "можно подавать",
            },
          },
        };
      },
    },
    alternatives: () => [
      {
        option_id: "q4-option",
        kind: "other_product",
        product_id: product.id,
        product_name: product.bank_product_name,
        amount_rub: 300000,
        term_months: 6,
        rate_annual_pct: product.bank_base_rate_from_pct,
        monthly_payment_rub: (300000 * product.bank_base_rate_from_pct) / 1200,
        reason: "синтетический вариант из каталога",
      },
    ],
  };
  const save = () =>
    db
      .prepare("UPDATE users SET state=? WHERE id=?")
      .run(JSON.stringify(state), uid);
  const id = a.createApplication(
    db,
    uid,
    { selectionId: "q4-selection", selectionVersion: 1 },
    deps,
  ).application.id;
  const command = (
    event: a.Event,
    payload: Record<string, unknown> = {},
  ): a.Command => ({
    applicationId: id,
    event,
    expectedVersion: a.applicationOf(db, id).version,
    actorRole: "client",
    actorId: uid,
    payload,
  });
  return {
    uid,
    state,
    deps,
    seen,
    gate,
    id,
    save,
    command,
    submit: () =>
      a.transitionApplication(db, command("submit", { consent: true }), deps),
  };
}

export function offerOf(db: DatabaseSync, id: string) {
  const event = a.eventsOf(db, id).findLast((e) => e.event === "make_offer");
  assert.ok(event, "automatic offer must exist");
  return JSON.parse(event.payload as string);
}

/** Execute the actual assertion helper, bypassing only live network setup. */
export function liveInstrumentAssertion(
  instrument: string,
  expectedInstrument: unknown,
) {
  const source = readFileSync(
    new URL("../applications-live.test.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("  function coreOf(");
  const end = source.indexOf('\n  test("S1', start);
  assert.ok(start >= 0 && end > start, "locate real live oracle");
  const js = stripTypeScriptTypes(source.slice(start, end));
  const core = {
    status: "можно подавать",
    instrument,
    stops_fired: [],
    missing: [],
    flow_month_rub: 100,
    limit_now_rub: 100,
    limit_after_rub: 100,
  };
  const check = { status: "ok", source: "синтетические данные (мок)" };
  const card = {
    dossier: {
      core_result: JSON.stringify({ core_id: "liza", decision_id: "q4", core }),
      checks: JSON.stringify({ bki: check, aml: check, fns: check }),
    },
  };
  const band = { min: 90, max: 110 };
  const g = {
    expected: {
      ...core,
      instrument: expectedInstrument,
      flow_month_rub: band,
      limit_rub: { now: band, after_actions: band },
    },
  };
  vm.runInNewContext(js + "\ncoreOf(JSON.parse(cardJson), JSON.parse(gJson))", {
    assert,
    cardJson: JSON.stringify(card),
    gJson: JSON.stringify(g),
  });
}
