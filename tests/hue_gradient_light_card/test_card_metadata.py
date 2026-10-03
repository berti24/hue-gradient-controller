"""Validate the optional frontend is included in the integration distribution."""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_frontend_asset_matches_release_and_is_self_contained() -> None:
    """The shipped module is versioned and bundles runtime dependencies locally."""
    integration = PROJECT_ROOT / "custom_components/hue_gradient_controller"
    version = json.loads((integration / "manifest.json").read_text())["version"]
    asset = (integration / "www/hue-gradient-light-card.js").read_text()
    assert asset.startswith(f"/* Hue Gradient Controller {version} |")
    assert "hue-gradient-light-card" in asset
    assert "hue-gradient-editor" in asset
    assert 'from "lit"' not in asset
    assert 'from"lit"' not in asset
    assert "BSD 3-Clause License" in (integration / "www/LICENSES.txt").read_text()


def test_frontend_dependencies_are_pinned_and_locked() -> None:
    """npm ci reproduces exact build and test dependency versions."""
    card = PROJECT_ROOT / "hue-gradient-light-card"
    package = json.loads((card / "package.json").read_text())
    lock = json.loads((card / "package-lock.json").read_text())
    for group in ("dependencies", "devDependencies"):
        for name, version in package[group].items():
            assert version[0].isdigit()
            assert lock["packages"][f"node_modules/{name}"]["version"] == version
