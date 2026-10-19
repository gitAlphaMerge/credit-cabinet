import { calculate, select } from "./finance";
import type { AppState } from "../shared/types";
// Read-only fixture factory. Never creates a user, session, file or database record.
export function publicPreview(kind: "ooo" | "ip" | "idea" = "ooo"): AppState {
  const now = new Date().toISOString();
  const profile: AppState["profile"] = {
    name:
      kind === "ooo"
        ? "ООО «ТехноПлюс»"
        : kind === "ip"
          ? "ИП Алексей Демонстрационный"
          : "Проект «Новая мастерская»",
    form: kind === "ooo" ? "ООО" : kind === "ip" ? "ИП" : "Не зарегистрирован",
    registered: kind !== "idea",
    stage: kind === "idea" ? "planning" : "operating",
    sector: "Производство",
    ageBand: kind === "idea" ? "" : "3–5 лет",
    result: "Прибыль",
    debt: kind === "ooo" ? "Да" : "Нет",
    intent: "Подобрать финансирование",
    source: "Синтетический публичный пример",
  };
  const financials: AppState["financials"] =
    kind === "idea"
      ? {}
      : {
          freeFlow: kind === "ooo" ? 420000 : 90000,
          existing: 0,
          balance: 850000,
          incoming: 1200000,
          expenses: 780000,
          forecastSource: "Синтетические предположения публичного примера",
        };
  const selection = {
    ...select(
      {
        purpose: "Оборудование",
        amount: 3000000,
        term: 36,
        flow: financials.freeFlow ?? null,
        existing: 0,
      },
      profile,
    ),
    id: "preview-selection",
    version: 1,
    createdAt: now,
  };
  const started = new Date();
  started.setUTCMonth(started.getUTCMonth() - 8);
  const calculation = calculate(
    { amount: 3000000, term: 36, rate: 22, flow: 420000 },
    started,
  );
  return {
    profile,
    financials,
    selections: [selection],
    documents: [],
    notifications: [],
    leads: [],
    preferences: { split: 60, tourDone: true },
    credit:
      kind !== "ooo"
        ? null
        : {
            id: "preview-credit",
            calculation,
            paid: 8,
            demo: true,
            balance: calculation.schedule[7].balance,
            source: "Синтетический пример — не банковский договор",
          },
    chats: [
      {
        id: "preview-chat",
        title: "Расчёт на оборудование",
        selectionId: selection.id,
        messages: [
          {
            id: "preview-user",
            role: "user",
            text: "Сравни запрос на оборудование с денежным потоком бизнеса.",
            createdAt: now,
          },
          {
            id: "preview-assistant",
            role: "assistant",
            mode: "demo",
            text: "## Разберём нагрузку\nРасчёт ниже использует **свободный денежный поток**, а не бухгалтерскую прибыль.\n\n- Сравните платёж с доступными деньгами.\n- Проверьте сценарий снижения потока на 30%.\n- Обсудите ограничения с менеджером.\n\nЭто публичный пример, не решение банка.",
            createdAt: now,
            calculation: selection.calculation,
          },
        ],
      },
    ],
  };
}
