import test from "node:test";
import assert from "node:assert/strict";
import {
  fundingInput,
  instrumentSchedule,
  transparentFundingEngine as engine,
} from "../server/funding-engine";
import {
  blankFundingRequest,
  fundingCatalog,
  type FundingRequest,
} from "../shared/financing";
import { fundingBusinessData } from "../shared/financing-business";
import { addDays, day } from "../shared/cabinet";
import type { AppState } from "../shared/types";
const today = day(),
  profile = {
    name: "Синтетическое ООО",
    form: "ООО",
    stage: "operating",
    sector: "Производство",
    registered: true,
    ageBand: "3–5 лет",
    result: "Прибыль",
    debt: "Есть",
    intent: "Подбор",
  };
const state = (): AppState => ({
  profile: { ...profile },
  documents: [],
  chats: [],
  selections: [],
  credit: null,
  notifications: [],
  leads: [],
  preferences: { split: 60, tourDone: true },
  financials: {},
});
const request = (patch: Partial<FundingRequest> = {}): FundingRequest => ({
  ...blankFundingRequest(),
  financials: { incoming: 800000, expenses: 400000, existing: 0 },
  ...patch,
});
const evaluate = (patch: Partial<FundingRequest> = {}, s = state()) =>
  engine.evaluate(request(patch), s, today);
