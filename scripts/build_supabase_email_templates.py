#!/usr/bin/env python3
"""Génère `supabase/templates/*.html` à partir du gabarit e-mail AxeL Job.

    python scripts/build_supabase_email_templates.py          # écrit les fichiers
    python scripts/build_supabase_email_templates.py --check  # échoue si un fichier a dérivé
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.services.auth_email_templates import auth_templates  # noqa: E402

OUT_DIR = ROOT / "supabase" / "templates"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="ne rien écrire, signaler les écarts")
    args = parser.parse_args()

    stale: list[str] = []
    for template in auth_templates():
        path = OUT_DIR / template.filename
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == template.html:
            continue
        if args.check:
            stale.append(template.filename)
            continue
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(template.html, encoding="utf-8", newline="\n")
        print(f"écrit {path.relative_to(ROOT)}")

    if stale:
        print("Templates Supabase périmés : " + ", ".join(stale))
        print("Lance : python scripts/build_supabase_email_templates.py")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
