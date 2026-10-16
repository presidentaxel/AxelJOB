"""
Extraction et fusion des polices embarquées d'un PDF → ``@font-face`` data-URL.

Un PDF embarque souvent une police en plusieurs *sous-ensembles* (un par flux
de contenu), chacun ne contenant que les glyphes qu'il utilise. Pour rejouer la
police fidèlement dans le canvas, on fusionne tous les sous-ensembles d'une même
famille (via fontTools) puis on encode la police complète en data-URL pour une
règle CSS ``@font-face``.

Le but : que le canvas utilise la VRAIE police du PDF (largeurs identiques →
plus de retour à la ligne / décalage), pas une approximation (Inter).
"""

from __future__ import annotations

import base64
import io
import logging
import re
import tempfile
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

# Garde-fous taille (la police part dans le layout persté en base).
MAX_FONT_BYTES = 240_000
MAX_TOTAL_FONT_BYTES = 700_000

_SUBSET_PREFIX_RE = re.compile(r"^[A-Z]{6}\+")
_EMBEDDABLE_EXTS = {"ttf", "otf"}


def _strip_subset_prefix(name: str) -> str:
    """``BAAAAA+Garet-Regular`` → ``Garet-Regular``."""
    return _SUBSET_PREFIX_RE.sub("", str(name or ""))


def font_css_weight(font_name: str) -> int | None:
    """Graisse CSS lue dans le nom (Medium 500, SemiBold 600). ``None`` si absente."""
    low = _strip_subset_prefix(font_name).lower().replace("-", "").replace(" ", "").replace("_", "")
    if "semibold" in low or "demibold" in low:
        return 600
    if "extrabold" in low or "ultrabold" in low:
        return 800
    if "extrablack" in low or "ultrablack" in low:
        return 900
    if "black" in low or "heavy" in low:
        return 900
    if "bold" in low:
        return 700
    if "medium" in low:
        return 500
    if "extralight" in low or "ultralight" in low:
        return 200
    if "light" in low:
        return 300
    if "thin" in low:
        return 100
    if "regular" in low or "roman" in low or "book" in low:
        return 400
    return None


def _font_root_and_style(basefont: str) -> tuple[str, int, bool]:
    """Retourne (racine_famille, graisse CSS, italique) depuis un nom PostScript."""
    name = _strip_subset_prefix(basefont)
    low = name.lower()
    weight = font_css_weight(name) or 400
    italic = "italic" in low or "oblique" in low
    # Racine = avant le premier séparateur de style ('-', ',', espace).
    root = re.split(r"[-,\s]", name, maxsplit=1)[0] or "Doc"
    root = re.sub(r"[^A-Za-z0-9]", "", root) or "Doc"
    return root, weight, italic


def _css_family(root: str) -> str:
    return f"PDFEmbed-{root}"


def embedded_family_for(font_name: str, embedded_roots: set[str]) -> str | None:
    """Stack CSS pour un span dont la police a été embarquée, sinon ``None``."""
    root, _, _ = _font_root_and_style(font_name)
    if root in embedded_roots:
        return f"'{_css_family(root)}', sans-serif"
    return None


def _merge_subsets(buffers: list[bytes]) -> bytes | None:
    """Fusionne plusieurs sous-ensembles TTF en une police couvrant l'union."""
    if not buffers:
        return None
    if len(buffers) == 1:
        return buffers[0]
    try:
        from fontTools.merge import Merger
        from fontTools.ttLib import TTFont

        paths: list[str] = []
        with tempfile.TemporaryDirectory() as tmp:
            for i, buf in enumerate(buffers):
                p = f"{tmp}/sub_{i}.ttf"
                with open(p, "wb") as fh:
                    fh.write(buf)
                paths.append(p)
            merged = Merger().merge(paths)
            out = io.BytesIO()
            merged.save(out)
            if isinstance(merged, TTFont):
                merged.close()
            return out.getvalue()
    except Exception as exc:  # pragma: no cover - dépend des polices
        logger.info("pdf_font_embed: fusion échouée (%s), repli sous-ensemble unique", exc)
        # Repli : on garde le sous-ensemble le plus complet (le plus gros).
        return max(buffers, key=len)


def _coverage_chars(font_bytes: bytes) -> str:
    """Caractères réellement dessinés. Un sous-ensemble incomplet mélange les graisses."""
    try:
        from fontTools.ttLib import TTFont

        font = TTFont(io.BytesIO(font_bytes))
        try:
            cmap = font.getBestCmap() or {}
        finally:
            font.close()
    except Exception:
        return ""
    chars = "".join(chr(code) for code in sorted(cmap) if 32 <= code < 0x10000)
    if len(chars) > 2000:
        return ""
    return chars


def _data_url(font_bytes: bytes) -> str:
    b64 = base64.b64encode(font_bytes).decode("ascii")
    return f"data:font/ttf;base64,{b64}"


def extract_embedded_fonts(doc, max_pages: int = 3) -> tuple[list[dict[str, Any]], set[str]]:
    """
    Extrait/fusionne les polices embarquées du PDF.

    Retourne ``(font_faces, embedded_roots)`` où :
    - ``font_faces`` : liste de ``{family, weight, style, src, format}`` pour
      des règles ``@font-face`` côté frontend ;
    - ``embedded_roots`` : racines de famille disponibles (ex. ``{"Garet"}``)
      pour mapper chaque bloc texte vers sa police.
    """
    try:
        n_pages = min(doc.page_count, max_pages)
    except Exception:
        return [], set()

    # (root, bold, italic) -> {xref: buffer}  (dédupliqué par xref)
    groups: dict[tuple[str, bool, bool], dict[int, bytes]] = defaultdict(dict)

    for page_index in range(n_pages):
        try:
            page_fonts = doc[page_index].get_fonts(full=True)
        except Exception:
            continue
        for entry in page_fonts:
            xref = entry[0]
            ext = str(entry[1] or "").lower()
            basefont = str(entry[3] or "")
            if ext not in _EMBEDDABLE_EXTS or not basefont:
                continue
            key = _font_root_and_style(basefont)
            if xref in groups[key]:
                continue
            try:
                _, fext, _, buffer = doc.extract_font(xref)
            except Exception:
                continue
            if not buffer or str(fext or "").lower() not in _EMBEDDABLE_EXTS:
                continue
            groups[key][xref] = buffer

    font_faces: list[dict[str, Any]] = []
    embedded_roots: set[str] = set()
    total = 0

    for (root, weight, italic), by_xref in groups.items():
        merged = _merge_subsets(list(by_xref.values()))
        if not merged or len(merged) > MAX_FONT_BYTES:
            continue
        if total + len(merged) > MAX_TOTAL_FONT_BYTES:
            continue
        total += len(merged)
        embedded_roots.add(root)
        face: dict[str, Any] = {
            "family": _css_family(root),
            "weight": weight,
            "style": "italic" if italic else "normal",
            "format": "truetype",
            "src": _data_url(merged),
        }
        coverage = _coverage_chars(merged)
        if coverage:
            face["coverage"] = coverage
        font_faces.append(face)

    return font_faces, embedded_roots
