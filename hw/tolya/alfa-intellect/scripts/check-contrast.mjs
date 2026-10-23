import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cssRules, resolveVars, parseColor, contrastRatio } from "./check-type.mjs";

const project = new URL("../", import.meta.url);
export function contrast(foreground, background) {
  const luminance = (hex) => {
    if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Not opaque sRGB: ${hex}`);
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function readTokens(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)]
    .map((m) => [m[1].replace(/^theme-/, ""), m[2].toLowerCase()]));
}

export function auditPalettes(board, css) {
  const palettes = [...board.matchAll(/\.theme\[data-direction="(\w+)"\]\[data-mode="(light|dark)"\]\s*\{([^}]+)\}/g)]
    .map((m) => ({ direction: m[1], mode: m[2], tokens: readTokens(m[3]) }));
  const errors = [], lines = [];
  let checks = 0;
  if (palettes.length !== 6 || new Set(palettes.map((p) => p.direction + p.mode)).size !== 6 ||
      palettes.some((p) => !["graphite", "porcelain", "paper"].includes(p.direction)))
    errors.push("Expected exactly 3 directions x 2 modes");
  const pair = (label, tokens, a, b, threshold) => {
    checks++;
    try {
      const ratio = contrast(tokens[a], tokens[b]);
      const ok = ratio >= threshold;
      lines.push(`${label} ${a}/${b} ${ratio.toFixed(3)} >= ${threshold} ${ok ? "PASS" : "FAIL"}`);
      if (!ok) errors.push(`${label} ${a}/${b}: ${ratio} < ${threshold}`);
    } catch (e) { errors.push(`${label} ${a}/${b}: ${e.message}`); }
  };
  for (const { direction, mode, tokens } of palettes) {
    const label = `${direction}/${mode}`;
    for (const bg of ["bg", "surface", "surface-soft", "surface-hover"]) {
      for (const fg of ["ink", "muted", "red", "green", "warning", "danger", "info"])
        pair(label, tokens, fg, bg, 4.5);
      for (const fg of ["field-border", "chart-primary", "chart-secondary"])
        pair(label, tokens, fg, bg, 3);
    }
    pair(label, tokens, "on-accent", "red", 4.5);
    pair(label, tokens, "on-accent", "accent-hover", 4.5);
    pair(label, tokens, "on-ink", "ink", 4.5);
    pair(label, tokens, "on-success", "green", 4.5);
    for (const state of ["success", "warning", "danger", "info"]) {
      pair(label, tokens, state === "success" ? "green" : state, `${state}-soft`, 4.5);
      pair(label, tokens, "ink", `${state}-soft`, 4.5);
    }
    if (tokens.brand !== "#ef3124") errors.push(`${label}: changed the brand red`);
  }
  // Read actual product declarations, not a second copy of expected numbers.
  const productBlocks = [
    ["light", css.match(/\/\* G5 palette: light \*\/\s*:root\s*\{([^}]+)\}/)?.[1]],
    ["dark", css.match(/\/\* G5 palette: dark \*\/\s*:root\[data-theme="dark"\]\s*\{([^}]+)\}/)?.[1]],
  ];
  const system = readTokens(css.match(/@media\s*\(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{([^}]+)\}/)?.[1] ?? "");
  for (const [mode, block] of productBlocks) {
    const tokens = readTokens(block ?? "");
    const palette = palettes.find((p) => p.direction === "graphite" && p.mode === mode);
    if (!block || !palette) { errors.push(`Missing product ${mode}`); continue; }
    for (const [key, value] of Object.entries(palette.tokens)) {
      if (tokens[key] !== value) errors.push(`Product ${mode} --${key}: differs from board`);
      if (mode === "dark" && system[key] !== value) errors.push(`System dark --${key}: differs from explicit dark`);
    }
  }
  return { palettes, checks, errors, lines };
}

// Check explicit foreground/background pairs in the real source in both modes.
// Inheritance, gradients and compositing still require browser review.
export function auditSource(sources, palettes) {
  const rules = sources.flatMap(([file, source]) => cssRules(source, file));
  const aliases = new Map();
  for (const rule of rules)
    if (rule.selector === ":root" && !rule.context)
      for (const d of rule.declarations)
        if (d.property.startsWith("--")) aliases.set(d.property, d.value);
  const errors = [], lines = [];
  let checks = 0, unresolved = 0;
  for (const { mode, tokens } of palettes.filter((p) => p.direction === "graphite")) {
    for (const rule of rules) {
      if (rule.selector.includes("[data-theme") || rule.context.includes("prefers-color-scheme")) continue;
      const values = new Map(aliases);
      for (const [key, value] of Object.entries(tokens)) values.set(`--theme-${key}`, value);
      for (const parent of rules) {
        if (parent.selector === ":root" || parent.selector.includes("[data-theme")) continue;
        if (parent.selector === rule.selector ||
          (!/[,:>+~\s]/.test(parent.selector) && rule.selector.split(",").every((s) => s.trim().startsWith(parent.selector + " "))))
          for (const d of parent.declarations)
            if (d.property.startsWith("--")) values.set(d.property, d.value);
      }
      const props = new Map(rule.declarations.map((d) => [d.property, d.value]));
      const fg = props.get("color"), bg = props.get("background-color") ?? props.get("background");
      if (!fg || !bg) continue;
      const a = parseColor(resolveVars(fg, values)), b = parseColor(resolveVars(bg, values));
      if (!a || !b || b[3] !== 1) { unresolved++; continue; }
      checks++;
      const ratio = contrastRatio(a, b), label = `product/${mode} ${rule.file}:${rule.line} ${rule.selector}`;
      lines.push(`${label} ${ratio.toFixed(3)} >= 4.5 ${ratio >= 4.5 ? "PASS" : "FAIL"}`);
      if (ratio < 4.5) errors.push(`${label}: ${ratio} < 4.5`);
    }
  }
  return { checks, unresolved, errors, lines };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = auditPalettes(
    readFileSync(new URL("public/design/theme-board.html", project), "utf8"),
    readFileSync(new URL("src/styles.css", project), "utf8"),
  );
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    return entry.isDirectory() ? walk(url) : entry.name.endsWith(".css") ? [[url.pathname, readFileSync(url, "utf8")]] : [];
  });
  const source = auditSource(walk(new URL("src/", project)), result.palettes);
  console.log(result.lines.join("\n"));
  console.log(source.lines.join("\n"));
  for (const error of [...result.errors, ...source.errors]) console.error(error);
  console.log(`SUMMARY ${result.palettes.length} palettes; checks=${result.checks + source.checks}; failures=${result.errors.length + source.errors.length}; unresolved-source-pairs=${source.unresolved}`);
  process.exitCode = result.errors.length + source.errors.length ? 1 : 0;
}
