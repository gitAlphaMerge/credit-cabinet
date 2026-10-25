import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingAmount } from "../src/OnboardingAmount";
import { onboardingSchema, initialQuestionnaire } from "../shared/mvp2";
test("Exact onboarding amount has a synchronized formatted input and catalog slider", () => {
  const html = renderToStaticMarkup(
    <OnboardingAmount value={3478123} onChange={() => {}} />,
  );
  assert.match(html, /type="range"/);
  assert.match(html, /min="300000"/);
  assert.match(html, /max="7000000"/);
  assert.match(html, /step="1"/);
  assert.ok(html.includes('value="3478123"'));
  assert.match(
    renderToStaticMarkup(
      <OnboardingAmount value={3500000} onChange={() => {}} />,
    ),
    /step="50000"/,
  );
  assert.ok(html.includes("3 478 123"));
  assert.doesNotMatch(html, /<select/);
  assert.equal(onboardingSchema.shape.amount.parse(3478123), 3478123);
  assert.equal(onboardingSchema.shape.amount.safeParse(7000001).success, false);
  assert.equal(onboardingSchema.shape.amount.safeParse(299999).success, false);
});
test("Unknown and empty amounts do not invent a chosen amount", () => {
  for (const unknown of [false, true]) {
    const html = renderToStaticMarkup(
      <OnboardingAmount value={null} unknown={unknown} onChange={() => {}} />,
    );
    assert.ok(html.includes("Сумма не выбрана"));
    assert.ok(html.includes('value=""'));
    assert.equal(html.includes('checked=""'), unknown);
  }
  const answers = {
    industry: "Производство",
    age: "Более 3 лет",
    purpose: "Текущие расходы",
    amountRange: "Не знаю",
    amount: null,
    term: 12,
    usage: "Всё сразу",
    repayment: "Регулярная выручка",
  };
  assert.equal(initialQuestionnaire(answers).amount, 0);
  assert.equal(
    initialQuestionnaire({ ...answers, amount: 3478123 }).amount,
    3478123,
  );
});
