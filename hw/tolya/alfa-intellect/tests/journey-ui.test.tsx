import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { Landing } from "../src/Landing";
test("Landing keeps the central animation and main CTA, without demo or covering finance cards", () => {
  const html = renderToStaticMarkup(<Landing go={() => {}} />);
  assert.match(html, /Большие планы/);
  assert.match(html, /Подобрать финансирование/);
  assert.match(html, /minimal-theatre/);
  for (const forbidden of [
    "Посмотреть демо",
    "Свободный поток после платежа",
    "Смотрите на шаг вперёд",
    "finance-scene-card",
    "finance-controls",
    "Селлер на маркетплейсе",
  ])
    assert.ok(!html.includes(forbidden), forbidden);
});
test("Origination uses compact onboarding and an embedded agent; no login or legacy workspace imports", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(app.includes("JourneyOnboarding"));
  assert.ok(app.includes("config.cabinetAvailable"));
  assert.ok(!app.includes('from "./Onboarding"'));
  assert.ok(!app.includes('from "./DemoPage"'));
  assert.ok(!app.includes("DemoProfileTools"));
  const form = readFileSync(
    new URL("../src/Mvp2.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(!form.includes("От задачи к понятным условиям"));
  assert.ok(!form.includes("Уже есть аккаунт"));
  assert.match(form, /<ApplicationAgent/);
  assert.ok(!form.includes("sessionStorage.setItem"));
});
test("Desktop columns preserve 60/40; animation numbers use white without blending", () => {
  const css = readFileSync(new URL("../src/mvp2.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\)/);
  const motion = readFileSync(
    new URL("../src/motion.css", import.meta.url),
    "utf8",
  );
  const rule = motion.match(/\.sphere-number\s*\{[^}]+\}/)![0];
  assert.match(rule, /color: #fff/);
  assert.match(rule, /mix-blend-mode: normal/);
});
