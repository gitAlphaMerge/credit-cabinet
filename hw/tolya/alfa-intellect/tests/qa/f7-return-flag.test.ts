import test from "node:test";
import {
  a, db, app, request, cookies, owner, manager, other, assert,
  queued, post, setMode, scoreCalls, deps, internal, create,
} from "./q1-harness";

async function requestInfo(flag?: unknown) {
  const id = await queued();
  await post(id, "request_info", {
    hole: "contract_main_customer", text: "Дослать договор",
    ...(flag === undefined ? {} : { return_to_manager: flag }),
  }, manager).expect(200);
  return id;
}
const update = (id: string, key?: `${string}-${string}-${string}-${string}-${string}`, version?: number) =>
  post(id, "client_update", { confirmed_fields: { qa: true } }, owner,
    version ?? a.applicationOf(db, id).version, key);
const queue = () => request(app).get("/api/bank/queue").set("Cookie", cookies[manager]);
const detail = (id: string) => request(app).get(`/api/applications/${id}`).set("Cookie", cookies[manager]);

test("F7 unchecked green resupply automatically offers without another manager action", async () => {
  const id = await requestInfo();
  const before = scoreCalls;
  setMode("green");
  const result = await update(id).expect(200);
  assert.equal(result.body.application.status, "offered");
  assert.equal(scoreCalls, before + 1);
  assert.equal(a.eventsOf(db, id).filter(e => e.actor_role === "manager").length, 1);
  assert.deepEqual(a.eventsOf(db, id).slice(-3).map(e => e.event),
    ["client_update", "underwriter_approve", "make_offer"]);
  assert.ok(!(await queue().expect(200)).body.some((r: any) => r.application.id === id));
  const event = a.eventsOf(db, id).findLast(e => e.event === "request_info")!;
  assert.equal(JSON.parse(String(event.payload)).return_to_manager, false);
});

for (const mode of ["green", "holes", "stop", "gate_info", "gate_stop", "limit"] as const)
  test(`F7 checked ${mode} resupply returns with fresh dossier and audited flag`, async () => {
    const id = await requestInfo(true);
    const dossierVersion = a.dossierOf(db, id)!.version;
    const before = scoreCalls;
    setMode(mode);
    const version = a.applicationOf(db, id).version;
    const result = await update(id, `f7-${mode}-0000-0000-0000` as `${string}-${string}-${string}-${string}-${string}`, version).expect(200);
    assert.equal(result.body.application.status, "queued");
    assert.equal(scoreCalls, before + (mode.startsWith("gate_") ? 0 : 1));
    const row = (await queue().expect(200)).body.find((r: any) => r.application.id === id);
    const dossier = (await detail(id).expect(200)).body.dossier;
    assert.equal(row.return_to_manager, true);
    assert.equal(dossier.return_to_manager, true);
    assert.equal(dossier.version, dossierVersion + 1);
    const verdict = mode === "green" ? "underwriting" : mode === "stop" || mode === "gate_stop" ? "rejected" : "info_requested";
    assert.equal(dossier.core_verdict, verdict);
    assert.equal(row.core_verdict, verdict);
    assert.ok(!a.eventsOf(db, id).some(e => e.event === "make_offer"));
    const event = a.eventsOf(db, id).findLast(e => e.event === "request_info")!;
    assert.equal(JSON.parse(String(event.payload)).return_to_manager, true);
    assert.equal(event.actor_role, "manager");
    assert.equal(event.actor_id, manager);
    assert.equal(event.at, deps.clock().toISOString());
    const journal = a.eventsOf(db, id);
    const replay = await update(id, `f7-${mode}-0000-0000-0000` as `${string}-${string}-${string}-${string}-${string}`, version).expect(200);
    assert.deepEqual(replay.body, result.body);
    assert.deepEqual(a.eventsOf(db, id), journal);
    if (mode === "green") {
      await post(id, "send_to_underwriting", { memo: "Проверено" }, manager).expect(200);
      assert.equal(a.applicationOf(db, id).status, "offered");
    } else {
      await post(id, "send_to_underwriting", { memo: "Проверено" }, manager).expect(409);
      await post(id, "reject", {}, manager).expect(200);
    }
  });

