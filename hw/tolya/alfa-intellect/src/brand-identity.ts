export const BRAND_NAME = "Альфа и Омега";
// One geometry for the header, static icon and animated tab icon.
export const ALPHA_PATH = "M5 32 16 7 27 32M10 23h12";
export const OMEGA_PATH = "M38 32h9v-5a11 11 0 1 1 8 0v5h9";
export const BRAND_BASE = "M5 40h59";
export type IdentityPhase = "pair" | "pattern" | "alpha" | "omega";
export const IDENTITY_CYCLE_MS = 8400;
export function identityPhase(elapsed: number): IdentityPhase {
  const time = Math.max(0, elapsed) % IDENTITY_CYCLE_MS;
  return time < 2800 ? "pair" : time < 5800 ? "pattern" : time < 7100 ? "alpha" : "omega";
}
