import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL("../src/" + f, import.meta.url), "utf8");

function tokens(css: string, selector: string): string[] {
  const start = css.indexOf(selector + " {");
  assert.ok(start >= 0, "нет блока " + selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
}

// Эталон — тёмная тема Альфа: любая основа обязана переопределить ровно эти токены, иначе экран «протечёт» цветами соседней темы.
const required = tokens(read("styles.css"), ':root[data-theme="dark"]').filter(
  (t) => !["--shadow-card"].includes(t),
);

test("каждая основа × режим задаёт полный набор цветовых токенов", () => {
  const blocks: [string, string][] = [
    ["palettes.css", ':root[data-palette="graphite"][data-theme="light"]'],
    ["palettes.css", ':root[data-palette="blueprint"][data-theme="dark"]'],
    ["palettes.css", ':root[data-palette="blueprint"][data-theme="light"]'],
    ["palettes.css", ':root[data-palette="paper"][data-theme="light"]'],
    ["palettes.css", ':root[data-palette="paper"][data-theme="dark"]'],
    ["graphite.css", ':root[data-palette="graphite"][data-theme="dark"]'],
  ];
  for (const [file, selector] of blocks) {
    const have = new Set(tokens(read(file), selector));
    const missing = required.filter((t) => !have.has(t));
    assert.deepEqual(missing, [], selector + " не задаёт " + missing.join(", "));
  }
});

test("акцент перекрашивает кнопки и в светлом, и в тёмном режиме", () => {
  const css = read("palettes.css");
  for (const accent of ["red", "blue", "mono", "mint"])
    for (const mode of ["light", "dark"]) {
      const have = tokens(css, `:root[data-accent="${accent}"][data-theme="${mode}"]`);
      for (const t of ["--theme-red", "--theme-on-accent", "--theme-accent-hover"])
        assert.ok(have.includes(t), `${accent}/${mode} без ${t}`);
    }
});
