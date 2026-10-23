// Offline fallback for this sandbox's tsx uv_os_get_passwd ENOMEM.
// Run with Node 24: node --import ./tests/qa/q3-loader.ts --test ...
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        const url = base.href + suffix;
        if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.(ts|tsx)$/.test(url) && !url.includes("/node_modules/")) {
      const source = transformSync(readFileSync(fileURLToPath(url), "utf8"), {
        sourcefile: fileURLToPath(url),
        loader: url.endsWith(".tsx") ? "tsx" : "ts",
        target: "es2023",
        format: "esm",
        jsx: "automatic",
      }).code;
      return { format: "module", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
