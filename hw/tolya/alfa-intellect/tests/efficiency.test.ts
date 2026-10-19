import test from "node:test";
import assert from "node:assert/strict";
import { efficiencyMetrics, efficiencyBasis } from "../shared/efficiency";
import { calculate } from "../server/finance";
import { publicPreview } from "../server/preview";
import { tourSteps } from "../src/Tour";
test("Эффективность: DSCR, нагрузка, запас и стресс вычисляются из тех же входов", () => {
  const c = calculate({
    amount: 120000,
    term: 12,
    rate: 0,
    flow: 25000,
    existing: 10000,
  });
  const m = efficiencyMetrics(c);
  assert.equal(m.dscr, 1.25);
  assert.equal(m.stressDscr, 0.875);
  assert.equal(m.burden, 80);
  assert.equal(m.reserve, 0);
  assert.equal(m.interestShare, 0);
});
test("Нет данных не превращается в нулевой рейтинг; отрицательный поток не скрывается", () => {
  assert.equal(efficiencyMetrics().dscr, null);
  assert.equal(
    efficiencyMetrics(calculate({ amount: 120000, term: 12, rate: 0 })).reserve,
    null,
  );
  const c = calculate({ amount: 120000, term: 12, rate: 0, flow: -1000 });
  assert.equal(efficiencyMetrics(c).dscr, -0.1);
  assert.equal(efficiencyMetrics(c).burden, null);
  assert.equal(efficiencyMetrics(c).reserve, -10800);
  assert.match(efficiencyBasis(publicPreview("ip")).label, /не действующий/);
});
test("Обучение: ровно шесть целей новой спецификации, уведомления и агент разделены", () => {
  assert.equal(tourSteps.length, 6);
  assert.equal(new Set(tourSteps.map((s) => s[0])).size, 6);
  assert.equal(tourSteps[3][0], "recommendations");
  assert.equal(tourSteps[4][0], "chat-panel");
  assert.equal(tourSteps[5][0], "financing");
  assert.ok(tourSteps.every((s) => !s[2].includes("Без кредита")));
});
