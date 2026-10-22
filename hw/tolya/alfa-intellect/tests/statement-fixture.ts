/** Build a statement operation date relative to the scenario's injected clock. */
export function statementDate(now: number | Date, daysAgo = 1): string {
  return new Date(Number(now) - daysAgo * 86_400_000).toISOString().slice(0, 10);
}
