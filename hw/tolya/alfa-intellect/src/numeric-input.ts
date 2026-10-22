export function normalizeNumericInput(
  text: string,
  decimals = 2,
  signed = false,
): string | null {
  let raw = text
    .trim()
    .replace(/(?:₽|руб\.?|мес\.?|месяц(?:а|ев)?|%)$/i, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  const pattern = new RegExp(
    `^${signed ? "-?" : ""}\\d*${decimals ? `(?:\\.\\d{0,${decimals}})?` : ""}$`,
  );
  if (!pattern.test(raw)) return null;
  raw = raw
    .replace(/^(-?)0+(?=\d)/, "$1")
    .replace(/^(-?)\./, (_, sign: string) => sign + "0.");
  return raw;
}
export function formatNumericInput(raw: string | number): string {
  const [whole, fraction] = String(raw).split(".");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
    (fraction === undefined ? "" : "," + fraction)
  );
}
/** Cursor offset by meaningful characters, not inserted grouping spaces. */
export function numericCaret(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++)
    if (/[\d,.-]/.test(text[i]) && ++seen === count) return i + 1;
  return text.length;
}
