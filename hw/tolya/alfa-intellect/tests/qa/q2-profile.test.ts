import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  customer,
  store,
  seed,
  profile,
  healthyCore,
  applications as a,
  prepare,
  submit,
  snapshot,
  csv,
} from "./q2-harness";
import { runComplianceGate } from "../../server/compliance";
import { extract } from "../../server/documents";

after(() => store.db.close());
const message = `seed=${seed}`;

test("Unicode, emoji, SQL and HTML are inert profile data; oversized names rejected", async () => {
  const owner = await customer();
  for (const name of [
    "ООО 🚀 東京",
    "'; DROP TABLE users; --",
    '<img src=x onerror="alert(1)">',
  ]) {
    await owner.agent
      .patch("/api/profile")
      .set("Cookie", owner.cookie)
      .send({ name })
      .expect(200);
    const state = await owner.agent
      .get("/api/state")
      .set("Cookie", owner.cookie)
      .expect(200);
    assert.equal(state.body.profile.name, name, message);
    assert.ok(
      store.db.prepare("SELECT id FROM users WHERE id=?").get(owner.id),
      message,
    );
  }
  const before = store.stateOf(owner.id);
  await owner.agent
    .patch("/api/profile")
    .set("Cookie", owner.cookie)
    .send({ name: "x".repeat(10_000) })
    .expect(422);
  assert.deepEqual(store.stateOf(owner.id), before, message);
});

test("wrong-checksum INN absent from mocks is refused with no profile overwrite", async () => {
  // 7707083893 has checksum 3; changing final digit makes it invalid.
  const owner = await customer(),
    before = store.stateOf(owner.id);
  await owner.agent
    .post("/api/lookup")
    .set("Cookie", owner.cookie)
    .send({ inn: "7707083894" })
    .expect(404);
  await owner.agent
    .post("/api/lookup/confirm")
    .set("Cookie", owner.cookie)
    .send({ inn: "7707083894" })
    .expect(409);
  assert.deepEqual(store.stateOf(owner.id), before, message);
});

test("future statement date produces an explicit hole before scoring", async () => {
  const report = await runComplianceGate({
    inn: profile.inn!,
    now: new Date("2026-10-23T12:00:00Z"),
    documents: [
      { category: "statement", confirmed: true, documentDate: "2099-01-01" },
    ],
  });
  assert.equal(report.gate, "info_requested", message);
  assert.ok(report.reasons.includes("COMPLIANCE_DOC_DATE_UNKNOWN"), message);
  assert.ok(report.holes.includes("statement_fresh"), message);
});

test("BOM and permutations preserve N/M, limit and stops through the submit pipeline", async () => {
  // Deterministic core isolates cabinet wiring; actual Python scoring is not measured here.
  a.configureApplications({
    clock: () => new Date(),
    core: { score: async () => ({ core_result: healthyCore() }) },
  });
  const source = csv(),
    [header, ...rows] = source.split("\n");
  const results: unknown[] = [];
  for (const text of [
    source,
    "\uFEFF" + source,
    [header, ...rows.reverse()].join("\n"),
  ]) {
    const owner = await customer(),
      id = await prepare(owner);
    const state = store.stateOf(owner.id),
      parsed = await extract(Buffer.from(text), "statement.csv");
    state.documents[0].records = parsed.records;
    state.documents[0].fields = parsed.fields;
    store.saveState(owner.id, state);
    await submit(owner, id).expect(200);
    const dossier = snapshot(id).dossier!;
    const core = JSON.parse(dossier.core_result).core;
    results.push([
      dossier.readiness_n,
      dossier.readiness_m,
      core.limit_now_rub,
      core.stops_fired,
    ]);
  }
  assert.deepEqual(results[1], results[0], message);
  assert.deepEqual(results[2], results[0], message);
});
