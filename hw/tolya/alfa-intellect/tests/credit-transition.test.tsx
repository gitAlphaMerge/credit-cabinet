import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CreditTransition,
  transitionStepStates,
  transitionSteps,
} from "../src/CreditMotion";

test("экраны ожидания показывают четыре конкретных шага и удерживают последний до ответа", () => {
  for (const kind of ["selection", "review"] as const) {
    const html = renderToStaticMarkup(
      <CreditTransition kind={kind} ready={false} onFinish={() => {}} />,
    );
    for (const label of transitionSteps[kind]) assert.ok(html.includes(label));
    assert.match(html, /credit-transition-pattern/);
    assert.match(html, /aria-busy="true"/);
    assert.deepEqual(
      transitionStepStates(kind, 3, false).map((step) => step.status),
      ["done", "done", "done", "running"],
    );
    assert.deepEqual(
      transitionStepStates(kind, 4, false).map((step) => step.status),
      ["done", "done", "done", "done"],
    );
  }
});

test("reduced motion оставляет статичный список, ошибка убирает экран ожидания", () => {
  const original = globalThis.matchMedia;
  globalThis.matchMedia = (() => ({ matches: true })) as unknown as typeof matchMedia;
  try {
    const props = { kind: "review" as const, ready: false, onFinish: () => {} };
    const html = renderToStaticMarkup(<CreditTransition {...props} />);
    assert.match(html, /data-reduced-motion="true"/);
    assert.match(html, /data-running="false"/);
    assert.doesNotMatch(html, /class="running"/);
    assert.equal(
      renderToStaticMarkup(<CreditTransition {...props} error="Сервер недоступен" />),
      "",
    );
  } finally {
    globalThis.matchMedia = original;
  }
});
