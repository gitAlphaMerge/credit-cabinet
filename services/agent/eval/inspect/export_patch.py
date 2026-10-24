"""Export new eval artifacts for review when worktree git metadata is read-only."""
import difflib
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[4]
OUTPUT = ROOT / 'services/agent/eval/reports/eval-a.patch'


def main():
    result = subprocess.run(['git', 'ls-files', '--others', '--exclude-standard', '--', 'services/agent/eval'],
                            cwd=ROOT, capture_output=True, text=True, check=True)
    parts, count = [], 0
    for relative in result.stdout.splitlines():
        path = ROOT / relative
        if path == OUTPUT:
            continue
        # All task edits are new text files. Do not include dependencies, local
        # traces, keys or user task files; gitignore and the explicit scope apply.
        text = path.read_text(encoding='utf-8-sig').replace('\r\n', '\n')
        if text and not text.endswith('\n'):
            text += '\n'
        parts.append(f'diff --git a/{relative} b/{relative}\nnew file mode 100644\n')
        parts.extend(difflib.unified_diff([], text.splitlines(keepends=True), fromfile='/dev/null', tofile='b/' + relative))
        count += 1
    OUTPUT.write_text(''.join(parts), encoding='utf-8', newline='\n')
    print(f'PATCH EXPORTED: {count} new eval files -> {OUTPUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
