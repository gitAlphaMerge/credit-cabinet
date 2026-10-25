import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "../src/Landing";
import { SelectionResult } from "../src/SelectionResult";
import { ApplicationStatusView } from "../src/ApplicationStatus";
import { ManagerView } from "../src/manager/ManagerWorkspace";
import { publicPreview } from "../server/preview";
import type { ClientDetail } from "../src/application-client";

const forbidden = /\b[A-Z_]{4,}\b|mvp|SHA-256|synthetic/i;
function screenText(view: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(view).replace(/<[^>]*>/g, " ");
}

test("main client and manager screens hide technical labels", () => {
  const detail = {
    application: { id: "internal-id", status: "rejected", version: 3, amount: 500000 },
    dossier: {
      stops_fired: ["ENFORCEMENT"],
      holes: ["UNKNOWN_REASON"],
      alternatives: [],
    },
    events: [{
      seq: 1, actor_role: "system", event: "reject", from_status: "queued",
      to_status: "rejected", at: "2026-10-26T08:00:00Z", reason: "ENFORCEMENT",
    }],
  } as ClientDetail;
  const client = screenText(createElement(ApplicationStatusView, {
    detail, busy: false, onAction: async () => {},
  }));
  const manager = screenText(createElement(ManagerView, {
    rows: [{ application: detail.application, client_name: "Клиент", red_reason: "UNKNOWN_REASON", reason: "ENFORCEMENT" }],
    selected: detail.application.id,
    detail,
    tab: "rejected",
    loading: false,
    detailLoading: false,
    error: "",
    busy: false,
    onSelect: () => {},
    onTab: () => {},
    onRetry: () => {},
    onAction: async () => {},
  }));
  const selection = screenText(createElement(SelectionResult, {
    item: publicPreview("ip").selections[0],
    onRevise: () => {},
    onDiscuss: () => {},
    onApply: () => {},
    onDocuments: () => {},
  }));
  const landing = screenText(createElement(Landing, { go: () => {} }));
  for (const [name, content] of Object.entries({ landing, selection, client, manager }))
    assert.doesNotMatch(content, forbidden, name);
  assert.match(client, /Исполнительное производство/);
  assert.match(manager, /Нужна проверка менеджером/);
});
