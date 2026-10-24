"""Check the actual credential against delivery files and decoded Inspect logs."""
import os
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runtime import HERE, ROOT, load_env
from inspect_ai.log import read_eval_log


def main():
    load_env()
    credential = os.getenv('OPENROUTER_API_KEY')
    if not credential:
        raise RuntimeError('credential unavailable: audit not performed')
    result = subprocess.run(['git', 'ls-files', '--others', '--exclude-standard', '--', 'services/agent/eval'],
                            cwd=ROOT, capture_output=True, text=True, check=True)
    files = [ROOT / p for p in result.stdout.splitlines()]
    leaks = []
    for path in files:
        if credential in path.read_text(encoding='utf-8-sig'):
            leaks.append(str(path.relative_to(ROOT)))
    logs = list((HERE / 'logs').rglob('*.eval'))
    for path in logs:
        log = read_eval_log(str(path))
        if credential in log.model_dump_json():
            leaks.append(str(path.relative_to(ROOT)))
    if leaks:
        # Print paths only, never the credential, request headers or leaked text.
        raise RuntimeError('credential found in: ' + ', '.join(leaks))
    print(f'SECRET AUDIT OK: {len(files)} delivery files, {len(logs)} decoded Inspect logs; no credential leakage')


if __name__ == '__main__':
    main()
