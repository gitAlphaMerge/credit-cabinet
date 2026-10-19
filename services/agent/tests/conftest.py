import pytest


@pytest.fixture(autouse=True)
def _isolated_agent_state(tmp_path, monkeypatch):
    """Память агента пишется на диск: каждому тесту своя папка, иначе сессии прошлого прогона текут в следующий."""
    monkeypatch.setenv("AGENT_STATE_DIR", str(tmp_path / "agent-state"))
    try:
        import server
        server.SESSIONS.clear()
    except ImportError:
        pass
