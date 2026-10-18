import type { AppState, Calculation } from "./types";
export const DSCR_TARGET = 1.25;
/** Same inputs and 30% flow stress as the financing engine; not ROI or bank scoring. */
export function efficiencyMetrics(c?: Calculation | null) {
  const debt = c && c.existing !== null ? c.monthlyPayment + c.existing : null;
  const known =
    !!c &&
    typeof c.flow === "number" &&
    Number.isFinite(c.flow) &&
    debt !== null &&
    debt > 0;
  const flow = known ? c!.flow! : null;
  return {
    debt,
    flow,
    dscr: flow === null ? null : flow / debt!,
    stressDscr: flow === null ? null : (flow * 0.7) / debt!,
    burden: flow === null || flow <= 0 ? null : (debt! / flow) * 100,
    reserve: flow === null ? null : flow / DSCR_TARGET - debt!,
    interestShare: c && c.amount > 0 ? (c.interest / c.amount) * 100 : null,
  };
}
export function efficiencyBasis(state: AppState) {
  return state.credit
    ? {
        calculation: state.credit.calculation,
        label: "Сохранённые условия кредита",
      }
    : {
        calculation: state.selections[0]?.calculation,
        label: "Последний сохранённый расчёт · не действующий кредит",
      };
}
