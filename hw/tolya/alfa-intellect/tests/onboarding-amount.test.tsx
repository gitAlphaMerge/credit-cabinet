import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingAmount } from "../src/OnboardingAmount";
import { ranges, onboardingSchema } from "../shared/mvp2";

test("Onboarding amount uses seven slider bands, not a system select", () => {
  for (const [index, value] of ranges.slice(0, -1).entries()) {
    const html = renderToStaticMarkup(
      <OnboardingAmount value={value} onChange={() => {}} />,
    );
    assert.match(html, /type="range"/);
    assert.doesNotMatch(html, /<select/);
    assert.ok(html.includes(`value="${index}"`));
    assert.ok(html.includes(`aria-valuetext="${value}"`));
    assert.match(html, /min="0"/);
    assert.match(html, /max="6"/);
    assert.match(html, /step="1"/);
    assert.equal(onboardingSchema.shape.amountRange.parse(value), value);
  }
});
test("Unknown remains explicit, disables the amount slider and survives the API schema", () => {
  const html = renderToStaticMarkup(
    <OnboardingAmount value="Не знаю" onChange={() => {}} />,
  );
  assert.match(html, /disabled=""/);
  assert.match(html, /checked=""/);
  assert.equal(onboardingSchema.shape.amountRange.parse("Не знаю"), "Не знаю");
});
test("Empty saved answer is not silently presented as a confirmed amount", () => {
  const html = renderToStaticMarkup(
    <OnboardingAmount value="" onChange={() => {}} />,
  );
  assert.ok(html.includes("Выберите сумму"));
  assert.ok(html.includes("Сумма не выбрана"));
});
