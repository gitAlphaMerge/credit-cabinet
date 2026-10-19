import test from "node:test";
import assert from "node:assert/strict";
import { calculate, select, forecast } from "../server/finance";
import type { Profile } from "../shared/types";
test("Аннуитет: сумма основного долга, конечный остаток и проценты согласованы", () => {
  const c = calculate(
    { amount: 3000000, term: 36, rate: 22, flow: 420000 },
    new Date("2026-10-16"),
  );
  assert.equal(c.schedule.length, 36);
  assert.ok(
    Math.abs(c.schedule.reduce((a, x) => a + x.principal, 0) - c.amount) < 0.2,
  );
  assert.equal(c.schedule.at(-1)!.balance, 0);
  assert.ok(Math.abs(c.total - c.amount - c.interest) < 0.01);
  assert.ok(c.monthlyPayment > 114000 && c.monthlyPayment < 115000);
  assert.equal(c.schedule[0].date, "2026-11-16");
});
test("Нулевая ставка и отсутствие финансовых данных не выдумывают лимит", () => {
  const c = calculate({ amount: 120000, term: 12, rate: 0 });
  assert.equal(c.monthlyPayment, 10000);
  assert.equal(c.interest, 0);
  assert.equal(c.maxAmount, null);
  assert.equal(c.dscr, null);
});
test("Границы: отрицательная сумма, NaN, слишком длинный срок отклоняются", () => {
  for (const x of [
    { amount: -1, term: 12, rate: 20 },
    { amount: NaN, term: 12, rate: 20 },
    { amount: 10000, term: 121, rate: 20 },
  ])
    assert.throws(() => calculate(x));
});
test("DSCR учитывает текущие платежи и стресс 30%", () => {
  const c = calculate({
    amount: 1000000,
    term: 24,
    rate: 24,
    flow: 120000,
    existing: 20000,
  });
  assert.equal(
    c.dscr,
    Math.round((120000 / (c.monthlyPayment + 20000)) * 100) / 100,
  );
  assert.ok(c.stressDscr! < c.dscr!);
  assert.ok(c.maxAmount! > 1000000);
});
test("Незарегистрированный бизнес не получает готовый кредит", () => {
  const p: Profile = {
    name: "Идея",
    registered: false,
    stage: "planning",
    form: "Не зарегистрирован",
    sector: "IT",
    ageBand: "",
    result: "",
    debt: "",
    intent: "",
  };
  const s = select({ purpose: "Запуск", amount: 1000000, term: 24 }, p);
  assert.equal(s.status, "Нужна дополнительная проверка");
  assert.ok(s.risks.some((x) => x.includes("не зарегистрирован")));
  assert.equal(s.calculation.maxAmount, null);
});
test("Стресс пересчитывает только прогноз и возвращает ожидаемую величину", () => {
  assert.equal(forecast(100000, 300000, 200000, 50000), 150000);
  assert.equal(forecast(100000, 300000, 200000, 50000, true), 60000);
});
