import type { Fields } from "../shared/types";

const maxBytes = 8 * 1024 * 1024;
const maxOperations = 50_000;

function calendarDate(value: string) {
  const timestamp = Date.parse(value);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

export function csvRows(buffer: Buffer): string[][] {
  // Validate the whole payload: bank exports often have entirely ASCII headers.
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    source = new TextDecoder("windows-1251").decode(buffer);
  }
  source = source.replace(/^\uFEFF/, "");
  // Only inspect the first unquoted record when choosing the separator.
  let quoted = false,
    commas = 0,
    semicolons = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (c === "\n" || c === "\r") break;
      if (c === ",") commas++;
      if (c === ";") semicolons++;
    }
  }
  const delimiter = semicolons > commas ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    closed = false;
  quoted = false;
  function endRow() {
    row.push(value);
    if (row.some((cell) => cell !== "")) rows.push(row);
    if (rows.length > maxOperations + 1)
      throw new Error("Слишком большой документ: используйте до 50 000 строк.");
    row = [];
    value = "";
    closed = false;
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c !== '"') value += c;
      else if (source[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (c === delimiter) {
      row.push(value);
      value = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else if (c === '"' && value === "" && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("Некорректные кавычки в CSV.");
      value += c;
    }
  }
  if (quoted) throw new Error("Незакрытые кавычки в CSV.");
  if (value !== "" || row.length || closed) endRow();
  return rows;
}
/** Multipart filenames may arrive as UTF-8 bytes decoded as Latin-1 by Multer.
 * Repair only a lossless UTF-8 round trip; preserve already-correct Unicode. */
export function readableFileName(name: string) {
  if ([...name].every((c) => c.charCodeAt(0) <= 255)) {
    const repaired = Buffer.from(name, "latin1").toString("utf8");
    if (
      !repaired.includes("\uFFFD") &&
      Buffer.from(repaired, "utf8").toString("latin1") === name
    )
      name = repaired;
  }
  return name
    .replace(/[\p{Cc}]/gu, " ")
    .trim()
    .slice(0, 180);
}
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
  if (buffer.length > maxBytes) throw new Error("Файл больше 8 МБ.");
  if (ext === "csv" || ext === "xlsx") {
    if (ext === "csv") rows = csvRows(buffer);
    else {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      if (buffer.subarray(0, 2).toString() !== "PK")
        throw new Error("Файл не является XLSX.");
      await book.xlsx.load(buffer as any);
      book.eachSheet((sheet) =>
        sheet.eachRow((row) => {
          rows.push(
            (row.values as import("exceljs").CellValue[])
              .slice(1)
              .map((v) =>
                typeof v === "object" && v !== null && "result" in v
                  ? String(v.result ?? "")
                  : String(v ?? ""),
              ),
          );
        }),
      );
    }
    if (rows[0]?.[0] !== "date")
      text = rows
        .map((r) => (r.length === 2 ? r.join(": ") : r.join(",")))
        .join("\n");
  } else if (ext === "docx") {
    if (buffer.subarray(0, 2).toString() !== "PK")
      throw new Error("Файл не является DOCX.");
    const { default: mammoth } = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (ext === "pdf") {
    if (buffer.subarray(0, 4).toString() !== "%PDF")
      throw new Error("Файл не является PDF.");
    const { PDFParse } = await import("pdf-parse");
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
  // Tabular statements are bounded by bytes and operation count, without a
  // second, smaller text cap. Keep the existing cap for extracted prose.
  if (text.length > 700_000 || rows.length > maxOperations + 1)
    throw new Error("Слишком большой документ: используйте до 50 000 строк.");
  const fields: Fields = {};
  const records: Record<string, string | number>[] = [];
  let period = "Не определён";
  let currency = "RUB";
  let category = categoryHint || "";
  const kv = /^([A-Za-z][A-Za-z0-9]*)\s*[:,\t]\s*(.+)$/;
  for (const line of text.split("\n")) {
    const m = line.trim().match(kv);
    if (m && rows[0]?.[0] !== "date") {
      const key = m[1],
        v = m[2].trim();
      if (key === "category") category = v;
      else if (key === "period") period = v;
      else if (key === "currency") currency = v;
      else if (key in fieldNames) {
        const n = Number(v.replace(/\s/g, "").replace(",", "."));
        fields[key] = v !== "" && Number.isFinite(n) ? n : v.slice(0, 1000);
      }
    }
  }
  if (rows[0]?.[0] === "date" && rows[0].includes("amount")) {
    category = "statement";
    const headers = rows[0];
    if (!headers.includes("kind"))
      throw new Error(
        "В шаблоне выписки нужна колонка kind: operating, financing, debt или transfer. Разметка не даёт принять получение кредита за операционный денежный поток.",
      );
    const dates: string[] = [];
    let incoming = 0,
      outgoing = 0,
      operatingFlow = 0,
      debtPayments = 0;
    const months = new Set<string>();
    for (const row of rows.slice(1)) {
      if (!row.some(Boolean)) continue;
      const date = row[0];
      const amount = Number(
        row[headers.indexOf("amount")]?.replace(/\s/g, "").replace(",", "."),
      );
      if (!calendarDate(date) || !Number.isFinite(amount))
        throw new Error("Выписка: нужны дата YYYY-MM-DD и числовая amount.");
      dates.push(date);
      months.add(date.slice(0, 7));
      if (amount >= 0) incoming += amount;
      else outgoing -= amount;
      const kind = row[headers.indexOf("kind")];
      if (!["operating", "financing", "debt", "transfer"].includes(kind))
        throw new Error(
          "Неизвестная категория операции kind. Используйте подготовленный шаблон.",
        );
      if (kind === "operating") operatingFlow += amount;
      if (kind === "debt" && amount < 0) debtPayments -= amount;
      const record: Record<string, string | number> = {
        date,
        amount,
        kind,
        counterparty: row[headers.indexOf("counterparty")] || "",
        purpose: row[headers.indexOf("purpose")] || "",
      };
      if (headers.includes("balance")) {
        const rawBalance = row[headers.indexOf("balance")]?.trim();
        const b = Number(rawBalance);
        if (rawBalance && Number.isFinite(b)) record.balance = b;
      }
      records.push(record);
    }
    if (!dates.length) throw new Error("В выписке нет операций.");
    dates.sort();
    records.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (typeof records.at(-1)?.balance === "number")
      fields.lastBalance = records.at(-1)!.balance;
    const first = new Date(dates[0]),
      last = new Date(dates.at(-1)!);
    const monthCount =
      (last.getUTCFullYear() - first.getUTCFullYear()) * 12 +
      last.getUTCMonth() -
      first.getUTCMonth() +
      1;
    period = dates[0] + " — " + dates.at(-1);
    Object.assign(fields, {
      inflow: incoming,
      outflow: outgoing,
      freeFlow: Math.round(operatingFlow / monthCount),
      existingPayments: Math.round(debtPayments / monthCount),
      months: monthCount,
      operations: dates.length,
    });
  }
  if (rows[0]?.[0] === "date" && rows[0].includes("payment")) {
    category = "schedule";
    const headers = rows[0];
    for (const row of rows.slice(1)) {
      if (!row.some(Boolean)) continue;
      const record: Record<string, string | number> = { date: row[0] };
      if (!calendarDate(row[0]))
        throw new Error("График: нужна корректная дата YYYY-MM-DD.");
      for (const key of [
        "payment",
        "principal",
        "interest",
        "balance",
        ...(headers.includes("fees") ? ["fees"] : []),
      ]) {
        const value = Number(row[headers.indexOf(key)]);
        if (!Number.isFinite(value) || value < 0)
          throw new Error("График: неверное число " + key);
        record[key] = value;
      }
      if (
        Math.abs(
          Number(record.payment) -
            Number(record.principal) -
            Number(record.interest) -
            Number(record.fees || 0),
        ) > 0.1
      )
        throw new Error(
          "График: платёж не равен сумме основного долга и процентов.",
        );
      records.push(record);
    }
    if (!records.length) throw new Error("График не содержит платежей.");
    records.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    Object.assign(fields, records[0], { payments: records.length });
    period = records[0].date + " — " + records.at(-1)!.date;
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
  return { category, period, currency, fields, records };
}
export const fieldNames: Record<string, string> = {
  inflow: "Поступления по счёту",
  outflow: "Списания по счёту",
  freeFlow: "Средний свободный денежный поток / мес.",
  existingPayments: "Средние действующие кредитные платежи / мес.",
  incoming: "Ожидаемые поступления",
  existing: "Действующие платежи",
  date: "Дата первого платежа",
  payments: "Платежей в графике",
  lastBalance: "Остаток по выписке",
  months: "Месяцев в выборке",
  operations: "Операций",
  assets: "Активы",
  liabilities: "Обязательства",
  equity: "Капитал",
  revenue: "Бухгалтерская выручка",
  previousRevenue: "Выручка предыдущего сопоставимого периода",
  salesProfit: "Прибыль от продаж",
  periodStart: "Начало отчётного периода",
  periodEnd: "Конец отчётного периода",
  previousStart: "Начало предыдущего периода",
  previousEnd: "Конец предыдущего периода",
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
  fees: "Комиссии",
  balance: "Остаток долга",
};
