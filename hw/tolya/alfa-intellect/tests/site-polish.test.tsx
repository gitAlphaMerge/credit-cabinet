import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { FutureProducts, OmegaPreview, pulseStories } from "../src/FutureProducts";
import { activityLabel, trackedFetch } from "../src/request-activity";
import { soundRecipe } from "../src/ui-sounds";
import { api } from "../src/api";
import { applyDesignSystem } from "../src/design-system";

function contrast(first: string, second: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

test("Supplied KK3 text, status and field-border pairs meet their contrast targets in both modes", () => {
  const css = readFileSync(new URL("../src/design-system.css", import.meta.url), "utf8");
  for (const mode of ["light", "dark"]) {
    const block = css.split(`data-theme="${mode}"] {`)[1].split("}")[0];
    const tokens = Object.fromEntries([...block.matchAll(/--kk3-([a-z-]+): (#[0-9a-f]{6});/g)].map(match => [match[1], match[2]]));
    for (const [text, background] of [["ink", "bg"], ["ink", "surface"], ["muted", "bg"], ["muted", "surface"], ["accent", "surface"], ["on-accent", "accent"], ["positive", "positive-soft"], ["warning", "warning-soft"], ["danger", "danger-soft"], ["info", "info-soft"]])
      assert.ok(contrast(tokens[text], tokens[background]) >= 4.5, `${mode}: ${text}/${background}`);
    assert.ok(contrast(tokens["field-border"], tokens.surface) >= 3);
  }
});
test("The design-system overlay preserves the user's palette, accent and mode", () => {
  const root = {dataset: {palette: "paper", accent: "mint", theme: "light"}} as unknown as HTMLElement;
  applyDesignSystem(root);
  assert.equal(root.dataset.palette, "paper");
  assert.equal(root.dataset.accent, "mint");
  assert.equal(root.dataset.theme, "light");
  assert.equal(root.dataset.designSystem, "kk3");
  const css = readFileSync(new URL("../src/design-system.css", import.meta.url), "utf8");
  assert.ok(css.includes(':not([data-palette]):not([data-accent])'));
});
test("Future products make their development state and fictional editorial scenarios explicit", () => {
  const html = renderToStaticMarkup(<FutureProducts go={() => {}}/>);
  assert.ok((html.match(/В активной разработке/g) ?? []).length >= 2);
  assert.match(html, /Превью агента/);
  assert.match(html, /Демонстрационная лента/);
  assert.match(html, /не как подтверждённые новости/);
  assert.equal(pulseStories.length, 4);
  assert.match(html, /2026-10-28T/);
  assert.match(html, /Приостановить анимацию новостей/);
});
test("Omega Code is a transparent, labelled preview with a team destination", () => {
  const html = renderToStaticMarkup(<OmegaPreview mode="code" onMode={() => {}} onTeam={() => {}}/>);
  assert.match(html, /Омега Код/);
  assert.match(html, /Код и инструменты здесь не исполняются/);
  assert.match(html, /запрос не отправляется модели/);
  assert.match(html, /раздел с именами команды/);
  assert.match(html, /disabled=""[^>]*aria-label="Отправить запрос/);
});
test("User actions get distinct audio cues while polls and autosaves stay quiet", () => {
  assert.equal(activityLabel("/journey/onboarding", "PUT"), "");
  assert.equal(activityLabel("/state", "GET"), "");
  assert.equal(activityLabel("/mvp2/applications/id/submit", "POST"), "Готовим результат");
  assert.equal(activityLabel("/registry/123", "GET"), "Проверяем сведения компании");
  assert.notDeepEqual(soundRecipe("success"), soundRecipe("error"));
  for (const sound of ["tap", "navigate", "toggle", "send", "success", "error"] as const)
    assert.ok(soundRecipe(sound).every(note => note >= 200 && note <= 1200));
});
test("Global activity always ends on success and errors and never includes the submitted body", async () => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  const target = new EventTarget();
  const events: unknown[] = [];
  target.addEventListener("alfa-request-start", event => events.push((event as CustomEvent).detail));
  target.addEventListener("alfa-request-end", event => events.push((event as CustomEvent).detail));
  globalThis.window = target as unknown as Window & typeof globalThis;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ok: true}), {status: 200, headers: {"Content-Type": "application/json"}});
    await api("/consultations", {phone: "synthetic-private-value"});
    assert.equal((events[1] as {ok: boolean}).ok, true);
    assert.ok(!JSON.stringify(events).includes("synthetic-private-value"));
    globalThis.fetch = async () => {throw new Error("offline");};
    await assert.rejects(api("/documents", {}), /Не удалось связаться/);
    assert.equal((events.at(-1) as {ok: boolean}).ok, false);
  } finally {globalThis.window = originalWindow; globalThis.fetch = originalFetch;}
});
test("Direct manager requests retain their exact credentials, body and idempotency key", async () => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  const target = new EventTarget(), events: unknown[] = [];
  target.addEventListener("alfa-request-start", event => events.push((event as CustomEvent).detail));
  target.addEventListener("alfa-request-end", event => events.push((event as CustomEvent).detail));
  globalThis.window = target as unknown as Window & typeof globalThis;
  const init: RequestInit = {method: "POST", credentials: "same-origin", headers: {"Idempotency-Key": "synthetic-key"}, body: JSON.stringify({event: "synthetic"})};
  try {
    let received: RequestInit | undefined;
    globalThis.fetch = async (_url, options) => {received = options; return new Response("{}", {status: 200});};
    await trackedFetch("/api/bank/applications/test/events", init);
    assert.equal(received, init);
    assert.equal(events.length, 2);
    await trackedFetch("https://example.com/font.woff2");
    assert.equal(events.length, 2, "external assets must not trigger user-action loading");
  } finally {globalThis.window = originalWindow; globalThis.fetch = originalFetch;}
});
