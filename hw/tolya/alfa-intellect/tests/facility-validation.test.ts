import assert from "node:assert/strict";
import test from "node:test";
import {
  facilityErrors,
  latestPaymentDate,
  russianValidationErrors,
} from "../shared/facility-validation";
const today = "2026-10-18",
  valid = {
    name: "Кредит на оборудование №18",
    amount: "3000000.50",
    balance: "1250000.05",
    rate: "18.75",
    term: "24",
    contractTerm: "36",
    issuedDate: "2025-10-18",
    firstDate: "2026-11-18",
  };
test("Credit validation accepts valid kopecks, zero rate and optional empty dates/term", () => {
  assert.deepEqual(facilityErrors(valid, today), {});
  assert.deepEqual(
    facilityErrors(
      { ...valid, rate: 0, contractTerm: "", issuedDate: "" },
      today,
    ),
    {},
  );
});
test("Missing fields have local Russian errors, no missing-to-zero coercion", () => {
  const errors = facilityErrors({}, today);
  for (const field of [
    "name",
    "amount",
    "balance",
    "rate",
    "term",
    "firstDate",
  ])
    assert.ok(errors[field]);
  assert.equal(errors.contractTerm, undefined);
  assert.equal(errors.issuedDate, undefined);
});
test("Screenshot values: excessive rate and months, invalid long year are rejected", () => {
  const errors = facilityErrors(
    { ...valid, rate: 232, term: 22232323, issuedDate: "33333-03-31" },
    today,
  );
  assert.match(errors.rate, /100%/);
  assert.match(errors.term, /120 месяцев/);
  assert.match(errors.issuedDate, /дату/);
  for (const term of [0, -1, 1.5, 121, "1e2"])
    assert.ok(facilityErrors({ ...valid, term }, today).term);
});
test("Monetary bounds and related loan fields are validated together", () => {
  assert.ok(facilityErrors({ ...valid, amount: 0 }, today).amount);
  assert.ok(facilityErrors({ ...valid, amount: 1e13 }, today).amount);
  assert.ok(facilityErrors({ ...valid, balance: -1 }, today).balance);
  assert.match(
    facilityErrors({ ...valid, balance: 4000000 }, today).balance,
    /не может превышать/,
  );
  assert.match(
    facilityErrors({ ...valid, contractTerm: 12 }, today).contractTerm,
    /не может быть меньше/,
  );
});
test("Calendar dates enforce actual dates, supported years and chronological bounds", () => {
  for (const issuedDate of [
    "2026-02-30",
    "1899-12-31",
    "2026-10-19",
    "33333-03-31",
  ])
    assert.ok(facilityErrors({ ...valid, issuedDate }, today).issuedDate);
  for (const firstDate of ["2026-10-17", "2099-01-01", "2026-02-30"])
    assert.ok(facilityErrors({ ...valid, firstDate }, today).firstDate);
  assert.equal(latestPaymentDate(today), "2036-10-18");
  assert.equal(
    facilityErrors({ ...valid, firstDate: latestPaymentDate(today) }, today)
      .firstDate,
    undefined,
  );
});
test("Contract names are bounded printable text, not only punctuation or controls", () => {
  for (const name of [
    "   ",
    "!!!",
    "a".repeat(101),
    "Кредит\u0000",
    "Договор\u200b",
  ])
    assert.ok(facilityErrors({ ...valid, name }, today).name);
  assert.equal(
    facilityErrors({ ...valid, name: "Договор 123-А" }, today).name,
    undefined,
  );
});
test("Generated validation errors are Russian; internal English and paths are not exposed", () => {
  const errors = russianValidationErrors([
    {
      path: ["rate"],
      code: "too_big",
      message: "Too big: expected number to be <=100",
      maximum: 100,
      origin: "number",
    },
    {
      path: ["name"],
      code: "invalid_type",
      message: "Invalid input: expected string",
    },
    {
      path: ["issuedDate"],
      code: "custom",
      message: "Некорректная календарная дата",
    },
  ]);
  assert.match(errors.rate, /не больше 100/);
  assert.match(errors.name, /Проверьте/);
  assert.match(errors.issuedDate, /Некорректная/);
  assert.ok(
    !JSON.stringify(Object.values(errors)).match(
      /Too big|Invalid input|expected|rate:/,
    ),
  );
});
