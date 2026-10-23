import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const target = new URL("../../scripts/seed-manager.ts", import.meta.url);
const original = readFileSync(target, "utf8");
const mutations = [
  [
    "consent",
    'await send("submit", { consent: true })',
    'await send("submit", { consent: false })',
  ],
  [
    "role",
    'actorRole: "system"',
    'actorRole: "manager"',
  ],
  [
    "silent-transition",
    'await send("escalate_silent", {});',
    'await send("agent_nudge", {});',
  ],
  [
    "nudge-required",
    'await send("agent_nudge", {',
    'if (false) await send("agent_nudge", {',
  ],
  [
    "idempotency",
    ".get(userId, `q5-${c.key}`) as Application | undefined",
    " .get(userId, `not-q5-${c.key}`) as Application | undefined",
  ],
  ["short-document", "months: 8", "months: 12"],
  ["alternative-limit", "amount: 90000000", "amount: 300000"],
  [
    "concentration",
    "concentrated: true",
    "concentrated: false",
  ],
];
let killed = 0;
for (const [name, from, to] of mutations) {
  if (!original.includes(from))
    throw new Error(`Mutation anchor missing: ${name}`);
  const line = original.slice(0, original.indexOf(from)).split("\n").length;
  try {
    writeFileSync(target, original.replace(from, to));
    const run = spawnSync(
      process.execPath,
      [
        "--experimental-transform-types",
        new URL("q5-run.ts", import.meta.url).pathname.replace(
          /^\/([A-Za-z]:)/,
          "$1",
        ),
        "./q5-seed.test.ts",
      ],
      { encoding: "utf8" },
    );
    const output = run.stdout + run.stderr;
    const dead =
      run.status !== 0 &&
      /AssertionError|ApplicationError|Q5 .*ожидалась|Q5 .*недоступны/.test(
        output,
      ) &&
      /tests 2/.test(output);
    if (dead) killed++;
    console.log(
      `${name} | seed-manager.ts:${line} | ${dead ? "KILLED" : "SURVIVED/INVALID"} | exit=${run.status}`,
    );
    if (!dead) console.log(output.slice(-2000));
  } finally {
    writeFileSync(target, original);
  }
}
console.log(`kill rate ${killed}/${mutations.length}`);
if (killed !== mutations.length) process.exitCode = 1;
