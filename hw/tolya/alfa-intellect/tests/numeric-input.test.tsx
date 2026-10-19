import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  normalizeNumericInput as parse,
  formatNumericInput as format,
  numericCaret,
} from "../src/numeric-input";
import { NumericInput } from "../src/NumericInput";

test("Ruble input: grouping, comma, pasted currency and kopecks preserve exact numeric value", () => {
  assert.equal(parse("1 250 000,50 ₽"), "1250000.50");
  assert.equal(parse("1\u00a0250\u202f000,05 руб."), "1250000.05");
  assert.equal(format("1250000.05"), "1 250 000,05");
  assert.equal(parse(format("123456789012.99")), "123456789012.99");
  assert.equal(parse("000123"), "123");
  assert.equal(parse(",5"), "0.5");
});
test("Incomplete numeric drafts are editable, negative cash flow remains supported", () => {
  assert.equal(parse(""), "");
  assert.equal(parse("1,"), "1.");
  assert.equal(parse("-", 2, true), "-");
  assert.equal(parse("-0,50", 2, true), "-0.50");
  assert.equal(parse("-.5", 2, true), "-0.5");
});
test("Invalid or overprecision input is rejected rather than silently reinterpreted", () => {
  for (const text of ["1e6", "1,2,3", "12abc", "1.234", "-10", "NaN"])
    assert.equal(parse(text), null);
});
test("Months are whole numbers, suffix never reaches the API", () => {
  assert.equal(parse("36 мес.", 0), "36");
  assert.equal(parse("36.5", 0), null);
  assert.equal(parse("-1", 0), null);
});
test("Caret mapping ignores inserted thousands separators", () => {
  assert.equal(numericCaret("1 250 000", 2), 3);
  assert.equal(numericCaret("1 250 000", 0), 0);
  assert.equal(numericCaret("1 250,50", 6), 7);
});
test("Formatted field has a numeric keyboard, readable value and decorative unit", () => {
  const html = renderToStaticMarkup(
    <NumericInput
      value="1250000.50"
      onValueChange={() => {}}
      aria-label="Сумма"
    />,
  );
  assert.ok(html.includes('value="1 250 000,50"'));
  assert.ok(html.includes('inputMode="decimal"'));
  assert.ok(html.includes('aria-hidden="true"'));
  assert.ok(html.includes('type="text"'));
});
