import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { useReveal } from "../src/motion";

function Card() {
  const reveal = useReveal();
  return <div ref={reveal.ref} className={"card " + reveal.className} />;
}

function withMotion<T>(reduce: boolean, run: () => T) {
  const saved = globalThis.matchMedia;
  globalThis.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof matchMedia;
  try {
    return run();
  } finally {
    globalThis.matchMedia = saved;
  }
}

test("useReveal: при reduced-motion классы анимации не ставятся", () => {
  const html = withMotion(true, () => renderToStaticMarkup(<Card />));
  assert.doesNotMatch(html, /ai-reveal|ai-in/);
  assert.match(html, /class="card /);
});

test("useReveal: без reduced-motion блок ждёт появления", () => {
  const html = withMotion(false, () => renderToStaticMarkup(<Card />));
  assert.match(html, /class="card ai-reveal"/);
});
