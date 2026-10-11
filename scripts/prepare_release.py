"""Validate a stable release tag and extract its dated changelog entry."""

import argparse
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RELEASE_TAG = re.compile(r"v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")


def release_notes(project_root: Path, tag: str) -> str:
    """Reject mismatched releases before any GitHub release can be created."""
    if not RELEASE_TAG.fullmatch(tag):
        raise ValueError("Release tags must use vMAJOR.MINOR.PATCH")
    manifest_path = (
        project_root / "custom_components/hue_gradient_controller/manifest.json"
    )
    version = json.loads(manifest_path.read_text(encoding="utf-8"))["version"]
    if tag != f"v{version}":
        raise ValueError(f"Tag {tag} does not match manifest version {version}")

    changelog = (project_root / "CHANGELOG.md").read_text(encoding="utf-8")
    entry = re.search(
        rf"^## \[{re.escape(version)}\] - \d{{4}}-\d{{2}}-\d{{2}}\n"
        r"(?P<notes>.*?)(?=^## |\Z)",
        changelog,
        re.MULTILINE | re.DOTALL,
    )
    if entry is None or not entry["notes"].strip():
        raise ValueError(f"Missing dated changelog notes for {version}")
    return entry["notes"].strip() + "\n"


def main() -> None:
    """Write notes to a file or stdout, without making GitHub API calls."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        notes = release_notes(PROJECT_ROOT, args.tag)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    if args.output:
        args.output.write_text(notes, encoding="utf-8")
    else:
        print(notes, end="")


if __name__ == "__main__":
    main()
