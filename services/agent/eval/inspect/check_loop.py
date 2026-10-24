"""A deliberately red regression against unchanged production rules."""
import argparse
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))
import dialog
import intake_rules
from metrics import loops


def run():
    items = json.loads((HERE.parent / 'data/loop-goals.json').read_text(encoding='utf-8'))
    rows = []
    for item in items:
        state = dialog.new_state({})
        dialog.turn(state, '')
        dialog.turn(state, item['text'], intake=intake_rules.parse)
        rows.append({'id': item['id'], 'text': item['text'], 'expected': item['expected'],
                     'actual': intake_rules.parse(item['text'], 'purpose'),
                     'loops': loops(state['trace']), 'trace': state['trace']})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--expect-red', action='store_true')
    args = ap.parse_args()
    rows = run()
    count = sum(bool(row['loops']) for row in rows)
    output = HERE.parent / 'reports/loop-regression.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'LOOP REGRESSION: {count}/{len(rows)} dialogs repeat the purpose slot (RED)')
    print('evidence:', output.as_posix())
    return (0 if count > 0 and len(rows) >= 30 else 1) if args.expect_red else (1 if count else 0)


if __name__ == '__main__':
    raise SystemExit(main())
