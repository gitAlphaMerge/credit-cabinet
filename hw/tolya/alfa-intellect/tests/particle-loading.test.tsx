import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadingScreen } from "../src/LoadingScreen";
const engine = await import(new URL("../public/v2/loading-pattern.js", import.meta.url).href);

test("Particle counts and target bounds stay controlled across mobile and desktop", () => {
  for (const [width, height] of [[319, 600], [1280, 720], [3840, 2160]]) {
    const targets = engine.particleTargets(width, height);
    assert.ok(targets.length > 500 && targets.length < 15000, String(targets.length));
    assert.ok(targets.every((p: {x: number; y: number}) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height));
  }
});
test("Tiny dots converge to the pattern, fall under gravity, and recover without runaway velocity", () => {
  const particle = {x: -180, y: -350, tx: 0, ty: 0, vx: 0, vy: 0, seed: 1};
  for (let n = 0; n < 240; n++) engine.advanceParticle(particle, 1 / 30, n / 30);
  assert.ok(Math.hypot(particle.x, particle.y) < 10);
  const restingY = particle.y;
  for (let n = 0; n < 32; n++) engine.advanceParticle(particle, 1 / 30, 9.5 + n / 30);
  assert.ok(particle.y > restingY + 20, "gravity must visibly move the dots down");
  for (let n = 0; n < 200; n++) engine.advanceParticle(particle, 1 / 30, 11 + n / 30);
  assert.ok(Math.hypot(particle.x, particle.y) < 10);
  engine.advanceParticle(particle, 10000, 2);
  assert.ok(Number.isFinite(particle.x) && Math.abs(particle.vy) < 1000);
});
test("Reduced motion resolves directly to exact geometry and zero velocity", () => {
  const particle = {x: -180, y: -350, tx: 25, ty: 47, vx: 100, vy: 100, seed: 1};
  engine.advanceParticle(particle, 1, 10, {x: 0, y: 0}, true);
  assert.deepEqual([particle.x, particle.y, particle.vx, particle.vy], [25, 47, 0, 0]);
});
test("Unknown work has no claimed percentage and a failed stage remains an error", () => {
  const indeterminate = renderToStaticMarkup(<LoadingScreen title="Открываем кабинет" />);
  assert.match(indeterminate, /push-loading-character/);
  assert.doesNotMatch(indeterminate, /role="progressbar"|aria-valuenow/);
  const failed = renderToStaticMarkup(<LoadingScreen steps={[{id: "server", label: "Сервер недоступен", status: "error"}]} />);
  assert.match(failed, /data-running="false"/);
  assert.match(failed, /role="status">Сервер недоступен/);
  assert.match(failed, /aria-valuenow="0"/);
});
