"""Show coverage of all source specs, including cases excluded by validation."""

from collections import Counter

from build_v3 import discover_specs
from validate_specs import OUTCOMES, catalog, validate


def table(title, products, columns, counts):
    """Print empty coverage cells explicitly, without terminal color dependencies."""
    print(title)
    print('product | ' + ' | '.join(columns))
    for product in products:
        print(product + ' | ' + ' | '.join(str(counts[product, col]) if counts[product, col] else '--' for col in columns))


def main():
    """Count accepted cases so rejected specs cannot disguise missing product coverage."""
    outcomes, traps = Counter(), Counter()
    specs, skipped = [], []
    for _, batch in discover_specs():
        bad = {f['case_id'] for f in validate(batch) if f['severity'] == 'error'}
        specs.extend(s for s in batch if s['case_id'] not in bad)
        skipped.extend(s['case_id'] for s in batch if s['case_id'] in bad)
    trap_names = set()
    for spec in specs:
        product = spec['request']['product_asked'] or spec['expected']['product'] or 'UNKNOWN'
        outcomes[product, spec['expected']['outcome']] += 1
        for trap in (spec['expected']['trap'] or 'none').split('+'):
            trap_names.add(trap)
            traps[product, trap] += 1
    products = sorted(set(catalog()) | {p for p, _ in outcomes})
    table('PRODUCT x OUTCOME (validated specs)', products, OUTCOMES, outcomes)
    table('PRODUCT x TRAP (combo counted in each trap)', products, sorted(trap_names), traps)
    missing = [f'{p}:{o}' for p in products for o in ('approve', 'reject') if not outcomes[p, o]]
    missing += [f'{p}:{t}' for p in products for t in ('T01', 'T03', 'T18') if not traps[p, t]]
    print(f'COVERAGE source={len(specs) + len(skipped)} accepted={len(specs)} skipped={len(skipped)} '
          f'products_with_specs={len({p for p, _ in outcomes})}/{len(catalog())} missing={",".join(missing) or "none"}')
    return int(bool(missing))


if __name__ == '__main__':
    raise SystemExit(main())
