"""Tests for release metadata."""

import json
import re
import tomllib
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
SEMVER_PATTERN = re.compile(
    r"^(0|[1-9]\d*)\."
    r"(0|[1-9]\d*)\."
    r"(0|[1-9]\d*)"
    r"(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


def test_release_version_is_valid_synchronized_and_changeloged() -> None:
    """Every published version surface uses the same documented SemVer."""
    pyproject = tomllib.loads((PROJECT_ROOT / "pyproject.toml").read_text())
    manifest = json.loads(
        (
            PROJECT_ROOT
            / "custom_components/hue_gradient_controller/manifest.json"
        ).read_text()
    )
    lockfile = (PROJECT_ROOT / "uv.lock").read_text()
    changelog = (PROJECT_ROOT / "CHANGELOG.md").read_text()

    version = pyproject["project"]["version"]
    assert SEMVER_PATTERN.fullmatch(version)
    assert manifest["version"] == version
    assert re.search(
        (
            r'\[\[package\]\]\nname = "hue-gradient-controller"\n'
            rf'version = "{re.escape(version)}"'
        ),
        lockfile,
    )
    assert re.search(
        rf"^## \[{re.escape(version)}\] - \d{{4}}-\d{{2}}-\d{{2}}$",
        changelog,
        re.MULTILINE,
    )
