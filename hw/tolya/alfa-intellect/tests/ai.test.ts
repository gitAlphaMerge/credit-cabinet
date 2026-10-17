import test from "node:test";
import assert from "node:assert/strict";
import { DemoProvider, OpenAIProvider, contextOf } from "../server/ai-provider";
import type { AppState, Message } from "../shared/types";
import { publicPreview } from "../server/preview";
import { calculate } from "../server/finance";
const state: AppState = {
  profile: {
    name: "Синтетический бизнес",
    form: "ООО",
    stage: "operating",
    registered: true,
    sector: "IT",
    ageBand: "3–5 лет",
    result: "Прибыль",
    debt: "Нет",
    intent: "",
  },
  documents: [],
  chats: [],
  selections: [],
  credit: null,
  notifications: [],
  leads: [],
  preferences: { split: 60, tourDone: true },
  financials: { freeFlow: 10000 },
};
const message = (text: string): Message => ({
  id: "1",
  role: "user",
  createdAt: "2026-10-16",
  text,
});
test("Демо явно маркируется, предупреждение основано на вычислении", async () => {
  const selection = publicPreview("ip").selections[0];
  selection.calculation = calculate({
    amount: 1000000,
    term: 24,
    rate: 24,
    flow: 10000,
  });
  const answer = await new DemoProvider().reply(
    { ...state, selections: [selection] },
    [message("Показать расчёт")],
  );
  assert.equal(answer.mode, "demo");
  assert.ok(answer.calculation);
  assert.ok(answer.warning?.includes("DSCR"));
  assert.ok(answer.calculation.dscr! < 1.25);
});
test("Обычный аккаунт без своего расчёта не получает случайный пример денег", async () => {
  const answer = await new DemoProvider().reply(state, [
    message("Как оценить кредитную нагрузку?"),
  ]);
  assert.equal(answer.calculation, undefined);
  assert.match(answer.text, /не буду подставлять/);
  const docs = await new DemoProvider().reply(state, [
    message("Какие документы нужны?"),
  ]);
  assert.match(docs.text, /Банковская выписка/);
});
test("Изменение из чата сначала предложение; исходное состояние не мутирует", async () => {
  const answer = await new DemoProvider().reply(state, [
    message("поток теперь 200 000"),
  ]);
  assert.deepEqual(answer.proposal, { field: "freeFlow", value: 200000 });
  assert.equal(state.financials.freeFlow, 10000);
});
test("Responses adapter: серверный инструмент считает и возвращает результат без платного запроса", async () => {
  const original = globalThis.fetch,
    oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-test-key";
  let calls = 0,
    budget = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 1800);
    if (calls === 2) {
      assert.ok(body.input.some((x: any) => x.type === "function_call_output"));
    }
    return new Response(
      JSON.stringify({
        id: "response_test_" + calls,
        object: "response",
        created_at: 1,
        model: "gpt-5.4-mini",
        status: "completed",
        output:
          calls === 1
            ? [
                {
                  type: "function_call",
                  id: "fc_1",
                  call_id: "call_1",
                  name: "calculate_financing",
                  arguments: JSON.stringify({
                    amount: 120000,
                    term: 12,
                    rate: 0,
                    flow: 10000,
                    existing: 0,
                  }),
                },
              ]
            : [
                {
                  type: "message",
                  id: "msg_1",
                  role: "assistant",
                  content: [
                    {
                      type: "output_text",
                      text: "Платёж рассчитан программно.",
                      annotations: [],
                    },
                  ],
                },
              ],
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const result = await new OpenAIProvider(() => budget++).reply(state, [
      message("Посчитай 120000 на 12 месяцев без процентов"),
    ]);
    assert.equal(result.mode, "live");
    assert.equal(result.calculation?.monthlyPayment, 10000);
    assert.equal(result.text, "Платёж рассчитан программно.");
    assert.equal(calls, 2);
    assert.equal(budget, 2);
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
