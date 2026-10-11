"""Exercise release preparation before the workflow writes to GitHub."""

import json
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest

SPEC = spec_from_file_location(
    "prepare_release",
    Path(__file__).resolve().parents[1] / "scripts/prepare_release.py",
)
assert SPEC is not None and SPEC.loader is not None
release_helper = module_from_spec(SPEC)
SPEC.loader.exec_module(release_helper)


@pytest.fixture
def release_project(tmp_path: Path) -> Path:
    """Use a small release repository with adjacent historical entries."""
    integration = tmp_path / "custom_components/hue_gradient_controller"
    integration.mkdir(parents=True)
    (integration / "manifest.json").write_text(
        json.dumps({"version": "1.0.0"}), encoding="utf-8"
    )
    (tmp_path / "CHANGELOG.md").write_text(
        "# Changelog\n\n## [Unreleased]\n\nFuture changes.\n\n"
        "## [1.0.0] - 2026-10-11\n\n### Added\n\n- Stable release.\n\n"
        "## [0.8.3] - 2026-10-11\n\nOlder changes.\n",
        encoding="utf-8",
    )
    return tmp_path


def test_release_notes_only_include_matching_version(release_project: Path) -> None:
    """Do not leak unreleased or historical entries into release notes."""
    assert release_helper.release_notes(release_project, "v1.0.0") == (
        "### Added\n\n- Stable release.\n"
    )


@pytest.mark.parametrize("tag", ["1.0.0", "v01.0.0", "v1.0", "v1.0.0-rc.1"])
def test_release_rejects_invalid_tags(release_project: Path, tag: str) -> None:
    """Only stable SemVer tags enter the publication workflow."""
    with pytest.raises(ValueError, match=r"vMAJOR\.MINOR\.PATCH"):
        release_helper.release_notes(release_project, tag)


def test_release_rejects_mismatched_version(release_project: Path) -> None:
    """A valid but stale tag must not advertise another manifest version."""
    with pytest.raises(ValueError, match="does not match manifest version"):
        release_helper.release_notes(release_project, "v0.8.3")


@pytest.mark.parametrize(
    "changelog",
    ["# Changelog\n", "## [1.0.0]\n\nUndated.\n", "## [1.0.0] - 2026-10-11\n"],
)
def test_release_rejects_missing_notes(release_project: Path, changelog: str) -> None:
    """Missing, undated and empty release entries fail before publication."""
    (release_project / "CHANGELOG.md").write_text(changelog, encoding="utf-8")
    with pytest.raises(ValueError, match="Missing dated changelog notes"):
        release_helper.release_notes(release_project, "v1.0.0")


def test_release_cli_writes_notes_file(
    release_project: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The CLI produces the actual file consumed by gh --notes-file."""
    output = release_project / "release-notes.md"
    monkeypatch.setattr(release_helper, "PROJECT_ROOT", release_project)
    monkeypatch.setattr(
        "sys.argv", ["prepare_release.py", "v1.0.0", "--output", str(output)]
    )
    release_helper.main()
    assert output.read_text(encoding="utf-8") == "### Added\n\n- Stable release.\n"


def test_release_cli_does_not_write_on_mismatch(
    release_project: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A rejected tag cannot leave a notes file for the GitHub write step."""
    output = release_project / "release-notes.md"
    monkeypatch.setattr(release_helper, "PROJECT_ROOT", release_project)
    monkeypatch.setattr(
        "sys.argv", ["prepare_release.py", "v0.8.3", "--output", str(output)]
    )
    with pytest.raises(SystemExit) as error:
        release_helper.main()
    assert error.value.code == 2
    assert not output.exists()
