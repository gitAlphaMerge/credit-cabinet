"""Static checks for the public boundary when Docker and nginx are unavailable."""
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[3]


def _locations(config):
    """Read location bodies, including nested method checks, from the nginx config."""
    config = re.sub(r"#[^\n]*", "", config)
    for match in re.finditer(r"\blocation\s+([^\{]+)\{", config):
        start = pos = match.end()
        depth = 1
        while depth:
            char = config[pos]
            depth += (char == "{") - (char == "}")
            pos += 1
        yield match.group(1).strip(), config[start:pos - 1]


def test_nginx_only_exposes_safe_go_routes():
    """Only score and health may reach Go; all other /api paths must fail closed."""
    config = (ROOT / "services/frontend/nginx.conf").read_text(encoding="utf-8")
    locations = dict(_locations(config))
    go_routes = [route for route, body in locations.items()
                 if "proxy_pass" in body and "http://api:8080" in body]
    assert go_routes == ["~ ^/api/(score|health)$"], go_routes
    assert "return 404;" in locations["/api/"]
    assert "proxy_pass" not in locations["/api/"]


def test_compose_keeps_go_api_internal():
    """An unpublished Go port prevents bypassing the nginx allowlist from the host."""
    config = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    api = re.search(r"(?ms)^  api:\n(.*?)(?=^  [\w-]+:|\Z)", config).group(1)
    assert not re.search(r"^    ports:", api, re.MULTILINE), api
    assert "network_mode:" not in api
    assert "http://api:8080" in config  # service-to-service callers still use DNS
