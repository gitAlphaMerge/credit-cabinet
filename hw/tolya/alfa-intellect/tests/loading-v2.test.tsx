import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import request from "supertest";
import { ApplicationLoading } from "../src/ApplicationLoading";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "loading-v2-")),
  "test.sqlite",
);
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
const { app, stopSilenceSweep } = await import("../server/app");
const { db } = await import("../server/store");
after(() => {
  stopSilenceSweep();
  db.close();
});

test("Only the loading document permits same-origin embedding", async () => {
  for (const path of ["/", "/api/state", "/v2/other.html"])
    assert.equal(
      (await request(app).get(path)).headers["x-frame-options"],
      "DENY",
    );
  const response = await request(app).get("/v2/zagruzka.html?embedded=1");
  assert.equal(response.headers["x-frame-options"], "SAMEORIGIN");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
});

test("Embedded v2 uses server stages, rejects forged progress and never starts a progress clock", () => {
  const html = readFileSync(
    new URL("../public/v2/zagruzka.html", import.meta.url),
    "utf8",
  );
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)![1];
  const listeners = new Map<string, (event: any) => void>();
  let component: any;
  let timers = 0;
  const parent = { postMessage() {} };
  class Logic {
    props: any;
    state: any;
    constructor(props: any) {
      this.props = props;
    }
    setState(value: any) {
      this.state = { ...this.state, ...value };
    }
  }
  runInNewContext(script, {
    embedded: true,
    DCLogic: Logic,
    location: { origin: "https://alphahack.ru" },
    parent,
    window: {
      addEventListener: (type: string, fn: any) => listeners.set(type, fn),
    },
    document: { getElementById: () => ({}) },
    ResizeObserver: class {
      observe() {}
    },
    setInterval: () => ++timers,
    mountDC: (Component: any, props: any) => {
      component = new Component(props);
      component.componentDidMount();
    },
  });
  assert.equal(timers, 1, "only decorative scene rotation may run");
  assert.equal(component.renderVals().pct, "");
  const update = listeners.get("message")!;
  const data = {
    type: "credit-loading-progress",
    steps: [
      { label: "Документы", status: "done" },
      { label: "Поток", status: "running" },
      { label: "Результат", status: "pending" },
    ],
  };
  update({ origin: "https://evil.example", source: parent, data });
  update({ origin: "https://alphahack.ru", source: {}, data });
  assert.equal(component.renderVals().pct, "");
  update({ origin: "https://alphahack.ru", source: parent, data });
  assert.equal(component.renderVals().pct, "33%");
  assert.equal(component.renderVals().stepLabel, "Поток");
  update({
    origin: "https://alphahack.ru",
    source: parent,
    data: { ...data, steps: [{ label: "Ошибка", status: "error" }] },
  });
  assert.match(component.renderVals().progressNote, /Не удалось/);
  assert.equal(component.renderVals().pct, "0%");
});

test("Parent retains the real current status even if the illustration fails", () => {
  const html = renderToStaticMarkup(
    <ApplicationLoading
      steps={[
        { id: "cash", label: "Финансовый анализ CSV", status: "running" },
      ]}
    />,
  );
  assert.match(html, /src="\/v2\/img\/push.png"/);
  assert.match(html, /role="status">Анализ выписок/);
  assert.doesNotMatch(html, /100%<\/p>/);
});
