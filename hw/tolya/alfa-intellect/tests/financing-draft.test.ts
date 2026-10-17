import test from "node:test";
import assert from "node:assert/strict";
import {
  readFinancingDraft,
  writeFinancingDraft,
  clearFinancingDraft,
  type FinancingDraft,
} from "../src/financing-draft";
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}
const draft: FinancingDraft = {
  tab: "new",
  step: 2,
  selected: null,
  parentId: "own-selection",
  form: {
    purpose: "Оборудование",
    amount: 2500000,
    term: 48,
    repayFrom: "Оплата по контракту",
    ownFunds: 200000,
    flow: "420000",
    existing: "",
  },
};
test("Черновик восстанавливает шаг, параметры и версию после reload", () => {
  const s = memoryStorage();
  assert.equal(writeFinancingDraft(s, "user-a", draft, 1000), true);
  assert.deepEqual(readFinancingDraft(s, "user-a", 2000), draft);
});
test("Черновики изолированы по аккаунту и удаляются при выходе", () => {
  const s = memoryStorage();
  writeFinancingDraft(s, "user-a", draft);
  assert.deepEqual(readFinancingDraft(s, "user-b"), {});
  writeFinancingDraft(s, "user-b", { step: 0 });
  clearFinancingDraft(s, "user-a");
  assert.deepEqual(readFinancingDraft(s, "user-a"), {});
  assert.deepEqual(readFinancingDraft(s, "user-b"), { step: 0 });
});
test("Повреждённое, устаревшее или неизвестное хранилище сбрасывается безопасно", () => {
  for (const raw of [
    "{",
    "null",
    JSON.stringify({ version: 2 }),
    JSON.stringify({ version: 1, savedAt: 1000, draft: { step: 99 } }),
  ]) {
    const s = memoryStorage();
    s.setItem("alfa:financing-draft:v1:user", raw);
    assert.deepEqual(readFinancingDraft(s, "user", 2000), {});
    assert.equal(s.items.size, 0);
  }
  const s = memoryStorage();
  writeFinancingDraft(s, "user", draft, 1000);
  assert.deepEqual(readFinancingDraft(s, "user", 1000 + 86400001), {});
});
test("Недоступное хранилище не ломает анкету, лишние данные не сохраняются", () => {
  const blocked = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
  assert.equal(writeFinancingDraft(blocked, "user", draft), false);
  assert.deepEqual(readFinancingDraft(blocked, "user"), {});
  assert.doesNotThrow(() => clearFinancingDraft(blocked, "user"));
  const s = memoryStorage();
  writeFinancingDraft(s, "user", {
    ...draft,
    password: "never-persist",
  } as FinancingDraft);
  assert.ok(![...s.items.values()][0].includes("never-persist"));
  assert.equal(
    writeFinancingDraft(s, "user", {
      ...draft,
      form: { ...draft.form!, amount: NaN },
    }),
    false,
  );
});
