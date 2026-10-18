import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FinancialIndicators } from "../src/FinancialIndicators";
import { cabinetRoute, metricScale } from "../src/metric-scale";
import { cabinetSnapshot } from "../shared/cabinet";
import { trainingCabinet } from "../shared/cabinet-training";
import { publicPreview } from "../server/preview";

test("Legacy URLs resolve to one cabinet, unrelated routes remain unchanged", () => {
  for (const p of ["/cabinet", "/cabinet-v2", "/efficiency"])
    assert.equal(cabinetRoute(p), "/cabinet");
  assert.equal(cabinetRoute("/chat"), "/chat");
});
test("DSCR bands retain the agreed 1.0 and 1.3 boundaries", () => {
  assert.equal(metricScale({ id: "dscr", value: 1 }).position, 50);
  assert.equal(metricScale({ id: "dscr", value: 1.3 }).position, 65);
  assert.equal(metricScale({ id: "dscr", value: 3 }).position, 100);
});
test("Directional scales do not invent safe financial thresholds", () => {
  assert.equal(metricScale({ id: "share", value: 100 }).position, 0);
  assert.equal(metricScale({ id: "share", value: 0 }).position, 100);
  assert.equal(metricScale({ id: "growth", value: 0 }).position, 50);
  assert.ok(metricScale({ id: "growth", value: -20 }).position! < 50);
  assert.ok(metricScale({ id: "growth", value: 20 }).position! > 50);
  assert.equal(metricScale({ id: "margin", value: 0 }).position, 50);
  assert.equal(metricScale({ id: "margin", value: -200 }).position, 0);
  assert.equal(metricScale({ id: "margin", value: 200 }).position, 100);
});
test("Unknown metrics have no coloured assessment marker, not zero", () => {
  for (const id of ["dscr", "share", "growth", "margin"])
    assert.equal(metricScale({ id, value: null }).position, null);
});
test("Four inline metric explanations replace a separate indicators page", () => {
  const metrics = cabinetSnapshot(trainingCabinet(publicPreview())).metrics;
  const html = renderToStaticMarkup(<FinancialIndicators metrics={metrics} />);
  assert.equal((html.match(/О показателе:/g) || []).length, 4);
  assert.equal((html.match(/metric-scale-track/g) || []).length, 4);
  assert.ok(!html.includes("/efficiency"));
  assert.ok(html.includes('aria-expanded="false"'));
});
