const rateNumber = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 4,
});

/** Percentage points in, e.g. 21.5; fractional API rates must be multiplied by 100. */
export function formatRate(percent: number): string {
  return Number.isFinite(percent)
    ? `${rateNumber.format(percent)}\u00a0%`
    : "Нет данных";
}
