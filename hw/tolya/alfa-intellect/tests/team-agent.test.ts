import test from "node:test";
import assert from "node:assert/strict";
import { TeamAgentProvider, createAIProvider, contextOf } from "../server/ai-provider";
import type { AppState, Message } from "../shared/types";

const state: AppState = {
  profile: { name: "Secret Company", form: "ООО", stage: "operating", registered: true, sector: "IT", ageBand: "3–5 лет", result: "Прибыль", debt: "Нет", intent: "", inn: "1234567890" },
  documents: [{ id: "d", category: "statement", name: "secret.csv", period: "2026-01", fields: { raw: "PRIVATE RAW" }, confirmed: true, createdAt: "2026-01-01", currency: "RUB", mime: "text/csv" }],
  chats: [], selections: [], credit: null, notifications: [], leads: [], preferences: { split: 60, tourDone: true }, financials: { existing: 12000 },
};
const message: Message = { id: "m", role: "user", text: "Помогите", createdAt: "2026-01-01" };
const history = [message];
state.chats = [{ id: "chat-123", title: "Тест", messages: history }];

test("provider priority: team agent, OpenAI, demo", () => {
  assert.ok(createAIProvider({ TEAM_AGENT_URL: "http://agent", OPENAI_API_KEY: "key" }) instanceof TeamAgentProvider);
  assert.equal(createAIProvider({ OPENAI_API_KEY: "key" }).constructor.name, "OpenAIProvider");
  assert.equal(createAIProvider({}).constructor.name, "DemoProvider");
});

test("team response reaches chat and sends only an allowlisted card", async () => {
  const original = globalThis.fetch;
  state.selections = [{ id: "selection", version: 1, createdAt: "2026-01-01", purpose: "оборудование", repayFrom: "заказчик", ownFunds: 0, product: "Лизинг", calculation: { amount: 500000, term: 12, schedule: [] }, risks: [], alternatives: [], status: "ready" } as any];
  let sent: any;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ text: "Уточните выписку?", status: "ready", view: {} }), { status: 200 });
  }) as typeof fetch;
  try {
    const answer = await new TeamAgentProvider("http://agent").reply(state, history, "selection");
    assert.equal(answer.mode, "team-agent");
    assert.equal(answer.text, "Уточните выписку?");
    assert.equal(sent.session_id, "chat-123");
    assert.deepEqual({ purpose: sent.card.purpose, amount_rub: sent.card.amount_rub, term_months: sent.card.term_months, instrument: sent.card.instrument }, { purpose: "оборудование", amount_rub: 500000, term_months: 12, instrument: "Лизинг" });
    const privatePayload = JSON.stringify(sent.card);
    for (const value of ["1234567890", "Secret Company", "Ivan", "secret.csv", "PRIVATE RAW", "inn", "name"])
      assert.ok(!privatePayload.includes(value));
    assert.deepEqual(sent.card.documents, [{ category: "statement", period: "2026-01" }]);
  } finally { globalThis.fetch = original; }
});

test("team agent network failure is an honest offline answer", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  try {
    const answer = await new TeamAgentProvider("http://agent").reply(state, history);
    assert.equal(answer.mode, "agent-offline");
    assert.match(answer.text, /Ассистент сейчас недоступен, попробуйте через минуту/);
  } finally { globalThis.fetch = original; }
});
