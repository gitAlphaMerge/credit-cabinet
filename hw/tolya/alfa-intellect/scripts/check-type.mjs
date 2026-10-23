import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Source audit, not a computed-style or WCAG conformance claim. No dependencies.
export const sizeExceptions = [
  // { file: "src/example.css", selector: ".counter", reason: "Decorative counter" }
];
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clean = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const lineAt = (s, n) => s.slice(0, n).split("\n").length;

export function cssRules(source, file = "fixture.css") {
  const s = clean(source),
    rules = [],
    stack = [];
  let start = 0,
    quote = "",
    parens = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") parens++;
    if (ch === ")") parens--;
    if (parens) continue;
    if (ch === "{") {
      stack.push({
        selector: s.slice(start, i).trim(),
        start: i + 1,
        context: stack.map((p) => p.selector).join(" > "),
      });
      start = i + 1;
    } else if (ch === "}") {
      const block = stack.pop();
      if (block && !block.selector.startsWith("@")) {
        const declarations = [];
        // Declaration separators inside functions or quoted strings are ignored.
        let pos = block.start,
          depth = 0,
          q = "";
        for (let j = pos; j <= i; j++) {
          const c = s[j];
          if (q) {
            if (c === "\\") j++;
            else if (c === q) q = "";
            continue;
          }
          if (c === '"' || c === "'") {
            q = c;
            continue;
          }
          if (c === "(") depth++;
          if (c === ")") depth--;
          if ((c === ";" && depth === 0) || j === i) {
            const text = s.slice(pos, j),
              match = text.match(/^\s*([\w-]+)\s*:\s*([\s\S]*?)\s*$/);
            if (match)
              declarations.push({
                property: match[1],
                value: match[2].replace(/\s*!important\s*$/, ""),
                line: lineAt(s, pos + text.search(/\S/)),
              });
            pos = j + 1;
          }
        }
        rules.push({
          ...block,
          declarations,
          file,
          line: lineAt(s, block.start),
        });
      }
      start = i + 1;
    } else if (ch === ";") {
      if (stack.length === 0) start = i + 1;
    }
  }
  return rules.sort((a, b) => a.start - b.start);
}

export function resolveVars(value, tokens, seen = []) {
  let result = value;
  for (let i = 0; i < 30 && /var\(/.test(result); i++) {
    let changed = false;
    result = result.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
      (m, name, fallback) => {
        if (seen.includes(name)) return m;
        const raw = tokens.get(name) ?? fallback;
        if (raw === undefined) return m;
        changed = true;
        return resolveVars(raw, tokens, [...seen, name]);
      },
    );
    if (!changed) break;
  }
  return result;
}

export function sizePx(raw, tokens = new Map()) {
  const value = resolveVars(raw, tokens).trim();
  const fixed = value.match(/^([\d.]+)(px|rem)$/);
  if (fixed) return Number(fixed[1]) * (fixed[2] === "rem" ? 16 : 1);
  // A clamp's lower bound is the source audit's guaranteed minimum.
  const clamp = value.match(/^clamp\(\s*([\d.]+)(px|rem)\s*,/);
  if (clamp) return Number(clamp[1]) * (clamp[2] === "rem" ? 16 : 1);
  return null; // em, %, inherit, calc and dynamic JSX require computed styles.
}

export function parseColor(raw) {
  let s = raw.trim().toLowerCase();
  s = { white: "#ffffff", black: "#000000", transparent: "#00000000" }[s] ?? s;
  if (/^#[\da-f]{3,4}$/.test(s))
    s = "#" + [...s.slice(1)].map((c) => c + c).join("");
  if (/^#[\da-f]{6}([\da-f]{2})?$/.test(s))
    return [
      parseInt(s.slice(1, 3), 16),
      parseInt(s.slice(3, 5), 16),
      parseInt(s.slice(5, 7), 16),
      s.length === 9 ? parseInt(s.slice(7, 9), 16) / 255 : 1,
    ];
  const rgb = s.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
  );
  return rgb
    ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)]
    : null;
}
export function contrastRatio(fg, bg) {
  const solid = fg.slice(0, 3).map((n, i) => n * fg[3] + bg[i] * (1 - fg[3]));
  const lum = (c) =>
    c
      .slice(0, 3)
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = lum(solid),
    b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );

