import { z } from "zod";
export const productIds = [
  "WORKING",
  "INVEST",
  "RCL",
  "NCL",
  "OVERDRAFT",
  "REFI",
] as const;
export type ProductId = (typeof productIds)[number];
export type Product = {
  id: ProductId;
  name: string;
  rate: number;
  min: number;
  max: number;
  minTerm: number;
  maxTerm: number;
  kind: "loan" | "line" | "overdraft";
  description: string;
  repayment: string;
};
/** Single catalog. Server validates all submitted terms against this source. Synthetic, not bank tariffs. */
export const products: Product[] = [
  {
    id: "WORKING",
    name: "Оборотный кредит",
    rate: 23.5,
    min: 300000,
    max: 5000000,
    minTerm: 6,
    maxTerm: 24,
    kind: "loan",
    description: "Разовая сумма на текущую деятельность и закупки",
    repayment: "Ежемесячные платежи по графику",
  },
  {
    id: "INVEST",
    name: "Инвестиционный кредит",
    rate: 22,
    min: 500000,
    max: 7000000,
    minTerm: 12,
    maxTerm: 60,
    kind: "loan",
    description: "Оборудование, транспорт и расширение бизнеса",
    repayment: "Ежемесячные платежи по графику",
  },
  {
    id: "RCL",
    name: "Возобновляемая кредитная линия",
    rate: 24,
    min: 500000,
    max: 5000000,
    minTerm: 6,
    maxTerm: 24,
    kind: "line",
    description: "Регулярная выборка и возврат в пределах лимита",
    repayment: "Возвращённый основной долг восстанавливает доступный лимит",
  },
  {
    id: "NCL",
    name: "Невозобновляемая кредитная линия",
    rate: 23,
    min: 500000,
    max: 7000000,
    minTerm: 12,
    maxTerm: 36,
    kind: "line",
    description: "Финансирование проекта отдельными траншами",
    repayment: "Лимит выдачи не восстанавливается после возврата",
  },
  {
    id: "OVERDRAFT",
    name: "Овердрафт",
    rate: 26,
    min: 300000,
    max: 2000000,
    minTerm: 1,
    maxTerm: 12,
    kind: "overdraft",
    description: "Короткий кассовый разрыв до поступления выручки",
    repayment:
      "Каждое использование — до 60 дней; проценты на фактический долг",
  },
  {
    id: "REFI",
    name: "Рефинансирование",
    rate: 22.5,
    min: 300000,
    max: 5000000,
    minTerm: 12,
    maxTerm: 48,
    kind: "loan",
    description: "Целевое финансирование для замены действующего кредита",
    repayment:
      "Ежемесячные платежи; внешний кредит не считается автоматически погашенным",
  },
];
export const industries = [
  "Торговля и маркетплейсы",
  "Услуги",
  "Строительство",
  "Производство",
  "Общепит",
  "Логистика и транспорт",
  "IT",
  "Сельское хозяйство",
  "Другое",
];
export const ages = [
  "Менее 6 месяцев",
  "6–12 месяцев",
  "1–3 года",
  "Более 3 лет",
  "Зарегистрирован, ещё не работает",
];
export const purposes = [
  "Закупки",
  "Текущие расходы",
  "Кассовый разрыв",
  "Оборудование/транспорт",
  "Ремонт/новая точка",
  "Контракт",
  "Рефинансирование",
  "Не определился",
];
export const ranges = [
  "До 300 тыс. ₽",
  "300–500 тыс. ₽",
  "500 тыс.–1 млн ₽",
  "1–3 млн ₽",
  "3–5 млн ₽",
  "5–7 млн ₽",
  "Более 7 млн ₽",
  "Не знаю",
];
export const uses = [
  "Всё сразу",
  "Частями",
  "Многократная выборка и возврат",
  "До ближайшего поступления",
  "Не знаю",
];
export const repayments = [
  "Регулярная выручка",
  "Продажи/работы",
  "Оплата контракта",
  "Новый проект",
  "Другое",
  "Не знаю",
];
const text = z.string().trim().max(500);
const rub = z.number().finite().min(0).max(1e12);
const tri = z.enum(["yes", "no", "unknown"]);
export const onboardingSchema = z
  .object({
    industry: z.enum(industries as [string, ...string[]]),
    age: z.enum(ages as [string, ...string[]]),
    purpose: z.enum(purposes as [string, ...string[]]),
    amountRange: z.enum(ranges as [string, ...string[]]),
    term: z.number().int().min(1).max(60),
    usage: z.enum(uses as [string, ...string[]]),
    repayment: z.enum(repayments as [string, ...string[]]),
  })
  .strict();
