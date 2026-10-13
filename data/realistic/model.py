"""
Модель процессов, календарь РФ, параметры отраслей.
Только stdlib.
"""

import calendar
import datetime as dt
import random
import zlib
from pathlib import Path

# --- Налоговые/бухгалтерские параметры, частично допущение -----------------

PARAMS = {
    "rate": 0.24,
    "dscr_min": 1.25,
    "stress": 0.30,
    "variable_share": 0.5,
    "concentration": 0.70,
    "cash_share": 0.30,
    "min_months": 6,
    "full_months": 12,
    "min_ops": 30,
    # НДС/УСН: параметр по датам. Точная сверка по первоисточнику не делалась.
    "vat_by_date": [(dt.date(2025, 10, 1), 0.20), (dt.date(2026, 1, 1), 0.20)],
    "usn_vat_threshold_rub": 60_000_000,
}

# --- Календарь РФ ----------------------------------------------------------
# Факт: нерабочие праздничные дни из ТК РФ ст. 112.
# Допущение: конкретные переносы на 2025-2026 без онлайн-проверки.

HOLIDAYS = {
    # 2025
    dt.date(2025, 1, 1), dt.date(2025, 1, 2), dt.date(2025, 1, 3), dt.date(2025, 1, 4),
    dt.date(2025, 1, 5), dt.date(2025, 1, 6), dt.date(2025, 1, 7), dt.date(2025, 1, 8),
    dt.date(2025, 2, 23), dt.date(2025, 3, 8),
    dt.date(2025, 5, 1), dt.date(2025, 5, 9),
    dt.date(2025, 6, 12), dt.date(2025, 11, 4),
    # 2026
    dt.date(2026, 1, 1), dt.date(2026, 1, 2), dt.date(2026, 1, 3), dt.date(2026, 1, 4),
    dt.date(2026, 1, 5), dt.date(2026, 1, 6), dt.date(2026, 1, 7), dt.date(2026, 1, 8),
    dt.date(2026, 2, 23), dt.date(2026, 3, 8),
    dt.date(2026, 5, 1), dt.date(2026, 5, 9),
    dt.date(2026, 6, 12), dt.date(2026, 11, 4),
}

EXTRA_OFF = {
    # 2025, допущение по переносам
    dt.date(2025, 3, 10),
    dt.date(2025, 5, 2),
    dt.date(2025, 5, 8),
    dt.date(2025, 6, 13),
    # 2026, допущение по переносам
    dt.date(2026, 3, 9),
    dt.date(2026, 5, 11),
}

ALL_OFF = HOLIDAYS | EXTRA_OFF

WORKDAY_COUNT = {
    (2025, 1): 17, (2025, 2): 20, (2025, 3): 20, (2025, 4): 22,
    (2025, 5): 18, (2025, 6): 19, (2025, 7): 23, (2025, 8): 21,
    (2025, 9): 22, (2025, 10): 23, (2025, 11): 20, (2025, 12): 22,
    (2026, 1): 16, (2026, 2): 19, (2026, 3): 21, (2026, 4): 22,
    (2026, 5): 19, (2026, 6): 21, (2026, 7): 23, (2026, 8): 21,
    (2026, 9): 22, (2026, 10): 22, (2026, 11): 20, (2026, 12): 23,
}


def is_workday(d: dt.date) -> bool:
    return d.weekday() < 5 and d not in ALL_OFF


def ensure_workday(d: dt.date, prev: bool = True) -> dt.date:
    """Если выходной: назад для платежей, вперёд для зачислений."""
    if is_workday(d):
        return d
    step = -1 if prev else 1
    nd = d + dt.timedelta(days=step)
    while not is_workday(nd):
        nd += dt.timedelta(days=step)
    return nd


def month_shift(start: dt.date, i: int):
    y = start.year + (start.month - 1 + i) // 12
    m = (start.month - 1 + i) % 12 + 1
    return y, m


def days_in_month(y: int, m: int):
    return calendar.monthrange(y, m)[1]


def month_dates(y: int, m: int):
    for day in range(1, days_in_month(y, m) + 1):
        yield dt.date(y, m, day)


def workdays_in_month(y: int, m: int):
    return [d for d in month_dates(y, m) if is_workday(d)]


def seed_from(*parts) -> int:
    # Никакого hash(): только crc32.
    key = "::".join(str(p) for p in parts).encode("utf-8")
    return zlib.crc32(key) & 0xFFFFFFFF


def get_rng(*parts) -> random.Random:
    return random.Random(seed_from(*parts))


def lognormal_amount(rnd: random.Random, mu: float, sigma: float, minimum: float = 100.0) -> float:
    return max(minimum, rnd.lognormvariate(mu, sigma))


# --- ИНН с контрольной суммой ---------------------------------------------

