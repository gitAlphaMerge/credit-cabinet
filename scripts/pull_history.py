"""Download incremental, redacted cabinet exports using only the stdlib."""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def download(base, directory=None, token=None):
    directory = Path(directory) if directory is not None else Path.home() / "projects/credit-cabinet-history"
    token = token or os.getenv("FEEDBACK_EXPORT_TOKEN")
    if not token:
        token = (Path.home() / ".config/credit-cabinet/token").read_text(encoding="utf-8").strip()
    if not token:
        raise ValueError("FEEDBACK_EXPORT_TOKEN is empty")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    state_path = directory / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    # Capture the watermark BEFORE requests: changes during export are fetched next time.
    started = datetime.now(timezone.utc)
    since = state.get("since")
    query = "?" + urlencode({"since": since}) if since else ""
    batches = {}
    for kind in ("history", "feedback"):
        request = Request(base.rstrip("/") + "/api/admin/" + kind + ".jsonl" + query,
                          headers={"Authorization": "Bearer " + token})
        with urlopen(request, timeout=60) as response:
            batches[kind] = [json.loads(line) for line in response.read().decode("utf-8").splitlines() if line.strip()]
    counts = []
    for kind, rows in batches.items():
        path = directory / (kind + "-" + started.date().isoformat() + ".jsonl")
        # Replace snapshots by id; feedback edits and repeated boundary records never duplicate.
        key = "chat_id" if kind == "history" else "id"
        existing = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()] if path.exists() else []
        merged = {row[key]: row for row in existing}
        merged.update({row[key]: row for row in rows})
        temporary = path.with_suffix(".jsonl.tmp")
        temporary.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in merged.values()), encoding="utf-8")
        temporary.replace(path)
        counts.append(len(rows))
    temporary = state_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps({"since": started.isoformat()}), encoding="utf-8")
    temporary.replace(state_path)
    print(f"скачано {counts[0]} чатов, {counts[1]} оценок")
    return tuple(counts)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    args = parser.parse_args()
    try:
        download(args.base)
    except (OSError, ValueError) as error:
        # Never include credentials or request headers in diagnostics.
        parser.exit(1, f"Не удалось скачать историю: {type(error).__name__}\n")


if __name__ == "__main__":
    main()
