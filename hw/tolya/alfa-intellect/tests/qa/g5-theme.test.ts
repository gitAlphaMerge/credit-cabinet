import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { subject } from "./q3-harness";

const project = fileURLToPath(new URL("../../", import.meta.url));

test("G5 all six palettes and actual product tokens meet contrast thresholds", () => {
  const result = spawnSync(process.execPath, ["scripts/check-contrast.mjs"], {
    cwd: project,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /6 palettes/);
  assert.match(result.stdout, /failures=0/);
});

test("G5 cabinet mounts the theme switch in the side rail", () => {
  const read = (file: string) =>
    readFileSync(new URL("../../src/" + file, import.meta.url), "utf8");
  const app = read("App.tsx");
  const rail = read("SideRail.tsx");
  // Решение 26.10: служебные кнопки (тема, палитра, сброс) переехали из шапки в боковую панель.
  assert.ok(/import \{ SideRail[^}]*\} from "\.\/SideRail"/.test(app));
  assert.ok(/className="header-tools[^"]*">\s*<SideRail>/.test(app));
  assert.ok(/import \{ ThemeToggle \} from "\.\/ThemeToggle"/.test(rail));
  assert.ok(/<ThemeToggle \/>/.test(rail));
});

function browser(
  saved: string | null,
  dark: boolean,
  denied: "read" | "write" | "access" | null,
  fn: (b: any) => void,
) {
  const previous = ["window", "document"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const attributes = new Map<string, string>(),
    listeners = new Map<string, Function>();
  const media = {
    matches: dark,
    addEventListener(name: string, callback: Function) {
      listeners.set(name, callback);
    },
    removeEventListener(name: string) {
      listeners.delete(name);
    },
  };
  const storage = {
    getItem() {
      if (denied === "read") throw Error("denied");
      return saved;
    },
    setItem(_key: string, value: string) {
      if (denied === "write") throw Error("denied");
      saved = value;
    },
  };
  const window = {
    get localStorage() {
      if (denied === "access") throw Error("denied");
      return storage;
    },
    matchMedia: () => media,
    addEventListener(name: string, callback: Function) {
      listeners.set(name, callback);
    },
    removeEventListener(name: string) {
      listeners.delete(name);
    },
  };
  const document = {
    documentElement: {
      setAttribute(key: string, value: string) {
        attributes.set(key, value);
      },
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: window,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: document,
    configurable: true,
  });
  try {
    fn({
      attributes,
      listeners,
      media,
      saved: () => saved,
      setSaved: (v: string | null) => {
        saved = v;
      },
    });
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test("G5 real button toggles data-theme both ways, persists and exposes its state", () => {
  browser(null, false, null, (b) => {
    const component = subject("src/ThemeToggle.tsx");
    assert.equal(b.attributes.get("data-theme"), "dark");
    let button = component.render("ThemeToggle");
    assert.equal(button.type, "button");
    assert.equal(button.props["aria-label"], "Тёмная тема");
    assert.equal(button.props["aria-pressed"], true);
    button.props.onClick();
    assert.equal(b.attributes.get("data-theme"), "light");
    assert.equal(b.saved(), "light");
    button = component.render("ThemeToggle");
    assert.equal(button.props["aria-pressed"], false);
    button.props.onClick();
    assert.equal(b.attributes.get("data-theme"), "dark");
    assert.equal(b.saved(), "dark");
    const reloaded = subject("src/ThemeToggle.tsx");
    assert.equal(reloaded.render("ThemeToggle").props["aria-pressed"], true);
  });
});

test("G5 system theme, saved override, invalid storage and denied storage work", () => {
  for (const [saved, dark, expected] of [
    [null, true, true],
    ["light", true, false],
    ["dark", false, true],
    ["junk", true, true],
  ] as const)
    browser(saved, dark, null, (b) => {
      const component = subject("src/ThemeToggle.tsx");
      assert.equal(
        component.render("ThemeToggle").props["aria-pressed"],
        expected,
      );
      assert.equal(b.attributes.get("data-theme"), expected ? "dark" : "light");
    });
  for (const denied of ["read", "write", "access"] as const)
    browser(null, true, denied, (b) => {
      const component = subject("src/ThemeToggle.tsx");
      const button = component.render("ThemeToggle");
      assert.equal(b.attributes.get("data-theme"), "dark");
      assert.doesNotThrow(() => button.props.onClick());
      assert.equal(b.attributes.get("data-theme"), "light");
    });
});

test("G5 keeps the MVP2 dark default, syncs explicit preferences across tabs and cleans listeners", () => {
  browser(null, false, null, (b) => {
    const component = subject("src/ThemeToggle.tsx");
    component.render("ThemeToggle");
    const cleanup = component.effects[0]();
    b.media.matches = true;
    assert.equal(b.listeners.has("change"), false);
    assert.equal(b.attributes.get("data-theme"), "dark");
    component.render("ThemeToggle").props.onClick();
    assert.equal(b.attributes.get("data-theme"), "light");
    b.setSaved("dark");
    b.listeners.get("storage")({ key: "alfa-cabinet-theme" });
    assert.equal(b.attributes.get("data-theme"), "dark");
    b.setSaved(null);
    b.media.matches = false;
    b.listeners.get("storage")({ key: null });
    assert.equal(b.attributes.get("data-theme"), "dark");
    cleanup();
    assert.equal(b.listeners.size, 0);
  });
});

test("G5 checker rejects low contrast, missing palettes and product drift", async () => {
  const checker = await import(
    new URL("../../scripts/check-contrast.mjs", import.meta.url).href
  );
  assert.equal(checker.contrast("#000000", "#ffffff"), 21);
  assert.equal(checker.contrast("#777777", "#777777"), 1);
  const board = readFileSync(
    new URL("../../public/design/theme-board.html", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../../src/styles.css", import.meta.url),
    "utf8",
  );
  assert.equal(checker.auditPalettes(board, css).errors.length, 0);
  assert.ok(
    checker.auditPalettes(
      board.replace("--theme-muted: #4f5b6c", "--theme-muted: #ffffff"),
      css,
    ).errors.length,
  );
  assert.ok(
    checker.auditPalettes(
      board.replace(
        'data-direction="paper"][data-mode="dark"]',
        'data-direction="other"][data-mode="dark"]',
      ),
      css,
    ).errors.length,
  );
  assert.ok(
    checker.auditPalettes(
      board.replace(
        /\.theme\[data-direction="paper"\]\[data-mode="dark"\]\s*\{[^}]+\}/,
        "",
      ),
      css,
    ).errors.length,
  );
  assert.ok(
    checker.auditPalettes(
      board,
      css.replace("--theme-ink: #171923", "--theme-ink: #222222"),
    ).errors.length,
  );
  const palettes = checker.auditPalettes(board, css).palettes;
  const source = checker.auditSource(
    [
      [
        "bad.css",
        ".bad { color: var(--theme-on-accent); background: var(--theme-surface); }",
      ],
    ],
    palettes,
  );
  assert.ok(source.errors.some((e: string) => e.includes("product/light")));
});

test("G5 board has six real samples, valid local icons and working direction controls", () => {
  const url = new URL("../../public/design/theme-board.html", import.meta.url);
  const html = readFileSync(url, "utf8");
  assert.equal((html.match(/<article class="theme"/g) ?? []).length, 6);
  assert.equal((html.match(/class="queue"/g) ?? []).length, 6);
  assert.equal((html.match(/<input /g) ?? []).length, 6);
  assert.ok(html.includes("Альфа: три направления кабинета"));
  assert.ok(!html.includes("???"));
  for (const match of html.matchAll(/src="([^"]+)"/g)) {
    assert.ok(match[1].startsWith("../icons/"));
    assert.ok(existsSync(new URL(match[1], url)), match[1]);
  }
  const picks = ["graphite", "porcelain", "paper", "all"].map((pick) => ({
    dataset: { pick },
    pressed: "",
    click: () => {},
    addEventListener(_name: string, fn: () => void) {
      this.click = fn;
    },
    setAttribute(_name: string, value: string) {
      this.pressed = value;
    },
  }));
  const sections = ["graphite", "porcelain", "paper"].map((section) => ({
    dataset: { section },
    hidden: false,
  }));
  runInNewContext(html.match(/<script>([\s\S]+)<\/script>/)![1], {
    document: {
      querySelectorAll: (query: string) =>
        query === "[data-pick]"
          ? picks
          : query === "[data-section]"
            ? sections
            : [],
    },
  });
  picks[3].click();
  assert.ok(sections.every((section) => !section.hidden));
  picks[2].click();
  assert.deepEqual(
    sections.map((section) => section.hidden),
    [true, true, false],
  );
  assert.equal(picks[2].pressed, "true");
});

test("G5 board, documented token tables and palette inventory agree", async () => {
  const checker = await import(
    new URL("../../scripts/check-contrast.mjs", import.meta.url).href
  );
  const board = readFileSync(
    new URL("../../public/design/theme-board.html", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../../src/styles.css", import.meta.url),
    "utf8",
  );
  const inventory = JSON.parse(
    readFileSync(
      new URL("../../docs/design/theme-tokens.json", import.meta.url),
      "utf8",
    ),
  );
  const doc = readFileSync(
    new URL("../../docs/design/brand-evolution.md", import.meta.url),
    "utf8",
  );
  for (const palette of checker.auditPalettes(board, css).palettes) {
    assert.deepEqual(
      palette.tokens,
      inventory[palette.direction][palette.mode],
    );
    for (const [key, value] of Object.entries(palette.tokens)) {
      assert.ok(doc.includes("`" + key + "`"));
      assert.ok(doc.includes(String(value).toUpperCase()));
    }
  }
});
