import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import type { DatabaseSync } from "node:sqlite";
import {
  a,
  fixture,
  offerOf,
  AT,
  buildAlternatives,
  liveInstrumentAssertion,
} from "./q4-review-harness";
import { runComplianceGate } from "../../server/compliance";
import { TeamAgentProvider } from "../../server/ai-provider";

let db: DatabaseSync;
before(async () => {
  process.env.DATABASE_PATH = ":memory:";
  ({ db } = await import("../../server/store"));
});
after(() => db?.close());

test("#1 unchanged evidence yields one system offer and version CAS denies replay", async () => {
  const f = fixture(db);
  const stale = f.command("submit", { consent: true });
  await f.submit();
  assert.equal(a.applicationOf(db, f.id).status, "offered");
  assert.deepEqual(
    a
      .eventsOf(db, f.id)
      .slice(1)
      .map((e) => e.actor_role),
    ["system", "system", "system"],
  );
  await assert.rejects(a.transitionApplication(db, stale, f.deps), {
    status: 409,
  });
  assert.equal(
    a.eventsOf(db, f.id).filter((e) => e.event === "make_offer").length,
    1,
  );
});

test("#4 accepted alternative amount and term are rescored, foreign option rejected", async () => {
  const f = fixture(db, 900000, "кассовый разрыв");
  await f.submit();
  await assert.rejects(
    a.transitionApplication(
      db,
      f.command("accept_alternative", { option_id: "foreign" }),
      f.deps,
    ),
    { status: 422 },
  );
  await a.transitionApplication(
    db,
    f.command("accept_alternative", { option_id: "q4-option" }),
    f.deps,
  );
  assert.equal(f.seen.at(-1).need.amount_rub, 300000);
  assert.equal(f.seen.at(-1).need.term_months, 6);
  assert.equal(offerOf(db, f.id).amount, 300000);
  assert.equal(offerOf(db, f.id).term_months, 6);
});

test("#7 confirmed stale evidence blocks, fresh evidence passes", async () => {
  for (const [documentDate, expected] of [
    ["2026-10-22", "pass"],
    ["2020-01-01", "info_requested"],
  ]) {
    const r = await runComplianceGate({
      inn: "9900000001",
      now: AT,
      documents: [{ category: "statement", confirmed: true, documentDate }],
    });
    assert.equal(r.gate, expected);
    assert.equal(
      r.reasons.includes("COMPLIANCE_DOC_EXPIRED"),
      expected !== "pass",
    );
  }
});

test("#9 canonical goals produce bounded catalogue alternatives", async () => {
  for (const purpose of ["рост", "закупка под контракт"]) {
    const options = buildAlternatives({
      amount_rub: 900000,
      term_months: 12,
      purpose,
      form: "ООО",
      months_active: 79,
      limit_now_rub: 400000,
      core_instrument: "ALFA_LUMP_UNSEC",
      core_status: "можно подавать",
    });
    assert.ok(options.length > 0 && options.length <= 3);
    for (const option of options) assert.ok(option.amount_rub <= 400000);
  }
});

test("#11 adapter supports explicit application context and drops profile PII", async (t) => {
  const f = fixture(db);
  const messages = [
    {
      id: "q4-message",
      role: "user" as const,
      text: "Не согласен",
      createdAt: AT.toISOString(),
    },
  ];
  f.state.chats.push({ id: "q4-chat", messages, title: "q4" });
  let payload: any;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      payload = JSON.parse(String(init.body));
      return Response.json({
        text: "Обсудим условия?",
        objections_summary: "Не согласен",
      });
    },
  );
  const answer = await new TeamAgentProvider("http://q4-agent.invalid").reply(
    f.state,
    messages,
    undefined,
    {
      application: { id: f.id, status: "info_requested", holes: ["statement"] },
      mode: "objections",
    },
  );
  assert.equal(payload.card.application.id, f.id);
  assert.equal(payload.mode, "objections");
  assert.equal(answer.objections_summary, "Не согласен");
  for (const privateValue of [f.state.profile.name, f.state.profile.inn!])
    assert.ok(!JSON.stringify(payload).includes(privateValue));
});

test("#15 live helper accepts its legacy scalar oracle and rejects wrong instrument", () => {
  liveInstrumentAssertion("ALFA_OVERDRAFT", "ALFA_OVERDRAFT");
  assert.throws(() =>
    liveInstrumentAssertion("ALFA_OVERDRAFT", "ALFA_LUMP_UNSEC"),
  );
});

test("#12 structured PII redaction mutations killed in production eventPayload", () => {
  const source = readFileSync(
    new URL("../../server/applications.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function eventPayload(");
  const end = source.indexOf("\nfunction persistTransition(", start);
  assert.ok(start >= 0 && end > start);
  const fragment = source.slice(start, end);
  const payload = {
    inn: "771234567890",
    ordinary: "keep",
    nested: { phone: "79991234567", memo: "keep" },
    documents: [{ passport: "4509123456", safe: true }],
  };
  const expected = {
    ordinary: "keep",
    nested: { memo: "keep" },
    documents: [{ safe: true }],
  };
  const oracle = (text: string) => {
    const js = stripTypeScriptTypes(text);
    const result = vm.runInNewContext(js + "\neventPayload(payload)", {
      payload,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), expected);
  };
  oracle(fragment);
  for (const [name, old, replacement] of [
    [
      "inn-key",
      '"phone", "inn", "passport", "email"',
      '"phone", "passport", "email"',
    ],
    ["array-recursion", "return value.map(eventPayload)", "return value"],
    ["object-recursion", "[key, eventPayload(item)]", "[key, item]"],
  ]) {
    assert.ok(fragment.includes(old), name);
    assert.throws(() => oracle(fragment.replace(old, replacement)), name);
    const line = source
      .slice(0, start + fragment.indexOf(old))
      .split("\n").length;
    console.log(`Q4_MUTATION=applications.ts:${line} ${name} killed`);
  }
});
