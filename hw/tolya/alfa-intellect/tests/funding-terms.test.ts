import test from "node:test";
import assert from "node:assert/strict";
import { fundingInput, instrumentSchedule, transparentFundingEngine } from "../server/funding-engine";
import { blankFundingRequest, fundingCatalog, fundingTerms } from "../shared/financing";
import type { AppState } from "../shared/types";

const state: AppState = {
  profile: {
    name: "Тестовое ООО", form: "ООО", stage: "operating",
    sector: "Торговля", registered: true, ageBand: "3–5 лет",
    result: "Прибыль", debt: "Нет", intent: "Подбор",
  },
  documents: [], chats: [], selections: [], credit: null,
  notifications: [], leads: [], preferences: { split: 60, tourDone: true },
  financials: {},
};

test("catalogue has the six source products and their exact term grids", () => {
  const expected = [
    ["working", 23.5, 300000, 5000000, [6, 12, 18, 24]],
    ["investment", 22, 500000, 7000000, [12, 18, 24, 36, 48, 60]],
    ["revolving", 24, 500000, 5000000, [6, 12, 18, 24]],
    ["contract", 23, 500000, 7000000, [12, 18, 24, 36]],
    ["overdraft", 26, 300000, 2000000, [30, 60, 90]],
    ["refinance", 22.5, 300000, 5000000, [12, 18, 24, 36, 48]],
  ] as const;
  assert.equal(fundingCatalog.length, expected.length);
  for (const [id, rate, min, max, terms] of expected) {
    const product = fundingCatalog.find((p) => p.id === id)!;
    assert.ok(product, id);
    assert.equal(product.rate, rate);
    assert.equal(product.min, min);
    assert.equal(product.max, max);
    assert.deepEqual(fundingTerms(product), terms);
  }
});

test("off-grid requested month rounds to nearest available term and explains it", () => {
  const request = { ...blankFundingRequest(), purpose: "Оборудование" as const,
    amount: 3000000, term: 10, financials: { flow: 500000, existing: 0 } };
  const result = transparentFundingEngine.evaluate(request, state, "2026-10-25");
  assert.equal(result.assessment?.selectedId, "investment");
  assert.equal(result.calculation.term, 12);
  assert.match(result.assessment!.reasons.join(" "), /10 месяцев.*12/);
});

test("server only accepts overdraft cycle values 30, 60 or 90", () => {
  for (const cycleDays of [30, 60, 90])
    assert.equal(fundingInput.safeParse({ ...blankFundingRequest(), cycleDays }).success, true);
  for (const cycleDays of [1, 14, 45, 91])
    assert.equal(fundingInput.safeParse({ ...blankFundingRequest(), cycleDays }).success, false);
});

test("catalogue scenarios route by purpose and usage", () => {
  const scenarios = [
    ["T01", "Закупка товаров и материалов", "once", 1200000, 12, "working"],
    ["T02", "Закупка товаров и материалов", "regular", 1500000, 12, "revolving"],
    ["T03", "Развитие", "parts", 3000000, 24, "contract"],
    ["T04", "Кассовый разрыв", "regular", 400000, null, "overdraft"],
    ["T05", "Оборудование", "once", 3500000, 36, "investment"],
  ] as const;
  for (const [id, purpose, usage, amount, term, expected] of scenarios) {
    const result = transparentFundingEngine.evaluate({
      ...blankFundingRequest(), purpose, usage, amount, term,
      financials: { flow: 500000, existing: 0 },
    }, state, "2026-10-25");
    assert.equal(result.assessment!.recommendedId, expected, id);
  }
  const switchProduct = transparentFundingEngine.evaluate({
    ...blankFundingRequest(), purpose: "Оборудование", usage: "once",
    productId: "revolving", amount: 3000000, term: 36,
    financials: { flow: 500000, existing: 0 },
  }, state, "2026-10-25");
  assert.equal(switchProduct.assessment!.recommendedId, "investment", "T12");
  assert.equal(switchProduct.assessment!.selectedId, "revolving", "T12 selected request");
  assert.ok(switchProduct.assessment!.checks.some((check) => check.state === "unmet"));
});

test("catalogue stop conditions exclude products from the recommendation", () => {
  const input = { ...blankFundingRequest(), financials: { flow: 500000, existing: 0 } };
  const longGap = transparentFundingEngine.evaluate({
    ...input, purpose: "Кассовый разрыв", amount: 400000, cycleDays: 90,
  }, state, "2026-10-25");
  assert.equal(longGap.assessment!.recommendedId, "working", "gap over 60 days");
  const belowMinimum = transparentFundingEngine.evaluate({
    ...input, purpose: "Кассовый разрыв", amount: 250000,
  }, state, "2026-10-25");
  assert.equal(belowMinimum.assessment!.recommendedId, "", "all products below minimum");
  const tooExpensiveRefi = transparentFundingEngine.evaluate({
    ...input, purpose: "Рефинансирование", amount: 2000000, term: 48,
    details: { currentBalance: 2000000, currentPayment: 40000, currentMonths: 48 },
  }, state, "2026-10-25");
  assert.equal(tooExpensiveRefi.assessment!.recommendedId, "", "T11");
  assert.match(tooExpensiveRefi.assessment!.checks.find((check) =>
    check.label === "Экономика рефинансирования")!.detail, /не ниже/);
});

test("revolving line repays each six-month draw and counts interest separately", () => {
  const revolving = fundingCatalog.find((product) => product.id === "revolving")!;
  const schedule = instrumentSchedule(revolving, 500000, 12, "regular", 30, "2026-10-25");
  assert.equal(schedule.length, 12);
  assert.equal(schedule[0].interest, 10000);
  assert.equal(schedule[5].principal, 500000);
  assert.equal(schedule[11].principal, 500000);
  assert.equal(schedule.reduce((sum, row) => sum + row.interest, 0), 120000);
});