def _inn_checksum(digits: str, coeffs):
    s = sum(int(d) * c for d, c in zip(digits, coeffs))
    return s % 11 % 10


def random_inn(rnd: random.Random, digits: int = 10) -> str:
    if digits == 10:
        base = str(rnd.randint(1, 9)) + "".join(str(rnd.randint(0, 9)) for _ in range(8))
        check = _inn_checksum(base, [2, 4, 10, 3, 5, 9, 4, 6, 8])
        return base + str(check)
    elif digits == 12:
        base = str(rnd.randint(1, 9)) + "".join(str(rnd.randint(0, 9)) for _ in range(9))
        c1 = _inn_checksum(base, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
        base2 = base + str(c1)
        c2 = _inn_checksum(base2, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
        return base2 + str(c2)
    raise ValueError("digits must be 10 or 12")


# --- Отраслевые параметры ---------------------------------------------------
# Почти всё ниже — допущение, но структурно повторяет типы клиентов.

INDUSTRY = {
    "стройка": {
        "b2b_share": 0.85, "acq_share": 0.00, "mp_share": 0.00,
        "mandatory_ratio": 0.50, "supplier_ratio": 0.38,
        "lag_days": 60, "supplier_mu": 10.7, "supplier_sigma": 0.70,
        "cash_propensity": 0.02, "season": [0.8, 0.8, 0.7, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.2, 1.1, 1.0],
    },
    "общепит": {
        "b2b_share": 0.10, "acq_share": 0.85, "mp_share": 0.00,
        "mandatory_ratio": 0.68, "supplier_ratio": 0.35,
        "lag_days": 7, "supplier_mu": 10.0, "supplier_sigma": 0.55,
        "cash_propensity": 0.02, "season": [1.0, 0.95, 1.0, 1.05, 1.1, 1.1, 1.1, 1.1, 1.0, 1.0, 1.0, 1.05],
    },
    "розница": {
        "b2b_share": 0.15, "acq_share": 0.75, "mp_share": 0.05,
        "mandatory_ratio": 0.50, "supplier_ratio": 0.35,
        "lag_days": 7, "supplier_mu": 10.2, "supplier_sigma": 0.55,
        "cash_propensity": 0.03, "season": [1.1, 1.2, 1.0, 0.9, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.3],
    },
    "производство": {
        "b2b_share": 0.70, "acq_share": 0.05, "mp_share": 0.00,
        "mandatory_ratio": 0.45, "supplier_ratio": 0.40,
        "lag_days": 45, "supplier_mu": 10.8, "supplier_sigma": 0.65,
        "cash_propensity": 0.01, "season": [1.0] * 12,
    },
    "перевозки": {
        "b2b_share": 0.80, "acq_share": 0.00, "mp_share": 0.00,
        "mandatory_ratio": 0.35, "supplier_ratio": 0.45,
        "lag_days": 35, "supplier_mu": 10.5, "supplier_sigma": 0.60,
        "cash_propensity": 0.05, "season": [0.9, 0.9, 1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.0, 1.0, 1.0, 1.0],
    },
    "услуги": {
        "b2b_share": 0.65, "acq_share": 0.20, "mp_share": 0.00,
        "mandatory_ratio": 0.55, "supplier_ratio": 0.25,
        "lag_days": 20, "supplier_mu": 9.8, "supplier_sigma": 0.50,
        "cash_propensity": 0.02, "season": [1.0] * 12,
    },
    "селлер": {
        "b2b_share": 0.05, "acq_share": 0.10, "mp_share": 0.80,
        "mandatory_ratio": 0.35, "supplier_ratio": 0.45,
        "lag_days": 14, "supplier_mu": 10.1, "supplier_sigma": 0.60,
        "cash_propensity": 0.01, "season": [1.2, 1.0, 0.9, 0.9, 0.9, 1.0, 1.0, 1.0, 1.0, 1.1, 1.3, 1.4],
    },
    "IT": {
        "b2b_share": 0.90, "acq_share": 0.00, "mp_share": 0.00,
        "mandatory_ratio": 0.35, "supplier_ratio": 0.25,
        "lag_days": 30, "supplier_mu": 9.7, "supplier_sigma": 0.45,
        "cash_propensity": 0.00, "season": [1.0] * 12,
    },
    "авто": {
        "b2b_share": 0.40, "acq_share": 0.55, "mp_share": 0.00,
        "mandatory_ratio": 0.45, "supplier_ratio": 0.38,
        "lag_days": 14, "supplier_mu": 10.0, "supplier_sigma": 0.55,
        "cash_propensity": 0.04, "season": [0.9, 0.9, 1.0, 1.1, 1.1, 1.1, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    },
}


def industry_param(industry: str, key: str, default=None):
    return INDUSTRY.get(industry, {}).get(key, default)
# заплатка Клода: build.py зовёт model.MONTH_RU, список лежал только в dirt.py
MONTH_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]
