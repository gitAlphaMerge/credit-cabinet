/** KK3 defines the default; saved palettes and accent choices remain authoritative. */
export function applyDesignSystem(root: HTMLElement = document.documentElement) {
  root.dataset.designSystem = "kk3";
}
if (typeof document !== "undefined") applyDesignSystem();
