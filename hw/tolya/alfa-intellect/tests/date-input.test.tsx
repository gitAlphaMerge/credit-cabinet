import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DateInput } from "../src/DateInput";
import {
  dateCaret,
  formatDateInput,
  normalizeDateInput,
} from "../src/date-input";
import { facilityErrors } from "../shared/facility-validation";

test("Russian date mask accepts typing and paste, API dates stay ISO", () => {
  for (const raw of ["18102026", "18.10.2026", "2026-10-18"])
    assert.equal(normalizeDateInput(raw), "2026-10-18");
  assert.equal(formatDateInput("2026-10-18"), "18.10.2026");
  assert.equal(normalizeDateInput(""), "");
  assert.equal(normalizeDateInput("181"), "18.1");
  assert.equal(normalizeDateInput("1802202"), "18.02.202");
  assert.equal(formatDateInput("18.02.202"), "18.02.202");
});
test("Invalid dates and drafts are not silently replaced by valid dates", () => {
  const form = {
    name: "Кредит",
    amount: "100000",
    balance: "50000",
    rate: "18",
    term: "24",
    firstDate: "2026-10-20",
  };
  for (const text of [
    "31.02.2026",
    "29.02.2026",
    "31.04.2026",
    "00.10.2026",
    "18.13.2026",
    "18.02.202",
  ]) {
    const issuedDate = normalizeDateInput(text)!;
    assert.ok(facilityErrors({ ...form, issuedDate }, "2026-10-18").issuedDate);
    assert.equal(formatDateInput(issuedDate), text);
  }
  assert.equal(
    facilityErrors(
      { ...form, issuedDate: normalizeDateInput("29.02.2024") },
      "2026-10-18",
    ).issuedDate,
    undefined,
  );
  for (const text of ["tomorrow", "18/10/2026", "181020260", "18.10.20xx"])
    assert.equal(normalizeDateInput(text), null);
});
test("Manual date entry still enforces issue/payment boundaries", () => {
  const form = {
    name: "Кредит",
    amount: "100000",
    balance: "50000",
    rate: "18",
    term: "24",
  };
  const errors = facilityErrors(
    {
      ...form,
      issuedDate: normalizeDateInput("19.10.2026"),
      firstDate: normalizeDateInput("17.10.2026"),
    },
    "2026-10-18",
  );
  assert.ok(errors.issuedDate?.includes("сегодняшний день"));
  assert.ok(errors.firstDate?.includes("не раньше сегодня"));
});
test("Caret positions account for the two automatically inserted dots", () => {
  for (const [ordinal, caret] of [
    [0, 0],
    [2, 2],
    [3, 4],
    [4, 5],
    [8, 10],
  ])
    assert.equal(dateCaret("18.10.2026", ordinal), caret);
});
test("Date input is Russian text, with a custom calendar trigger, not an OS date input", () => {
  const html = renderToStaticMarkup(
    <DateInput
      name="issuedDate"
      aria-label="Дата выдачи кредита"
      value="2026-10-18"
      min="1900-01-01"
      max="2026-10-18"
      onValueChange={() => {}}
    />,
  );
  assert.ok(html.includes('placeholder="ДД.ММ.ГГГГ"'));
  assert.ok(html.includes('value="18.10.2026"'));
  assert.ok(html.includes('type="text"'));
  assert.ok(html.includes('inputMode="numeric"'));
  assert.ok(html.includes('aria-haspopup="dialog"'));
  assert.ok(!html.includes('type="date"'));
});
