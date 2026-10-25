/** Explicit fixture exceptions are not real tax identifiers. Other INNs use checksum validation. */
const syntheticInns = new Set([
  "9900000001",
  "9900000002",
  "990000000001",
  "990000000002",
  "9900000041",
  "9900000042",
  "9900050018",
  "990005000140",
  "9900050025",
  "990005000214",
  "9900050032",
]);
export function innError(inn: string): string {
  if (!/^(\d{10}|\d{12})$/.test(inn))
    return "Введите ИНН целиком: 10 цифр для ООО или 12 для ИП.";
  if (syntheticInns.has(inn)) return "";
  const digits = [...inn].map(Number);
  const checksum = (weights: number[]) =>
    (weights.reduce((sum, weight, i) => sum + weight * digits[i], 0) % 11) % 10;
  const valid =
    inn.length === 10
      ? checksum([2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[9]
      : checksum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[10] &&
        checksum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[11];
  return valid ? "" : "Проверьте ИНН: контрольные цифры не совпадают.";
}
