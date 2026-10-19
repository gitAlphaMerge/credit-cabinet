import { z } from "zod";
import type { Calculation, Selection, Profile } from "../shared/types";
import { fundingCatalog, blankFundingRequest } from "../shared/financing";
import { fundingInput, transparentFundingEngine } from "./funding-engine";
export const financeInput = z.object({
  amount: z.coerce.number().finite().min(10000).max(100_000_000),
  term: z.coerce.number().int().min(1).max(120),
  rate: z.coerce.number().finite().min(0).max(100),
  flow: z.coerce.number().finite().min(-1e9).max(1e9).nullable().default(null),
  existing: z.coerce.number().finite().min(0).max(1e9).default(0),
});
export function calculate(raw: unknown, today = new Date()): Calculation {
  const x = financeInput.parse(raw),
    i = x.rate / 1200,
    n = x.term,
    factor = i === 0 ? n : (1 - (1 + i) ** -n) / i;
  const payment = x.amount / factor;
  let balance = x.amount;
  const schedule = [];
  for (let k = 1; k <= n; k++) {
    const interest = balance * i;
    const principal = k === n ? balance : Math.min(balance, payment - interest);
    const date = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth() + k,
        Math.min(today.getUTCDate(), 28),
      ),
    );
    schedule.push({
      month: k,
      date: date.toISOString().slice(0, 10),
      payment: round(principal + interest),
      principal: round(principal),
      interest: round(interest),
      balance: round(Math.max(0, balance - principal)),
    });
    balance -= principal;
  }
  const total = round(schedule.reduce((a, b) => a + b.payment, 0)),
    capacity = x.flow === null ? null : Math.max(0, x.flow / 1.25 - x.existing);
  return {
    ...x,
    monthlyPayment: round(payment),
    total,
    interest: round(total - x.amount),
    maxAmount: capacity === null ? null : round(capacity * factor),
    dscr: x.flow === null ? null : round(x.flow / (payment + x.existing)),
    stressDscr:
      x.flow === null ? null : round((x.flow * 0.7) / (payment + x.existing)),
    schedule,
    source:
      "Демонстрационная ставка; денежный поток — подтверждённые документы или сведения пользователя",
    formula:
      "A = S × i / (1 − (1 + i)^−n); i = ставка / 12 / 100; DSCR = свободный денежный поток / (A + действующие платежи). Порог модели: 1,25; стресс: поток −30%.",
  };
}
const round = (n: number) => Math.round(n * 100) / 100;
export const catalog = fundingCatalog;
export function select(
  raw: Record<string, unknown>,
  profile: Profile,
): Omit<Selection, "id" | "version" | "createdAt"> {
  // Compatibility adapter for saved demos and the original API contract.
  // Recommendation rules live in one engine, not in a second legacy selector.
  const input = fundingInput.parse({
    ...blankFundingRequest(),
    purpose: raw.purpose,
    amount: Number(raw.amount),
    term: raw.term === undefined ? null : Number(raw.term),
    repayFrom: String(raw.repayFrom || "Требует уточнения").slice(0, 300),
    details: {
      ownFunds: z.coerce
        .number()
        .min(0)
        .max(1e9)
        .parse(raw.ownFunds ?? 0),
    },
    financials: {
      flow:
        raw.flow === undefined || raw.flow === null || raw.flow === ""
          ? null
          : Number(raw.flow),
      ...(raw.existing === undefined ? {} : { existing: Number(raw.existing) }),
    },
  });
  const result = transparentFundingEngine.evaluate(input, {
    profile,
    documents: [],
    chats: [],
    selections: [],
    credit: null,
    notifications: [],
    leads: [],
    preferences: { split: 60, tourDone: true },
    financials: {},
  });
  if (!profile.registered) result.status = "Нужна дополнительная проверка";
  return result;
}
export function forecast(
  balance: number,
  incoming: number,
  expenses: number,
  payment: number,
  stress = false,
) {
  return round(balance + incoming * (stress ? 0.7 : 1) - expenses - payment);
}
