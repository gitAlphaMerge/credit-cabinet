export function panelBounds(width: number) {
  const usable = Math.max(1, width - 14);
  return {
    min: Math.max(40, Math.ceil((420 / usable) * 100)),
    max: Math.min(75, Math.floor(((usable - 370) / usable) * 100)),
  };
}
export function panelSplit(width: number, preferred: number) {
  const { min, max } = panelBounds(width);
  return Math.max(min, Math.min(max, preferred));
}
