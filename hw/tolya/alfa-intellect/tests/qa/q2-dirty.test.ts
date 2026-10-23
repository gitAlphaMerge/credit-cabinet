import test from "node:test";
import assert from "node:assert/strict";
import { extract } from "../../server/documents";
import { readFile } from "node:fs/promises";
import { seed, csv, shuffled } from "./q2-harness";
const message = `seed=${seed}`;

test("reject empty, header-only, binary CSV and nonnumeric amount", async () => {
  for (const buffer of [
    Buffer.alloc(0),
    Buffer.from("date,amount,counterparty,purpose,kind\n"),
    Buffer.from([0, 255, 0, 137, 80, 78, 71]),
    Buffer.from("date,amount,kind\n2026-10-22,NaN,operating"),
  ])
    await assert.rejects(extract(buffer, "statement.csv"), message);
});

test("signed amounts, localized numbers and debt excluded from operating flow", async () => {
  const data = await extract(
    Buffer.from(
      'date,amount,kind\n2026-10-01,"1 234,50",operating\n2026-10-02,-100,operating\n2026-10-03,-50,debt',
    ),
    "statement.csv",
  );
  assert.equal(data.fields.freeFlow, 1135, message);
  assert.equal(data.fields.existingPayments, 50, message);
  assert.equal(data.fields.inflow, 1234.5, message);
  assert.equal(data.fields.outflow, 150, message);
  assert.equal(data.records.length, 3, message);
});

test("permutation preserves extracted fields and canonical multiset of operations", async () => {
  const [header, ...rows] = csv(36).split("\n");
  const original = await extract(
    Buffer.from([header, ...rows].join("\n")),
    "statement.csv",
  );
  const changed = await extract(
    Buffer.from([header, ...shuffled(rows)].join("\n")),
    "statement.csv",
  );
  assert.deepEqual(changed.fields, original.fields, message);
  const canonical = (records: typeof original.records) =>
    records.map((r) => JSON.stringify(r)).sort();
  assert.deepEqual(
    canonical(changed.records),
    canonical(original.records),
    message,
  );
});

test("UTF8 BOM preserves statement fields and records", async () => {
  const source = csv();
  assert.deepEqual(
    await extract(Buffer.from("\uFEFF" + source), "statement.csv"),
    await extract(Buffer.from(source), "statement.csv"),
    message,
  );
});

test("duplicates are observable rather than silently lost", async () => {
  const row = "2026-10-22,1000,Client,Service,operating";
  const data = await extract(
    Buffer.from("date,amount,counterparty,purpose,kind\n" + row + "\n" + row),
    "statement.csv",
  );
  assert.equal(data.fields.operations, 2, message);
  assert.equal(data.fields.freeFlow, 2000, message);
});

test("real v3 dirty CSV and CP1251 1C fail explicitly without unsupported success", async () => {
  const folder = new URL(
    "../../../../../data/v3/ALFA_DELO-003/seed_0/",
    import.meta.url,
  );
  for (const filename of ["statement_dirty.csv", "statement_1c.txt"]) {
    const data = await readFile(new URL(filename, folder));
    assert.ok(data.length > 0, message);
    await assert.rejects(extract(data, filename), message);
  }
});
