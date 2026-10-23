/** Sandbox bootstrap only. Usage: node tests/qa/q4-runner.ts <test paths>.
 * --baseline runs exactly the npm test file globs with isolated node:test workers.
 * No product code is patched. os.userInfo is needed by tsx's pipe-name helper.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const loader = pathToFileURL(require.resolve("tsx/esm")).href;
const bootstrap = `
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
try { os.userInfo(); } catch (error) {
  if (error.code !== 'ERR_SYSTEM_ERROR' || error.info?.syscall !== 'uv_os_get_passwd') throw error;
  os.userInfo = () => ({ username: 'q4-sandbox', uid: -1, gid: -1, shell: null, homedir: process.cwd() });
  syncBuiltinESMExports();
}
await import(${JSON.stringify(loader)});
`;
const requested = process.argv.slice(2);
const files =
  requested[0] === "--baseline"
    ? ["tests/*.test.ts", "tests/*.test.tsx"]
    : requested;
if (!files.length) throw new Error("Pass explicit test paths or --baseline");
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "data:text/javascript," + encodeURIComponent(bootstrap),
    "--test",
    "--test-reporter=spec",
    ...files,
  ],
  { stdio: "inherit", env: process.env },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
