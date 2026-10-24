"""Pure deterministic metrics, shared by Inspect scorers, reports and tests."""
from collections import Counter
import math

FIELDS = ('purpose', 'amount_rub', 'term_months', 'repay_from', 'contract_with_main_customer')


def scored_fields(item, source):
    # Legacy corpus explicitly excluded repay_from in data_io.FIELDS. Missing
    # annotations there mean unknown, not an assertion that the slot is absent.
    return tuple(k for k in FIELDS if not (source == 'phrases-deepseek.json'
                and k == 'repay_from' and k not in item['expected']))


def slot_matches(expected, actual, fields=FIELDS):
    # Include absent fields: inventing a slot is an error too. Intent is a separate task.
    return {k: actual.get(k) == expected.get(k) for k in fields}


def loops(trace):
    """Semantic router slot repetition, including paraphrased questions and side returns."""
    counts = Counter()
    for turn in trace:
        goal = turn.get('goal', '')
        if goal.startswith('ask:'):
            counts[goal[4:]] += 1
        elif turn.get('goal') == 'answer' and turn.get('slot') and '?' in turn.get('reply', ''):
            counts[turn['slot']] += 1
    return {slot: count for slot, count in counts.items() if count >= 2}


def pass3(rows):
    """Missing, failed or errored epochs can never turn into a pass."""
    by = {}
    for row in rows:
        by.setdefault(str(row['id']), []).append(row)
    return {key: len(items) == 3 and {r['epoch'] for r in items} == {1, 2, 3}
            and all(r.get('passed') is True for r in items) for key, items in by.items()}


def percentile(values, q):
    if not values:
        return None
    xs = sorted(values)
    position = (len(xs) - 1) * q
    lo, hi = math.floor(position), math.ceil(position)
    return xs[lo] + (xs[hi] - xs[lo]) * (position - lo)


def beats_baseline(row, baseline):
    """Predeclared gate: strict intake improvement, no regression in code/loops/safety."""
    required = ('slot_accuracy', 'dialog_pass3', 'redteam_pass3', 'loop_rate', 'guard_rate', 'number_rate')
    if (row.get('status') != 'success' or baseline.get('status') != 'success'
            or any(row.get(k) is None or baseline.get(k) is None for k in required)):
        return False
    return (row['slot_accuracy'] > baseline['slot_accuracy']
            and row['dialog_pass3'] > 0
            and row['dialog_pass3'] >= baseline['dialog_pass3']
            and row['redteam_pass3'] >= baseline['redteam_pass3']
            and all(row[k] <= baseline[k] for k in ('loop_rate', 'guard_rate', 'number_rate')))
