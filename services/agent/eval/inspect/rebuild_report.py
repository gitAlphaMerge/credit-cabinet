"""Rebuild report from its .eval manifest without API calls or new model runs."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runtime import ROOT
from inspect_ai.log import read_eval_log
from reporting import aggregate, write_report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('report', help='path to report JSON')
    args = ap.parse_args()
    path = Path(args.report)
    report = json.loads(path.read_text(encoding='utf-8'))
    rows = []
    for previous in report['models']:
        locations = [p for p in report['log_files'] if '/' + previous['name'].replace(':', '-') + '/' in p.replace('\\', '/')]
        if locations:
            row = aggregate(previous, [read_eval_log(location) for location in locations])
            if report['phase'] == 'smoke':
                row['dialog_pass3'] = row['redteam_pass3'] = None
            rows.append(row)
        else:
            rows.append(previous)
    context = {k: v for k, v in report.items() if k not in ('models', 'qualified_candidates')}
    write_report(path.with_suffix('.md'), rows, context)
    print('REBUILT', path.relative_to(ROOT) if path.is_absolute() else path)


if __name__ == '__main__':
    main()
