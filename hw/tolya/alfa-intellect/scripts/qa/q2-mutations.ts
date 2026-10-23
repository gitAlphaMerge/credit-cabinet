import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mutations } from "./q2-runtime";

const files = ["applications.ts", "documents.ts", "registry.ts"];
const hash = (file: string) =>
  createHash("sha256")
    .update(readFileSync(new URL("../../server/" + file, import.meta.url)))
    .digest("hex");
const before = files.map(hash);
let killed = 0;
const results = [];
for (const [index, mutation] of mutations.entries()) {
  const fault = mutation[0] !== "documents.ts";
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/qa/q2-runtime.ts",
      "--test",
      "--test-name-pattern",
      fault
        ? "core 500|core string-limit|core negative-limit|local compliance|registry adapter"
        : "signed amounts|permutation|reject empty",
      fault ? "tests/qa/q2-faults.test.ts" : "tests/qa/q2-dirty.test.ts",
    ],
    {
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, Q2_MUTANT: String(index) },
    },
  );
  const output = result.stdout + result.stderr;
  const activated = output.includes(`Q2_MUTANT=${index}:`);
  const failures = output.split(/\r?\n/).filter((line) => /^✖/.test(line));
  // Infrastructure failures cannot count as kills.
  const isKilled =
    activated && result.status === 1 && failures.length > 0 && !result.error;
  if (isKilled) killed++;
  const row = {
    index,
    file: mutation[0],
    anchor: mutation[1],
    change: mutation[3],
    status: isKilled
      ? "killed"
      : activated && result.status === 0
        ? "survived"
        : "infrastructure failure",
    failures,
    tail: output
      .split(/\r?\n/)
      .filter((line) => /^ℹ/.test(line))
      .slice(-8),
    error: result.error?.message,
  };
  results.push(row);
  console.log("Q2_MUTATION", JSON.stringify(row));
}
const unchanged = before.every((digest, i) => hash(files[i]) === digest);
console.log(
  "Q2_MUTATIONS",
  JSON.stringify({
    killed,
    total: mutations.length,
    killRate: killed / mutations.length,
    unchanged,
    results,
    hashes: Object.fromEntries(files.map((file, i) => [file, before[i]])),
  }),
);
if (!unchanged || results.some((r) => r.status === "infrastructure failure"))
  process.exitCode = 1;
