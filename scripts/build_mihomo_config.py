"""Конфиг mihomo для выхода агента к LLM: из профиля Clash (stdin) берутся только узлы, остальное задаём сами.

    base64 -d <<< "$VPN_CLASH_PROFILE" | python3 scripts/build_mihomo_config.py "$PASS" > config.yaml

Порт только внутри docker-сети, вход по логину agent и паролю из аргумента, панели управления нет,
трафик идёт через автовыбор живого узла (url-test), без правил и DNS профиля.
"""
import sys

import yaml

TEST_URL = "https://www.gstatic.com/generate_204"


def build(profile: dict, password: str) -> dict:
    proxies = [p for p in profile.get("proxies") or [] if isinstance(p, dict) and p.get("name")]
    if not proxies:
        raise SystemExit("в профиле нет узлов (proxies)")
    if len(password) < 16:
        raise SystemExit("пароль прокси короче 16 символов")
    return {
        "mixed-port": 7890,
        "allow-lan": True,  # слушать сеть compose, наружу порт не публикуется
        "bind-address": "*",
        "authentication": [f"agent:{password}"],
        "skip-auth-prefixes": [],
        "mode": "rule",
        "log-level": "warning",
        "ipv6": False,
        "profile": {"store-selected": False, "store-fake-ip": False},
        "proxies": proxies,
        "proxy-groups": [{"name": "auto", "type": "url-test", "url": TEST_URL, "interval": 120, "timeout": 5000, "lazy": False,
                          "tolerance": 100, "proxies": [p["name"] for p in proxies]}],
        "rules": ["MATCH,auto"],
    }


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: build_mihomo_config.py <password> < profile.yaml")
    sys.stdout.reconfigure(encoding="utf-8")
    profile = yaml.safe_load(sys.stdin.buffer.read().decode("utf-8-sig")) or {}
    yaml.safe_dump(build(profile, sys.argv[1]), sys.stdout, allow_unicode=True, sort_keys=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
