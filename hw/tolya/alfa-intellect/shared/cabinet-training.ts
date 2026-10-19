import { addDays, day, facilityOf } from "./cabinet";
import type { AppState } from "./types";
// UI-only decoration of the existing public fixture. Never passed to saveState.
export function trainingCabinet(s: AppState): AppState {
  const today = day(),
    c = facilityOf(s);
  if (!c) return s;
  const next = c.events.find((p) => p.status !== "paid")!;
  const gap = Math.round(
    (Date.parse(addDays(today, 3)) - Date.parse(next.date)) / 86400000,
  );
  const events = c.events.map((e) => ({ ...e, date: addDays(e.date, gap) }));
  const monthStart = addDays(today, -29);
  return {
    ...s,
    cabinet: {
      facility: {
        ...c,
        name: "Кредит на оборудование",
        startDate: addDays(c.startDate, gap),
        events,
      },
      plan: {
        balance: 180000,
        balanceDate: today,
        through: addDays(today, 29),
        source: "Учебный синтетический план",
        confirmedAt: new Date().toISOString(),
        items: [
          {
            id: "t-expense",
            date: addDays(today, 2),
            amount: -120000,
            label: "Поставщики",
          },
          {
            id: "t-income",
            date: addDays(today, 5),
            amount: 420000,
            label: "Плановое поступление",
          },
        ],
      },
      coverage: {
        amount: 140000,
        start: today,
        end: addDays(today, 29),
        source: "Учебный CFADS",
        methodology:
          "Операционные поступления минус обязательные расходы и налоги; синтетический учебный пример.",
        confirmedAt: new Date().toISOString(),
      },
    },
    documents: [
      {
        id: "training-pnl",
        category: "pnl",
        name: "Учебный ОФР",
        period: "Два сопоставимых завершённых года",
        confirmed: true,
        currency: "RUB",
        mime: "text/csv",
        createdAt: new Date().toISOString(),
        fields: {
          revenue: 18000000,
          previousRevenue: 15000000,
          salesProfit: 2400000,
          profit: 1800000,
          expenses: 15600000,
          periodStart: Number(today.slice(0, 4)) - 1 + "-01-01",
          periodEnd: Number(today.slice(0, 4)) - 1 + "-12-31",
          previousStart: Number(today.slice(0, 4)) - 2 + "-01-01",
          previousEnd: Number(today.slice(0, 4)) - 2 + "-12-31",
        },
      },
      {
        id: "training-statement",
        category: "statement",
        name: "Учебная выписка.csv",
        period: monthStart + " — " + today,
        fields: {},
        confirmed: true,
        currency: "RUB",
        mime: "text/csv",
        createdAt: new Date().toISOString(),
        records: [
          {
            date: monthStart,
            amount: 1100000,
            kind: "operating",
            balance: 600000,
          },
          { date: today, amount: -920000, kind: "operating", balance: 180000 },
        ],
      },
    ],
  };
}
