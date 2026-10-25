import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientDossier } from "../src/ClientDossier";
import { CompanyCard, companyAge } from "../src/CompanyCard";
import {
  initialQuestionnaire,
  products,
  type MvpApplication,
} from "../shared/mvp2";
const answers = {
  industry: "Производство",
  age: "Более 3 лет",
  purpose: "Текущие расходы",
  amountRange: "1–3 млн ₽",
  amount: 2345678,
  term: 12,
  usage: "Всё сразу",
  repayment: "Регулярная выручка",
};
const company = {
  inn: "9900000001",
  name: "ООО «Мок Мастерская»",
  form: "ООО",
  registeredAt: "2020-03-12",
  okved: "31.09",
  activity: "Производство мебели",
  status: "ACTIVE",
  source: "синтетический реестр",
  region: "г. Москва",
};
test("Company card uses only supplied registry facts and calculates age by completed months", () => {
  const html = renderToStaticMarkup(<CompanyCard company={company} />);
  for (const fact of ["31.09", "Производство мебели", "г. Москва", "Действует"])
    assert.ok(html.includes(fact));
  assert.equal(companyAge("2020-03-12", new Date("2026-10-11")), "6 г. 6 мес.");
  assert.equal(companyAge(undefined), null);
  assert.equal(companyAge("2030-01-01", new Date("2026-10-25")), null);
});
test("Client dossier has four editable cards and excludes inactive financial/product branches", () => {
  const q = {
    ...initialQuestionnaire(answers),
    loans: "no" as const,
    leasing: "no" as const,
    projectCost: 999999,
    monthlyDebt: 999999,
  };
  const application = {
    id: "test",
    onboarding: answers,
    questionnaire: q,
    company,
    lifecycle: "DRAFT",
  } as MvpApplication;
  const html = renderToStaticMarkup(
    <ClientDossier
      application={application}
      products={products}
      statements={[]}
      editable
      onEdit={() => {}}
    />,
  );
  assert.equal((html.match(/class="dossier-card"/g) || []).length, 4);
  assert.equal((html.match(/>Изменить<\/button>/g) || []).length, 4);
  for (const omitted of [
    "Стоимость проекта",
    "Платёж по кредитам",
    "План траншей",
    "oldRate",
    "Не запрашивался",
  ])
    assert.ok(!html.includes(omitted), omitted);
  assert.ok(html.includes("Выписка не загружена"));
  assert.ok(html.includes("Дополнительные сведения заявки"));
});
