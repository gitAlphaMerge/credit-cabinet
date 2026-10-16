import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { Readable } from "node:stream";
import type { Fields } from "../shared/types";
const required: Record<string, string[]> = {
  statement: ["inflow", "outflow", "freeFlow"],
  balance: ["assets", "liabilities", "equity"],
  pnl: ["revenue", "expenses", "profit"],
  model: ["plannedIncome", "plannedExpenses", "investment"],
  plan: ["purpose", "assumptions", "risks"],
  schedule: ["payment", "principal", "interest"],
};
export async function extract(
  buffer: Buffer,
  name: string,
  categoryHint?: string,
) {
  const ext = name.toLowerCase().split(".").pop();
  let text = "",
    rows: string[][] = [];
  if (buffer.length > 8 * 1024 * 1024) throw new Error("Файл больше 8 МБ.");
  if (ext === "csv" || ext === "xlsx") {
    const book = new ExcelJS.Workbook();
    if (ext === "xlsx") {
      if (buffer.subarray(0, 2).toString() !== "PK")
        throw new Error("Файл не является XLSX.");
      await book.xlsx.load(buffer as any);
    } else
      await book.csv.read(Readable.from([buffer]), {
        map: (value: string) => value,
      });
    book.eachSheet((sheet) =>
      sheet.eachRow((row) => {
        rows.push(
          (row.values as ExcelJS.CellValue[])
            .slice(1)
            .map((v) =>
              typeof v === "object" && v !== null && "result" in v
                ? String(v.result ?? "")
                : String(v ?? ""),
            ),
        );
      }),
    );
    text = rows
      .map((r) => (r.length === 2 ? r.join(": ") : r.join(",")))
      .join("\n");
  } else if (ext === "docx") {
    if (buffer.subarray(0, 2).toString() !== "PK")
      throw new Error("Файл не является DOCX.");
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (ext === "pdf") {
    if (buffer.subarray(0, 4).toString() !== "%PDF")
      throw new Error("Файл не является PDF.");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
    if (text.replace(/\s/g, "").length < 30)
      throw new Error(
        "В PDF нет извлекаемого текста. OCR сканированных документов не поддерживается.",
      );
  } else
    throw new Error("Поддерживаются CSV, XLSX, DOCX и PDF с текстовым слоем.");
  if (text.length > 700000 || rows.length > 50000)
    throw new Error("Слишком большой документ: используйте до 50 000 строк.");
  const fields: Fields = {};
  let period = "Не определён";
  let currency = "RUB";
  let category = categoryHint || "";
  const kv = /^([A-Za-z][A-Za-z0-9]*)\s*[:,\t]\s*(.+)$/;
  for (const line of text.split("\n")) {
    const m = line.trim().match(kv);
    if (m) {
      const key = m[1],
        v = m[2].trim();
      if (key === "category") category = v;
      else if (key === "period") period = v;
      else if (key === "currency") currency = v;
      else {
        const n = Number(v.replace(/\s/g, "").replace(",", "."));
        fields[key] = v !== "" && Number.isFinite(n) ? n : v.slice(0, 1000);
      }
    }
  }
  if (rows[0]?.[0] === "date" && rows[0].includes("amount")) {
    category = "statement";
    const headers = rows[0];
    const dates: string[] = [];
    let incoming = 0,
      outgoing = 0;
    const months = new Set<string>();
    for (const row of rows.slice(1)) {
      if (!row.some(Boolean)) continue;
      const date = row[0];
      const amount = Number(
        row[headers.indexOf("amount")]?.replace(/\s/g, "").replace(",", "."),
      );
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount))
        throw new Error("Выписка: нужны дата YYYY-MM-DD и числовая amount.");
      dates.push(date);
      months.add(date.slice(0, 7));
      if (amount >= 0) incoming += amount;
      else outgoing -= amount;
      if (headers.includes("balance")) {
        const b = Number(row[headers.indexOf("balance")]);
        if (Number.isFinite(b)) fields.lastBalance = b;
      }
    }
    if (!dates.length) throw new Error("В выписке нет операций.");
    dates.sort();
    period = dates[0] + " — " + dates.at(-1);
    Object.assign(fields, {
      inflow: incoming,
      outflow: outgoing,
      freeFlow: Math.round((incoming - outgoing) / months.size),
      months: months.size,
      operations: dates.length,
    });
  }
  if (!category)
    category =
      Object.keys(required).find((c) =>
        required[c].every((k) => k in fields),
      ) || "";
  if (!required[category] || !required[category].every((k) => k in fields))
    throw new Error(
      "Документ не соответствует поддерживаемому шаблону. Скачайте пример в профиле: обязательные поля " +
        (required[category]?.join(", ") || "не распознаны") +
        ".",
    );
  if (
    category !== "plan" &&
    required[category].some((k) => typeof fields[k] !== "number")
  )
    throw new Error(
      "Обязательные финансовые показатели должны быть числами в рублях.",
    );
  if (currency !== "RUB")
    throw new Error("Для первого MVP поддерживаются только документы в RUB.");
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "number" && !Number.isFinite(v))
      throw new Error("Некорректное число: " + k);
  }
  return { category, period, currency, fields };
}
export const fieldNames: Record<string, string> = {
  inflow: "Поступления по счёту",
  outflow: "Списания по счёту",
  freeFlow: "Средний свободный денежный поток / мес.",
  lastBalance: "Остаток по выписке",
  months: "Месяцев в выборке",
  operations: "Операций",
  assets: "Активы",
  liabilities: "Обязательства",
  equity: "Капитал",
  revenue: "Бухгалтерская выручка",
  expenses: "Расходы",
  profit: "Бухгалтерская прибыль",
  plannedIncome: "Плановые поступления",
  plannedExpenses: "Плановые расходы",
  investment: "Инвестиции",
  purpose: "Назначение проекта",
  assumptions: "Предположения",
  risks: "Риски",
  payment: "Платёж",
  principal: "Основной долг",
  interest: "Проценты",
  balance: "Остаток долга",
};
