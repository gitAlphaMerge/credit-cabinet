import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  customer,
  healthyCore,
  store,
  seed,
  configure,
  prepare,
  submit,
} from "./q2-harness";
const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
  store.db.close();
});

for (const fault of ["missing", "string-limit", "negative-limit"] as const) {
  test(`BUG: team-score must reject ${fault} upstream payload instead of HTTP 200`, async () => {
    const owner = await customer(),
      value: any = fault === "missing" ? {} : healthyCore();
    if (fault !== "missing")
      value.core.limit_now_rub = fault === "string-limit" ? "1000000" : -1;
    globalThis.fetch = async () => Response.json(value);
    const response = await owner.agent
      .post("/api/team-score")
      .set("Cookie", owner.cookie)
      .send({
        statement_csv: "date,amount,counterparty,purpose\n2026-10-22,10,c,p",
        need: {},
        questionnaire: {},
      });
    assert.ok(
      response.status >= 500 && response.status < 600,
      `seed=${seed}: received ${response.status} ${JSON.stringify(response.body)}`,
    );
  });
}

test("BUG: upstream exception must not expose confidential values in server journal", async () => {
  const owner = await customer(),
    id = await prepare(owner);
  configure();
  globalThis.fetch = async () => {
    throw new Error("SECRET_Q2 account=12345678901234567890");
  };
  const originalError = console.error,
    logs: string[] = [];
  console.error = (...args) => {
    logs.push(args.join(" "));
  };
  try {
    await submit(owner, id).expect(503);
    assert.ok(logs.length > 0, `seed=${seed}`);
    assert.doesNotMatch(
      logs.join("\n"),
      /SECRET_Q2|12345678901234567890/,
      `seed=${seed}`,
    );
  } finally {
    console.error = originalError;
  }
});
