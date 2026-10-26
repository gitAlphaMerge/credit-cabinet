import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ApplicationAgent } from "../src/ApplicationAgent";
import {
  quickActions,
  quickActionStage,
  sendQuickAction,
} from "../shared/quick-actions";
import type { MvpApplication } from "../shared/mvp2";

test("every MVP2 agent stage has two to four usable actions", () => {
  for (const [stage, actions] of Object.entries(quickActions)) {
    assert.ok(actions.length >= 2 && actions.length <= 4, stage);
    assert.equal(
      new Set(actions.map((action) => action.id)).size,
      actions.length,
      stage,
    );
    for (const action of actions) {
      assert.ok(action.label.trim(), `${stage}: empty label`);
      assert.ok(
        action.label.trim().split(/\s+/u).length <= 4,
        `${stage}: long label`,
      );
      assert.ok(action.prompt.trim(), `${stage}: empty prompt`);
    }
  }
  assert.match(
    quickActions.onboarding.find((action) => action.id === "need-credit")!
      .prompt,
    /без кредита/u,
  );
});

test("MVP2 views choose the actions for the current step", () => {
  assert.equal(quickActionStage("intro", 0), "onboarding");
  assert.equal(quickActionStage("questionnaire", 0), "questionnaire");
  assert.equal(quickActionStage("questionnaire", 1), "documents");
  assert.equal(quickActionStage("dossier", 4), "documents");
  assert.equal(quickActionStage("recommendation", 0), "recommendation");
  assert.equal(quickActionStage("decision", 0), "decision");
  assert.equal(
    quickActionStage("supplement", 1, "ADDITIONAL_DATA_REQUIRED"),
    "supplement",
  );
  assert.equal(quickActionStage("contract", 4), "contract");
});

test("agent renders stage actions and activating an action sends its prompt", () => {
  const application = { id: "example", decision: undefined } as MvpApplication;
  const html = renderToStaticMarkup(
    createElement(ApplicationAgent, {
      application,
      section: 1,
      view: "questionnaire",
    }),
  );
  for (const action of quickActions.documents)
    assert.match(html, new RegExp(action.label));
  assert.doesNotMatch(html, /Зачем этот вопрос/u);
  const sent: string[] = [];
  sendQuickAction(quickActions.documents[0], (prompt) => sent.push(prompt));
  assert.deepEqual(sent, [quickActions.documents[0].prompt]);
});