export type OnboardingAnswers = z.infer<typeof onboardingSchema>;
export const questionnaireSchema = z
  .object({
    inn: z
      .string()
      .regex(/^(\d{10}|\d{12})$/)
      .or(z.literal("")),
    companyConfirmed: z.boolean(),
    registryError: text,
    authorized: z.boolean(),
    consents: z
      .object({
        registry: z.boolean(),
        financial: z.boolean(),
        bki: z.boolean(),
      })
      .strict(),
    actualIndustry: text,
    accounts: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            bank: text,
            number: z.string().max(40),
            documentId: z.string().max(100),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    complete: tri,
    outsideType: text,
    outsideIn: rub.nullable(),
    outsideOut: rub.nullable(),
    loans: tri,
    debt: rub.nullable(),
    monthlyDebt: rub.nullable(),
    balloon: rub.nullable(),
    balloonPeriod: text,
    leasing: z.enum(["yes", "no"]),
    monthlyLeasing: rub.nullable(),
    debtReconciled: z.boolean(),
    seasonality: tri,
    future: z.enum(["none", "income", "expense", "both", "unknown"]),
    futureIn: rub.nullable(),
    futureOut: rub.nullable(),
    futurePeriod: text,
    purpose: text,
    amount: z.number().int().positive().max(1e12),
    term: z.number().int().min(1).max(120),
    neededAt: text,
    productId: z.enum(productIds),
    usage: text,
    repayment: text,
    projectCost: rub.nullable(),
    economicEffect: rub.nullable(),
    cycleDays: z.number().int().min(1).max(365).nullable(),
    tranches: text,
    oldRate: z.number().min(0).max(100).nullable(),
    oldPayment: rub.nullable(),
    oldBalance: rub.nullable(),
    signatory: text,
    authority: text,
    receivingAccount: z.string().max(40),
    receivingBank: text,
    customerContractAmount: z
      .number()
      .finite()
      .min(0)
      .max(99999999999)
      .nullable()
      .default(null),
    customerContractMonths: z
      .number()
      .int()
      .min(1)
      .max(120)
      .nullable()
      .default(null),
    reconciliationReference: z.string().trim().max(160).default(""),
  })
  .strict();
export type Questionnaire = z.infer<typeof questionnaireSchema>;
export function questionnaireErrors(
  q: Questionnaire,
  section: number,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const required = (key: keyof Questionnaire, label: string) => {
    if (q[key] === null || q[key] === "") errors[key] = label;
  };
  if (section === 0) {
    if (!/^(\d{10}|\d{12})$/.test(q.inn))
      errors.inn = "Введите ИНН: 10 или 12 цифр.";
    if (!q.companyConfirmed)
      errors.companyConfirmed = "Подтвердите найденную компанию.";
    if (!q.authorized)
      errors.authorized = "Для подачи нужны полномочия представителя.";
    if (Object.values(q.consents).some((v) => !v))
      errors.consents = "Для продолжения нужны отдельные согласия на проверки.";
  }
  if (section === 1) {
    if (q.complete === "unknown") errors.complete = "Уточните полноту выписок.";
    if (q.accounts.some((a) => !a.bank))
      errors.accounts = "Укажите банк для каждого расчётного счёта.";
    if (q.complete === "no") {
      required("outsideType", "Укажите операции вне CSV.");
      required("outsideIn", "Укажите поступления вне CSV.");
      required("outsideOut", "Укажите расходы вне CSV.");
    }
  }
  if (section === 2) {
    if (q.loans === "unknown") errors.loans = "Уточните наличие кредитов.";
    if (q.loans === "yes") {
      required("debt", "Укажите остаток долга.");
      required("monthlyDebt", "Укажите месячный платёж.");
    }
    if (q.leasing === "yes")
      required("monthlyLeasing", "Укажите платёж по лизингу.");
    if (q.balloon)
      required("balloonPeriod", "Укажите период крупного погашения.");
  }
  if (section === 3) {
    if (["income", "both"].includes(q.future))
      required("futureIn", "Укажите будущее поступление.");
    if (["expense", "both"].includes(q.future))
      required("futureOut", "Укажите будущий расход.");
    if (!["none", "unknown"].includes(q.future))
      required("futurePeriod", "Укажите период будущих операций.");
  }
  if (section === 4) {
    required("purpose", "Уточните назначение средств.");
    required("neededAt", "Укажите, когда нужны средства.");
    if (!Number.isSafeInteger(q.amount) || q.amount <= 0 || q.amount > 1e12)
      errors.amount = "Введите положительную сумму в рублях.";
    if (!Number.isInteger(q.term) || q.term < 1 || q.term > 120)
      errors.term = "Укажите срок от 1 до 120 месяцев.";
    if (q.productId === "INVEST")
      required("projectCost", "Укажите стоимость проекта.");
    if (["RCL", "OVERDRAFT"].includes(q.productId))
      required("cycleDays", "Укажите длительность использования.");
    if (q.productId === "NCL")
      required("tranches", "Укажите суммы и сроки траншей.");
    if (q.productId === "REFI") {
      required("oldBalance", "Укажите остаток старого кредита.");
      required("oldRate", "Укажите ставку старого кредита.");
      required("oldPayment", "Укажите платёж старого кредита.");
    }
  }
  return errors;
}
export function recommend(a: OnboardingAnswers): ProductId {
  if (a.purpose === "Рефинансирование") return "REFI";
  if (a.usage === uses[3] || a.purpose === "Кассовый разрыв")
    return "OVERDRAFT";
  if (a.usage === uses[2]) return "RCL";
  if (a.usage === uses[1]) return "NCL";
  if ([purposes[3], purposes[4]].includes(a.purpose)) return "INVEST";
  return "WORKING";
}
export function initialQuestionnaire(a: OnboardingAnswers): Questionnaire {
  return {
    inn: "",
    companyConfirmed: false,
    registryError: "",
    authorized: false,
    consents: { registry: false, financial: false, bki: false },
    actualIndustry: "",
    accounts: [{ id: "account-1", bank: "", number: "", documentId: "" }],
    complete: "unknown",
    outsideType: "",
    outsideIn: null,
    outsideOut: null,
    loans: "unknown",
    debt: null,
    monthlyDebt: null,
    balloon: null,
    balloonPeriod: "",
    leasing: "no",
    monthlyLeasing: null,
    debtReconciled: false,
    seasonality: "unknown",
    future: "none",
    futureIn: null,
    futureOut: null,
    futurePeriod: "",
    purpose: a.purpose,
    amount: [
      250000, 400000, 750000, 2000000, 4000000, 6000000, 7500000, 1000000,
    ][ranges.indexOf(a.amountRange)],
    term: a.term,
    neededAt: "До месяца",
    productId: recommend(a),
    usage: a.usage,
    repayment: a.repayment,
    projectCost: null,
    economicEffect: null,
    cycleDays: null,
    tranches: "",
    oldRate: null,
    oldPayment: null,
    oldBalance: null,
    signatory: "",
    authority: "",
    receivingAccount: "",
    receivingBank: "",
    customerContractAmount: null,
    customerContractMonths: null,
    reconciliationReference: "",
  };
}
export function productIssues(
  q: Pick<Questionnaire, "productId" | "amount" | "term">,
): string[] {
  const p = products.find((p) => p.id === q.productId)!;
  return [
    q.amount < p.min || q.amount > p.max
      ? `Сумма продукта: от ${p.min.toLocaleString("ru-RU")} до ${p.max.toLocaleString("ru-RU")} ₽.`
      : "",
    q.term < p.minTerm || q.term > p.maxTerm
      ? `Срок продукта: ${p.minTerm}–${p.maxTerm} мес.`
      : "",
  ].filter(Boolean);
}
export type MissingField = { key: string; label: string; section: number };
export const managerRequestedFields: MissingField[] = [
  { key: "actualIndustry", label: "Фактическая деятельность", section: 0 },
  { key: "accounts", label: "CSV по расчётным счетам", section: 1 },
  { key: "debt", label: "Остаток долга", section: 2 },
  { key: "monthlyDebt", label: "Месячный платёж по кредитам", section: 2 },
  { key: "monthlyLeasing", label: "Платёж по лизингу", section: 2 },
  { key: "projectCost", label: "Стоимость проекта", section: 4 },
  {
    key: "customerContractAmount",
    label: "Сумма договора с заказчиком",
    section: 4,
  },
  {
    key: "reconciliationReference",
    label: "Реквизиты акта сверки",
    section: 4,
  },
];
export type Decision =
  | "APPROVED"
  | "MANAGER_REVIEW_REQUIRED"
  | "ADDITIONAL_DATA_REQUIRED"
  | "DECLINED";
