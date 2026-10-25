"""Regression coverage for the backend test toolchain and dependency policy."""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any

_SHA256_PATTERN = re.compile(r"sha256:[0-9a-f]{64}")


def test_test_bootstrap_overrides_service_configuration_and_disables_dotenv(tmp_path):
    """An inherited production shell must not select production test behavior."""
    dotenv_file = tmp_path / ".env"
    dotenv_file.write_text("FIREBASE_PROJECT_ID=synthetic-dotenv-project\n")
    unsafe_environment = {
        "APP_ENV": "production",
        "PYTHON_DOTENV_DISABLED": "0",
        "DEV_AUTH_BYPASS": "true",
        "VAMP_MEMORY_ENABLED": "true",
        "RATELIMIT_ENABLED": "true",
        "LLM_RATELIMIT_ENABLED": "true",
        "USER_QUOTA_ENABLED": "true",
        "SECRET_KEY": "synthetic-inherited-secret",
    }
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import json,os,runpy,sys; runpy.run_path(sys.argv[1]); "
            "from dotenv import load_dotenv; load_dotenv(sys.argv[2]); "
            "print(json.dumps({key:os.getenv(key) for key in "
            "[*json.loads(sys.argv[3]), 'FIREBASE_PROJECT_ID']}))",
            str(Path(__file__).with_name("conftest.py")),
            str(dotenv_file),
            json.dumps(list(unsafe_environment)),
        ],
        env=unsafe_environment,
        capture_output=True,
        text=True,
        check=True,
        timeout=15,
    )
    configured = json.loads(result.stdout)
    assert configured["APP_ENV"] == "testing"
    assert configured["PYTHON_DOTENV_DISABLED"] == "1"
    for name in (
        "DEV_AUTH_BYPASS",
        "VAMP_MEMORY_ENABLED",
        "RATELIMIT_ENABLED",
        "LLM_RATELIMIT_ENABLED",
        "USER_QUOTA_ENABLED",
    ):
        assert configured[name] == "false"
    assert configured["SECRET_KEY"] != unsafe_environment["SECRET_KEY"]
    assert len(configured["SECRET_KEY"]) >= 32
    assert configured["FIREBASE_PROJECT_ID"] is None


def _load_toml(path: Path) -> dict:
    with path.open("rb") as file:
        return tomllib.load(file)


def _normalize_package_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _declared_requirement_signature(requirement: str) -> tuple[str, tuple[str, ...], str, str]:
    requirement_part, separator, marker = requirement.partition(";")
    match = re.fullmatch(
        r"(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)(?:\[(?P<extras>[^]]+)\])?(?P<specifier>.*)",
        requirement_part.strip(),
    )
    assert match is not None, f"Invalid dependency declaration: {requirement}"
    extras = tuple(sorted(extra.strip() for extra in (match.group("extras") or "").split(",") if extra.strip()))
    return (
        _normalize_package_name(match.group("name")),
        extras,
        match.group("specifier").strip(),
        marker.strip() if separator else "",
    )


def _locked_requirement_signature(requirement: dict[str, Any]) -> tuple[str, tuple[str, ...], str, str]:
    return (
        _normalize_package_name(requirement["name"]),
        tuple(sorted(requirement.get("extras", []))),
        requirement.get("specifier", ""),
        requirement.get("marker", ""),
    )


def test_pyproject_is_the_only_dependency_source_of_truth(backend_root: Path) -> None:
    pyproject = _load_toml(backend_root / "pyproject.toml")

    assert pyproject["project"]["dependencies"]
    assert pyproject["dependency-groups"]["dev"]
    assert pyproject["tool"]["uv"]["required-version"] == "==0.12.5"
    assert not (backend_root / "requirements.txt").exists()


def test_uv_lock_covers_direct_dependencies_with_hashed_artifacts(backend_root: Path) -> None:
    pyproject = _load_toml(backend_root / "pyproject.toml")
    lock = _load_toml(backend_root / "uv.lock")

    assert lock["requires-python"] == pyproject["project"]["requires-python"]

    packages = lock["package"]
    project_package = next(package for package in packages if package["name"] == pyproject["project"]["name"])
    locked_metadata = project_package["metadata"]
    assert {_locked_requirement_signature(requirement) for requirement in locked_metadata["requires-dist"]} == {
        _declared_requirement_signature(requirement) for requirement in pyproject["project"]["dependencies"]
    }
    assert {_locked_requirement_signature(requirement) for requirement in locked_metadata["requires-dev"]["dev"]} == {
        _declared_requirement_signature(requirement) for requirement in pyproject["dependency-groups"]["dev"]
    }

    registry_packages = [package for package in packages if "registry" in package.get("source", {})]
    assert registry_packages
    for package in registry_packages:
        artifacts = [package["sdist"]] if "sdist" in package else []
        artifacts.extend(package.get("wheels", []))
        assert artifacts, f"{package['name']} has no locked distribution artifacts"
        assert all(_SHA256_PATTERN.fullmatch(artifact.get("hash", "")) for artifact in artifacts), (
            f"{package['name']} has an artifact without a SHA-256 hash"
        )
