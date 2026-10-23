import test from "node:test";
import assert from "node:assert/strict";
import { businessAge } from "../../server/applications";

// Решение 23.10 (Q4 #8): реестр главнее анкеты; словарь ядра
// services/ml-model/core.py:198,284 ("меньше года", "1–3").
test("F8 registry months win over the questionnaire band", () => {
  const age = businessAge("Менее года", 79);
  assert.equal(age.source, "registry");
  assert.equal(age.years, "5–10");
  assert.equal(age.mismatch, true);
});

test("F8 no registry: questionnaire band mapped to core vocabulary and marked", () => {
  assert.deepEqual(businessAge("Менее года"), {
    years: "меньше года", source: "questionnaire", months: null, mismatch: false,
  });
  assert.equal(businessAge("1–3 года").years, "1–3");
  assert.equal(businessAge("Менее 3 месяцев").years, "меньше года");
  assert.equal(businessAge("3–5 лет", Number.NaN).source, "questionnaire");
});

test("F8 mismatch only beyond 12 months outside the declared band", () => {
  assert.equal(businessAge("1–3 года", 40).mismatch, false);
  assert.equal(businessAge("1–3 года", 49).mismatch, true);
  assert.equal(businessAge("1–3 года", 5).mismatch, false);
  assert.equal(businessAge("3–5 лет", 5).mismatch, true);
  assert.equal(businessAge("", 20).mismatch, false);
});

test("F8 young business by registry reaches the core as TOO_YOUNG vocabulary", () => {
  assert.equal(businessAge("5–10 лет", 4).years, "меньше года");
  assert.equal(businessAge("Более 10 лет", 0).years, "меньше года");
  assert.equal(businessAge(undefined, -3).months, 0);
});
