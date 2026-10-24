import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LivePattern,
  SCENES,
  COLORS,
  SHAPES,
  animateLivePattern,
} from "../../src/LivePattern";

const original = readFileSync(
  new URL("../../../../../services/frontend/live-pattern.js", import.meta.url),
  "utf8",
);
const sandbox: any = {};
runInNewContext(
  original.replace(
    /document\.querySelectorAll\('[^']+'\)\.forEach\(start\);/,
    "globalThis.fixture = { SCENES, COLORS, SHAPES, grids, shapeTf, easeIn, easeBack };",
  ),
  sandbox,
);
const fixture = JSON.parse(JSON.stringify(sandbox.fixture));

test("G3: все сцены, строки плиток, цвета, фигуры и выдержки равны оригиналу", () => {
  assert.deepEqual(SCENES, fixture.SCENES);
  assert.deepEqual(COLORS, fixture.COLORS);
  assert.deepEqual(SHAPES, fixture.SHAPES);
  assert.equal(SCENES.length, 6);
});
test("G3: первый кадр содержит 36 плиток и отдельные слои фонов и фигур", () => {
  const html = renderToStaticMarkup(<LivePattern />);
  assert.equal((html.match(/data-lp-tile=/g) || []).length, 36);
  assert.equal((html.match(/<rect /g) || []).length, 36);
  assert.equal((html.match(/<path /g) || []).length, 36);
  assert.match(html, /viewBox="0 0 384 384"/);
  assert.match(html, /aria-hidden="true"/);
});

