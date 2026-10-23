import test from "node:test";
import assert from "node:assert/strict";
import { setup, clock, realCoreTransport } from "./q5-support";
import { resumeDisagreedReview } from "../../server/application-silence";

// Preserve the missing contract transition as a red acceptance test. F1 cannot
// modify applications.ts or label a responding customer CLIENT_SILENT again.
test("BUG: F1 still-red resupply after CLIENT_SILENT returns to the manager queue", async () => {
  const { db, api, seedManager, createUser, saveState, demoState, DEMO_CASES } =
    await setup();
  const transport = realCoreTransport();
  const deps = {
    ...api.applicationsDependencies(),
    clock,
    core: api.httpCoreClient,
  };
  try {
    await seedManager(db, { ...deps, log: () => {} });
    const state = demoState(DEMO_CASES[0], clock());
    const uid = createUser("79990000515", "test-only-password", state.profile);
    saveState(uid, state);
    let a = api.createApplication(
      db,
      uid,
      { selectionId: state.selections[0].id, selectionVersion: 1 },
      deps,
    ).application;
    for (const [event, payload] of [
      ["submit", { consent: true }],
      ["agent_nudge", { text: "Дослать договор и акт сверки" }],
      ["escalate_silent", {}],
    ] as const) {
      a = (
        await api.transitionApplication(
          db,
          {
            applicationId: a.id,
            expectedVersion: a.version,
            event,
            actorRole: "system",
            actorId: null,
            payload,
          },
          deps,
        )
      ).application;
    }
    a = (
      await api.executeApplicationEvent(
        db,
        {
          applicationId: a.id,
          expectedVersion: a.version,
          event: "request_info",
          actorRole: "manager",
          actorId: "q5-manager",
          reason: "Дослать договор и акт сверки",
          payload: {
            hole: "contract_main_customer",
            text: "Дослать договор и акт сверки",
          },
        },
        "f1-gap-request",
        "f1-gap-request",
        deps,
      )
    ).application;
    a = (
      await api.executeApplicationEvent(
        db,
        {
          applicationId: a.id,
          expectedVersion: a.version,
          event: "client_update",
          actorRole: "client",
          actorId: uid,
          payload: {
            confirmed_fields: { contract_main_customer: "Договор подтверждён" },
          },
        },
        "f1-gap-update",
        "f1-gap-update",
        deps,
      )
    ).application;
    assert.ok(
      JSON.parse(api.dossierOf(db, a.id)!.holes).includes("reconciliation_act"),
      "actual core still requires the act",
    );
    a = (await resumeDisagreedReview(db, a, deps)).application;
    assert.equal(
      a.status,
      "queued",
      "red resupply must return to manager without fabricating fresh silence or objections",
    );
  } finally {
    transport.restore();
  }
});
