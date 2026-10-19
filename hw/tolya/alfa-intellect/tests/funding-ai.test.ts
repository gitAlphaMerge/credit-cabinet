import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIProvider } from "../server/ai-provider";
import { transparentFundingEngine } from "../server/funding-engine";
import { blankFundingRequest } from "../shared/financing";
import type { AppState, Selection } from "../shared/types";
test("LLM integration: proposal uses the selected instrument's server calculator; no writes or paid calls", async () => {
  const s: AppState = {
    profile: {
      name: "Синтетический бизнес",
      form: "ООО",
      stage: "operating",
      registered: true,
      sector: "Услуги",
      ageBand: "3–5 лет",
      result: "Прибыль",
      debt: "Есть",
      intent: "Подбор",
    },
    documents: [],
    chats: [],
    selections: [],
    credit: null,
    notifications: [],
    leads: [],
    preferences: { split: 60, tourDone: true },
    financials: {},
  };
  const result = transparentFundingEngine.evaluate(
      {
        ...blankFundingRequest(),
        financials: { flow: 400000, existing: 10000 },
      },
      s,
    ),
    selection: Selection = {
      ...result,
      id: "funding-mock",
      version: 2,
      createdAt: new Date().toISOString(),
      versions: [],
    };
  s.selections = [selection];
  const before = JSON.stringify(s),
    original = globalThis.fetch,
    oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-no-live-key";
  let calls = 0,
    budget = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    if (calls === 1)
      assert.ok(body.tools.some((t: any) => t.name === "propose_financing"));
    if (calls === 2) {
      const output = body.input.find(
          (x: any) => x.type === "function_call_output",
        ),
        value = JSON.parse(output.output);
      assert.equal(value.assessment.selectedId, "overdraft");
      assert.equal(value.calculation.schedule.length, 1);
      assert.equal(value.calculation.amount, 700000);
      assert.equal(value.pendingConfirmation, true);
    }
    return new Response(
      JSON.stringify({
        id: "mock_" + calls,
        object: "response",
        created_at: 1,
        model: "synthetic",
        status: "completed",
        output:
          calls === 1
            ? [
                {
                  type: "function_call",
                  id: "f",
                  call_id: "call",
                  name: "propose_financing",
                  arguments: JSON.stringify({
                    amount: 700000,
                    term: 12,
                    productId: "overdraft",
                  }),
                },
              ]
            : [
                {
                  type: "message",
                  id: "m",
                  role: "assistant",
                  content: [
                    {
                      type: "output_text",
                      text: "Подготовлено предложение. Сохранение после подтверждения.",
                      annotations: [],
                    },
                  ],
                },
              ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const answer = await new OpenAIProvider(() => budget++).reply(
      s,
      [
        {
          id: "u",
          role: "user",
          text: "Сравни овердрафт 700000",
          createdAt: new Date().toISOString(),
        },
      ],
      selection.id,
    );
    assert.deepEqual(answer.fundingProposal, {
      selectionId: selection.id,
      expectedVersion: 2,
      amount: 700000,
      term: 12,
      productId: "overdraft",
    });
    assert.equal(calls, 2);
    assert.equal(budget, 2);
    assert.equal(JSON.stringify(s), before);
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
