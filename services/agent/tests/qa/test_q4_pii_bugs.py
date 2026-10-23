"""Review #12: privacy oracle from TASK.md Q4.3 and PERMISSIONS.md:28."""
import json
import pytest
from test_q4_pii_regressions import SECRETS, persisted_turn


@pytest.mark.parametrize("application", [False, True], ids=["chat", "application-objections"])
@pytest.mark.parametrize("field", ["history", "trace"])
@pytest.mark.parametrize("secret", SECRETS, ids=["inn", "phone", "fio"])
def test_BUG_12_private_values_must_not_persist(monkeypatch, tmp_path, application, field, secret):
    saved, _, _ = persisted_turn(monkeypatch, tmp_path, application)
    serialized = json.dumps(saved[field], ensure_ascii=False)
    assert secret not in serialized, f"BUG: #12 session/<sha256>.json:{field} contains synthetic {secret}"
