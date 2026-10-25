export type Profile = {
  mvp2Answers?: import("./mvp2").OnboardingAnswers;
  onboardedAt?: string;
  name: string;
  form: string;
  stage: string;
  sector: string;
  registered: boolean;
  ageBand: string;
  result: string;
  debt: string;
  intent: string;
  preparation?: string;
  inn?: string;
  registeredAt?: string;
  region?: string;
  activity?: string;
  registryRecord?: Record<string, unknown>;
  source?: string;
};
export type Fields = Record<string, string | number>;
export type Doc = {
  records?: Record<string, string | number>[];
  id: string;
  category: string;
  name: string;
  period: string;
  fields: Fields;
  confirmed: boolean;
  createdAt: string;
  currency: string;
  mime: string;
};
export type Calculation = {
  amount: number;
  term: number;
  rate: number;
  monthlyPayment: number;
  interest: number;
  total: number;
  flow: number | null;
  existing: number | null;
  maxAmount: number | null;
  dscr: number | null;
  stressDscr: number | null;
  schedule: {
    month: number;
    date: string;
    payment: number;
    principal: number;
    interest: number;
    balance: number;
  }[];
  source: string;
  formula: string;
};
export type Selection = {
  input?: import("./financing").FundingRequest;
  assessment?: import("./financing").FundingAssessment;
  versions?: import("./financing").FundingVersion[];
  updatedAt?: string;
  id: string;
  version: number;
  parentId?: string;
  createdAt: string;
  purpose: string;
  repayFrom: string;
  ownFunds: number;
  product: string;
  calculation: Calculation;
  risks: string[];
  alternatives: string[];
  status: string;
};
export type Message = {
  fundingProposal?: {
    selectionId: string;
    expectedVersion: number;
    amount?: number;
    term?: number;
    productId?: string;
  };
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  mode?: string;
  calculation?: Calculation;
  warning?: string;
  proposal?: { field: string; value: number };
};
export type Chat = {
  mvp2Context?: {
    applicationId: string;
    section: number;
    activeField?: string;
    validationFields?: string[];
  };
  cabinetContext?: {
    capturedAt: string;
    snapshot: import("./cabinet").CabinetSnapshot;
  };
  id: string;
  title: string;
  selectionId?: string;
  messages: Message[];
};
export type Credit = {
  id: string;
  calculation: Calculation;
  paid: number;
  demo: true;
  balance: number;
  source: string;
};
export type Notice = {
  type?: "payment" | "risk" | "data" | "result";
  active?: boolean;
  id: string;
  key: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};
export type AppState = {
  cabinet?: import("./cabinet").CabinetData;
  profile: Profile;
  documents: Doc[];
  chats: Chat[];
  selections: Selection[];
  credit: Credit | null;
  notifications: Notice[];
  leads: {
    version?: number;
    status?: "Демо-заявка создана";
    application?: Record<string, unknown>;
    note?: string;
    id: string;
    selectionId: string;
    phone: string;
    createdAt: string;
  }[];
  preferences: { split: number; tourDone: boolean };
  financials: Fields;
};
export const documentTypes = [
  ["statement", "Банковская выписка"],
  ["balance", "Бухгалтерский баланс"],
  ["pnl", "Отчёт о финансовых результатах"],
  ["model", "Финансовая модель"],
  ["plan", "Бизнес-план"],
  ["schedule", "График кредитных платежей"],
] as const;