export type Lifecycle =
  | "DRAFT"
  | "SUBMITTED"
  | "PROCESSING"
  | "DECIDED"
  | "MEETING_SCHEDULED"
  | "MANAGER_APPROVED"
  | "MANAGER_DECLINED"
  | "CONTRACT_READY"
  | "SIGNED_DEMO"
  | "ACTIVE";
export type Company = {
  inn: string;
  name: string;
  form: string;
  registeredAt?: string;
  okved?: string;
  activity?: string;
  status: string;
  source: string;
};
export type Stage = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  at?: string;
};
export type Alternative = {
  id: string;
  productId: ProductId;
  amount: number;
  term: number;
  rate: number;
  payment: number;
  reason: string;
};
export type MvpApplication = {
  id: string;
  businessId: string;
  version: number;
  onboarding: OnboardingAnswers;
  recommendedProductId: ProductId;
  questionnaire: Questionnaire;
  company?: Company;
  lifecycle: Lifecycle;
  decision?: Decision;
  reasons: string[];
  missing: MissingField[];
  alternatives: Alternative[];
  stages: Stage[];
  error?: string;
  financial?: {
    flow: number;
    payment: number;
    dscr: number;
    limit: number;
    months: number;
    debtInCsv: number;
    uncoveredDebt: number;
    source: string;
  };
  provenance: Record<
    string,
    {
      source: "ONBOARDING" | "REGISTRY" | "CSV" | "USER_CONFIRMED" | "ENGINE";
      confirmed: boolean;
      at: string;
    }
  >;
  meeting?: { slotId: string; at: string; manager: string };
  signature?: { id: string; at: string; hash: string; version: number };
  contract?: { number: string; date: string; hash: string; version: number };
  activatedAt?: string;
  createdAt: string;
  updatedAt: string;
};
