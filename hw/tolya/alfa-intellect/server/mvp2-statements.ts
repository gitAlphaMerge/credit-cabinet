import { createHash } from "node:crypto";
import { csvRows } from "./documents";
import { validDate, day } from "../shared/cabinet";
export type Operation = {
  date: string;
  amount: number;
  counterparty: string;
  purpose: string;
  kind: string;
};
export type Statement = {
  id: string;
  accountId: string;
  name: string;
  hash: string;
  period: string;
  months: string[];
  records: Operation[];
};
const aliases: Record<string, string[]> = {
  date: ["date", "дата", "дата операции"],
  amount: ["amount", "сумма", "сумма операции"],
  counterparty: ["counterparty", "контрагент"],
  purpose: ["purpose", "назначение", "назначение платежа"],
  kind: ["kind", "тип"],
};
export function parseStatement(
  buffer: Buffer,
  name: string,
  accountId: string,
): Omit<Statement, "id"> {
  if (!name.toLowerCase().endsWith(".csv"))
    throw new Error("Для анализа нужна банковская выписка CSV.");
  const rows = csvRows(buffer),
    header = rows.shift()?.map((x) => x.trim().toLowerCase()) ?? [];
  const ix = (key: string) => header.findIndex((h) => aliases[key].includes(h));
  if (["date", "amount", "counterparty", "purpose"].some((k) => ix(k) < 0))
    throw new Error(
      "В CSV нужны колонки: date, amount, counterparty, purpose (или их русские названия).",
    );
  const records = rows
    .map((row, i) => {
      let date = row[ix("date")]?.trim();
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(date))
        date = date.split(".").reverse().join("-");
      const raw = row[ix("amount")]
        ?.replace(/[\s\u00a0]/g, "")
        .replace(",", ".");
      const amount = Number(raw);
      if (
        !raw ||
        !validDate(date) ||
        date > day() ||
        !Number.isFinite(amount) ||
        Math.abs(amount) > 1e12
      )
        throw new Error(`Строка ${i + 2}: проверьте дату и сумму операции.`);
      const purpose = (row[ix("purpose")] || "").slice(0, 1000),
        counterparty = (row[ix("counterparty")] || "").slice(0, 1000);
      // Classification here is only for reconciliation; Liza independently classifies the CSV.
      // A caller-controlled kind column cannot hide an expense or debt payment.
      const kind = /между сво|собственн.*счет|внутренний перевод/i.test(purpose)
        ? "transfer"
        : amount < 0 &&
            /погашен.*кредит|кредит.*плат[её]ж|лизинг|процент.*кредит/i.test(
              purpose,
            )
          ? "debt"
          : "operating";
      return { date, amount, counterparty, purpose, kind };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!records.length) throw new Error("В CSV нет операций.");
  const months = [...new Set(records.map((r) => r.date.slice(0, 7)))];
  return {
    accountId,
    name,
    hash: createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    period: records[0].date + " — " + records.at(-1)!.date,
    months,
    records,
  };
}
export function aggregateStatements(statements: Statement[]) {
  // Never collapse identical business transactions across distinct accounts. Remove
  // explicitly identified internal transfers and duplicate uploads, not revenue.
  const unique = [...new Map(statements.map((s) => [s.hash, s])).values()];
  const records = unique
    .flatMap((s) => s.records)
    .filter((r) => r.kind !== "transfer")
    .sort((a, b) => a.date.localeCompare(b.date));
  const months = [...new Set(records.map((r) => r.date.slice(0, 7)))].sort();
  const quote = (v: unknown) => '"' + String(v).replaceAll('"', '""') + '"';
  return {
    records,
    months,
    csv: [
      "date,amount,counterparty,purpose",
      ...records.map((r) =>
        [r.date, r.amount, r.counterparty, r.purpose].map(quote).join(","),
      ),
    ].join("\n"),
    debt:
      Math.round(
        (-records
          .filter((r) => r.kind === "debt" && r.amount < 0)
          .reduce((s, r) => s + r.amount, 0) /
          Math.max(months.length, 1)) *
          100,
      ) / 100,
  };
}
