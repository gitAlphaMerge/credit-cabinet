/** The field displays Russian dates; only complete dates are sent in ISO order. */
export function formatDateInput(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : value;
}

export function normalizeDateInput(text: string): string | null {
  const raw = text.trim();
  // Accept ISO paste as well, without relying on the browser's locale.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (!/^[\d.]*$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length > 8) return null;
  if (digits.length === 8)
    return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  // Keep incomplete and impossible dates editable: validation must not silently
  // turn 31 February into a different, financially significant payment date.
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
    .filter(Boolean)
    .join(".");
}

export function dateCaret(display: string, ordinal: number): number {
  if (!ordinal) return 0;
  let seen = 0;
  for (let i = 0; i < display.length; i++)
    if (/\d/.test(display[i]) && ++seen === ordinal) return i + 1;
  return display.length;
}
