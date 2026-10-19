import type { Calculation } from "./types";

export const fundingPurposes = [
  "Оборотные средства",
  "Закупка товаров и материалов",
  "Оборудование",
  "Развитие",
  "Кассовый разрыв",
  "Исполнение контракта",
  "Рефинансирование",
  "Запуск",
  "Другая цель",
] as const;
export type FundingPurpose = (typeof fundingPurposes)[number];
export type Usage = "once" | "parts" | "regular";
export const fundingDetailKeys = [
  "frequency",
  "receiptsDate",
  "purchaseCost",
  "effect",
  "projectCost",
  "ownFunds",
  "expenseDate",
  "confidence",
  "contractAmount",
  "contractCosts",
  "currentBalance",
  "currentRate",
  "currentPayment",
  "currentMonths",
  "debtIncluded",
  "recordSource",
  "other",
  "cycleManual",
] as const;
export type FundingRequest = {
  purpose: FundingPurpose;
  amount: number;
  term: number | null;
  needed: "urgent" | "month" | "later" | "date";
  neededDate?: string;
  usage: Usage;
  description: string;
  repayFrom: string;
  productId?: string;
  cycleDays: number;
  details: Record<string, string | number | boolean | null>;
  financials: Partial<Record<FinancialKey, number | null>>;
};
export type FinancialKey =
  "incoming" | "expenses" | "flow" | "existing" | "available" | "changes";
export const financialLabels: Record<FinancialKey, string> = {
  incoming: "Месячные поступления",
  expenses: "Обязательные расходы в месяц",
  flow: "Свободный операционный поток",
  existing: "Действующие платежи в месяц",
  available: "Доступные свободные деньги",
  changes: "Ожидаемое изменение потока в месяц",
};
export type FundingDatum = {
  key: FinancialKey;
  value: number | null;
  source: string;
  period: string;
  asOf: string;
  currency: "RUB";
  kind: "fact" | "manual" | "forecast";
  confirmed: boolean;
  stale?: boolean;
  conflict?: boolean;
};
export type FundingCheck = {
  label: string;
  state: "met" | "unmet" | "unknown";
  detail: string;
};
export type FundingAssessment = {
  cycleDays?: number;
  engine: "transparent-mvp-2";
  recommendedId: string;
  selectedId: string;
  level: "Ориентировочная" | "Предварительно обоснованная" | "Расширенная";
  decision: "consider" | "reduce" | "unnecessary" | "rethink" | "insufficient";
  title: string;
  data: FundingDatum[];
  checks: FundingCheck[];
  missing: string[];
  reasons: string[];
  assumptions: string[];
  alternatives: { id: string; name: string; reason: string }[];
  peakPayment: number;
  finalPayment: number;
  paymentLabel: string;
  existingAfter: number | null;
  flow: number | null;
  capacity: number | null;
  dscr: number | null;
  stressDscr: number | null;
  paybackMonths: number | null;
  formula: string[];
  catalogVersion: string;
};
export type FundingVersion = {
  version: number;
  createdAt: string;
  input?: FundingRequest;
  assessment?: FundingAssessment;
  calculation: Calculation;
  product: string;
  status: string;
};
export const blankFundingRequest = (): FundingRequest => ({
  purpose: "Оборудование",
  amount: 3000000,
  term: null,
  needed: "month",
  usage: "once",
  description: "",
  repayFrom: "Текущая деятельность",
  cycleDays: 30,
  details: {},
  financials: {},
});

export type FundingProduct = {
  id: string;
  name: string;
  kind: "loan" | "line" | "overdraft";
  purposes: readonly string[];
  rate: number;
  min: number;
  max: number;
  term: number;
  minAge: number;
  forms: readonly string[];
  source: string;
  version: string;
  verifiedAt: string;
  rateKind: "scenario";
};
/** Existing project catalogue, normalised; none of these are verified bank offers. */
export const fundingCatalog: FundingProduct[] = [
  {
    id: "working",
    name: "Оборотный кредит",
    kind: "loan",
    purposes: [
      "Оборотные средства",
      "Закупка товаров и материалов",
      "Развитие",
    ],
    rate: 24,
    max: 15000000,
    term: 36,
  },
  {
    id: "investment",
    name: "Инвестиционный кредит",
    kind: "loan",
    purposes: ["Оборудование", "Развитие", "Запуск"],
    rate: 22,
    max: 50000000,
    term: 84,
  },
  {
    id: "contract",
    name: "Кредитная линия под контракт",
    kind: "line",
    purposes: [
      "Исполнение контракта",
      "Закупка товаров и материалов",
      "Оборотные средства",
    ],
    rate: 23,
    max: 20000000,
    term: 36,
  },
  {
    id: "overdraft",
    name: "Овердрафт",
    kind: "overdraft",
    purposes: ["Кассовый разрыв", "Оборотные средства"],
    rate: 26,
    max: 3000000,
    term: 12,
  },
  {
    id: "refinance",
    name: "Рефинансирование",
    kind: "loan",
    purposes: ["Рефинансирование"],
    rate: 23,
    max: 10000000,
    term: 60,
  },
].map((p) => ({
  ...p,
  kind: p.kind as FundingProduct["kind"],
  min: 10000,
  minAge: 12,
  forms: ["ИП", "ООО"],
  source: "Синтетический каталог проекта, не предложение банка",
  version: "demo-1",
  verifiedAt: "2026-10-16",
  rateKind: "scenario",
}));

export const requirementText = (state: FundingCheck["state"]) =>
  ({ met: "Выполнено", unmet: "Не выполнено", unknown: "Нужно уточнить" })[
    state
  ];

export function fundingWarningRequired(item: {
  assessment?: FundingAssessment;
  risks: string[];
}) {
  return (
    !!item.assessment &&
    (item.risks.length > 0 ||
      ["reduce", "unnecessary", "rethink"].includes(item.assessment.decision) ||
      item.assessment.checks.some((c) => c.state === "unmet"))
  );
}
