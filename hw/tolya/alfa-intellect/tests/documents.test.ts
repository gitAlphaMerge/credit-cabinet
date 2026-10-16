import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixtures } from "../scripts/fixtures";
import { extract } from "../server/documents";
const dir = await mkdtemp(join(tmpdir(), "alfa-docs-"));
await createFixtures(dir);
for (const [category, file, field, expected] of [
  ["statement", "statement.csv", "freeFlow", 420000],
  ["balance", "balance.csv", "assets", 12500000],
  ["pnl", "pnl.pdf", "profit", 1260000],
  ["model", "model.xlsx", "plannedIncome", 1500000],
  ["plan", "plan.docx", "purpose", "Synthetic workshop equipment"],
  ["schedule", "schedule.csv", "payment", 114566],
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
