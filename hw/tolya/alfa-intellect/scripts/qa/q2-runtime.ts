// Native Node fallback for hosts where tsx cannot call os.userInfo().
// Mutations exist only in loader output, never in production files on disk.
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const mutations = [
  [
    "applications.ts",
    "if (!response.ok)",
    "if (false)",
    "upstream HTTP status ignored",
  ],
  [
    "applications.ts",
    'typeof core.limit_now_rub !== "number"',
    "false",
    "limit type guard removed",
  ],
  [
    "applications.ts",
    "core.limit_now_rub < 0",
    "false",
    "negative limit guard removed",
  ],
  [
    "applications.ts",
    "!Array.isArray(core.stops_fired)",
    "Array.isArray(core.stops_fired)",
    "stop-array guard inverted",
  ],
  [
    "applications.ts",
    'if (compliance.gate !== "pass")',
    'if (compliance.gate === "pass")',
    "compliance gate inverted",
  ],
  [
    "documents.ts",
    'if (kind === "operating") operatingFlow += amount;',
    'if (kind === "operating") operatingFlow -= amount;',
    "operating flow sign inverted",
  ],
  [
    "documents.ts",
    'if (kind === "debt" && amount < 0) debtPayments -= amount;',
    'if (kind === "debt" && amount < 0) debtPayments += amount;',
    "debt sign inverted",
  ],
  ["documents.ts", "rows.length > 50000", "rows.length > 2", "row cap reduced"],
  [
    "documents.ts",
    "!Number.isFinite(amount)",
    "Number.isFinite(amount)",
    "amount guard inverted",
  ],
  [
    "registry.ts",
    "      502,",
    "      200,",
    "registry failure reported as success status",
  ],
] as const;

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || !context.parentURL) throw error;
      for (const suffix of [".ts", ".tsx"]) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(url)) return { url: url.href, shortCircuit: true };
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (!url.startsWith("file:") || !url.endsWith(".ts"))
      return nextLoad(url, context);
    let source = readFileSync(new URL(url), "utf8");
    const index = Number(process.env.Q2_MUTANT ?? -1);
    const mutation = mutations[index];
    if (
      mutation &&
      fileURLToPath(url)
        .replaceAll("\\", "/")
        .endsWith("/server/" + mutation[0])
    ) {
      if (!source.includes(mutation[1]))
        throw new Error("Mutation anchor missing: " + index);
      source = source.replace(mutation[1], mutation[2]);
      process.stderr.write(`Q2_MUTANT=${index}: ${mutation[3]}\n`);
    }
    // Installed Node typings only expose strip mode; Node 24 also supports transform.
    return {
      format: "module",
      source: stripTypeScriptTypes(source, { mode: "transform" } as any),
      shortCircuit: true,
    };
  },
});
