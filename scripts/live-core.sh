#!/usr/bin/env bash
# From cc-p1-apps: bash scripts/live-core.sh
# Optional: CREDIT_CABINET_DIR=/path/to/credit-cabinet PYTHON=python3 bash scripts/live-core.sh
# Uses installed node_modules only. Temp logs/journal are retained for acceptance.
set -euo pipefail
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export CREDIT_CABINET_DIR="${CREDIT_CABINET_DIR:-$(dirname -- "$repo")/credit-cabinet}"
export TEAM_API_URL=http://127.0.0.1:5000
export CORE_ID=liza PORT=5000 PYTHONDONTWRITEBYTECODE=1
python_bin="${PYTHON:-python}"
artifacts="$(mktemp -d "${TMPDIR:-/tmp}/alfa-live-core.XXXXXX")"
export JOURNAL_PATH="$artifacts/decisions.jsonl"
if command -v cygpath >/dev/null 2>&1; then
  export CREDIT_CABINET_DIR="$(cygpath -m "$CREDIT_CABINET_DIR")"
  export JOURNAL_PATH="$(cygpath -m "$JOURNAL_PATH")"
fi
core_pid=""
cleanup() {
  if [[ -n "$core_pid" ]]; then
    kill "$core_pid" 2>/dev/null || true
    wait "$core_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
echo "Live core logs and decision journal: $artifacts"
# app.py hardcodes 0.0.0.0. Bind its standard-library HTTP server to loopback
# without changing core files; run the actual app.py as __main__.
(
  cd -- "$CREDIT_CABINET_DIR"
  exec "$python_bin" -u -c '
import http.server, os, runpy, sys
original = http.server.ThreadingHTTPServer
class LoopbackServer(original):
    def __init__(self, address, handler, *args, **kwargs):
        super().__init__(("127.0.0.1", address[1]), handler, *args, **kwargs)
http.server.ThreadingHTTPServer = LoopbackServer
sys.path.insert(0, os.path.abspath("services/ml-model"))
runpy.run_path("services/ml-model/app.py", run_name="__main__")
'
) >"$artifacts/core.log" 2>&1 &
core_pid=$!
cd -- "$repo/hw/tolya/alfa-intellect"
# Bounded startup wait. Failure still runs the suite so Node reports explicit SKIP.
node --input-type=module -e '
const end = Date.now() + 15000;
while (Date.now() < end) {
  try {
    const r = await fetch("http://127.0.0.1:5000/health", {signal: AbortSignal.timeout(500)});
    await r.body?.cancel();
    if (r.ok) process.exit(0);
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 200));
}
process.exit(1);
' || { echo "Core startup unavailable; suite will report SKIP. Core log:"; cat "$artifacts/core.log"; }
# Do not silently test an unrelated process already occupying port 5000.
if ! kill -0 "$core_pid" 2>/dev/null; then
  echo "Core child exited; see $artifacts/core.log"
  cat "$artifacts/core.log"
  # Still show explicit skipped tests if no service is available.
  node --import tsx --test tests/applications-live.test.ts
  exit 1
fi
node --import tsx --test tests/applications-live.test.ts
