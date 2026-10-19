export const PREPARATION_KEY = "alfa-cabinet-preparation";
export const PREPARATION_MS = 10000;
export function preparationProgress(
  elapsed: number,
  duration = PREPARATION_MS,
) {
  return Math.min(
    100,
    Math.max(0, Math.floor((elapsed / Math.max(1, duration)) * 100)),
  );
}
export function readPreparation(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
): number | null {
  try {
    const raw = storage.getItem(PREPARATION_KEY),
      start = Number(raw);
    return raw &&
      Number.isFinite(start) &&
      start > 0 &&
      start <= now &&
      now - start < 60000
      ? start
      : null;
  } catch {
    return null;
  }
}
