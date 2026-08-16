"""Tests for release metadata."""

import json
import re
import struct
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


def _png_dimensions(path: Path) -> tuple[int, int]:
    """Return dimensions from a PNG image header."""
    with path.open("rb") as image:
        assert image.read(8) == b"\x89PNG\r\n\x1a\n"
        assert image.read(4) == b"\x00\x00\x00\r"
        assert image.read(4) == b"IHDR"
        return struct.unpack(">II", image.read(8))


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


def test_local_brand_icons_have_supported_dimensions() -> None:
    """Brand icons provide Home Assistant's normal and high-DPI sizes."""
    brand_dir = (
        PROJECT_ROOT / "custom_components/hue_gradient_controller/brand"
    )

    assert _png_dimensions(brand_dir / "icon.png") == (256, 256)
    assert _png_dimensions(brand_dir / "icon@2x.png") == (512, 512)
