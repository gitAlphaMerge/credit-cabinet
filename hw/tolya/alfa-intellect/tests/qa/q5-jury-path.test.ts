import test from "node:test";
import assert from "node:assert/strict";
import { setup, clock, realCoreTransport } from "./q5-support";

// IDs and business data are deterministic; UUIDs/passwords are security values,
// never fuzz inputs. No random seed is needed to reproduce these scenarios.
test("S1: green application reaches offer and schedule without manager or LLM", async () => {
  const { db, api, DEMO_CASES, demoState, createUser, saveState } =
    await setup();
  const transport = realCoreTransport();
  try {
    assert.equal(process.env.AI_PROVIDER, "");
    assert.equal(process.env.TEAM_AGENT_URL, "");
    const state = demoState(DEMO_CASES[1], clock());
    state.selections[0].calculation.amount = 300000;
    const id = createUser("79990000511", "test-only-password", state.profile);
    saveState(id, state);
    const deps = { clock, core: api.httpCoreClient };
    const a = api.createApplication(
      db,
      id,
      { selectionId: state.selections[0].id, selectionVersion: 1 },
      deps,
    ).application;
    const result = await api.executeApplicationEvent(
      db,
      {
        applicationId: a.id,
        event: "submit",
        expectedVersion: a.version,
        actorRole: "client",
        actorId: id,
        payload: { consent: true },
      },
      "q5-s1",
      "q5-s1",
      deps,
    );
    assert.equal(result.application.status, "offered");
    const events = api.eventsOf(db, a.id);
    assert.deepEqual(
      events.map((e) => e.event),
      ["create", "submit", "underwriter_approve", "make_offer"],
    );
    assert.ok(events.slice(1).every((e) => e.actor_role === "system"));
    const offer = JSON.parse(String(events.at(-1)!.payload));
    assert.equal(offer.schedule.length, 12);
    assert.equal(
      Math.round(
        offer.schedule.reduce((sum: number, p: any) => sum + p.principal, 0),
      ),
      300000,
    );
    assert.equal(
      api.bankQueue(db, deps).some((q) => q.application.id === a.id),
      false,
    );
    assert.equal(transport.calls(), 1);
  } finally {
    transport.restore();
  }
});

test("S4: inactive company rejected with understandable compliance reason before core", async () => {
  const { db, api, DEMO_CASES, demoState, createUser, saveState } =
    await setup();
  const state = demoState(DEMO_CASES[0], clock());
  state.profile.inn = "9900000002";
  const id = createUser("79990000514", "test-only-password", state.profile);
  saveState(id, state);
  const deps = { clock, core: api.httpCoreClient };
  const transport = realCoreTransport();
  try {
    const a = api.createApplication(
      db,
      id,
      { selectionId: state.selections[0].id, selectionVersion: 1 },
      deps,
    ).application;
    const result = await api.executeApplicationEvent(
      db,
      {
        applicationId: a.id,
        event: "submit",
        expectedVersion: a.version,
        actorRole: "client",
        actorId: id,
        payload: { consent: true },
      },
      "q5-s4",
      "q5-s4",
      deps,
    );
    assert.equal(result.application.status, "rejected");
    assert.equal(transport.calls(), 0);
    assert.equal(
      api.eventsOf(db, a.id).at(-1)!.reason,
      "COMPLIANCE_EGRUL_INACTIVE",
    );
    assert.ok(
      api
        .dossierOf(db, a.id)!
        .compliance!.checks.find((c) => c.key === "egrul")!
        .clientText!.includes("недействующ"),
    );
    assert.equal(
      api.bankQueue(db, deps).some((q) => q.application.id === a.id),
      false,
    );
  } finally {
    transport.restore();
  }
});

test("BUG: S-manager: resupplied red case returns to queue then underwriting with memo", async () => {
  const { db, api, seedManager } = await setup();
  const transport = realCoreTransport();
  const deps = { clock, core: api.httpCoreClient };
  try {
    await seedManager(db, { ...deps, log: () => {} });
    let a = api
      .bankQueue(db, deps)
      .find((q) => q.application.user_id === "q5-client-silent")!.application;
    const send = async (
      event: Parameters<typeof api.transitionApplication>[1]["event"],
      role: "client" | "manager",
      payload: Record<string, unknown>,
      reason?: string,
    ) => {
      a = (
        await api.executeApplicationEvent(
          db,
          {
            applicationId: a.id,
            event,
            actorRole: role,
            actorId: role === "manager" ? "q5-manager" : a.user_id,
            expectedVersion: a.version,
            payload,
            reason,
          },
          `q5-manager-${event}`,
          `q5-manager-${event}`,
          deps,
        )
      ).application;
    };
    await send(
      "request_info",
      "manager",
      { hole: "contract_main_customer", text: "Дослать договор и акт сверки" },
      "Дослать договор и акт сверки",
    );
    assert.equal(a.status, "info_requested");
    await send("client_update", "client", {
      confirmed_fields: {
        contract_main_customer: "Демо-договор подтверждён",
        reconciliation_act: "Демо-акт подтверждён",
      },
    });
    assert.equal(
      a.status,
      "queued",
      "S-manager step 3: full client update must return to manager; observed automatic offer",
    );
    await send("send_to_underwriting", "manager", {
      memo: "Документы проверены, передать андеррайтеру.",
    });
    assert.equal(a.status, "offered");
    assert.ok(
      api
        .eventsOf(db, a.id)
        .some(
          (e) =>
            e.event === "send_to_underwriting" &&
            JSON.parse(String(e.payload)).memo,
        ),
    );
  } finally {
    transport.restore();
  }
});
