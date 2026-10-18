import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixtures } from "../scripts/fixtures";
import { extract, readableFileName } from "../server/documents";
const dir = await mkdtemp(join(tmpdir(), "alfa-docs-"));
test("Russian uploaded filenames are losslessly decoded, not double-decoded", () => {
  const original = "Выписка за октябрь.csv",
    wire = Buffer.from(original, "utf8").toString("latin1");
  assert.equal(readableFileName(wire), original);
  assert.equal(readableFileName(original), original);
  assert.equal(readableFileName("statement.csv"), "statement.csv");
  assert.equal(readableFileName("Café.csv"), "Café.csv");
  assert.equal(readableFileName("Смета\u0000.csv"), "Смета .csv");
});
await createFixtures(dir);
for (const [category, file, field, expected] of [
  ["statement", "statement.csv", "freeFlow", 420000],
  ["balance", "balance.csv", "assets", 12500000],
  ["pnl", "pnl.pdf", "profit", 1260000],
  ["model", "model.xlsx", "plannedIncome", 1500000],
  ["plan", "plan.docx", "purpose", "Synthetic workshop equipment"],
  ["schedule", "schedule.csv", "payments", 28],
] as const)
  test("Извлечение " + category, async () => {
    const d = await extract(await readFile(join(dir, file)), file);
    assert.equal(d.category, category);
    assert.equal(d.fields[field], expected);
    assert.equal(d.currency, "RUB");
    assert.ok(d.period.length > 3);
  });
test("Неподдерживаемый файл, ложное расширение, пустой CSV и неверная сумма отклоняются", async () => {
  await assert.rejects(extract(Buffer.from("bad"), "x.exe"));
  await assert.rejects(extract(Buffer.from("bad"), "x.pdf"));
  await assert.rejects(extract(Buffer.from("date,amount\n"), "x.csv"));
  await assert.rejects(
    extract(Buffer.from("date,amount\n2026-09-01,invalid"), "x.csv"),
  );
  await assert.rejects(
    extract(Buffer.from("category,balance\nassets,3"), "x.csv"),
  );
});
test("Кредитные поступления и внутренние переводы не увеличивают операционный поток", async () => {
  const data =
    "date,amount,counterparty,purpose,balance,kind\n2026-06-01,500000,Customer,Sale,500000,operating\n2026-06-05,-200000,Supplier,Cost,300000,operating\n2026-06-10,3000000,Bank,Loan,3300000,financing\n2026-06-15,-50000,Bank,Repayment,3250000,debt\n2026-06-20,700000,Own,Transfer,3950000,transfer\n";
  const d = await extract(Buffer.from(data), "statement.csv");
  assert.equal(d.fields.freeFlow, 300000);
  assert.equal(d.fields.existingPayments, 50000);
  assert.equal(d.records.length, 5);
  assert.equal(d.fields.date, undefined);
});
test("Полный график хранит даты и согласованные части платежа", async () => {
  const d = await extract(
    await readFile(join(dir, "schedule.csv")),
    "schedule.csv",
  );
  assert.equal(d.records.length, 28);
  assert.equal(d.records[0].date, "2026-11-16");
  assert.ok(
    Math.abs(
      Number(d.records[0].payment) -
        Number(d.records[0].principal) -
        Number(d.records[0].interest),
    ) < 0.02,
  );
  assert.equal(d.records.at(-1)!.balance, 0);
});