test("F7 next unchecked request clears the previous cycle flag", async () => {
  const id = await requestInfo(true);
  await update(id).expect(200);
  assert.equal(a.applicationOf(db, id).status, "queued");
  await post(id, "request_info", { hole: "contract_main_customer", text: "Ещё документ" }, manager).expect(200);
  assert.equal((await detail(id)).body.dossier.return_to_manager, false);
  setMode("green");
  await update(id).expect(200);
  assert.equal(a.applicationOf(db, id).status, "offered");
  assert.equal((await detail(id)).body.dossier.return_to_manager, false);
});

test("F7 unchecked red resupply returns after prior CLIENT_SILENT without a new silence event", async () => {
  setMode("holes");
  const id = create();
  await post(id, "submit", { consent: true }).expect(200);
  await internal(id, "agent_nudge", { text: "Дослать договор" });
  await internal(id, "escalate_silent");
  await post(id, "request_info", { hole: "contract_main_customer", text: "Дослать договор" }, manager).expect(200);
  await update(id).expect(200);
  assert.equal(a.applicationOf(db, id).status, "queued");
  assert.equal(a.eventsOf(db, id).at(-1)!.event, "client_update");
  const row = (await queue()).body.find((r: any) => r.application.id === id);
  assert.equal(row.return_to_manager, false);
  assert.equal(row.red_reason, "CLIENT_SILENT");
});

test("F7 flag is boolean and belongs only to manager request_info; rejected requests are atomic", async () => {
  const id = await queued();
  const snapshot = () => [a.applicationOf(db, id), a.eventsOf(db, id), a.dossierOf(db, id)];
  const before = snapshot();
  for (const flag of ["true", "false", 1, 0, null, [], {}]) {
    await post(id, "request_info", { return_to_manager: flag }, manager).expect(422);
    assert.deepEqual(snapshot(), before);
  }
  for (const actor of [owner, other]) {
    const response = await post(id, "request_info", { return_to_manager: true }, actor);
    assert.ok([403, 404, 422].includes(response.status));
    assert.deepEqual(snapshot(), before);
  }
  await post(id, "request_info", { hole: "contract_main_customer", text: "Дослать" }, manager).expect(200);
  const pending = snapshot();
  for (const flag of [true, false]) {
    const response = await post(id, "client_update", { confirmed_fields: { qa: true }, return_to_manager: flag });
    assert.ok([403, 422].includes(response.status));
    assert.deepEqual(snapshot(), pending);
  }
  await assert.rejects(internal(id, "client_update", { confirmed_fields: { qa: true }, return_to_manager: true }),
    (e: any) => [403, 422].includes(e.status));
});

test("F7 flagged cycle cannot bypass manager through accepting an alternative", async () => {
  const id = await requestInfo(true);
  setMode("limit");
  await update(id).expect(200);
  assert.equal(a.applicationOf(db, id).status, "queued");
  await post(id, "accept_alternative", { option_id: "q1-option" }).expect(200);
  assert.equal(a.applicationOf(db, id).status, "queued");
  assert.equal((await detail(id)).body.dossier.core_verdict, "underwriting");
  assert.equal((await detail(id)).body.dossier.return_to_manager, true);
});

test("F7 Q1 seed=20261198 above-limit send_to_underwriting is rejected by documented guard", async () => {
  setMode("limit");
  const id = create();
  await post(id, "submit", { consent: true }).expect(200);
  await internal(id, "escalate_disagreed", { client_objections: "Не уменьшаю сумму" });
  const before = a.eventsOf(db, id);
  await post(id, "send_to_underwriting", { memo: "Проверено" }, manager).expect(409);
  assert.equal(a.applicationOf(db, id).status, "queued");
  assert.deepEqual(a.eventsOf(db, id), before);
});
