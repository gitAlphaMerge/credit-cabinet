import test from "node:test";
import assert from "node:assert/strict";
import { products, productTerms, defaultContractDetails, questionnaireInputSchema, initialQuestionnaire } from "../shared/mvp2";
import { contractParagraphs, renderContractPdf } from "../server/mvp2-contracts";
import type { MvpApplication, OnboardingAnswers, ProductId } from "../shared/mvp2";

const answers: OnboardingAnswers = {
  industry: "Производство", age: "Более 3 лет", purpose: "Текущие расходы",
  amountRange: "1–3 млн ₽", term: 12, usage: "Всё сразу", repayment: "Регулярная выручка",
};
function application(form: "ИП" | "ООО", productId: ProductId = "WORKING", days = 30): MvpApplication {
  const inn = form === "ИП" ? "990000000001" : "9900000001";
  const company = {
    inn, form, name: form === "ИП" ? "ИП Синтетический Алексей Примерович" : "ООО «Мок Мастерская»",
    director: "Синтетическая Анна Директорова", ogrnip: "321990000000001",
    status: "ACTIVE", source: "синтетические данные (мок)", demo: true,
  };
  const product = products.find((item) => item.id === productId)!;
  const questionnaire = {
    ...initialQuestionnaire(answers), productId, amount: 1000000,
    term: product.kind === "overdraft" ? 12 : product.minTerm,
    overdraftRepaymentDays: days as 30 | 60 | 90,
    ...defaultContractDetails(company, []),
  };
  return {
    id: "00000000-0000-0000-0000-000000000000", businessId: "client", version: 1,
    onboarding: answers, recommendedProductId: productId, questionnaire, company,
    lifecycle: "DECIDED", decision: "APPROVED", reasons: [], missing: [],
    alternatives: [], stages: [], provenance: {}, createdAt: "2026-10-26T00:00:00Z",
    updatedAt: "2026-10-26T00:00:00Z",
    contract: { number: "MVP-TEST", date: "2026-10-26", hash: "", version: 1 },
  };
}

test("IP and LLC contract details derive from company data without manual input", () => {
  const ip = application("ИП");
  const llc = application("ООО");
  assert.equal(ip.questionnaire.signatory, "Синтетический Алексей Примерович");
  assert.match(ip.questionnaire.authority, /ЕГРИП.*321990000000001/);
  assert.equal(llc.questionnaire.signatory, "Синтетическая Анна Директорова");
  assert.equal(llc.questionnaire.authority, "Устава");
  for (const a of [ip, llc]) {
    assert.match(a.questionnaire.receivingAccount, /^\d{20}$/);
    assert.equal(a.questionnaire.receivingBank, "АО «Альфа-Банк»");
    assert.match(contractParagraphs(a).join(" "), new RegExp(a.questionnaire.signatory));
  }
  const actual = defaultContractDetails(llc.company!, [
    { bank: "Альфа-Банк", number: "40702810000000000001" },
  ]);
  assert.equal(actual.receivingAccount, "40702810000000000001");
});

test("MVP2 terms use product grid and overdraft day grid", () => {
  assert.deepEqual(productTerms(products.find((p) => p.id === "WORKING")!), [6, 12, 18, 24]);
  assert.deepEqual(productTerms(products.find((p) => p.id === "OVERDRAFT")!), [12]);
  for (const days of [30, 60, 90]) {
    const a = application("ИП", "OVERDRAFT", days);
    assert.match(contractParagraphs(a).join(" "), new RegExp(`не позднее ${days} дней`));
    assert.equal(questionnaireInputSchema.safeParse(a.questionnaire).success, true);
  }
  assert.equal(questionnaireInputSchema.safeParse(application("ИП", "OVERDRAFT", 45).questionnaire).success, false);
  const bad = application("ИП");
  bad.questionnaire.term = 7;
  assert.equal(questionnaireInputSchema.safeParse(bad.questionnaire).success, false);
});

test("contract paragraphs have no em dash and bundled font renders on Windows", async () => {
  const a = application("ООО", "REFI");
  assert.ok(contractParagraphs(a).every((paragraph) => !paragraph.includes("\u2014")));
  const previous = process.env.CONTRACT_FONT;
  delete process.env.CONTRACT_FONT;
  try {
    const pdf = await renderContractPdf(a, "contract");
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  } finally {
    if (previous === undefined) delete process.env.CONTRACT_FONT;
    else process.env.CONTRACT_FONT = previous;
  }
});
