"""Offline acceptance of artifacts, independent of whether candidate scores pass."""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent


def check(path):
    report = json.loads(Path(path).read_text(encoding='utf-8'))
    assert report['phase'] == 'matrix' and report['offline'] is False
    assert report['epochs'] == 3
    assert report['budget_usd'] <= 3
    models = report['models']
    assert len([m for m in models if m['mode'] == 'remote']) in range(4, 7)
    assert any(m['name'] == 'templates' for m in models)
    assert any(m['name'] == 'qwen3:8b' for m in models)
    expected_intake = sum(len(json.loads(p.read_text(encoding='utf-8'))) for prefix in ('phrases-', 'loop-')
                          for p in (HERE.parent / 'data').glob(prefix + '*.json'))
    persona_counts = {}
    for kind in ('dialog', 'redteam'):
        persona_counts[kind] = sum(len(json.loads(p.read_text(encoding='utf-8')))
            for p in (HERE.parent / 'data').glob('personas-*.json')
            if ('redteam' in p.name) == (kind == 'redteam'))
    evaluated = 0
    for model in models:
        assert model['parameters_b'] <= 120
        if model['mode'] != 'templates':
            assert model.get('hf', '').startswith('https://huggingface.co/') and model['license']
        if model['status'] == 'unavailable':
            assert model['errors']
            assert model['mode'] == 'local', (model['name'], 'remote candidate not evaluated')
            continue
        assert model['intake_n'] == expected_intake, (model['name'], 'intake incomplete')
        for kind, expected in persona_counts.items():
            rows = model['rows'][kind]
            assert len(rows) == expected * 3, (model['name'], kind, 'missing attempts')
            counts = Counter((row['id'], row['epoch']) for row in rows)
            assert len(counts) == expected * 3 and set(counts.values()) == {1}
            assert {r['epoch'] for r in rows} == {1, 2, 3}
        evaluated += 1
    regression = json.loads((HERE.parent / 'reports/loop-regression.json').read_text(encoding='utf-8'))
    assert len(regression) >= 30 and any(r['loops'] for r in regression)
    print(f'MATRIX ARTIFACTS OK: {evaluated} evaluated; {expected_intake} intake + '
          f'{persona_counts["dialog"] * 3} dialog + {persona_counts["redteam"] * 3} redteam attempts per candidate')
    print(f'LOOP RED: {sum(bool(r["loops"]) for r in regression)}/{len(regression)}; budget ledger ${report["budget_usd"]:.6f} <= $3')
    print('MODEL FAILURES/UNAVAILABLE ARE PRESERVED; qualified: ' + (','.join(report['qualified_candidates']) or 'none'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('report')
    arguments = parser.parse_args()
    check(arguments.report)
