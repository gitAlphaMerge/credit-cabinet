// TASK.md explicitly authorizes transient mutations in these two production files.
// Run sequentially in an otherwise idle worktree. Every mutation restores exact bytes.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
type Mutation = { file: string; before: string; after: string; test: string };
const mutations: Mutation[] = [
  {
    file: "applications.ts",
    before: "p.consent !== true",
    after: "false",
    test: "missing consent",
  },
  {
    file: "applications.ts",
    before: 'role === "client" && application.user_id !== actorId',
    after: "false",
    test: "IDOR:",
  },
  {
    file: "applications.ts",
    before: "actor === role && (target === undefined || to === target)",
    after: "(target === undefined || to === target)",
    test: "HTTP ignores",
  },
  {
    file: "applications.ts",
    before: "if (a.amount > Number(core.limit_now_rub))",
    after: "if (false)",
    test: "gate/core/BKI/limit",
  },
  {
    file: "applications.ts",
    before: "if (stops.length)",
    after: "if (false)",
    test: "gate/core/BKI/limit",
  },
  {
    file: "applications.ts",
    before:
      'if (bki.status !== "unavailable" && bki.data.overdue90Plus12m > 0)',
    after: "if (false)",
    test: "gate/core/BKI/limit",
  },
  {
    file: "applications.ts",
    before: "cached.request_hash !== hash",
    after: "false",
    test: "exact response replay",
  },
  {
    file: "applications.ts",
    before: "if (cached) return cached;",
    after: "if (false) return cached;",
    test: "exact response replay",
  },
  {
    file: "applications.ts",
    before: "status=?,version=version+1",
    after: "status=?,version=version+2",
    test: "gate/core/BKI/limit",
  },
  {
    file: "applications-routes.ts",
    before: "res.locals.applicationRole = user.role;",
    after: 'res.locals.applicationRole = "manager";',
    test: "IDOR:",
  },
];
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const run = (pattern?: string) =>
  spawnSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      "./tests/qa/q1-loader.ts",
      "--test",
      "--test-force-exit",
      ...(pattern ? ["--test-name-pattern", pattern] : []),
      "tests/qa/q1-regression.test.ts",
    ],
    { encoding: "utf8", timeout: 60000, maxBuffer: 2_000_000 },
  );
const baseline = run();
process.stdout.write(baseline.stdout + baseline.stderr);
if (baseline.status !== 0)
  throw new Error("Mutation baseline failed: no production file was changed");
let killed = 0;
for (const [index, mutation] of mutations.entries()) {
  const path = `server/${mutation.file}`,
    original = readFileSync(path),
    source = original.toString("utf8");
  if (source.split(mutation.before).length !== 2)
    throw new Error(`Mutation ${index + 1}: anchor must match once`);
  const line = source
    .slice(0, source.indexOf(mutation.before))
    .split("\n").length;
  try {
    writeFileSync(path, source.replace(mutation.before, mutation.after));
    const result = run(mutation.test),
      output = result.stdout + result.stderr;
    // Compile/startup/timeout failures do not count as kills. Require an actual assertion failure.
    const assertion =
      result.status !== 0 &&
      /ERR_ASSERTION|AssertionError|expected .*got /i.test(output);
    if (assertion) killed++;
    console.log(
      `M${index + 1} ${path}:${line} ${assertion ? "KILLED" : result.status === 0 ? "SURVIVED" : "INVALID"} test=${mutation.test}`,
    );
    process.stdout.write(output);
  } finally {
    writeFileSync(path, original);
    if (digest(readFileSync(path)) !== digest(original))
      throw new Error(`Restore failed: ${path}`);
  }
}
console.log(
  `KILL_RATE=${killed}/${mutations.length} (${(100 * killed) / mutations.length}%)`,
);
if (killed !== mutations.length) process.exitCode = 1;
