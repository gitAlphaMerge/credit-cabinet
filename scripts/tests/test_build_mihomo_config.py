import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_mihomo_config as b  # noqa: E402

PROFILE = {"mixed-port": 7897, "external-controller": "127.0.0.1:9090", "secret": "panel", "allow-lan": False,
           "dns": {"enhanced-mode": "fake-ip"}, "tun": {"enable": True},
           "proxies": [{"name": "nl-1", "type": "vless", "server": "x"}, {"name": "de-1", "type": "ss", "server": "y"}],
           "proxy-groups": [{"name": "→ sel", "type": "select", "proxies": ["nl-1", "de-1"]}],
           "rules": ["DOMAIN-SUFFIX,ru,DIRECT", "MATCH,→ sel"]}


def test_only_nodes_survive_and_panel_is_gone():
    cfg = b.build(PROFILE, "a" * 32)
    for key in ("external-controller", "secret", "external-ui", "tun", "dns"):
        assert key not in cfg
    assert [p["name"] for p in cfg["proxies"]] == ["nl-1", "de-1"]
    assert cfg["rules"] == ["MATCH,auto"]
    assert cfg["proxy-groups"][0]["type"] == "url-test"


def test_proxy_requires_password():
    cfg = b.build(PROFILE, "b" * 32)
    assert cfg["authentication"] == ["agent:" + "b" * 32] and cfg["skip-auth-prefixes"] == []
    with pytest.raises(SystemExit):
        b.build(PROFILE, "short")


def test_profile_without_nodes_fails():
    with pytest.raises(SystemExit):
        b.build({"proxies": []}, "c" * 32)
