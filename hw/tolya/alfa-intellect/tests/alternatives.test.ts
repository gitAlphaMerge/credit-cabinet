import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildAlternatives,
  type AlternativesRequest,
} from "../server/alternatives";

const products = JSON.parse(
  readFileSync(
    new URL("../../../../data/catalog/products.json", import.meta.url),
    "utf8",
  ),
).products;
const req: AlternativesRequest = {
  amount_rub: 900000,
  term_months: 12,
  purpose: "рост",
  form: "ИП",
  months_active: 36,
  limit_now_rub: 400000,
  core_instrument: "ALFA_LUMP_UNSEC",
  core_status: "нужен менеджер",
};

test("capped offers, order, stable IDs and independent annuity", () => {
  const offers = buildAlternatives(req);
  assert.ok(offers.length >= 2);
  assert.equal(offers[0].kind, "smaller_amount");
  assert.equal(offers[0].amount_rub, 400000);
  assert.equal(offers.at(-1)?.kind, "longer_term");
  assert.ok(offers.at(-1)!.monthly_payment_rub < offers[0].monthly_payment_rub);
  assert.deepEqual(buildAlternatives(req), offers);
  for (const o of offers) {
    const p = products.find((p: any) => p.id === o.product_id);
    assert.ok(p);
    assert.ok(o.amount_rub <= 400000);
    assert.equal(o.rate_annual_pct, p.bank_base_rate_from_pct);
    const r = p.bank_base_rate_from_pct / 1200;
    const payment =
      (o.amount_rub * r * (1 + r) ** o.term_months) /
      ((1 + r) ** o.term_months - 1);
    assert.ok(Math.abs(o.monthly_payment_rub - payment) <= 0.01);
  }
});

test("zero, below minimum, missing facts and invalid numbers fail closed", () => {
  for (const limit of [0, -1, 49999, NaN, Infinity])
    assert.deepEqual(buildAlternatives({ ...req, limit_now_rub: limit }), []);
  assert.deepEqual(buildAlternatives({ ...req, form: null }), []);
  assert.deepEqual(buildAlternatives({ ...req, months_active: null }), []);
  assert.ok(
    !buildAlternatives({ ...req, months_active: 8 }).some(
      (o) => o.product_id === req.core_instrument,
    ),
  );
});

test("revolving interest, daily rate conversion and principal disclosure", () => {
  for (const id of ["ALFA_RCL_UNSEC", "ALFA_START", "ALFA_OVERDRAFT"]) {
    const p = products.find((p: any) => p.id === id);
    const o = buildAlternatives({
      ...req,
      core_instrument: id,
      purpose: "кассовый разрыв",
      term_months: 2,
    })[0];
    assert.equal(o.product_id, id);
    const rate =
      p.bank_base_rate_from_pct * (p.bank_rate_unit === "daily_pct" ? 365 : 1);
    assert.equal(o.rate_annual_pct, rate);
    assert.ok(
      Math.abs(o.monthly_payment_rub - (o.amount_rub * rate) / 1200) <= 0.01,
    );
    assert.match(o.reason, /только проценты/);
    assert.match(o.reason, /основн/);
  }
});

test("restricted purposes, absent base rates and cheapest other product", () => {
  for (const purpose of [
    "dividends",
    "личные нужды",
    "неизвестно",
    "рефинансирование",
  ])
    assert.deepEqual(buildAlternatives({ ...req, purpose }), []);
  const offers = buildAlternatives({
    ...req,
    purpose: "сезон",
    term_months: 6,
    core_instrument: "ALFA_RCL_UNSEC",
  });
  assert.equal(offers[1]?.kind, "other_product");
  assert.equal(offers[1]?.product_id, "ALFA_START");
});

test("a longer term can satisfy catalogue minimum when the requested term cannot", () => {
  const offers = buildAlternatives({ ...req, term_months: 6 });
  assert.ok(
    offers.some(
      (o) =>
        o.kind === "longer_term" &&
        o.product_id === req.core_instrument &&
        o.term_months === 60,
    ),
  );
});

test("catalogue invariants across all 8 products and combinations", () => {
  let checked = 0;
  for (const core of products)
    for (const amount of [49999, 300000, 509999, 900000, 160000000])
      for (const term of [1, 2, 6, 12, 60, 120, 121])
        for (const form of ["ИП", "ООО", null] as const)
          for (const purpose of [
            "рост",
            "кассовый разрыв",
            "оборудование",
            "рефинансирование",
            "dividends",
          ])
            for (const age of [0, 8, 9, 36]) {
              const input = {
                ...req,
                amount_rub: amount,
                limit_now_rub: amount - 1,
                term_months: term,
                form,
                purpose,
                months_active: age,
                core_instrument: core.id,
              };
              const offers = buildAlternatives(input);
              assert.ok(offers.length <= 3);
              assert.equal(
                new Set(offers.map((o) => o.option_id)).size,
                offers.length,
              );
              for (const o of offers) {
                checked++;
                const p = products.find((p: any) => p.id === o.product_id);
                assert.ok(
                  o.amount_rub <= input.limit_now_rub && o.amount_rub <= amount,
                );
                assert.equal(o.amount_rub % 10000, 0);
                assert.ok(
                  o.amount_rub >= p.bank_min_amount_rub &&
                    o.amount_rub <= p.bank_max_amount_rub,
                );
                assert.ok(
                  form &&
                    p.bank_borrower_types
                      .split(";")
                      .includes(form === "ИП" ? "IP" : "OOO"),
                );
                assert.ok(age >= p.bank_min_business_age_months);
                assert.ok(o.term_months >= (p.bank_min_term_months ?? 1));
                assert.ok(
                  o.term_months <= (p.bank_max_term_months ?? Infinity),
                );
                if (p.bank_tranche_max_months)
                  assert.ok(o.term_months <= p.bank_tranche_max_months);
                if (p.bank_tranche_max_days_without_subscription)
                  assert.ok(
                    o.term_months * 30 <=
                      p.bank_tranche_max_days_without_subscription,
                  );
                assert.ok(
                  Number.isFinite(o.monthly_payment_rub) &&
                    o.monthly_payment_rub > 0,
                );
                if (purpose === "dividends" || purpose === "рефинансирование")
                  assert.fail("restricted or absent base rate");
                if (purpose === "оборудование" || purpose === "рост")
                  assert.ok(
                    !["ALFA_RCL_UNSEC", "ALFA_OVERDRAFT"].includes(
                      o.product_id,
                    ),
                  );
                if (p.bank_collateral === "required")
                  assert.match(o.reason, /залог/);
              }
            }
  assert.ok(checked > 100);
});
