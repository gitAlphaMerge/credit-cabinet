import { day, validDate } from "./cabinet";

export const facilityLimits = {
  amount: 1e12,
  rate: 100,
  months: 120,
  earliestIssue: "1900-01-01",
};
export function latestPaymentDate(today = day()) {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + 10);
  return day(d);
}
export type FieldErrors = Record<string, string>;
/** Same restrictions for the form and server; no silent clamping of financial data. */
export function facilityErrors(
  values: Record<string, unknown>,
  today = day(),
): FieldErrors {
  const errors: FieldErrors = {},
    numbers: Record<string, number> = {};
  const name = typeof values.name === "string" ? values.name.trim() : "";
  if (!name) errors.name = "Введите название договора.";
  else if (name.length > 100) errors.name = "Название — не более 100 символов.";
  else if (/[\p{Cc}\p{Cf}]/u.test(name) || !/[\p{L}\p{N}]/u.test(name))
    errors.name = "Укажите название договора буквами или цифрами.";
  for (const k of ["amount", "balance", "rate", "term", "contractTerm"]) {
    const v = values[k];
    if (v === "" || v === undefined || v === null) {
      if (k !== "contractTerm")
        errors[k] =
          k === "amount"
            ? "Введите первоначальную сумму кредита."
            : k === "balance"
              ? "Введите остаток основного долга."
              : k === "rate"
                ? "Введите годовую ставку."
                : "Введите оставшийся срок кредита.";
      continue;
    }
    const n =
      typeof v === "number"
        ? v
        : typeof v === "string" && /^\d+(?:\.\d*)?$/.test(v)
          ? Number(v)
          : NaN;
    numbers[k] = n;
    if (!Number.isFinite(n)) {
      errors[k] = "Введите корректное число.";
      continue;
    }
    if (k === "term" || k === "contractTerm") {
      if (!Number.isInteger(n) || n < 1 || n > facilityLimits.months)
        errors[k] = "Укажите целое число от 1 до 120 месяцев.";
    } else if (k === "rate") {
      if (n < 0 || n > facilityLimits.rate)
        errors[k] = "Годовая ставка должна быть от 0 до 100%.";
    } else if (n < (k === "amount" ? 0.01 : 0) || n > facilityLimits.amount)
      errors[k] =
        k === "amount"
          ? "Сумма должна быть от 0,01 до 1 000 000 000 000 ₽."
          : "Остаток должен быть от 0 до 1 000 000 000 000 ₽.";
  }
  if (!errors.balance && !errors.amount && numbers.balance > numbers.amount)
    errors.balance = "Остаток долга не может превышать первоначальную сумму.";
  if (
    !errors.term &&
    !errors.contractTerm &&
    numbers.contractTerm < numbers.term
  )
    errors.contractTerm = "Общий срок не может быть меньше оставшегося срока.";
  for (const k of ["issuedDate", "firstDate"]) {
    const v = values[k];
    if (v === undefined || v === null || v === "") {
      if (k === "firstDate") errors[k] = "Укажите дату ближайшего платежа.";
      continue;
    }
    if (typeof v !== "string" || !validDate(v)) {
      errors[k] = "Введите существующую дату в формате ДД.ММ.ГГГГ.";
      continue;
    }
    if (k === "issuedDate" && (v < facilityLimits.earliestIssue || v > today))
      errors[k] = "Дата выдачи — с 01.01.1900 по сегодняшний день.";
    if (k === "firstDate" && (v < today || v > latestPaymentDate(today)))
      errors[k] = "Дата платежа — не раньше сегодня и не дальше 10 лет вперёд.";
  }
  if (
    !errors.firstDate &&
    !errors.issuedDate &&
    values.issuedDate &&
    String(values.issuedDate) > String(values.firstDate)
  )
    errors.firstDate = "Дата платежа не может быть раньше даты выдачи кредита.";
  return errors;
}

/** Never expose generated English Zod messages or internal property paths. */
export function russianValidationErrors(
  issues: readonly {
    path: readonly PropertyKey[];
    code: string;
    message: string;
    minimum?: unknown;
    maximum?: unknown;
    origin?: unknown;
  }[],
): FieldErrors {
  const fields: FieldErrors = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".") || "form";
    if (fields[key]) continue;
    if (
      /[А-Яа-яЁё]/.test(i.message) &&
      !/^Invalid|^Too |^Unrecognized/.test(i.message)
    ) {
      fields[key] = i.message;
      continue;
    }
    if (i.code === "too_big")
      fields[key] =
        i.origin === "string"
          ? `Не более ${i.maximum} символов.`
          : `Укажите значение не больше ${i.maximum}.`;
    else if (i.code === "too_small")
      fields[key] =
        i.origin === "string"
          ? `Введите не менее ${i.minimum} символов.`
          : `Укажите значение не меньше ${i.minimum}.`;
    else fields[key] = "Проверьте значение этого поля.";
  }
  return fields;
}
