import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const baseline = process.argv.includes("--baseline");
const rootCss = readFileSync("src/styles.css", "utf8");
const file = "src/documents.css";
const css = baseline
  ? execFileSync(
      "git",
      ["show", "HEAD:hw/tolya/alfa-intellect/src/styles.css"],
      { encoding: "utf8" },
    )
  : existsSync(file)
    ? readFileSync(file, "utf8")
    : rootCss;
if (
  !baseline &&
  existsSync(file) &&
  !rootCss.includes('@import "./documents.css";')
)
  throw new Error("Document stylesheet is not connected to src/styles.css");
const variables = Object.fromEntries(
  [...rootCss.matchAll(/(--[\w-]+)\s*:\s*(#[\da-f]{6})/gi)].map((m) => [
    m[1],
    m[2],
  ]),
);
function resolve(color) {
  return color?.replace(/var\((--[\w-]+)\)/g, (_, key) => variables[key]);
}
function luminance(hex) {
  if (!/^#[\da-f]{6}$/i.test(hex || ""))
    throw new Error("Unknown color: " + hex);
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
let minimum = Infinity,
  lowest = Infinity,
  pairs = 0,
  failures = 0;
for (const match of css
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const [_, selector, body] = match;
  if (
    !/document-|documents-panel|doc-status|file-name|template-link/.test(
      selector,
    ) ||
    /doc-icon|file-name svg/.test(selector)
  )
    continue;
  const size = body.match(/font-size:\s*([\d.]+)px/);
  if (size) {
    const n = +size[1];
    minimum = Math.min(minimum, n);
    const threshold = /h3|doc-status|button/.test(selector) ? 14 : 13;
    if (n < threshold) {
      console.log(`FAIL font ${n}px < ${threshold}px: ${selector.trim()}`);
      failures++;
    }
  }
  const color = resolve(
    body.match(/(?:^|;)\s*color:\s*([^;\n]+)/)?.[1]?.trim(),
  );
  const background = resolve(
    body.match(/(?:^|;)\s*background(?:-color)?:\s*([^;\n]+)/)?.[1]?.trim() ||
      "#ffffff",
  );
  if (color) {
    const a = luminance(color),
      b = luminance(background);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    console.log(
      `${selector.trim()}: ${color}/${background} = ${ratio.toFixed(2)}:1`,
    );
    lowest = Math.min(lowest, ratio);
    pairs++;
    if (ratio < 4.5) failures++;
  }
}
if (!Number.isFinite(minimum) || !pairs)
  throw new Error("No document typography/color rules audited");
console.log(
  `Documents ${baseline ? "before" : "after"}: min font-size=${minimum}px; min contrast=${lowest.toFixed(2)}:1; pairs=${pairs}; failures=${failures}`,
);
process.exitCode = failures ? 1 : 0;
