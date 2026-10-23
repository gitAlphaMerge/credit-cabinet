import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CalculationView } from "../../src/ui";
import { publicPreview } from "../../server/preview";
import { formatRate } from "../../src/format-rate";
import { readFileSync } from "node:fs";

const checkerUrl = new URL("../../scripts/check-type.mjs", import.meta.url);

test("G4 rate formatter preserves percentage-point units, decimals and absent data", () => {
  for (const [input, output] of [
    [21.5, "21,5\u00a0%"],
    [0, "0\u00a0%"],
    [100, "100\u00a0%"],
    [21.1234, "21,1234\u00a0%"],
    [0.215, "0,215\u00a0%"],
    [NaN, "Нет данных"],
    [Infinity, "Нет данных"],
  ] as const)
    assert.equal(formatRate(input), output);
  assert.equal(formatRate(0.215 * 100), "21,5\u00a0%");
});

test("G4 auditor reads nested CSS, ignores comments, resolves tokens and counts real contrast", async () => {
  const check = await import(checkerUrl.href);
  const rules = check.cssRules(`
    /* .fake { font-size: 5px; } */
    :root { --size: 0.75rem; --fg: #000; --bg: white; }
    @media (max-width: 390px) {
      .real { content: "{a;b}"; font-size: var(--size); color: var(--fg); background: var(--bg); }
    }
  `);
  assert.equal(rules.length, 2);
  assert.equal(rules[1].selector, ".real");
  assert.equal(
    rules[1].declarations.find(
      (d: { property: string }) => d.property === "content",
    ).value,
    '"{a;b}"',
  );
  const tokens = new Map<string, string>(
    rules[0].declarations.map((d: { property: string; value: string }) => [
      d.property,
      d.value,
    ]),
  );
  assert.equal(check.sizePx("var(--size)", tokens), 12);
  assert.equal(check.sizePx("7px"), 7);
  assert.equal(check.sizePx("clamp(8px, 2vw, 20px)"), 8);
  assert.equal(check.sizePx("var(--missing, 11px)"), 11);
  assert.equal(check.sizePx("0.8em"), null);
  assert.equal(check.sizePx("var(--a)", new Map([["--a", "var(--a)"]])), null);
  const black = check.parseColor(check.resolveVars("var(--fg)", tokens));
  const white = check.parseColor(check.resolveVars("var(--bg)", tokens));
  assert.equal(check.contrastRatio(black, white), 21);
  assert.equal(check.contrastRatio(white, white), 1);
  assert.ok(
    check.contrastRatio(check.parseColor("#fff"), check.parseColor("#ef3124")) <
      4.5,
  );
  assert.deepEqual(check.parseColor("#0008"), [0, 0, 0, 136 / 255]);
  assert.ok(
    Math.abs(
      check.contrastRatio(check.parseColor("rgba(0,0,0,0.5)"), white) -
        3.976653,
    ) < 0.000001,
  );
  assert.equal(check.parseColor("linear-gradient(white, black)"), null);
});

test("G4 all stylesheet and inline sizes resolve to the shared seven-step scale", async () => {
  const check = await import(checkerUrl.href);
  const result = check.audit();
  assert.equal(result.files, 8);
  assert.equal(result.small.length, 0);
  assert.ok(result.sizes.length >= 824);
  const scale = new Set([12, 13, 15, 18, 24, 32, 48]);
  for (const s of result.sizes)
    assert.ok(scale.has(s.px), `${s.file}:${s.line} ${s.value}`);
  assert.ok(
    !result.unresolved.some((u: { reason: string }) =>
      /font-?[Ss]ize/.test(u.reason),
    ),
  );
});