function rig(reduced = false, hidden = false) {
  let now = 0,
    id = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  const frames = new Map<number, FrameRequestCallback>();
  const listeners = new Map<string, () => void>();
  const media = {
    matches: reduced,
    addEventListener(_: string, fn: () => void) {
      listeners.set("media", fn);
    },
    removeEventListener() {
      listeners.delete("media");
    },
  };
  const doc = {
    hidden,
    addEventListener(_: string, fn: () => void) {
      listeners.set("visibility", fn);
    },
    removeEventListener() {
      listeners.delete("visibility");
    },
  };
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const win = {
    performance: { now: () => now },
    matchMedia: () => media,
    setTimeout(fn: () => void, ms: number) {
      tasks.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(key: number) {
      tasks.delete(key);
    },
    requestAnimationFrame(fn: FrameRequestCallback) {
      frames.set(++id, fn);
      return id;
    },
    cancelAnimationFrame(key: number) {
      frames.delete(key);
    },
  };
  class Observer {
    constructor(fn: typeof intersect) {
      intersect = fn;
    }
    observe() {}
    disconnect() {
      listeners.set("disconnected", () => {});
    }
  }
  class Node {
    attrs: Record<string, string> = {};
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    }
  }
  const backgrounds = Array.from({ length: 36 }, () => new Node());
  const shapes = Array.from({ length: 36 }, () => new Node());
  fixture.grids[0].forEach((t: any, i: number) => {
    backgrounds[i].setAttribute("fill", COLORS[t.b as keyof typeof COLORS]);
    shapes[i].setAttribute("d", SHAPES[t.s as keyof typeof SHAPES]);
    shapes[i].setAttribute("fill", COLORS[t.c as keyof typeof COLORS]);
    shapes[i].setAttribute("transform", sandbox.fixture.shapeTf(t.r, 1));
  });
  const svg = {
    querySelectorAll: (q: string) => (q === "rect" ? backgrounds : shapes),
  };
  const caption = { textContent: " ", classList: { toggle() {} } };
  const restore = ["window", "document", "IntersectionObserver"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: win,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: doc,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: Observer,
  });
  const stop = animateLivePattern(svg as any, caption as any);
  return {
    tasks,
    frames,
    caption,
    shapes,
    backgrounds,
    media,
    doc,
    advance(ms: number) {
      const end = now + ms;
      while (true) {
        const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        tasks.delete(next[0]);
        next[1].fn();
      }
      now = end;
      const pending = [...frames];
      frames.clear();
      for (const [, fn] of pending) fn(now);
    },
    visibility(value: boolean) {
      doc.hidden = value;
      listeners.get("visibility")!();
    },
    intersect(value: boolean) {
      intersect([{ isIntersecting: value }]);
    },
    preference(value: boolean) {
      media.matches = value;
      listeners.get("media")!();
    },
    close() {
      stop();
      assert.equal(tasks.size, 0);
      assert.equal(frames.size, 0);
      assert.equal(listeners.has("visibility"), false);
      assert.equal(listeners.has("media"), false);
      assert.ok(listeners.has("disconnected"));
      for (const [key, descriptor] of restore) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
test("G3: reduced-motion оставляет первый кадр без таймеров и кадров", () => {
  const r = rig(true);
  try {
    assert.equal(r.tasks.size, 0);
    assert.equal(r.frames.size, 0);
    r.advance(30000);
    assert.equal(r.caption.textContent, " ");
  } finally {
    r.close();
  }
});
test("G3: цикл подписей и выдержки 2200/2800 мс совпадают с оригиналом", () => {
  const r = rig();
  try {
    for (let i = 0; i < SCENES.length; i++) {
      r.advance((SCENES[i].hold || 2800) - 1);
      assert.equal(r.caption.textContent.trim(), SCENES[i].name);
      r.advance(1);
      assert.equal(
        r.caption.textContent.trim(),
        SCENES[(i + 1) % SCENES.length].name,
      );
    }
  } finally {
    r.close();
  }
});
test("G3: скрытая вкладка не меняет сцену и возобновляет оставшуюся выдержку", () => {
  const r = rig();
  try {
    r.advance(1000);
    r.visibility(true);
    assert.equal(r.tasks.size, 0);
    assert.equal(r.frames.size, 0);
    r.advance(10000);
    assert.equal(r.caption.textContent, " ");
    r.visibility(false);
    r.advance(1199);
    assert.equal(r.caption.textContent, " ");
    r.advance(1);
    assert.equal(r.caption.textContent, "Магазин у дома");
    r.advance(100);
    const before = JSON.stringify(r.shapes);
    r.visibility(true);
    r.advance(10000);
    assert.equal(JSON.stringify(r.shapes), before);
    assert.equal(r.frames.size, 0);
    r.visibility(false);
    r.advance(100);
    assert.notEqual(JSON.stringify(r.shapes), before);
    r.advance(1200);
    assert.equal(r.frames.size, 0);
  } finally {
    r.close();
  }
});
test("G3: скрытый старт, выход из viewport и смена системной настройки", () => {
  const r = rig(false, true);
  try {
    assert.equal(r.tasks.size, 0);
    r.visibility(false);
    r.advance(2200);
    r.intersect(false);
    assert.equal(r.tasks.size, 0);
    assert.equal(r.frames.size, 0);
    r.advance(10000);
    assert.equal(r.caption.textContent, "Магазин у дома");
    r.intersect(true);
    r.preference(true);
    assert.equal(r.tasks.size, 0);
    assert.equal(r.frames.size, 0);
    assert.equal(r.caption.textContent.trim(), "");
    r.preference(false);
    r.advance(2199);
    assert.equal(r.caption.textContent.trim(), "");
    r.advance(1);
    assert.equal(r.caption.textContent, "Магазин у дома");
  } finally {
    r.close();
  }
});

test("G3: геометрия промежуточных кадров и все финальные плитки равны оригиналу", () => {
  const r = rig();
  const normalize = (s: string) =>
    s
      .replace(/var\(--red, (#\w+)\)/g, "$1")
      .replace(/var\(--surface, (#\w+)\)/g, "$1");
  try {
    r.advance(2200);
    r.advance(100);
    assert.equal(
      r.shapes[0].attrs.transform,
      sandbox.fixture.shapeTf(1, 1 - sandbox.fixture.easeIn(0.5)),
    );
    assert.equal(r.shapes[35].attrs.transform, sandbox.fixture.shapeTf(0, 1));
    r.advance(310);
    assert.equal(
      r.shapes[0].attrs.transform,
      sandbox.fixture.shapeTf(2, sandbox.fixture.easeBack(0.5)),
    );
    r.advance(660);
    for (let scene = 1; scene <= SCENES.length; scene++) {
      fixture.grids[scene % SCENES.length].forEach((t: any, i: number) => {
        assert.equal(r.shapes[i].attrs.d, fixture.SHAPES[t.s]);
        assert.equal(normalize(r.shapes[i].attrs.fill), fixture.COLORS[t.c]);
        assert.equal(
          normalize(r.backgrounds[i].attrs.fill),
          fixture.COLORS[t.b],
        );
        assert.equal(
          r.shapes[i].attrs.transform,
          sandbox.fixture.shapeTf(t.r, 1),
        );
      });
      assert.equal(r.frames.size, 0);
      if (scene < SCENES.length) {
        r.advance(2800 - 1070);
        r.advance(1070);
      }
    }
  } finally {
    r.close();
  }
});
test("G3: длинная задержка кадров не создаёт параллельных циклов RAF", () => {
  const r = rig();
  try {
    r.advance(2200 + 2800 * 10);
    assert.equal(r.tasks.size, 1);
    assert.equal(r.frames.size, 1);
    r.advance(1070);
    assert.equal(r.frames.size, 0);
  } finally {
    r.close();
  }
});
test("G3: hero подключён, сетка резервирует квадрат и помещается на 1280/390", () => {
  const landing = readFileSync(
    new URL("../../src/Landing.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../../src/redesign.css", import.meta.url),
    "utf8",
  );
  const base = readFileSync(
    new URL("../../src/styles.css", import.meta.url),
    "utf8",
  );
  const hero = landing.slice(
    landing.indexOf('<section className="hero'),
    landing.indexOf('<section className="benefit-strip'),
  );
  assert.match(hero, /<LivePattern \/>/);
  assert.match(hero, /<HeroFinance pattern=\{<LivePattern \/>\} \/>/);
  assert.ok(
    hero.indexOf("<LivePattern") > hero.indexOf('className="hero-copy"'),
  );
  assert.match(
    css,
    /\.landing \.hero\.hero-live-pattern\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(520px, 1fr\);\s*gap:\s*40px;/,
  );
  assert.match(
    css,
    /@media \(max-width: 1100px\)\s*\{\s*\.landing \.hero\.hero-live-pattern\s*\{ grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(css, /\.live-pattern-box\s*\{[^}]*aspect-ratio: 1;/);
  assert.match(css, /\.live-pattern-caption\s*\{[^}]*height: 20px;/);
  assert.match(
    base,
    /\.wrap\s*\{\s*max-width: 1240px;[^}]*padding-left: 30px;[^}]*padding-right: 30px;/,
  );
  assert.match(
    base,
    /@media \(max-width: 560px\)\s*\{\s*\.wrap\s*\{\s*padding-left: 22px;\s*padding-right: 22px;/,
  );
  const desktop = (Math.min(1280, 1240) - 2 * 30 - 40) / 2;
  const oldDesktop = (Math.min(1280, 1240) - 2 * 30 - 55) / 2.04;
  const mobile = 390 - 2 * 22;
  assert.ok(desktop >= 520 && desktop > oldDesktop);
  assert.equal(desktop, 570);
  assert.equal(mobile, 346);
});
