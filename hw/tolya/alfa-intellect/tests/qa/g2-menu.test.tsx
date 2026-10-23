import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DemoProfileMenuView,
  profileMenuStyles,
  switchDemoPersona,
} from "../../src/DemoProfileMenu";
import { demoPersonas } from "../../shared/demo-personas";
import { elements, textOf } from "./q3-harness";

const personas = demoPersonas.map((p) => ({
  key: p.key,
  company: p.company,
  description: p.description,
  role: p.role,
  current: p.key === "green",
}));
const props = {
  company: "Текущая компания",
  personas,
  busy: false,
  error: "",
  onProfile() {},
  onSwitch(_key: string) {},
};

test("G2 menu: six scenarios, current marker, callbacks, loading and errors", () => {
  const selected: string[] = [];
  const tree = DemoProfileMenuView({
    ...props,
    onSwitch: (key) => selected.push(key),
  });
  const buttons = elements(tree).filter((n) => n.type === "button");
  assert.equal(buttons.length, 7);
  assert.equal(
    buttons.filter((n) => n.props["aria-current"] === "true").length,
    1,
  );
  assert.equal(
    buttons.find((n) => textOf(n).includes("Текущий"))!.props.disabled,
    true,
  );
  for (const button of buttons.slice(2)) button.props.onClick();
  assert.deepEqual(
    selected,
    personas.slice(1).map((p) => p.key),
  );
  const html = renderToStaticMarkup(tree);
  for (const p of personas) {
    assert.ok(html.includes(p.company));
    assert.ok(html.includes(p.description));
  }
  assert.match(html, /Синтетические данные \(мок\)/);
  assert.doesNotMatch(html, /пароль|password|799900006/);
  const hidden = renderToStaticMarkup(
    DemoProfileMenuView({ ...props, personas: [] }),
  );
  assert.doesNotMatch(hidden, /Демонстрационные профили|g2-personas/);
  const busy = DemoProfileMenuView({
    ...props,
    busy: true,
    error: "Не удалось сменить профиль",
  });
  assert.ok(
    elements(busy)
      .filter((n) => n.type === "button")
      .every((n) => n.props.disabled),
  );
  assert.match(renderToStaticMarkup(busy), /role="status"/);
  assert.match(renderToStaticMarkup(busy), /role="alert"/);
});

test("G2 header: shared 36px controls, accessible labels, focus and full session reload", () => {
  assert.match(
    profileMenuStyles,
    /width: 36px; height: 36px; min-width: 36px; min-height: 36px/,
  );
  assert.match(
    profileMenuStyles,
    /:focus-visible.*outline: 2px solid var\(--red\)/,
  );
  assert.match(profileMenuStyles, /notification-center > div > \.icon-button/);
  const source = readFileSync(
    new URL("../../src/DemoProfileMenu.tsx", import.meta.url),
    "utf8",
  );
  for (const name of [
    'label="Выйти"',
    'label="Помощь и обучение"',
    "aria-label={`Профиль:",
  ])
    assert.ok(source.includes(name));
  assert.match(source, /window\.location\.assign\(destination\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /trigger\.current\?\.focus\(\)/);
  const app = readFileSync(
    new URL("../../src/App.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /header-tools g2-tools/);
  assert.match(app, /<DemoProfileTools/);
});

test("G2 switch API: exact persona body, server errors and invalid destination are retained", async () => {
  const original = globalThis.fetch;
  try {
    let body = "";
    globalThis.fetch = async (_url, init) => {
      body = String(init?.body);
      return Response.json({ is_demo: true, destination: "/bank" });
    };
    assert.equal(await switchDemoPersona("manager"), "/bank");
    assert.deepEqual(JSON.parse(body), { persona: "manager" });
    globalThis.fetch = async () =>
      Response.json({ error: "Демонстрация выключена" }, { status: 404 });
    await assert.rejects(switchDemoPersona("green"), /Демонстрация выключена/);
    for (const value of [
      { is_demo: false, destination: "/bank" },
      { is_demo: true, destination: "https://evil.invalid" },
    ]) {
      globalThis.fetch = async () => Response.json(value);
      await assert.rejects(switchDemoPersona("green"), /Сервер не подтвердил/);
    }
  } finally {
    globalThis.fetch = original;
  }
});