export function audit(sourceDir = join(project, "src")) {
  const files = walk(sourceDir).sort(),
    css = [],
    sizes = [],
    unresolved = [],
    contrasts = [],
    risks = [];
  const rootTokens = new Map(),
    scoped = new Map();
  // Match stylesheet import order; remaining component styles are still scanned.
  const order = [
    "styles.css",
    "redesign.css",
    "motion.css",
    "chat.css",
    "cabinet.css",
    "financing.css",
  ];
  const cssFiles = files
    .filter((f) => f.endsWith(".css"))
    .sort(
      (a, b) =>
        (order.indexOf(a.split(/[\\/]/).at(-1)) + 1 || 100) -
        (order.indexOf(b.split(/[\\/]/).at(-1)) + 1 || 100),
    );
  for (const f of cssFiles)
    css.push(
      ...cssRules(
        readFileSync(f, "utf8"),
        relative(project, f).replaceAll("\\", "/"),
      ),
    );
  for (const rule of css) {
    for (const d of rule.declarations.filter((d) =>
      d.property.startsWith("--"),
    )) {
      if (rule.selector === ":root" && !rule.context)
        rootTokens.set(d.property, d.value);
      else {
        if (!scoped.has(rule.selector)) scoped.set(rule.selector, new Map());
        scoped.get(rule.selector).set(d.property, d.value);
      }
    }
  }
  for (const rule of css) {
    const tokens = new Map(rootTokens);
    // Only unambiguous selector ancestry; no guessed DOM inheritance.
    for (const [selector, values] of scoped)
      if (
        selector === rule.selector ||
        (!/[,:>+~\s]/.test(selector) &&
          rule.selector
            .split(",")
            .every((s) => s.trim().startsWith(selector + " ")))
      ) {
        for (const [name, v] of values) tokens.set(name, v);
      }
    const props = new Map(rule.declarations.map((d) => [d.property, d]));
    for (const d of rule.declarations.filter(
      (d) => d.property === "font-size",
    )) {
      const px = sizePx(d.value, tokens),
        item = {
          file: rule.file,
          line: d.line,
          selector: rule.selector,
          value: d.value,
          px,
        };
      if (px === null)
        unresolved.push({
          ...item,
          reason: "font-size requires computed style",
        });
      else sizes.push(item);
    }
    const fg = props.get("color"),
      bg = props.get("background-color") ?? props.get("background");
    if (fg && bg) {
      const foreground = resolveVars(fg.value, tokens),
        background = resolveVars(bg.value, tokens);
      const a = parseColor(foreground),
        b = parseColor(background);
      if (a && b && b[3] === 1)
        contrasts.push({
          file: rule.file,
          line: fg.line,
          selector: rule.selector,
          foreground,
          background,
          ratio: contrastRatio(a, b),
        });
      else
        unresolved.push({
          file: rule.file,
          line: fg.line,
          selector: rule.selector,
          reason: `contrast needs backdrop/computed style: ${foreground} / ${background}`,
        });
    }
    const h = props.get("height");
    if (h && /^\d+(\.\d+)?px$/.test(h.value))
      risks.push({
        file: rule.file,
        line: h.line,
        selector: rule.selector,
        reason: `fixed height ${h.value}; inspect text/clipping at 390/768/1280 and 200%`,
      });
  }
  for (const f of files.filter((f) => f.endsWith(".tsx"))) {
    const source = readFileSync(f, "utf8");
    for (const m of source.matchAll(/\bfontSize\s*:\s*([^,}\n]+)/g)) {
      const raw = m[1].trim(),
        literal = raw.match(/^["'](.*)["']$/);
      const value = literal
        ? literal[1]
        : /^\d+(\.\d+)?$/.test(raw)
          ? raw + "px"
          : raw;
      const px = sizePx(value, rootTokens),
        item = {
          file: relative(project, f).replaceAll("\\", "/"),
          line: lineAt(source, m.index),
          selector: "inline fontSize",
          value,
          px,
        };
      if (px === null)
        unresolved.push({
          ...item,
          reason: "fontSize requires computed style",
        });
      else sizes.push(item);
    }
  }
  const small = sizes.filter(
    (s) =>
      s.px < 12 &&
      !sizeExceptions.some(
        (e) => e.file === s.file && e.selector === s.selector && e.reason,
      ),
  );
  const lowContrast = contrasts.filter((c) => c.ratio < 4.5);
  return {
    files: cssFiles.length,
    sizes,
    small,
    contrasts,
    lowContrast,
    unresolved,
    risks,
    violations: small.length + lowContrast.length,
  };
}

export function printAudit(result) {
  const histogram = new Map();
  for (const s of result.sizes)
    histogram.set(s.px, (histogram.get(s.px) ?? 0) + 1);
  console.log(`CSS files: ${result.files}; font sizes: ${result.sizes.length}`);
  console.log("Font size histogram (clamp = minimum, rem at 16px root):");
  for (const [px, n] of [...histogram].sort((a, b) => a[0] - b[0]))
    console.log(`${px}px: ${n}`);
  for (const s of result.small)
    console.log(
      `SIZE ${s.file}:${s.line} ${s.selector.replace(/\s+/g, " ")} = ${s.value} (${s.px}px)`,
    );
  for (const c of result.contrasts)
    console.log(
      `CONTRAST ${c.file}:${c.line} ${c.selector.replace(/\s+/g, " ")} ${c.foreground} / ${c.background} = ${c.ratio.toFixed(3)}:1 ${c.ratio < 4.5 ? "FAIL" : "PASS"}`,
    );
  for (const u of result.unresolved)
    console.log(
      `UNRESOLVED ${u.file}:${u.line} ${u.selector.replace(/\s+/g, " ")}: ${u.reason}`,
    );
  for (const r of result.risks)
    console.log(
      `LAYOUT ${r.file}:${r.line} ${r.selector.replace(/\s+/g, " ")}: ${r.reason}`,
    );
  console.log(
    `SUMMARY sizes<12=${result.small.length}; contrast<4.5=${result.lowContrast.length}; violations=${result.violations}; unresolved=${result.unresolved.length}; fixed-height-risks=${result.risks.length}`,
  );
  console.log(
    "Static source audit only: cascading overrides, inherited backgrounds, gradients, zoom and spacing require browser review.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = audit(process.argv[2] ? resolve(process.argv[2]) : undefined);
  printAudit(result);
  process.exitCode = result.violations ? 1 : 0;
}