test("G4 text controls have growing heights, numeric sums wrap, and shell rows can grow", async () => {
  const check = await import(checkerUrl.href);
  const files = [
    "styles.css",
    "redesign.css",
    "chat.css",
    "cabinet.css",
    "financing.css",
    "application-status.css",
    "manager/manager.css",
  ];
  const rules = files.flatMap((f) =>
    check.cssRules(
      readFileSync(new URL("../../src/" + f, import.meta.url), "utf8"),
      f,
    ),
  );
  const textBoxes = new Set([
    ".public-header",
    ".app-header",
    ".app-shell .app-header",
    ".app-shell .workspace-footer",
    ".chat-shell.chat-v3 .chat-header",
    ".chat-shell.chat-v3 .history-search-row .chat-search",
    ".chat-shell.chat-v3 .history-rename",
    ".question-sector select",
    ".date-input-grid > span, .date-input-grid > button",
    ".anchored-calendar .cv-calendar-grid button",
  ]);
  for (const r of rules) {
    if (textBoxes.has(r.selector.replace(/\s+/g, " ")))
      assert.ok(
        !r.declarations.some(
          (d: { property: string; value: string }) =>
            d.property === "height" && /^\d+px$/.test(d.value),
        ),
        `${r.file}:${r.line}`,
      );
  }
  const has = (selector: string, property: string, value: string) =>
    rules.some(
      (r) =>
        r.selector
          .split(",")
          .map((s: string) => s.trim())
          .includes(selector) &&
        r.declarations.some(
          (d: { property: string; value: string }) =>
            d.property === property && d.value === value,
        ),
    );
  for (const selector of [
    ".credit-summary-grid strong",
    ".payment-value strong",
    ".cv-payment-number",
    ".capacity-comparison strong",
    ".application-terms b",
  ])
    assert.ok(has(selector, "overflow-wrap", "anywhere"), selector);
  assert.ok(has("table", "font-variant-numeric", "tabular-nums"));
  assert.ok(has("body", "font-size", "var(--text-base)"));
  assert.ok(has("body", "font-variant-numeric", "tabular-nums"));
  assert.ok(has(".application-terms b", "font-size", "var(--text-xl)"));
  assert.ok(
    has(
      ".app-shell",
      "grid-template-rows",
      "minmax(var(--app-header), auto) minmax(0, 1fr) minmax(var(--app-footer), auto)",
    ),
  );
});

test("G4 source typography and contrast audit exits successfully", () => {
  const run = spawnSync(process.execPath, ["scripts/check-type.mjs"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(run.error, undefined);
  assert.equal(
    run.status,
    0,
    run.stdout.split("\n").find((line) => line.startsWith("SUMMARY")) +
      run.stderr,
  );
  assert.match(run.stdout, /sizes<12=0; contrast<4\.5=0; violations=0/);
});

test("G4 calculation displays a decimal Russian rate separated from percent", () => {
  const preview = publicPreview();
  const c = { ...preview.selections[0].calculation, rate: 21.5 };
  const html = renderToStaticMarkup(createElement(CalculationView, { c }));
  assert.ok(
    html.includes("21,5\u00a0%"),
    html.match(/Демо-ставка<\/small><strong>(.*?)<\/strong>/)?.[0] ?? html,
  );
  assert.ok(!html.includes("21.5%"));
});

test("G4 server offer converts a fractional rate once and preserves missing terms", async () => {
  const { ApplicationStatusView } = await import("../../src/ApplicationStatus");
  const detail = {
    application: {
      id: "g4-offer",
      status: "offered",
      amount: 300000,
      version: 1,
    },
    dossier: { limit_now_rub: 400000 },
    events: [
      {
        seq: 1,
        event: "make_offer",
        to_status: "offered",
        actor_role: "system",
        at: "2026-10-24",
        payload: JSON.stringify({
          amount: 250000,
          rate: 0.215,
          term_months: 6,
        }),
      },
    ],
  };
  const render = () =>
    renderToStaticMarkup(
      createElement(ApplicationStatusView, {
        detail,
        busy: false,
        onAction: async () => {},
      }),
    );
  assert.ok(render().includes("21,5\u00a0% годовых"));
  detail.events[0].payload = JSON.stringify({ amount: 250000, term_months: 6 });
  assert.ok(!render().includes("% годовых"));
});
