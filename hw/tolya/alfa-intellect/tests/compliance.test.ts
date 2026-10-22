import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runComplianceGate, type ComplianceInput } from "../server/compliance";

const savedEnv = new WeakMap<TestContext, Set<string>>();
function setEnv(t: TestContext, key: string, value: string) {
  const keys = savedEnv.get(t) ?? new Set<string>();
  savedEnv.set(t, keys);
  if (!keys.has(key)) {
    const previous = process.env[key];
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
    keys.add(key);
  }
  process.env[key] = value;
}

const now = new Date("2026-10-23T00:00:00Z");
const input = (
  inn = "9900000001",
  documentDate: string | null = "2026-10-20",
): ComplianceInput => ({
  inn,
  now,
  documents: [{ category: "statement", confirmed: true, documentDate }],
});

test("clean company: four checks, deterministic enrichment and fresh statement", async () => {
  const r = await runComplianceGate(input());
  assert.equal(r.gate, "pass");
  assert.deepEqual(
    r.checks.map((c) => c.key),
    ["egrul", "fns", "bankruptcy", "aml"],
  );
  assert.ok(
    r.checks.every(
      (c) =>
        c.status === "ok" &&
        c.checkedAt === now.toISOString() &&
        c.source &&
        c.managerText &&
        c.clientText,
    ),
  );
  assert.deepEqual(r.enrichment, {
    form: "ООО",
    registeredAt: "2020-03-12",
    monthsActive: 79,
    okved: "31.09",
  });
  assert.equal(r.documents[0].status, "fresh");
  assert.deepEqual(r.reasons, []);
  assert.deepEqual(r.holes, []);
});

test("bankruptcy is an isolated hard stop and enrichment is withheld", async () => {
  const r = await runComplianceGate(input("9900000042"));
  assert.equal(r.gate, "hard_stop");
  assert.deepEqual(r.reasons, ["COMPLIANCE_BANKRUPTCY"]);
  assert.deepEqual(r.holes, ["bankruptcy"]);
  assert.deepEqual(r.enrichment, {});
});

test("inactive company precedes FNS requests", async () => {
  const r = await runComplianceGate(input("9900000002"));
  assert.equal(r.gate, "hard_stop");
  assert.deepEqual(r.reasons, [
    "COMPLIANCE_EGRUL_INACTIVE",
    "COMPLIANCE_FNS_UNRELIABLE",
    "COMPLIANCE_FNS_TAX_DEBT",
  ]);
});

test("FNS discrepancies request clear client action", async () => {
  const r = await runComplianceGate(input("9900000041"));
  assert.equal(r.gate, "info_requested");
  assert.deepEqual(r.reasons, [
    "COMPLIANCE_FNS_UNRELIABLE",
    "COMPLIANCE_FNS_TAX_DEBT",
  ]);
  assert.deepEqual(r.holes, ["fns"]);
  assert.ok(r.checks.find((c) => c.key === "fns")?.clientText);
});

test("unavailable AML cannot pass", async () => {
  const r = await runComplianceGate(input("990000000001"));
  assert.equal(r.gate, "info_requested");
  assert.deepEqual(r.reasons, ["COMPLIANCE_SOURCE_UNAVAILABLE"]);
  assert.deepEqual(r.holes, ["aml"]);
});

test("statement expiry, unknown dates and exact TTL boundary", async () => {
  for (const [date, status, reason] of [
    ["2026-09-08", "expired", "COMPLIANCE_DOC_EXPIRED"],
    [null, "unknown", "COMPLIANCE_DOC_DATE_UNKNOWN"],
    ["invalid", "unknown", "COMPLIANCE_DOC_DATE_UNKNOWN"],
    ["2026-10-24", "unknown", "COMPLIANCE_DOC_DATE_UNKNOWN"],
    ["2026-09-23", "fresh", undefined],
    ["2026-09-22T23:59:59Z", "expired", "COMPLIANCE_DOC_EXPIRED"],
    ["2026-09-23T03:00:00+03:00", "fresh", undefined],
  ] as const) {
    const r = await runComplianceGate(input(undefined, date));
    assert.equal(r.documents[0].status, status);
    assert.deepEqual(r.reasons, reason ? [reason] : []);
    assert.deepEqual(r.holes, reason ? ["statement_fresh"] : []);
    assert.equal(r.gate, reason ? "info_requested" : "pass");
  }
});

test("TTL configuration and missing statement", async (t) => {
  setEnv(t, "STATEMENT_TTL_DAYS", "2");
  assert.equal(
    (await runComplianceGate(input())).documents[0].status,
    "expired",
  );
  setEnv(t, "STATEMENT_TTL_DAYS", "invalid");
  assert.equal((await runComplianceGate(input())).documents[0].ttlDays, 30);
  const r = await runComplianceGate({ ...input(), documents: [] });
  assert.equal(r.gate, "pass"); // Presence/confirmation belongs to P2's checklist.
});

test("missing and unknown INN produce reports rather than exceptions", async () => {
  for (const [inn, code] of [
    ["", "COMPLIANCE_INN_MISSING"],
    ["7712345678", "COMPLIANCE_EGRUL_NOT_FOUND"],
    ["123", "COMPLIANCE_EGRUL_NOT_FOUND"],
  ]) {
    const r = await runComplianceGate(input(inn));
    assert.equal(r.gate, "info_requested");
    assert.ok(r.reasons.includes(code));
    assert.ok(r.holes.includes("egrul"));
  }
});

test("all fixture INNs satisfy fail-closed and pass invariants", async () => {
  const inns = new Set<string>();
  for (const file of ["checks-mock.json", "egr-mock.json"]) {
    const rows = JSON.parse(
      readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8"),
    );
    for (const row of rows) inns.add(row.inn);
  }
  for (const inn of inns) {
    const r = await runComplianceGate(input(inn));
    if (r.checks.some((c) => c.status !== "ok"))
      assert.notEqual(r.gate, "pass", inn);
    if (r.gate === "pass") {
      assert.deepEqual(r.reasons, [], inn);
      assert.deepEqual(r.holes, [], inn);
    }
    for (const c of r.checks) {
      assert.ok(c.source && c.managerText && c.clientText, inn);
      assert.doesNotMatch(c.clientText!, /скоринг|стоп-фактор|полноценн.*AML/i);
    }
  }
});

test("gate never calls fetch even with explicit real providers and keys", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Network forbidden");
  });
  setEnv(t, "FNS_API_KEY", "x");
  setEnv(t, "DADATA_API_KEY", "y");
  for (const provider of ["", "api-fns", "dadata", "unknown"]) {
    setEnv(t, "EGR_PROVIDER", provider);
    assert.equal((await runComplianceGate(input())).gate, "pass");
  }
  assert.equal(calls, 0);
});
