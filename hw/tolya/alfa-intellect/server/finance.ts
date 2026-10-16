import { z } from "zod";
import type { Calculation, Selection, Profile } from "../shared/types";
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
export const catalog = [
  {
    name: "Оборотный кредит",
    purposes: ["Оборотные средства", "Развитие"],
    rate: 24,
    max: 15000000,
    term: 36,
    minAge: 12,
  },
  {
    name: "Инвестиционный кредит",
    purposes: ["Оборудование", "Развитие"],
    rate: 22,
    max: 50000000,
    term: 84,
    minAge: 12,
  },
  {
    name: "Кредитная линия под контракт",
    purposes: ["Исполнение контракта"],
    rate: 23,
    max: 20000000,
    term: 36,
    minAge: 12,
  },
  {
    name: "Овердрафт",
    purposes: ["Оборотные средства"],
    rate: 26,
    max: 3000000,
    term: 12,
    minAge: 12,
  },
  {
    name: "Рефинансирование",
    purposes: ["Рефинансирование"],
    rate: 23,
    max: 10000000,
    term: 60,
    minAge: 12,
  },
].map((p) => ({
  ...p,
  version: "demo-1",
  source: "Синтетический каталог команды, не предложение банка",
  verifiedAt: "2026-10-16",
}));
export function select(
  raw: Record<string, unknown>,
  profile: Profile,
): Omit<Selection, "id" | "version" | "createdAt"> {
  const purpose = z
    .enum([
      "Оборотные средства",
      "Оборудование",
      "Развитие",
      "Исполнение контракта",
      "Рефинансирование",
      "Запуск",
    ])
    .parse(raw.purpose);
  const product = catalog.find((p) => p.purposes.includes(purpose));
  const c = calculate({ ...raw, rate: product?.rate ?? 24 });
  const risks = [];
  if (!profile.registered)
    risks.push(
      "Бизнес ещё не зарегистрирован. Кредитные продукты могут быть недоступны; требуется консультация.",
    );
  if (profile.ageBand.includes("Менее") || profile.stage === "planning")
    risks.push(
      "Возраст или стадия бизнеса не соответствует базовым требованиям демонстрационного каталога.",
    );
  if (c.flow === null)
    risks.push(
      "Не указан свободный денежный поток. Посильная сумма не определена.",
    );
  else if (c.dscr! < 1.25)
    risks.push(
      "Платёж превышает предварительно посильную нагрузку по модели DSCR 1,25.",
    );
  if (c.stressDscr !== null && c.stressDscr < 1)
    risks.push(
      "При снижении свободного потока на 30% денег может не хватить на платежи.",
    );
  if (product && (c.amount > product.max || c.term > product.term))
    risks.push(
      "Сумма или срок выходит за ограничения выбранного типа продукта.",
    );
  if (purpose === "Исполнение контракта" && !String(raw.repayFrom || "").trim())
    risks.push("Нужно уточнить контракт и срок поступления оплаты.");
  const eligible =
    !!product &&
    ["ИП", "ООО", "АО"].includes(profile.form) &&
    profile.registered &&
    profile.stage === "operating" &&
    !profile.ageBand.includes("Менее") &&
    c.amount <= product.max &&
    c.term <= product.term;
  if (!["ИП", "ООО", "АО"].includes(profile.form))
    risks.push(
      "Для этой формы бизнеса нужна индивидуальная консультация: демонстрационный каталог рассчитан на ИП, ООО и АО.",
    );
  return {
    purpose,
    repayFrom: String(raw.repayFrom || "Требует уточнения").slice(0, 300),
    ownFunds: z.coerce
      .number()
      .min(0)
      .max(1e9)
      .parse(raw.ownFunds ?? 0),
    product: product?.name ?? "Консультация по финансированию запуска",
    calculation: c,
    risks,
    alternatives:
      purpose === "Оборудование"
        ? ["Рассмотреть лизинг оборудования; нужны его отдельные условия."]
        : [
            "Сравнить меньшую сумму или более длинный срок; общая стоимость может вырасти.",
          ],
    status: !eligible
      ? "Нужна дополнительная проверка"
      : c.flow === null
        ? "Предварительный подбор"
        : c.dscr! >= 1.25
          ? "Можно обсуждать с менеджером"
          : "Сначала скорректируйте нагрузку",
  };
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