test("Equipment: deterministic investment selection, amortisation and provenance", () => {
  const r = evaluate({ details: { purchaseCost: 3000000, effect: 200000 } }),
    c = r.calculation;
  assert.equal(r.assessment!.selectedId, "investment");
  assert.equal(r.assessment!.level, "Предварительно обоснованная");
  assert.equal(r.assessment!.paybackMonths, 15);
  assert.ok(c.maxAmount! > c.amount);
  assert.equal(c.schedule.at(-1)!.balance, 0);
  assert.ok(
    Math.abs(c.schedule.reduce((n, r) => n + r.principal, 0) - c.amount) < 0.02,
  );
  assert.equal(c.flow, 400000);
  assert.equal(c.dscr, Math.round((400000 / c.monthlyPayment) * 100) / 100);
  assert.match(r.assessment!.data[0].source, /пользователем/);
});
test("Cash gap: actual dates select overdraft cycle with actual/365 interest, not annuity", () => {
  const r = evaluate({
      purpose: "Кассовый разрыв",
      amount: 400000,
      details: {
        expenseDate: addDays(today, 1),
        receiptsDate: addDays(today, 16),
        confidence: "confirmed",
      },
    }),
    c = r.calculation;
  assert.equal(r.assessment!.selectedId, "overdraft");
  assert.equal(c.schedule.length, 1);
  assert.equal(
    c.interest,
    Math.round(((400000 * 0.26 * 30) / 365) * 100) / 100,
  );
  assert.equal(c.schedule[0].date, addDays(today, 31));
  assert.equal(c.schedule[0].principal, 400000);
  assert.match(r.assessment!.paymentLabel, /30/);
  assert.equal(r.assessment!.cycleDays, 30);
  assert.match(r.assessment!.reasons.join(" "), /15 дней.*30/);
  const manual = evaluate({
    purpose: "Кассовый разрыв",
    amount: 400000,
    cycleDays: 60,
    details: {
      expenseDate: addDays(today, 1),
      receiptsDate: addDays(today, 16),
      cycleManual: true,
    },
  });
  assert.equal(manual.assessment!.cycleDays, 60);
});
test("Credit line: drawdown interest, balloon principal and peak-aware affordability", () => {
  const full = evaluate({
      purpose: "Исполнение контракта",
      amount: 900000,
      term: 12,
      usage: "once",
      productId: "contract",
    }),
    parts = evaluate({
      purpose: "Исполнение контракта",
      amount: 900000,
      term: 12,
      usage: "parts",
    });
  assert.equal(full.assessment!.selectedId, "contract");
  assert.equal(full.calculation.schedule[0].principal, 0);
  assert.equal(full.calculation.schedule.at(-1)!.principal, 900000);
  assert.equal(parts.calculation.schedule[0].interest, 5750);
  assert.ok(parts.calculation.interest < full.calculation.interest);
  assert.ok(full.assessment!.peakPayment > 900000);
  assert.ok(full.calculation.maxAmount! < 900000);
  assert.equal(full.assessment!.decision, "reduce");
});
test("Refinance: confirmed replacement removes old payment once; unknown/partial does not", () => {
  const input = request({
      purpose: "Рефинансирование",
      amount: 500000,
      financials: { incoming: 800000, expenses: 300000, existing: 100000 },
      details: {
        currentBalance: 500000,
        currentPayment: 40000,
        currentRate: 30,
        currentMonths: 18,
        debtIncluded: true,
      },
    }),
    r = engine.evaluate(input, state(), today);
  assert.equal(r.calculation.existing, 60000);
  assert.equal(
    engine.evaluate(
      { ...input, financials: { ...input.financials, existing: 0 } },
      state(),
      today,
    ).calculation.maxAmount,
    null,
  );
  assert.equal(
    engine.evaluate(
      { ...input, details: { ...input.details, debtIncluded: null } },
      state(),
      today,
    ).calculation.existing,
    100000,
  );
  assert.equal(
    engine.evaluate({ ...input, amount: 250000 }, state(), today).calculation
      .existing,
    100000,
  );
});
test("Unknown costs, debt and cash remain unknown, not zero", () => {
  for (const financials of [
    { incoming: 800000 },
    { incoming: 800000, expenses: 300000 },
    { flow: 400000, existing: null },
  ]) {
    const r = evaluate({ financials });
    assert.equal(r.calculation.maxAmount, null);
    assert.equal(r.calculation.dscr, null);
    assert.equal(r.assessment!.level, "Ориентировочная");
    assert.equal(r.assessment!.decision, "insufficient");
  }
  assert.equal(
    evaluate({ financials: { flow: 400000 } }).calculation.existing,
    null,
  );
  assert.equal(
    fundingBusinessData(state()).find((d) => d.key === "available")!.value,
    null,
  );
});
test("High debt gives anti-credit, not a promise of bank refusal", () => {
  const r = evaluate({
    financials: { incoming: 100000, expenses: 90000, existing: 50000 },
  });
  assert.equal(r.calculation.maxAmount, 0);
  assert.equal(r.assessment!.decision, "reduce");
  assert.ok(!/банк.*откажет/i.test(r.status));
  assert.equal(
    evaluate({ financials: { flow: 500000, existing: 0, available: 3000000 } })
      .assessment!.decision,
    "unnecessary",
  );
  assert.equal(
    evaluate({ details: { effect: 0 } }).assessment!.decision,
    "rethink",
  );
});
test("Any catalogue product can be selected without suppressing known mismatches", () => {
  for (const p of fundingCatalog) {
    const r = evaluate({ productId: p.id });
    assert.equal(r.assessment!.selectedId, p.id);
    assert.equal(r.product, p.name);
  }
  const r = evaluate({ productId: "overdraft", amount: 9000000, term: 48 });
  assert.equal(r.calculation.amount, 9000000);
  assert.equal(r.calculation.term, 12);
  assert.ok(
    r.assessment!.checks.filter((c) => c.state === "unmet").length >= 3,
  );
});
test("Source conflicts, stale and future statements cannot support capacity", () => {
  for (const end of [addDays(today, -200), addDays(today, 20)]) {
    const s = state();
    s.documents = [
      {
        id: "s",
        category: "statement",
        name: "Синтетическая выписка",
        period: addDays(end, -89) + " — " + end,
        fields: { freeFlow: 400000, months: 3 },
        confirmed: true,
        createdAt: today,
        currency: "RUB",
        mime: "text/csv",
      },
    ];
    assert.equal(
      evaluate({ financials: { existing: 0 } }, s).calculation.maxAmount,
      null,
    );
  }
  const s = state();
  s.profile.debt = "Нет";
  s.cabinet = {
    facility: {
      id: "f",
      kind: "loan",
      name: "Долг",
      amount: 100000,
      balance: 50000,
      rate: 20,
      term: 2,
      startDate: today,
      asOf: today,
      source: "Введён пользователем",
      quality: "manual",
      events: [
        {
          id: "e",
          date: addDays(today, 3),
          principal: 20000,
          interest: 1000,
          fees: 0,
          balance: 30000,
          status: "planned",
        },
      ],
    },
  };
  assert.equal(
    evaluate({ financials: { flow: 400000 } }, s).calculation.maxAmount,
    null,
  );
  assert.ok(
    evaluate({ financials: { flow: 400000 } }, s).assessment!.data.find(
      (d) => d.key === "existing",
    )!.conflict,
  );
  assert.notEqual(
    evaluate({ financials: { flow: 400000, existing: 21000 } }, s).calculation
      .maxAmount,
    null,
  );
});
test("Data level is evidence based, not a document counter", () => {
  const s = state();
  for (let i = 0; i < 6; i++)
    s.documents.push({
      id: String(i),
      category: "plan",
      name: "Синтетический план",
      period: today,
      fields: {},
      confirmed: true,
      createdAt: today,
      currency: "RUB",
      mime: "text/csv",
    });
  assert.equal(
    evaluate({ financials: {} }, s).assessment!.level,
    "Ориентировочная",
  );
  s.documents.push(
    {
      id: "statement",
      category: "statement",
      name: "Синтетическая история",
      period: addDays(today, -89) + " — " + today,
      fields: { freeFlow: 400000, months: 3 },
      confirmed: true,
      createdAt: today,
      currency: "RUB",
      mime: "text/csv",
    },
    {
      id: "schedule",
      category: "schedule",
      name: "Синтетический график",
      period: today,
      fields: {},
      records: Array.from({ length: 48 }, (_, i) => ({
        date: day(
          new Date(
            Date.UTC(
              new Date(today).getUTCFullYear(),
              new Date(today).getUTCMonth() + i + 1,
              20,
            ),
          ),
        ),
        payment: 10000,
      })),
      confirmed: true,
      createdAt: today,
      currency: "RUB",
      mime: "text/csv",
    },
  );
  assert.equal(
    evaluate({ financials: { existing: 10000, available: 100000 } }, s)
      .assessment!.level,
    "Расширенная",
  );
});
test("Zero-interest calculator, calendar end-of-month, invalid request bounds", () => {
  const schedule = instrumentSchedule(
    { ...fundingCatalog[0], rate: 0 },
    120000,
    12,
    "once",
    30,
    "2028-01-31",
  );
  assert.equal(schedule[0].date, "2028-02-29");
  assert.equal(schedule[0].payment, 10000);
  assert.equal(schedule.at(-1)!.balance, 0);
  for (const patch of [
    { amount: -1 },
    { amount: NaN },
    { term: 121 },
    { cycleDays: 0 },
    { financials: { existing: -1 } },
    { details: { currentRate: 232 } },
    { details: { receiptsDate: "33333-03-31" } },
  ] as Partial<FundingRequest>[])
    assert.equal(fundingInput.safeParse(request(patch)).success, false);
});
