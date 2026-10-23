// Offline alternative to tsx when its startup os.userInfo() fails in the sandbox.
// Uses the already installed esbuild dependency; no output files or package installs.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
        for (const suffix of [".ts", ".tsx", "/index.ts"]) {
          const url = new URL(specifier + suffix, context.parentURL);
          if (existsSync(url)) return { url: url.href, shortCircuit: true };
        }
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (/\.tsx?$/.test(url) && !url.includes("/node_modules/"))
      return {
        format: "module",
        shortCircuit: true,
        source: transformSync(readFileSync(fileURLToPath(url), "utf8"), {
          loader: url.endsWith(".tsx") ? "tsx" : "ts",
          format: "esm",
          target: "node24",
          jsx: "automatic",
          sourcefile: fileURLToPath(url),
        }).code,
      };
    return next(url, context);
  },
});
