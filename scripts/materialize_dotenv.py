#!/usr/bin/env python3
"""Write `.env` and `frontend/.env` from process env (Cursor Cloud secrets).

Never prints secret values. Existing files are merged: injected env vars win,
then already-set file values, then safe local-dev defaults.

A filled key is never blanked. Indented assignments and values that sit under
a commented placeholder are kept. If a rewrite would drop one, the files are
left untouched and the process exits with an error.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections.abc import Mapping
from pathlib import Path

# Leading whitespace is significant: local .env files are often indented.
# A line this regex misses is treated as absent and used to be wiped on rewrite.
ASSIGN_RE = re.compile(r"^\s*(#\s*)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


class EnvWouldWipe(RuntimeError):
    """Raised when a rewrite would replace a filled key with an empty one."""

    def __init__(self, dest: str, keys: list[str]) -> None:
        self.dest = dest
        self.keys = keys
        joined = ", ".join(keys)
        super().__init__(f"Refus d'écrire {dest}: ces clés déjà remplies seraient vidées: {joined}")


DEV_DEFAULTS = {
    "ENVIRONMENT": "development",
    "VITE_API_URL": "http://localhost:8000",
    "CV_BOT_API_BASE_URL": "http://localhost:8000",
    "CV_BOT_FRONTEND_URL": "http://localhost:5173",
}

# Public Vite URL is the same project URL as the backend secret.
ALIASES = {
    "VITE_SUPABASE_URL": "SUPABASE_URL",
}

TARGETS = (
    (".env.example", ".env"),
    (os.path.join("frontend", ".env.example"), os.path.join("frontend", ".env")),
)


def _clean(value: str) -> str:
    return value.replace("\r", "").replace("\n", "").strip()


def parse_assignments(text: str) -> dict[str, str]:
    """Live assignments only. Commented placeholders are ignored.

    A later non-empty value replaces an earlier empty one. A later empty value
    does not erase a value already seen.
    """
    found: dict[str, str] = {}
    for raw in text.splitlines():
        match = ASSIGN_RE.match(raw)
        if not match:
            continue
        prefix, key, value = match.groups()
        if prefix:
            continue
        cleaned = _clean(value)
        if key not in found or (not found[key] and cleaned):
            found[key] = cleaned
    return found


def dropped_filled_keys(existing_text: str, new_text: str) -> list[str]:
    before = parse_assignments(existing_text)
    after = parse_assignments(new_text)
    return sorted(key for key, value in before.items() if value and not after.get(key))


def resolve_value(
    key: str,
    *,
    example_value: str,
    was_commented: bool,
    existing: Mapping[str, str],
    environ: Mapping[str, str],
) -> str | None:
    """Return the value to write, or None to keep the original example line."""
    env_val = _clean(environ.get(key, ""))
    if env_val:
        return env_val

    existing_val = _clean(existing.get(key, ""))
    if existing_val:
        return existing_val

    alias = ALIASES.get(key)
    if alias:
        alias_val = _clean(environ.get(alias, "")) or _clean(existing.get(alias, ""))
        if alias_val:
            return alias_val

    default = DEV_DEFAULTS.get(key)
    if default and (was_commented or not _clean(example_value)):
        return default

    if was_commented:
        return None
    return example_value


def fill_template(example: str, existing_text: str | None, environ: Mapping[str, str]) -> str:
    existing = parse_assignments(existing_text or "")
    lines_out: list[str] = []
    seen_in_example: set[str] = set()
    for raw in example.splitlines():
        match = ASSIGN_RE.match(raw)
        if not match:
            lines_out.append(raw)
            continue
        prefix, key, example_value = match.groups()
        seen_in_example.add(key)
        was_commented = bool(prefix)
        value = resolve_value(
            key,
            example_value=example_value,
            was_commented=was_commented,
            existing=existing,
            environ=environ,
        )
        if value is None:
            lines_out.append(raw)
            continue
        lines_out.append(f"{key}={value}")
    extras = [
        f"{key}={existing[key]}"
        for key in sorted(existing)
        if key not in seen_in_example and existing[key]
    ]
    if extras:
        if lines_out and lines_out[-1] != "":
            lines_out.append("")
        lines_out.extend(extras)
    return "\n".join(lines_out) + "\n"


def summarize(text: str) -> tuple[int, int]:
    filled = 0
    empty = 0
    for raw in text.splitlines():
        match = ASSIGN_RE.match(raw)
        if not match or match.group(1):
            continue
        if _clean(match.group(3)):
            filled += 1
        else:
            empty += 1
    return filled, empty


def materialize(root: Path, environ: Mapping[str, str]) -> list[Path]:
    written: list[Path] = []
    planned: list[tuple[Path, str, str]] = []
    for example_rel, dest_rel in TARGETS:
        example_path = root / example_rel
        dest_path = root / dest_rel
        if not example_path.is_file():
            raise FileNotFoundError(f"Template manquant: {example_path}")
        example = example_path.read_text(encoding="utf-8")
        existing = dest_path.read_text(encoding="utf-8") if dest_path.is_file() else None
        new_text = fill_template(example, existing, environ)
        if existing:
            wiped = dropped_filled_keys(existing, new_text)
            if wiped:
                raise EnvWouldWipe(dest_rel, wiped)
        planned.append((dest_path, dest_rel, new_text))
    for dest_path, dest_rel, new_text in planned:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_text(new_text, encoding="utf-8")
        written.append(dest_path)
        filled, empty = summarize(new_text)
        print(f"Wrote {dest_rel} ({filled} keys set, {empty} still empty)")
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        default=".",
        help="Repository root (default: current directory)",
    )
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    try:
        materialize(root, os.environ)
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except EnvWouldWipe as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
