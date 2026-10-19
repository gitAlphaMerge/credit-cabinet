import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph } from "docx";
import PDFDocument from "pdfkit";
import { pathToFileURL } from "node:url";
import { calculate } from "../server/finance";
export async function createFixtures(dir: string) {
  await mkdir(dir, { recursive: true });
  let balance = 500000;
  const rows = ["date,amount,counterparty,purpose,balance,kind"];
  for (let m = 4; m <= 9; m++) {
    for (const [d, amount, counterparty, purpose] of [
      [3, 1200000, "Synthetic Customer", "Contract income"],
      [10, -300000, "Synthetic Supplier", "Materials"],
      [15, -350000, "Synthetic Staff", "Payroll"],
      [22, -130000, "Synthetic Landlord", "Rent and tax"],
    ] as const) {
      balance += amount;
      rows.push(
        `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")},${amount},${counterparty},${purpose},${balance},operating`,
      );
    }
  }
  await writeFile(resolve(dir, "statement.csv"), rows.join("\n") + "\n");
  await writeFile(
    resolve(dir, "balance.csv"),
    "category,balance\nperiod,2026-09-30\ncurrency,RUB\nassets,12500000\nliabilities,4500000\nequity,8000000\nreceivables,2300000\n",
  );
  const schedule = calculate(
    { amount: 3000000, term: 36, rate: 22 },
    new Date("2026-02-16"),
  ).schedule.slice(8);
  await writeFile(
    resolve(dir, "schedule.csv"),
    [
      "date,payment,principal,interest,balance",
      ...schedule.map((p) =>
        [p.date, p.payment, p.principal, p.interest, p.balance].join(","),
      ),
    ].join("\n") + "\n",
  );
  const x = new ExcelJS.Workbook(),
    s = x.addWorksheet("Synthetic model");
  [
    ["category", "model"],
    ["period", "2027 plan"],
    ["currency", "RUB"],
    ["plannedIncome", 1500000],
    ["plannedExpenses", 900000],
    ["investment", 3000000],
  ].forEach((r) => s.addRow(r));
  s.columns = [{ width: 25 }, { width: 35 }];
  await x.xlsx.writeFile(resolve(dir, "model.xlsx"));
  const p = new Document({
    sections: [
      {
        children: [
          "category: plan",
          "period: 2027 plan",
          "currency: RUB",
          "purpose: Synthetic workshop equipment",
          "assumptions: Production capacity increases by 20 percent",
          "risks: Customer payment delay and cost inflation",
        ].map((t) => new Paragraph(t)),
      },
    ],
  });
  await writeFile(resolve(dir, "plan.docx"), await Packer.toBuffer(p));
  const pdf = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((r) => {
    pdf.on("data", (b) => chunks.push(b));
    pdf.on("end", () => r(Buffer.concat(chunks)));
  });
  pdf
    .fontSize(14)
    .text("SYNTHETIC FINANCIAL RESULTS - NOT CLIENT DATA")
    .moveDown();
  [
    "category: pnl",
    "period: 2026-Q3",
    "currency: RUB",
    "revenue: 3600000",
    "expenses: 2340000",
    "profit: 1260000",
  ].forEach((t) => pdf.fontSize(12).text(t));
  pdf.end();
  await writeFile(resolve(dir, "pnl.pdf"), await done);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await createFixtures(resolve("fixtures"));
  console.log("6 synthetic fixtures generated in fixtures/");
}
