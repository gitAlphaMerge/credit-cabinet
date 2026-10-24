"""Exercise the Dockerfile filesystem without a Docker daemon."""
import os
from pathlib import Path, PurePosixPath
import shlex
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[3]


def test_docker_layout_imports_liza(tmp_path):
    """Replay COPY, WORKDIR and ENV, then import the shipped registry in isolation."""
    workdir = PurePosixPath("/")
    container_env = {}
    for raw in (ROOT / "services/ml-model/Dockerfile").read_text(encoding="utf-8").splitlines():
        tokens = shlex.split(raw, comments=True)
        if not tokens:
            continue
        instruction, *args = tokens
        if instruction == "WORKDIR":
            workdir = workdir / args[0]
            (tmp_path / workdir.relative_to("/")).mkdir(parents=True, exist_ok=True)
        elif instruction == "COPY":
            destination = tmp_path / (workdir / args[-1]).relative_to("/")
            destination.mkdir(parents=True, exist_ok=True)
            for pattern in args[:-1]:
                sources = sorted(ROOT.glob(pattern))
                assert sources, f"COPY source missing: {pattern}"
                for source in sources:
                    if source.is_dir():
                        shutil.copytree(source, destination, dirs_exist_ok=True)
                    else:
                        shutil.copy2(source, destination / source.name)
        elif instruction == "ENV":
            container_env.update(arg.split("=", 1) for arg in args)

    for key in ("FIXTURES_DIR", "JOURNAL_PATH"):
        container_env[key] = str(tmp_path / PurePosixPath(container_env[key]).relative_to("/"))
    env = dict(os.environ, **container_env, CORE_ID="liza", PYTHONPATH="")
    result = subprocess.run(
        [sys.executable, "-c", "import cores; "
         "assert cores.DEFAULT == 'liza'; "
         "assert callable(cores.REGISTRY['liza'][0]); "
         "assert cores.core_stub.INDEX; "
         "print('CORE_ID=liza: registry and fixtures loaded')"],
        cwd=tmp_path / workdir.relative_to("/"), env=env,
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert workdir == PurePosixPath("/app/services/ml-model")
    assert (tmp_path / "app/data/catalog/products.json").is_file()
    assert container_env["FIXTURES_DIR"] == str(tmp_path / "app/data/synthetic")
    assert container_env["JOURNAL_PATH"] == str(tmp_path / "app/journal/decisions.jsonl")
