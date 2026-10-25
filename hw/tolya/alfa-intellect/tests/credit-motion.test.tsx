import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { CreditMotion, type CreditStep } from "../src/CreditMotion";
const steps: CreditStep[] = [
  { id: "company", label: "Проверка компании", status: "done" },
  { id: "cashflow", label: "Анализ выписок", status: "running" },
  { id: "decision", label: "Подготовка решения", status: "pending" },
];
test("MVP 1 sphere visual exposes only actual completed stages, with no invented percentage", () => {
  const html = renderToStaticMarkup(
    <CreditMotion title="Рассматриваем заявку" steps={steps} />,
  );
  assert.match(html, /preparation-sphere/);
  assert.match(html, /preparation-orbit/);
  assert.match(html, /<strong>1<small> \/ 3/);
  assert.equal((html.match(/class="done"/g) || []).length, 1);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.ok(!html.includes("%"));
  const stopped = renderToStaticMarkup(
    <CreditMotion
      title="Нужны сведения"
      steps={steps.map((s) => ({
        ...s,
        status: s.id === "company" ? "done" : "waiting-data",
      }))}
    />,
  );
  assert.match(stopped, /data-running="false"/);
  assert.ok(!stopped.includes('aria-current="step"'));
});
