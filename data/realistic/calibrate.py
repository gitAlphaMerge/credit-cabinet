"""
Калибровка сумм под целевой свободный поток и ограничения.
"""

from __future__ import annotations

import math

FLOW_LABELS = {"inflow", "mandatory", "operating", "cash", "enforcement"}


class CalibrationError(Exception):
    pass


def flow_sum(rows):
    return sum(r["amount"] for r in rows if r["label"] in FLOW_LABELS)


def calibrate_tunable(rows, target_total: float, tunable_ops):
    """
    Меняем только операции из tunable_ops.
    Обычно это поставщики.
    """
    if not tunable_ops:
        raise CalibrationError("нет tunable операций")

    current = flow_sum(rows)
    base = sum(op["amount"] for op in tunable_ops)
    if abs(base) < 1e-6:
        raise CalibrationError("tunable база почти нулевая")

    # new = current + base*(f-1) = target
    f = 1.0 + (target_total - current) / base
    if f <= 0:
        raise CalibrationError("калибровка требует отрицательный масштаб")

    for op in tunable_ops:
        op["amount"] *= f
    return f


def round_amounts(rows, target_total=None, anchor_filter=None):
    """
    Округление до копеек после калибровки.
    Остаток копеек кладем в одну якорную операцию.
    """
    for r in rows:
        r["amount"] = round(float(r["amount"]), 2)

    if target_total is None:
        return

    current = flow_sum(rows)
    residual = round(target_total - current, 2)
    if abs(residual) < 0.005:
        return

    candidates = [
        r for r in rows
        if r["label"] in FLOW_LABELS and (anchor_filter is None or anchor_filter(r))
    ]
    if not candidates:
        candidates = [r for r in rows if r["label"] in FLOW_LABELS]
    if not candidates:
        raise CalibrationError("некуда положить копеечный остаток")

    anchor = max(candidates, key=lambda r: abs(r["amount"]))
    anchor["amount"] = round(anchor["amount"] + residual, 2)


# --- Квадратичный множитель для нескольких ограничений ----------------------

def gauss_solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    eps = 1e-12

    for col in range(n):
        pivot = max(range(col, n), key=lambda i: abs(M[i][col]))
        if abs(M[pivot][col]) < eps:
            raise CalibrationError("плохая матрица калибровки")
        M[col], M[pivot] = M[pivot], M[col]

        for i in range(col + 1, n):
            factor = M[i][col] / M[col][col]
            for j in range(col, n + 1):
                M[i][j] -= factor * M[col][j]

    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = M[i][n] - sum(M[i][j] * x[j] for j in range(i + 1, n))
        x[i] = s / M[i][i]
    return x


def solve_multipliers_quadratic(base: dict, constraints: list, weights: dict | None = None):
    """
    Минимизируем (k-1)^T W (k-1)
    при A k = b.
    base: category -> signed base sum
    constraints: list[(coeff_dict, target)]
    """
    if not constraints:
        return {c: 1.0 for c in base}

    cats = sorted(base.keys())
    n = len(cats)
    m = len(constraints)
    weights = weights or {}

    A = []
    b = []
    for coeff, target in constraints:
        row = [coeff.get(c, 0.0) * base[c] for c in cats]
        A.append(row)
        b.append(target - sum(row))

    W = [weights.get(c, 1.0) for c in cats]

    # M = A W^-1 A^T
    M = [[sum(A[j][i] * A[k][i] / W[i] for i in range(n)) for k in range(m)] for j in range(m)]
    lam = gauss_solve(M, b)

    delta = [
        sum(A[j][i] * lam[j] for j in range(m)) / W[i]
        for i in range(n)
    ]

    return {cats[i]: 1.0 + delta[i] for i in range(n)}