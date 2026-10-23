import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extract } from "../../server/documents";

test("v3 CSV and 1C compatibility across every client and seed", async () => {
  const folder = new URL("../../../../../data/v3/", import.meta.url);
  const names = (await readdir(folder, { recursive: true }))
    .filter((name) => /\.(csv|txt)$/.test(name))
    .sort();
  assert.ok(names.length > 100);
  const hash = createHash("sha256");
  let accepted = 0,
    rejected = 0;
  for (const name of names) {
    let result: unknown;
    try {
      result = await extract(
        await readFile(new URL(name.replaceAll("\\", "/"), folder)),
        name,
      );
      accepted++;
    } catch (error) {
      result = { error: (error as Error).message };
      rejected++;
    }
    hash.update(JSON.stringify([name.replaceAll("\\", "/"), result]) + "\n");
  }
  const digest = hash.digest("hex");
  console.log(
    "F4_V3",
    JSON.stringify({ files: names.length, accepted, rejected, digest }),
  );
  assert.equal(
    digest,
    "71fab4229efeae612f15794c862e94b3b912ba76699a18cfeff5d0df2a2ac632",
  );
});
