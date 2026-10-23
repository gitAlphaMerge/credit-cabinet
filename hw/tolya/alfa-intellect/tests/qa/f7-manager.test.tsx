import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ManagerView } from "../../src/manager/ManagerWorkspace";
import { sendManagerEvent } from "../../src/manager/api";
import { elements, textOf } from "./q3-harness";

const application = { id: "f7", version: 8, status: "queued", amount: 300000 };
const dossier = { holes: ["statement"], limit_now_rub: 400000, N: 5, M: 5 };
function props(extra: any = {}): any {
  return {
    rows: [{ application, ...dossier }], selected: "f7",
    detail: { application, dossier, events: [] }, tab: "queue",
    loading: false, detailLoading: false, busy: false, error: "",
    onSelect() {}, onTab() {}, onRetry() {}, async onAction() {}, ...extra,
  };
}
test("F7 manager checkbox defaults unchecked and submits boolean through the real API adapter", async () => {
  const oldFetch = globalThis.fetch, oldFormData = globalThis.FormData;
  let checked = false;
  const bodies: any[] = [];
  try {
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ application });
    };
    globalThis.FormData = class {
      get(key: string) {
        return key === "hole" ? "statement" : key === "text" ? "Дослать выписку" : checked ? "on" : null;
      }
    } as any;
    const tree = ManagerView(props({ onAction: (event: any, payload: any) => sendManagerEvent(application, event, payload) }));
    const checkbox = elements(tree).find(n => n.type === "input" && n.props.name === "return_to_manager");
    assert.ok(checkbox, "return checkbox must exist");
    assert.equal(checkbox.props.type, "checkbox");
    assert.equal(checkbox.props.defaultChecked, false);
    const form = elements(tree).find(n => n.type === "form" && elements(n).includes(checkbox))!;
    assert.match(textOf(form), /Вернуть мне после досылки/);
    assert.match(textOf(form), /Без галочки зелёная заявка уйдёт клиенту сама/);
    for (const value of [false, true]) {
      checked = value;
      await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
      assert.equal(bodies.at(-1).event, "request_info");
      assert.equal(bodies.at(-1).expectedVersion, 8);
      assert.equal(bodies.at(-1).payload.return_to_manager, value);
      assert.equal(bodies.at(-1).reason, "Дослать выписку");
    }
    for (const state of [{ busy: true }, { detailLoading: true }, {
      detail: { application: { ...application, status: "offered" }, dossier, events: [] },
    }]) {
      const input = elements(ManagerView(props(state))).find(n => n.props?.name === "return_to_manager");
      assert.ok(!input || input.props.disabled);
    }
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.FormData = oldFormData;
  }
});

test("F7 queue and dossier show the return badge alongside the fresh verdict", () => {
  const returned = { ...dossier, return_to_manager: true, core_verdict: "underwriting" };
  const html = renderToStaticMarkup(ManagerView(props({
    rows: [{ application, ...returned }], detail: { application, dossier: returned, events: [] },
  })));
  assert.equal((html.match(/вы просили вернуть/g) ?? []).length, 2);
  assert.equal((html.match(/Готова к автоматическому офферу/g) ?? []).length, 2);
  assert.doesNotMatch(renderToStaticMarkup(ManagerView(props())), /вы просили вернуть/);
});
