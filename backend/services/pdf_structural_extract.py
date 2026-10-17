"""
Import CV Canva - reconstruction *déterministe* du layout v3 depuis un PDF natif.

Aucune IA : on lit directement les instructions du PDF via PyMuPDF (fitz) -
texte positionné, polices, couleurs, rectangles de fond, images - et on les
transpose 1:1 en blocs canvas v3 (coordonnées en millimètres, origine haut-gauche).

C'est un vrai "copier-coller" visuel du PDF, contrairement à l'approche vision
(Gemini devine un template) qui restait approximative.

Limites :
- PDF *scanné* (image sans couche texte) → pas de texte extractible → retourne None
  (le caller peut alors retomber sur la vision / preset).
- Polices non standard : on mappe sur une stack générique (Inter/serif/mono).
"""

from __future__ import annotations

import base64
import html
import logging
import math
import re
from typing import Any

from backend.services.pdf_font_embed import (
    embedded_family_for,
    extract_embedded_fonts,
    font_css_weight,
)

logger = logging.getLogger(__name__)

PAGE_W_MM = 210.0
PAGE_H_MM = 297.0
MM_PER_PT = 25.4 / 72.0

# Garde-fous (évite de polluer le canvas avec des micro-artefacts vectoriels).
MIN_SHAPE_AREA_MM2 = 12.0
LINE_MAX_THICKNESS_MM = 1.6
MAX_BULLET_MM = 6.5
# Puces de liste seulement. Au-delà, c'est un pictogramme (téléphone, pastille).
LIST_BULLET_MAX_MM = 3.0
MAX_ICON_MM = 16.0
MIN_ICON_MM = 3.0
# Au-delà, un pictogramme carré n'est plus une icône contact mais un masque photo.
MAX_CONTACT_ICON_MM = 10.0
# Surface mini d'un rectangle plein pour être considéré comme bandeau/fond
# structurel (sidebar, header). En dessous = petit encart/icône → ignoré
# (évite de polluer le canvas avec des micro-rectangles).
BACKGROUND_MIN_AREA_MM2 = 500.0
# Au-delà de cette fraction de la page, un rectangle est le fond de page → ignoré.
PAGE_BG_AREA_RATIO = 0.82
# Longueur mini (mm) d'un trait pour être gardé comme filet de séparation.
MIN_SEPARATOR_LEN_MM = 8.0
MIN_TEXT_CHARS_FOR_NATIVE = 40
MAX_PAGES = 3
# Puce à gauche du texte : écart max (mm) et tolérance verticale pour l'alignement.
MAX_GUTTER_GAP_MM = 14.0
MAX_BULLET_ALIGN_DY_MM = 8.0
_BULLET_GLYPH_RE = re.compile(r"^[•●○◦▪■‣▸∙·\-–—*]$")
_JOB_TITLE_DASH_RE = re.compile(r"\s[–—-]\s")
MAX_IMAGES_PER_DOC = 8
MAX_IMAGE_BYTES = 350_000
# Fond graphique rasterisé (texte retiré) : résolution et poids max.
BG_RENDER_SCALE = 2.5
MAX_BG_BYTES = 520_000
# Décomposition de la couche graphique en blocs déplaçables indépendamment.
CUTOUT_RENDER_SCALE = 3.0
CLUSTER_GAP_PT = 7.0
MAX_CUTOUTS = 90
MAX_CUTOUT_TOTAL_BYTES = 480_000
# Taille typique d'une photo de profil importée (mm).
MIN_PHOTO_MM = 12.0
MAX_PHOTO_MM = 90.0

# Flags de span PyMuPDF (cf. doc fitz).
_FLAG_ITALIC = 1 << 1
_FLAG_BOLD = 1 << 4


def _int_color_to_hex(color: int | None) -> str:
    if not isinstance(color, int):
        return "#1a1a1a"
    return f"#{(color & 0xFFFFFF):06x}"


def _span_hex_color(span: dict) -> str:
    color = span.get("color")
    if isinstance(color, int):
        return _int_color_to_hex(color)
    if isinstance(color, str) and len(color) == 7 and color.startswith("#"):
        return color.lower()
    return "#1a1a1a"


def _dominant_span_color(spans: list[dict]) -> str:
    """Couleur qui couvre le plus de caractères, pas le fragment le plus long.

    Un lien court en bleu ne doit pas repeindre l'adresse noire de la même ligne,
    et l'inverse non plus : la couleur minoritaire reste dans le HTML.
    """
    totals: dict[str, int] = {}
    order: list[str] = []
    for span in spans:
        text = str(span.get("text") or "").strip()
        if not text:
            continue
        color = _span_hex_color(span)
        if color not in totals:
            order.append(color)
            totals[color] = 0
        totals[color] += len(text)
    if not order:
        return "#1a1a1a"
    return max(order, key=lambda color: totals[color])


def _float_rgb_to_hex(value: Any) -> str | None:
    """Convertit un fill PyMuPDF (tuple flottants 0..1, gris ou rgb) en hex."""
    if value is None:
        return None
    if isinstance(value, int | float):
        v = max(0, min(255, round(float(value) * 255)))
        return f"#{v:02x}{v:02x}{v:02x}"
    if isinstance(value, tuple | list):
        if len(value) == 1:
            v = max(0, min(255, round(float(value[0]) * 255)))
            return f"#{v:02x}{v:02x}{v:02x}"
        if len(value) >= 3:
            r, g, b = (max(0, min(255, round(float(c) * 255))) for c in value[:3])
            return f"#{r:02x}{g:02x}{b:02x}"
    return None


# Texte minuscule et quasi de la couleur du fond : mots-clés ATS invisibles.
# On ne les recopie pas dans le modèle (ils ne font pas partie du CV visible).
_HIDDEN_ATS_MAX_PT = 6.0
_HIDDEN_ATS_MAX_CONTRAST = 1.8


def _srgb_channel(value: int) -> float:
    channel = max(0, min(255, value)) / 255.0
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def _relative_luminance(hex_color: str | None) -> float | None:
    if not hex_color or len(hex_color) != 7 or not hex_color.startswith("#"):
        return None
    try:
        red = int(hex_color[1:3], 16)
        green = int(hex_color[3:5], 16)
        blue = int(hex_color[5:7], 16)
    except ValueError:
        return None
    return (
        0.2126 * _srgb_channel(red) + 0.7152 * _srgb_channel(green) + 0.0722 * _srgb_channel(blue)
    )


def _contrast_ratio(foreground: str | None, background: str | None) -> float | None:
    fore = _relative_luminance(foreground)
    back = _relative_luminance(background)
    if fore is None or back is None:
        return None
    lighter = max(fore, back)
    darker = min(fore, back)
    return (lighter + 0.05) / (darker + 0.05)


def _is_hidden_ats_text(size_pt: float, color_hex: str | None, background_hex: str | None) -> bool:
    """Vrai si la ligne est un pavé de mots-clés ATS camouflé, pas un texte à afficher."""
    if size_pt > _HIDDEN_ATS_MAX_PT:
        return False
    contrast = _contrast_ratio(color_hex, background_hex or "#ffffff")
    if contrast is None:
        return False
    return contrast < _HIDDEN_ATS_MAX_CONTRAST


def _paint_fills(page) -> list[tuple[Any, str]]:
    """Aplats dans l'ordre de peinture : le dernier qui contient un point est le fond."""
    fills: list[tuple[Any, str]] = []
    try:
        drawings = page.get_drawings()
    except Exception:
        return fills
    for drawing in drawings:
        rect = drawing.get("rect")
        fill = drawing.get("fill")
        if rect is None or fill is None:
            continue
        hex_color = _float_rgb_to_hex(fill)
        if not hex_color:
            continue
        fills.append((rect, hex_color))
    return fills


def _background_at(fills: list[tuple[Any, str]], x: float, y: float) -> str:
    background = "#ffffff"
    for rect, hex_color in fills:
        if rect.x0 - 0.5 <= x <= rect.x1 + 0.5 and rect.y0 - 0.5 <= y <= rect.y1 + 0.5:
            background = hex_color
    return background


def _span_is_hidden_ats(span: dict, fills: list[tuple[Any, str]], font_scale: float) -> bool:
    text = str(span.get("text", "") or "").strip()
    if not text:
        return False
    bbox = span.get("bbox") or (0, 0, 0, 0)
    try:
        cx = (float(bbox[0]) + float(bbox[2])) / 2.0
        cy = (float(bbox[1]) + float(bbox[3])) / 2.0
    except (TypeError, ValueError, IndexError):
        cx, cy = 0.0, 0.0
    size_pt = float(span.get("size", 10) or 10) * font_scale
    color = _int_color_to_hex(span.get("color"))
    return _is_hidden_ats_text(size_pt, color, _background_at(fills, cx, cy))


def _reading_order_plaintext(fragments: list[dict]) -> str:
    """Colonne par colonne, puis de haut en bas. Les ancres évitent de mélanger deux colonnes."""
    if not fragments:
        return ""

    def line_text(frag: dict) -> str:
        return _collapse_tracked_caps(str(frag.get("text") or ""))

    anchors = _column_anchor_xs(fragments)
    if len(anchors) < 2:
        ordered = sorted(fragments, key=lambda frag: (float(frag["y0"]), float(frag["x0"])))
        return "\n".join(line_text(frag) for frag in ordered if line_text(frag))

    def column_key(x0: float) -> float:
        return min(anchors, key=lambda anchor: abs(anchor - x0))

    ordered = sorted(
        fragments,
        key=lambda frag: (column_key(float(frag["x0"])), float(frag["y0"]), float(frag["x0"])),
    )
    return "\n".join(line_text(frag) for frag in ordered if line_text(frag))


def visible_text_excluding_hidden_ats(file_bytes: bytes) -> tuple[str, int]:
    """Texte lisible du PDF, et le nombre de lignes ATS camouflées retirées.

    S'il n'y en a aucune, le texte renvoyé peut être ignoré : l'extracteur
    habituel (ordre de lecture) reste préférable.
    """
    import fitz

    hidden = 0
    pages: list[str] = []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception:
        return "", 0
    try:
        for page in doc:
            fills = _paint_fills(page)
            fragments: list[dict] = []
            for raw_block in page.get_text("dict").get("blocks", []):
                if raw_block.get("type") != 0:
                    continue
                for line in raw_block.get("lines", []):
                    spans = [
                        span for span in line.get("spans", []) if str(span.get("text", "")).strip()
                    ]
                    if not spans:
                        continue
                    visible = [span for span in spans if not _span_is_hidden_ats(span, fills, 1.0)]
                    hidden += len(spans) - len(visible)
                    if not visible:
                        continue
                    text = _join_line_span_texts(visible)
                    if not text:
                        continue
                    x0, y0, _x1, _y1 = line.get("bbox", (0, 0, 0, 0))
                    fragments.append({"x0": float(x0), "y0": float(y0), "text": text})
            page_text = _reading_order_plaintext(fragments)
            if page_text:
                pages.append(page_text)
    finally:
        doc.close()
    return "\n\n".join(pages), hidden


def _is_near_white(hex_color: str | None) -> bool:
    if not hex_color or len(hex_color) != 7:
        return False
    try:
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
    except ValueError:
        return False
    return r >= 248 and g >= 248 and b >= 248


def _is_near_body_black(hex_color: str | None) -> bool:
    """Noir pur ou gris très sombre (texte corps) : pas une couleur d'accent."""
    if not hex_color or len(hex_color) != 7:
        return True
    try:
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
    except ValueError:
        return True
    return r < 50 and g < 50 and b < 50


def _extract_theme_colors(page, scale: float) -> dict:
    """Lit les couleurs de design (accent, sidebar, header) directement dans les
    instructions vectorielles du PDF, AVANT toute rasterisation ou mutation de page.

    Fonctionne quel que soit le chemin de rendu (graphic_blocks / bg_block / shape_blocks).
    """
    try:
        drawings = page.get_drawings()
    except Exception:
        return {}

    page_area = PAGE_W_MM * PAGE_H_MM
    sidebar_color: str | None = None
    header_color: str | None = None
    # (couleur, poids) - poids = largeur ou longueur de la forme
    accent_candidates: list[tuple[str, float]] = []

    for d in drawings:
        rect = d.get("rect")
        if rect is None:
            continue
        w_mm = (rect.x1 - rect.x0) * scale
        h_mm = (rect.y1 - rect.y0) * scale

        items_raw = d.get("items", [])
        is_pure_segment = any(it[0] == "l" for it in items_raw if it) and not any(
            it[0] == "re" for it in items_raw if it
        )
        if (w_mm <= 0 or h_mm <= 0) and not is_pure_segment:
            continue
        if w_mm > 0 and h_mm > 0 and w_mm * h_mm > page_area * PAGE_BG_AREA_RATIO:
            continue  # fond de page entier → ignoré

        fill_hex = _float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None
        stroke_hex = _float_rgb_to_hex(d.get("color")) if d.get("color") is not None else None

        color: str | None = None
        if fill_hex and not _is_near_white(fill_hex):
            color = fill_hex
        elif stroke_hex and not _is_near_white(stroke_hex):
            color = stroke_hex
        if not color:
            continue

        y_mm = rect.y0 * scale
        thin = min(w_mm, h_mm) <= LINE_MAX_THICKNESS_MM

        # Sidebar : grand rectangle vertical (gauche ou droite)
        if h_mm > PAGE_H_MM * 0.45 and w_mm < PAGE_W_MM * 0.4:
            if not sidebar_color:
                sidebar_color = color
        # Bandeau header : rectangle large et bas, en haut de page
        elif y_mm < 14 and h_mm < 80 and w_mm > PAGE_W_MM * 0.55:
            if not header_color:
                header_color = color
        # Filet de séparation explicite (type:line, mince et long)
        elif thin and max(w_mm, h_mm) >= MIN_SEPARATOR_LEN_MM:
            if not _is_near_body_black(color):
                accent_candidates.append((color, max(w_mm, h_mm)))
        # Barre horizontale épaisse (ratio w/h > 5 et ≥ 20mm)
        elif w_mm > h_mm * 5 and w_mm >= 20:
            if not _is_near_body_black(color):
                accent_candidates.append((color, w_mm))

    result: dict = {}
    if sidebar_color:
        result["color_sidebar"] = sidebar_color
    if header_color:
        result["color_header"] = header_color

    if accent_candidates:
        weights: dict[str, float] = {}
        for c, w in accent_candidates:
            weights[c] = weights.get(c, 0.0) + w
        best = max(weights, key=lambda c: weights[c])
        result["color_accent"] = best
        result["color_section_title"] = best
    elif header_color:
        result["color_accent"] = header_color
        result["color_section_title"] = header_color
    elif sidebar_color:
        result["color_accent"] = sidebar_color
        result["color_section_title"] = sidebar_color

    return result


def _font_family_from_name(font_name: str) -> str | None:
    name = (font_name or "").lower()
    if "mono" in name or "courier" in name or "consol" in name:
        return "'Courier New', monospace"
    if (
        "times" in name
        or "georgia" in name
        or "serif" in name
        or "garamond" in name
        or "minion" in name
        or "cambria" in name
    ):
        return "Georgia, 'Times New Roman', serif"
    return None  # défaut : stack sans-serif gérée côté thème


def _span_css_weight(span: dict) -> int:
    """Graisse réelle. Le nom (Medium, SemiBold) prime sur le flag gras du PDF."""
    named = font_css_weight(str(span.get("font") or ""))
    if named is not None:
        return named
    flags = int(span.get("flags", 0) or 0)
    if flags & _FLAG_BOLD:
        return 700
    return 400


def _span_is_bold(span: dict) -> bool:
    return _span_css_weight(span) >= 700


def _span_is_italic(span: dict) -> bool:
    flags = int(span.get("flags", 0) or 0)
    if flags & _FLAG_ITALIC:
        return True
    name = str(span.get("font", "")).lower()
    return "italic" in name or "oblique" in name


def _fit_factor(page_width_pt: float, page_height_pt: float) -> float:
    """Facteur (≤1) pour faire tenir une page non-A4 dans l'A4 (210×297mm).

    Ne s'applique PAS à la conversion pt→mm : seulement à la réduction
    homothétique d'une page plus grande que l'A4.
    """
    w_mm = page_width_pt * MM_PER_PT
    h_mm = page_height_pt * MM_PER_PT
    if w_mm <= 0 or h_mm <= 0:
        return 1.0
    return min(PAGE_W_MM / w_mm, PAGE_H_MM / h_mm, 1.0)


def _join_line_span_texts(spans: list) -> str:
    """Concatène les spans d'une ligne PDF en insérant l'espace manquant.

    PyMuPDF coupe souvent « Organisation : » et « Loulitos » en deux spans
    collés (gap ≥ 0 ou deux-points collé à la lettre suivante).
    """
    parts: list[str] = []
    prev_x1: float | None = None
    for span in spans:
        text = str(span.get("text", "") or "")
        if not text:
            continue
        bbox = span.get("bbox") or (0, 0, 0, 0)
        try:
            x0 = float(bbox[0])
            x1 = float(bbox[2])
        except (TypeError, ValueError, IndexError):
            x0, x1 = 0.0, 0.0
        if parts:
            left = parts[-1]
            gap = 0.0 if prev_x1 is None else x0 - prev_x1
            glued_after_colon = bool(left and left[-1] in ":;" and text[0].isalnum())
            need_space = glued_after_colon or (
                gap > 0.55
                and not left[-1].isspace()
                and not text[0].isspace()
                and text[0] not in ".,;:!?)]}/»"
                and left[-1] not in "«(/["
            )
            if need_space:
                parts.append(" ")
        parts.append(text)
        prev_x1 = x1
    return "".join(parts).strip()


def _line_spans_kept(spans: list) -> list[dict]:
    """Garde le gras/italique de chaque span. Un span « dominant » ne peint pas toute la ligne."""
    kept: list[dict] = []
    prev_x1: float | None = None
    prev_text = ""
    for span in spans:
        text = str(span.get("text", "") or "")
        if not text:
            continue
        bbox = span.get("bbox") or (0, 0, 0, 0)
        try:
            x0 = float(bbox[0])
            x1 = float(bbox[2])
        except (TypeError, ValueError, IndexError):
            x0, x1 = 0.0, 0.0
        if kept and prev_text:
            gap = 0.0 if prev_x1 is None else x0 - prev_x1
            glued_after_colon = bool(prev_text[-1] in ":;" and text[0].isalnum())
            need_space = glued_after_colon or (
                gap > 0.55
                and not prev_text[-1].isspace()
                and not text[0].isspace()
                and text[0] not in ".,;:!?)]}/»"
                and prev_text[-1] not in "«(/["
            )
            if need_space:
                text = " " + text.lstrip()
        kept.append(
            {
                "text": text,
                "size": float(span.get("size", 10) or 10),
                "color": span.get("color"),
                "font": str(span.get("font", "")),
                "flags": int(span.get("flags", 0) or 0),
            }
        )
        prev_text = text
        prev_x1 = x1
    return kept


def _span_text(span: dict) -> str:
    text = span.get("text")
    if text:
        return str(text)
    return "".join(str(ch.get("c") or "") for ch in span.get("chars") or [])


def _tracked_single_caps(text: str) -> bool:
    tokens = [tok for tok in text.split(" ") if tok]
    return bool(tokens) and all(len(tok) == 1 and tok.isupper() for tok in tokens)


def _line_column_fragments(line: dict) -> list[dict]:
    """Découpe une ligne PDF là où un large blanc sépare deux colonnes.

    Word aligne date, poste et ville sur la même baseline avec des espaces.
    Leurs boîtes se touchent, donc un simple écart entre spans ne les sépare pas.
    """
    y0, y1 = 0.0, 0.0
    bbox = line.get("bbox") or (0, 0, 0, 0)
    try:
        y0 = float(bbox[1])
        y1 = float(bbox[3])
    except (TypeError, ValueError, IndexError):
        y0, y1 = 0.0, 0.0

    glyphs: list[tuple[dict, str, float, float]] = []
    for span in line.get("spans") or []:
        chars = span.get("chars") or []
        if chars:
            for ch in chars:
                glyphs.append(
                    (
                        span,
                        str(ch.get("c") or ""),
                        float(ch.get("bbox", (0, 0, 0, 0))[0]),
                        float(ch.get("bbox", (0, 0, 0, 0))[2]),
                    )
                )
            continue
        text = _span_text(span)
        if text.strip():
            sb = span.get("bbox") or (0, 0, 0, 0)
            glyphs.append((span, text, float(sb[0]), float(sb[2])))

    groups: list[list[tuple[dict, str, float, float]]] = []
    group: list[tuple[dict, str, float, float]] = []
    prev_x1: float | None = None
    for span, text, x0, x1 in glyphs:
        if text.isspace() or not text:
            continue
        gap = 0.0 if prev_x1 is None else x0 - prev_x1
        current = "".join(part for _span, part, _a, _b in group)
        tracked = _tracked_single_caps(current) and len(text) == 1 and text.isupper()
        if group and gap > _COLUMN_SPLIT_GAP_PT and not tracked:
            groups.append(group)
            group = []
            gap = 0.0
        if group and gap > 0.45:
            group.append((span, " ", x0, x0))
        group.append((span, text, x0, x1))
        prev_x1 = x1
    if group:
        groups.append(group)

    fragments: list[dict] = []
    for index, piece in enumerate(groups):
        spans_out: list[dict] = []
        for span, text, x0, x1 in piece:
            key = (span.get("font"), span.get("flags"), span.get("size"), span.get("color"))
            if spans_out and spans_out[-1].get("_key") == key:
                spans_out[-1]["text"] += text
                box = spans_out[-1]["bbox"]
                spans_out[-1]["bbox"] = (box[0], box[1], max(box[2], x1), box[3])
            else:
                spans_out.append(
                    {
                        "text": text,
                        "size": span.get("size", 10),
                        "color": span.get("color"),
                        "font": span.get("font", ""),
                        "flags": span.get("flags", 0),
                        "bbox": (x0, y0, x1, y1),
                        "_key": key,
                    }
                )
        if not spans_out:
            continue
        for span in spans_out:
            span.pop("_key", None)
        ink = [item for item in piece if item[1].strip()]
        fragments.append(
            {
                "x0": ink[0][2],
                "y0": y0,
                "x1": ink[-1][3],
                "y1": y1,
                "spans": _line_spans_kept(spans_out),
                "column_break": index > 0,
            }
        )
    return fragments


# Fragments PDF sur la même ligne de base (Canva découpe souvent un mot = une « ligne »).
_BASELINE_TOL_PT = 2.2
_COLUMN_ANCHOR_TOL_PT = 3.5
_COLUMN_ANCHOR_MIN = 3
_JOIN_GAP_PT = 22.0
# Plus large qu'un espace entre deux mots (~2,5 pt), plus étroit qu'un trou
# de colonne (date | poste | ville). Les lettres écartées d'un titre en
# capitales restent dans le même fragment.
_COLUMN_SPLIT_GAP_PT = 6.5
_TRACKED_CAPS_RE = re.compile(r"^(?:[A-ZÀ-Ý]{1,4} +){2,}[A-ZÀ-Ý]{1,6}$")


def _collapse_tracked_caps(text: str) -> str:
    """« ALT E R NANT » (interlettrage PDF) redevient « ALTERNANT »."""
    stripped = " ".join(text.split())
    if not _TRACKED_CAPS_RE.match(stripped):
        return text.strip()
    tokens = stripped.split(" ")
    if sum(1 for token in tokens if len(token) == 1) < 2:
        return text.strip()
    return "".join(tokens)


def _column_anchor_xs(fragments: list[dict]) -> list[float]:
    """x de début répétés = colonnes (date | école), pas la suite d'une phrase."""
    xs = sorted(float(f["x0"]) for f in fragments)
    clusters: list[list[float]] = []
    for x in xs:
        if clusters and x - clusters[-1][-1] <= _COLUMN_ANCHOR_TOL_PT:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    return [
        sum(cluster) / len(cluster) for cluster in clusters if len(cluster) >= _COLUMN_ANCHOR_MIN
    ]


def _starts_new_column(x0: float, current_x0: float, anchors: list[float]) -> bool:
    for anchor in anchors:
        if abs(x0 - anchor) <= _COLUMN_ANCHOR_TOL_PT:
            return abs(x0 - current_x0) > _COLUMN_ANCHOR_TOL_PT
    return False


def _harmonize_span_weights(spans: list[dict]) -> list[dict]:
    """Une graisse par mot. Gras et régulier restent possibles d'un mot à l'autre."""
    pieces: list[dict] = []
    for span in spans:
        raw = str(span.get("text") or "")
        if not raw:
            continue
        weight = _span_css_weight(span)
        for part in re.split(r"(\s+)", raw):
            if part:
                pieces.append({**span, "text": part, "_weight": weight})
    groups: list[list[dict]] = []
    word: list[dict] = []
    for piece in pieces:
        if str(piece.get("text") or "").isspace():
            if word:
                groups.append(word)
                word = []
            groups.append([piece])
        else:
            word.append(piece)
    if word:
        groups.append(word)
    out: list[dict] = []
    for group in groups:
        if str(group[0].get("text") or "").isspace():
            out.extend(group)
            continue
        counts: dict[int, int] = {}
        for piece in group:
            weight = int(piece["_weight"])
            counts[weight] = counts.get(weight, 0) + len(str(piece.get("text") or ""))
        majority = max(counts, key=lambda item: (counts[item], -item))
        for piece in group:
            piece["_weight"] = majority
            out.append(piece)
    return out


def _spans_to_html(spans: list[dict]) -> str:
    # Avant le découpage des mots : les espaces internes comptent, sinon
    # un lien un peu long devient la couleur de toute la ligne.
    dominant = _dominant_span_color(spans)
    spans = _harmonize_span_weights(spans)
    parts: list[str] = []
    for span in spans:
        raw = str(span.get("text") or "")
        if not raw:
            continue
        escaped = html.escape(raw)
        stored = span.get("_weight")
        weight = stored if isinstance(stored, int) else _span_css_weight(span)
        bold = weight >= 700
        italic = _span_is_italic(span)
        if bold and italic:
            escaped = f"<strong><em>{escaped}</em></strong>"
        elif bold:
            escaped = f"<strong>{escaped}</strong>"
        elif italic:
            escaped = f"<em>{escaped}</em>"
        styles: list[str] = []
        if 400 < weight < 700:
            styles.append(f"font-weight:{weight}")
        # La couleur du bloc est la dominante. Les autres restent sur leur fragment.
        if _span_hex_color(span) != dominant and raw.strip():
            styles.append(f"color:{_span_hex_color(span)}")
        if styles:
            escaped = f'<span style="{";".join(styles)}">{escaped}</span>'
        parts.append(escaped)
    plain = "".join(str(span.get("text") or "") for span in spans)
    collapsed = _collapse_tracked_caps(plain)
    if collapsed != plain.strip() and "<" not in "".join(parts):
        return html.escape(collapsed)
    return "".join(parts)


def _merge_baseline_fragments(fragments: list[dict]) -> list[dict]:
    """Recolle les mots d'une même ligne visuelle, sans fusionner deux colonnes."""
    if not fragments:
        return []
    anchors = _column_anchor_xs(fragments)
    rows: list[list[dict]] = []
    for frag in sorted(fragments, key=lambda f: (float(f["y0"]), float(f["x0"]))):
        if not rows or float(frag["y0"]) - float(rows[-1][0]["y0"]) > _BASELINE_TOL_PT:
            rows.append([frag])
        else:
            rows[-1].append(frag)
    merged: list[dict] = []
    for row in rows:
        row.sort(key=lambda f: float(f["x0"]))
        current = {
            "x0": row[0]["x0"],
            "y0": row[0]["y0"],
            "x1": row[0]["x1"],
            "y1": row[0]["y1"],
            "spans": list(row[0]["spans"]),
        }
        for nxt in row[1:]:
            gap = float(nxt["x0"]) - float(current["x1"])
            size_a = float(current["spans"][0].get("size") or 10)
            size_b = float(nxt["spans"][0].get("size") or 10)
            # Un trou de colonne (espaces de calage dans le PDF) ne se recolle pas :
            # sinon « 2024    Poste » redevient une seule ligne.
            if nxt.get("column_break"):
                merged.append(current)
                current = {
                    "x0": nxt["x0"],
                    "y0": nxt["y0"],
                    "x1": nxt["x1"],
                    "y1": nxt["y1"],
                    "spans": list(nxt["spans"]),
                }
                continue
            new_column = _starts_new_column(float(nxt["x0"]), float(current["x0"]), anchors)
            # Un mot en fin de phrase peut tomber sur l'ancre de la colonne date.
            # On ne coupe que si le fragment de gauche est court (une date), pas
            # une phrase déjà longue dont le dernier mot est juste après.
            left_len = len("".join(str(s.get("text") or "") for s in current["spans"]).strip())
            if new_column and left_len >= 18 and gap <= max(size_a * 1.35, 12.0):
                new_column = False
            if -2.0 <= gap <= _JOIN_GAP_PT and abs(size_a - size_b) <= 1.5 and not new_column:
                left = "".join(str(s.get("text") or "") for s in current["spans"])
                right = str(nxt["spans"][0].get("text") or "") if nxt["spans"] else ""
                tight_punct = bool(right) and right[0] in ".,;:!?)]}/»" and gap < 1.5
                if (
                    left
                    and right
                    and not left[-1].isspace()
                    and not right[0].isspace()
                    and not tight_punct
                    and left[-1] not in "«(/["
                ):
                    current["spans"].append({**nxt["spans"][0], "text": " " + right.lstrip()})
                    current["spans"].extend(nxt["spans"][1:])
                else:
                    current["spans"].extend(nxt["spans"])
                current["x1"] = max(float(current["x1"]), float(nxt["x1"]))
                current["y0"] = min(float(current["y0"]), float(nxt["y0"]))
                current["y1"] = max(float(current["y1"]), float(nxt["y1"]))
            else:
                merged.append(current)
                current = {
                    "x0": nxt["x0"],
                    "y0": nxt["y0"],
                    "x1": nxt["x1"],
                    "y1": nxt["y1"],
                    "spans": list(nxt["spans"]),
                }
        merged.append(current)
    return merged


def _extract_text_blocks(
    page, pos_scale: float, font_scale: float, embedded_roots: set[str] | None = None
) -> tuple[list[dict], int]:
    """Une ligne PDF = un bloc texte canvas. Retourne (blocs, nb_chars).

    - ``pos_scale`` (= MM_PER_PT × fit) : conversion des positions pt→mm.
    - ``font_scale`` (= fit) : la taille de police RESTE en points (CSS pt),
      on n'applique que la réduction homothétique éventuelle.
    - ``embedded_roots`` : familles de police embarquées (rendu fidèle).
    """
    roots = embedded_roots or set()
    blocks: list[dict] = []
    char_count = 0
    fragments: list[dict] = []
    fills = _paint_fills(page)
    data = page.get_text("rawdict")
    for raw_block in data.get("blocks", []):
        if raw_block.get("type") != 0:  # 0 = texte
            continue
        for line in raw_block.get("lines", []):
            spans = []
            for span in line.get("spans", []):
                if not span.get("text"):
                    span["text"] = _span_text(span)
                if str(span.get("text", "")).strip() and not _span_is_hidden_ats(
                    span, fills, font_scale
                ):
                    spans.append(span)
            if not spans:
                continue
            kept_line = {"bbox": line.get("bbox"), "spans": spans}
            pieces = _line_column_fragments(kept_line)
            if not pieces:
                continue
            fragments.extend(pieces)

    for frag in _merge_baseline_fragments(fragments):
        spans = frag["spans"]
        content = _spans_to_html(spans)
        if not content:
            continue
        plain = re.sub(r"<[^>]+>", "", html.unescape(content))
        char_count += len(plain)
        # Style dominant = span qui porte le plus de caractères (et non le
        # plus grand) : un simple tiret en 14pt ne doit pas imposer sa
        # taille à toute une ligne rédigée en 9.5pt.
        lead = max(
            spans, key=lambda s: (len(str(s.get("text", "")).strip()), float(s.get("size", 0) or 0))
        )
        size_pt = float(lead.get("size", 10) or 10) * font_scale
        style: dict[str, Any] = {
            "font_size": round(size_pt, 1),
            "color": _dominant_span_color(spans),
            "align": "left",
            # Une ligne PDF = une ligne canvas. La police web (Inter) est un
            # peu plus large que celle du PDF : sans ça le texte reviendrait
            # à la ligne et chevaucherait le bloc suivant (positions figées).
            "nowrap": True,
        }
        lead_font = str(lead.get("font", ""))
        emb_family = embedded_family_for(lead_font, roots)
        if emb_family:
            style["font_family"] = emb_family
        else:
            fam = _font_family_from_name(lead_font)
            if fam:
                style["font_family"] = fam
        # Gras/italique seulement si TOUTE la ligne l'est. Sinon le CSS du
        # bloc graisserait aussi les mots réguliers ; le gras partiel est dans le HTML.
        visible_spans = [s for s in spans if str(s.get("text", "")).strip()]
        weights = {_span_css_weight(s) for s in visible_spans}
        if len(weights) == 1:
            only = next(iter(weights))
            if only >= 700:
                style["bold"] = True
            elif only != 400:
                style["font_weight"] = only
        if spans and all(_span_is_italic(s) for s in spans if str(s.get("text", "")).strip()):
            style["italic"] = True

        x0, y0, x1, y1 = frag["x0"], frag["y0"], frag["x1"], frag["y1"]
        w_mm = max(4.0, (x1 - x0) * pos_scale + 5.0)
        line_h_mm = max((y1 - y0) * pos_scale, size_pt * MM_PER_PT * 1.05)
        blocks.append(
            {
                "type": "text",
                "content": content,
                "x": round(max(0.0, x0 * pos_scale), 2),
                "y": round(max(0.0, y0 * pos_scale), 2),
                "w": round(min(w_mm, PAGE_W_MM), 2),
                "h": round(max(3.0, line_h_mm), 2),
                "z": 3,
                "style": style,
            }
        )
    return blocks, char_count


def _shape_block_from_box(
    x0_pt: float,
    y0_pt: float,
    x1_pt: float,
    y1_pt: float,
    scale: float,
    color: str,
) -> dict | None:
    """Construit un bloc forme depuis une box en points (rect ou trait épais)."""
    x_lo, x_hi = sorted((x0_pt, x1_pt))
    y_lo, y_hi = sorted((y0_pt, y1_pt))
    w_mm = (x_hi - x_lo) * scale
    h_mm = (y_hi - y_lo) * scale
    if w_mm <= 0 or h_mm <= 0:
        return None

    area = w_mm * h_mm
    thin = min(w_mm, h_mm) <= LINE_MAX_THICKNESS_MM

    # Fond de page entier → on ne le reproduit pas (il masquerait tout).
    if area > (PAGE_W_MM * PAGE_H_MM * PAGE_BG_AREA_RATIO):
        return None
    # Micro-artefacts vectoriels.
    if area < MIN_SHAPE_AREA_MM2 and not thin:
        return None
    # Rectangle plein ni fin (filet) ni assez grand (bandeau) → encart parasite.
    if not thin and area < BACKGROUND_MIN_AREA_MM2:
        return None
    horizontal = w_mm >= h_mm
    x_mm = max(0.0, x_lo * scale)
    y_mm = max(0.0, y_lo * scale)

    # Trait fin horizontal → shape:line (barre fine), vertical → shape:line orienté.
    # On stocke l'épaisseur réelle du PDF (min 0.05mm pour éviter zéro) ;
    # le rendu CSS applique un min-height/min-width de 1px pour la visibilité écran.
    if thin and horizontal:
        return {
            "type": "shape:line",
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": round(min(w_mm, PAGE_W_MM), 2),
            "h": round(max(h_mm, 0.05), 2),
            "z": 1,
            "style": {"color": color, "stroke_width": round(max(h_mm, 0.05), 2)},
        }
    if thin and not horizontal:
        return {
            "type": "shape:line",
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": round(max(w_mm, 0.05), 2),
            "h": round(min(h_mm, PAGE_H_MM), 2),
            "z": 1,
            "style": {
                "color": color,
                "stroke_width": round(max(w_mm, 0.05), 2),
                "orientation": "vertical",
            },
        }
    return {
        "type": "shape:rect",
        "x": round(x_mm, 2),
        "y": round(y_mm, 2),
        "w": round(max(min(w_mm, PAGE_W_MM), 0.3), 2),
        "h": round(max(min(h_mm, PAGE_H_MM), 0.3), 2),
        # z=1 : au-dessus d'une image de fond pleine page (z=0), sous le texte (z=3).
        "z": 1,
        "style": {"color": color},
    }


def _line_block_from_segment(
    p1, p2, stroke_width_pt: float, scale: float, color: str
) -> dict | None:
    """Trait (segment) tracé → bloc fin. Gère horizontal et vertical."""
    x0, y0 = float(p1.x), float(p1.y)
    x1, y1 = float(p2.x), float(p2.y)
    thickness_pt = max(stroke_width_pt, 0.5)
    if abs(y1 - y0) <= abs(x1 - x0):  # horizontal
        y0 -= thickness_pt / 2
        y1 = y0 + thickness_pt
    else:  # vertical
        x0 -= thickness_pt / 2
        x1 = x0 + thickness_pt
    return _shape_block_from_box(x0, y0, x1, y1, scale, color)


def _frame_strips_from_rects(r_a, r_b, scale: float, color: str) -> list[dict]:
    """Deux rectangles imbriqués remplis en *even-odd* = un cadre/filet.

    Seule la différence (outer − inner) est réellement peinte. On émet donc une
    fine bande par bord présentant un écart (souvent un seul → soulignement de
    section), au lieu de deux gros rectangles pleins.
    """
    a_a = (r_a.x1 - r_a.x0) * (r_a.y1 - r_a.y0)
    a_b = (r_b.x1 - r_b.x0) * (r_b.y1 - r_b.y0)
    outer, inner = (r_a, r_b) if a_a >= a_b else (r_b, r_a)

    # (x0, y0, x1, y1) en points pour chaque bord du cadre.
    edges = [
        (outer.x0, outer.y0, inner.x0, outer.y1),  # gauche
        (inner.x1, outer.y0, outer.x1, outer.y1),  # droite
        (outer.x0, outer.y0, outer.x1, inner.y0),  # haut
        (outer.x0, inner.y1, outer.x1, outer.y1),  # bas
    ]
    out: list[dict] = []
    for x0, y0, x1, y1 in edges:
        if (x1 - x0) <= 0.2 or (y1 - y0) <= 0.2:  # bord sans écart (en points)
            continue
        blk = _shape_block_from_box(x0, y0, x1, y1, scale, color)
        if blk:
            out.append(blk)
    return out


def _separator_block_from_line_items(
    line_items, scale: float, color: str, stroke_w_pt: float = 0.8
) -> dict | None:
    """Segments tracés (1 à N) → filet si la bbox est un trait fin assez long.

    Les filets de section Word/Canva sont souvent des chemins à 4 segments
    (rectangle fin) : l'ancienne logique ``len(line_items) >= 3`` les ignorait.
    """
    xs: list[float] = []
    ys: list[float] = []
    for it in line_items:
        if it[0] != "l":
            continue
        p1, p2 = it[1], it[2]
        xs.extend([float(p1.x), float(p2.x)])
        ys.extend([float(p1.y), float(p2.y)])
    if not xs:
        return None
    thickness_pt = max(stroke_w_pt, 0.5)
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    if (y1 - y0) < thickness_pt * 0.5:
        mid_y = (y0 + y1) / 2
        y0 = mid_y - thickness_pt / 2
        y1 = mid_y + thickness_pt / 2
    elif (x1 - x0) < thickness_pt * 0.5:
        mid_x = (x0 + x1) / 2
        x0 = mid_x - thickness_pt / 2
        x1 = mid_x + thickness_pt / 2
    blk = _shape_block_from_box(x0, y0, x1, y1, scale, color)
    if not blk:
        return None
    long_side = max(blk["w"], blk["h"])
    if long_side < MIN_SEPARATOR_LEN_MM:
        return None
    return blk


def _extract_shape_blocks(page, scale: float) -> list[dict]:
    """Rectangles pleins (sidebar, bandeau), filets/soulignements + séparateurs.

    Cas gérés par chemin (``get_drawings``) :
    - 1 rectangle plein → fond (header, sidebar) tel quel ;
    - 2 rectangles imbriqués (even-odd) → cadre/filet : seule la fine
      différence est peinte (cf. ``_frame_strips_from_rects``) ;
    - segments tracés → filets de séparation horizontaux.
    """
    blocks: list[dict] = []
    try:
        drawings = page.get_drawings()
    except Exception as exc:  # pragma: no cover - dépend du PDF
        logger.debug("pdf_structural_extract: get_drawings échoué: %s", exc)
        return blocks

    for d in drawings:
        fill_hex = _float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None
        stroke_hex = _float_rgb_to_hex(d.get("color")) if d.get("color") is not None else None
        stroke_w_pt = float(d.get("width") or 0)

        items = [it for it in d.get("items", []) if it]
        re_items = [it[1] for it in items if it[0] == "re"]
        line_items = [it for it in items if it[0] == "l"]

        if fill_hex and not _is_near_white(fill_hex):
            if len(re_items) == 1:
                r = re_items[0]
                blk = _shape_block_from_box(r.x0, r.y0, r.x1, r.y1, scale, fill_hex)
                if blk:
                    blocks.append(blk)
            elif len(re_items) == 2:
                blocks.extend(_frame_strips_from_rects(re_items[0], re_items[1], scale, fill_hex))
            # ≥3 rectangles = art vectoriel complexe → ignoré (pollution).

        if stroke_hex and not _is_near_white(stroke_hex) and line_items and not re_items:
            blk = _separator_block_from_line_items(line_items, scale, stroke_hex, stroke_w_pt)
            if blk:
                blocks.append(blk)
                continue
        if stroke_hex and not _is_near_white(stroke_hex):
            is_frame = bool(re_items)
            if not is_frame:
                for item in line_items:
                    p1, p2 = item[1], item[2]
                    dx = abs(float(p2.x) - float(p1.x))
                    dy = abs(float(p2.y) - float(p1.y))
                    if dx * scale < MIN_SEPARATOR_LEN_MM and dy * scale < MIN_SEPARATOR_LEN_MM:
                        continue
                    blk = _line_block_from_segment(p1, p2, stroke_w_pt, scale, stroke_hex)
                    if blk:
                        blocks.append(blk)
    return blocks


def _pix_rgb_at(pix, x: int, y: int) -> tuple[int, int, int] | None:
    """Échantillon RGB (ou niveau de gris) à un pixel du pixmap."""
    if pix is None or pix.width <= 0 or pix.height <= 0:
        return None
    x = max(0, min(int(pix.width) - 1, int(x)))
    y = max(0, min(int(pix.height) - 1, int(y)))
    n = int(pix.n or 0)
    if n < 1:
        return None
    idx = (y * int(pix.width) + x) * n
    samples = pix.samples
    if idx + n > len(samples):
        return None
    if n >= 3:
        return int(samples[idx]), int(samples[idx + 1]), int(samples[idx + 2])
    g = int(samples[idx])
    return g, g, g


def _pix_alpha_at(pix, x: int, y: int) -> int | None:
    if pix is None or not getattr(pix, "alpha", False):
        return None
    x = max(0, min(int(pix.width) - 1, int(x)))
    y = max(0, min(int(pix.height) - 1, int(y)))
    n = int(pix.n or 0)
    if n < 4:
        return None
    idx = (y * int(pix.width) + x) * n
    samples = pix.samples
    if idx + 3 >= len(samples):
        return None
    return int(samples[idx + 3])


def _color_dist(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> float:
    return ((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2) ** 0.5


def _pix_looks_round(pix) -> bool:
    """Heuristique : photo affichée en cercle (coins vides / alpha faible / fond uniforme)."""
    if pix is None:
        return False
    try:
        w, h = int(pix.width), int(pix.height)
    except Exception:
        return False
    if w < 12 or h < 12:
        return False
    ratio = w / h if h else 1.0
    if not (0.85 <= ratio <= 1.18):
        return False

    inset_x = max(2, int(w * 0.08))
    inset_y = max(2, int(h * 0.08))
    cx, cy = w // 2, h // 2
    corners = [
        (inset_x, inset_y),
        (w - 1 - inset_x, inset_y),
        (w - 1 - inset_x, h - 1 - inset_y),
        (inset_x, h - 1 - inset_y),
    ]
    center = _pix_rgb_at(pix, cx, cy)
    if center is None:
        return False

    if getattr(pix, "alpha", False):
        alphas = [_pix_alpha_at(pix, x, y) for x, y in corners]
        if all(a is not None for a in alphas):
            return sum(a < 40 for a in alphas) >= 3

    corner_colors = [_pix_rgb_at(pix, x, y) for x, y in corners]
    if any(c is None for c in corner_colors):
        return False
    corner_spread = max(
        _color_dist(corner_colors[i], corner_colors[j]) for i in range(4) for j in range(i + 1, 4)
    )
    corner_avg = (
        sum(c[0] for c in corner_colors) // 4,
        sum(c[1] for c in corner_colors) // 4,
        sum(c[2] for c in corner_colors) // 4,
    )
    center_corner_dist = _color_dist(center, corner_avg)
    return corner_spread < 36.0 and center_corner_dist > 22.0


def _is_photo_sized(w_mm: float, h_mm: float) -> bool:
    side = max(w_mm, h_mm)
    short = min(w_mm, h_mm)
    return MIN_PHOTO_MM <= side <= MAX_PHOTO_MM and short >= MIN_PHOTO_MM * 0.75


def _infer_image_shape(w_mm: float, h_mm: float, pix=None) -> str:
    """Déduit ``circle`` ou ``rect`` pour un bloc image importé."""
    ratio = w_mm / h_mm if h_mm else 1.0
    squareish = 0.85 <= ratio <= 1.18
    if not squareish:
        return "rect"
    if pix is not None and _pix_looks_round(pix):
        return "circle"
    if _is_photo_sized(w_mm, h_mm) and squareish:
        return "circle"
    return "rect"


def _pixmap_to_data_url(pix) -> str | None:
    import fitz

    try:
        if pix.n >= 5:  # CMYK / autres → RGB
            pix = fitz.Pixmap(fitz.csRGB, pix)
        # On garde le canal alpha (logos ronds). JPEG seulement si le PNG est trop lourd.
        data = pix.tobytes("png")
        if len(data) > MAX_IMAGE_BYTES:
            flat = fitz.Pixmap(pix, 0) if pix.alpha else pix
            data = flat.tobytes("jpeg")
        if len(data) > MAX_IMAGE_BYTES:
            return None
        b64 = base64.b64encode(data).decode("ascii")
        mime = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
        return f"data:{mime};base64,{b64}"
    except Exception as exc:  # pragma: no cover - dépend du PDF
        logger.debug("pdf_structural_extract: image encode échoué: %s", exc)
        return None


def _pixmap_visible_on_page(pix, rect, page_rect):
    """Recadre le bitmap sur la partie vraiment imprimée (Canva déborde souvent de la page)."""
    import fitz

    full = fitz.Rect(rect)
    inter = full & fitz.Rect(page_rect)
    if inter.is_empty or inter.width < 1 or inter.height < 1:
        return None, None
    inside = (
        abs(inter.x0 - full.x0) < 0.6
        and abs(inter.y0 - full.y0) < 0.6
        and abs(inter.x1 - full.x1) < 0.6
        and abs(inter.y1 - full.y1) < 0.6
    )
    if inside or pix.width < 2 or pix.height < 2:
        return pix, inter
    rw = full.width or 1
    rh = full.height or 1
    x0 = max(0, min(pix.width - 1, int((inter.x0 - full.x0) / rw * pix.width)))
    y0 = max(0, min(pix.height - 1, int((inter.y0 - full.y0) / rh * pix.height)))
    x1 = max(x0 + 1, min(pix.width, int(round((inter.x1 - full.x0) / rw * pix.width))))
    y1 = max(y0 + 1, min(pix.height, int(round((inter.y1 - full.y0) / rh * pix.height))))
    if x1 - x0 < 2 or y1 - y0 < 2:
        return pix, inter
    cropped = _crop_pixmap(pix, x0, y0, x1, y1)
    return (cropped if cropped is not None else pix), inter


def _crop_pixmap(pix, x0: int, y0: int, x1: int, y1: int):
    """Découpe un pixmap sans ``Pixmap(pix, clip)`` (cassé sur certains ICC)."""
    import fitz

    x0 = max(0, min(pix.width - 1, int(x0)))
    y0 = max(0, min(pix.height - 1, int(y0)))
    x1 = max(x0 + 1, min(pix.width, int(x1)))
    y1 = max(y0 + 1, min(pix.height, int(y1)))
    width = x1 - x0
    height = y1 - y0
    channels = pix.n
    source = pix.samples
    stride = pix.width * channels
    row = width * channels
    buffer = bytearray(height * row)
    for y in range(height):
        start = (y0 + y) * stride + x0 * channels
        buffer[y * row : (y + 1) * row] = source[start : start + row]
    try:
        return fitz.Pixmap(pix.colorspace, width, height, bytes(buffer), bool(pix.alpha))
    except Exception:
        return None


def _pdf_content_tokens(text: str) -> list[str]:
    """Tokens d'un flux PDF, sans les chaînes ni les commentaires."""
    tokens: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch.isspace() or ord(ch) < 32:
            i += 1
            continue
        if ch == "%":
            while i < n and text[i] not in "\n\r":
                i += 1
            continue
        if ch == "(":
            i += 1
            depth = 1
            while i < n and depth:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == "(":
                    depth += 1
                elif text[i] == ")":
                    depth -= 1
                i += 1
            continue
        if ch == "<":
            if text.startswith("<<", i):
                depth = 0
                while i < n - 1:
                    if text.startswith("<<", i):
                        depth += 1
                        i += 2
                        continue
                    if text.startswith(">>", i):
                        depth -= 1
                        i += 2
                        if depth == 0:
                            break
                        continue
                    i += 1
                continue
            i += 1
            while i < n and text[i] != ">":
                i += 1
            i += 1
            continue
        if ch == "[":
            depth = 1
            i += 1
            while i < n and depth:
                if text[i] == "[":
                    depth += 1
                elif text[i] == "]":
                    depth -= 1
                i += 1
            continue
        start = i
        if ch == "/":
            i += 1
        while (
            i < n and not text[i].isspace() and text[i] not in "[]()<>{}/%" and ord(text[i]) >= 32
        ):
            i += 1
        if i > start:
            tokens.append(text[start:i])
    return tokens


def _circle_from_path(ops: list[tuple]) -> tuple[float, float, float] | None:
    """Cercle PDF classique : un moveto et quatre courbes de Bézier."""
    if not ops or ops[0][0] != "m":
        return None
    curves = [op for op in ops if op[0] == "c"]
    if len(curves) != 4 or any(op[0] not in ("m", "c", "h") for op in ops):
        return None
    points = [(float(ops[0][1]), float(ops[0][2]))]
    points.extend((float(op[5]), float(op[6])) for op in curves)
    if points[0] == points[-1]:
        points = points[:-1]
    if len(points) < 4:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    radii = [math.hypot(x - cx, y - cy) for x, y in points]
    mean = sum(radii) / len(radii)
    if mean < 1 or max(radii) - min(radii) > mean * 0.08:
        return None
    if abs((max(xs) - min(xs)) - (max(ys) - min(ys))) > mean * 0.12:
        return None
    return cx, cy, mean


def _user_circle_to_page(circle, ctm, page_tm) -> tuple[float, float, float] | None:
    import fitz

    cx, cy, radius = circle
    center = fitz.Point(cx, cy) * ctm * page_tm
    edge_x = fitz.Point(cx + radius, cy) * ctm * page_tm
    edge_y = fitz.Point(cx, cy + radius) * ctm * page_tm
    rx = math.hypot(edge_x.x - center.x, edge_x.y - center.y)
    ry = math.hypot(edge_y.x - center.x, edge_y.y - center.y)
    if min(rx, ry) < 8:
        return None
    if abs(rx - ry) > max(rx, ry) * 0.12:
        return None
    return float(center.x), float(center.y), (rx + ry) / 2


def _rect_to_page(x: float, y: float, w: float, h: float, ctm, page_tm):
    import fitz

    corners = (
        fitz.Point(x, y) * ctm * page_tm,
        fitz.Point(x + w, y) * ctm * page_tm,
        fitz.Point(x, y + h) * ctm * page_tm,
        fitz.Point(x + w, y + h) * ctm * page_tm,
    )
    xs = [p.x for p in corners]
    ys = [p.y for p in corners]
    return min(xs), min(ys), max(xs), max(ys)


def _photo_circle_geometry(doc, page) -> tuple[dict[int, list[tuple]], list[tuple]]:
    """Cercles qui rognent une photo, et pastilles claires derrière.

    Retourne ``(clips par xref image, pastilles (cx, cy, r, couleur))`` en
    coordonnées de page. Un cadre blanc circulaire n'est pas le bitmap.
    """
    import fitz

    image_clips: dict[int, list[tuple]] = {}
    plates: list[tuple] = []
    seen_forms: set[int] = set()
    page_tm = page.transformation_matrix

    def remember_clip(circle) -> None:
        mapped = _user_circle_to_page(circle, ctm[0], page_tm)
        if mapped is None:
            return
        if any(
            math.hypot(mapped[0] - old[0], mapped[1] - old[1]) < 1.5
            and abs(mapped[2] - old[2]) < 1.5
            for old in clips[0]
        ):
            return
        clips[0].append(mapped)

    def walk(stream: bytes, resources_text: str) -> None:
        xo_text = _resource_subsection(doc, resources_text, "XObject") or ""
        xobjects: dict[str, tuple[int, str]] = {}
        for name, body in _named_refs(xo_text):
            ref = re.fullmatch(r"\s*(\d+)\s+0\s+R\s*", body)
            if not ref:
                continue
            xref = int(ref.group(1))
            try:
                header = doc.xref_object(xref)
            except Exception:
                continue
            if "/Subtype /Image" in header or "/Subtype/Image" in header:
                kind = "Image"
            elif "/Subtype /Form" in header or "/Subtype/Form" in header:
                kind = "Form"
            else:
                continue
            xobjects[name] = (xref, kind)
        try:
            tokens = _pdf_content_tokens(stream.decode("latin1", errors="replace"))
        except Exception:
            return
        nums: list[float] = []
        path: list[tuple] = []
        last_name = ""

        def take(count: int):
            if len(nums) < count:
                nums.clear()
                return None
            vals = nums[-count:]
            nums.clear()
            return vals

        for word in tokens:
            if word.startswith("/"):
                last_name = word[1:]
                nums.clear()
                continue
            try:
                nums.append(float(word))
                continue
            except ValueError:
                pass
            if word == "q":
                stack.append((ctm[0], list(clips[0]), fill[0]))
            elif word == "Q":
                if stack:
                    ctm[0], clips[0], fill[0] = stack.pop()
            elif word == "cm":
                vals = take(6)
                if vals:
                    ctm[0] = fitz.Matrix(*vals) * ctm[0]
            elif word == "m":
                vals = take(2)
                path = [("m", *vals)] if vals else []
            elif word == "l":
                vals = take(2)
                if vals:
                    path.append(("l", *vals))
            elif word == "c":
                vals = take(6)
                if vals:
                    path.append(("c", *vals))
            elif word == "h":
                nums.clear()
                path.append(("h",))
            elif word == "re":
                vals = take(4)
                path = [("re", *vals)] if vals else []
            elif word in ("W", "W*"):
                nums.clear()
                circle = _circle_from_path(path)
                if circle:
                    remember_clip(circle)
            elif word in ("f", "F", "f*", "b", "b*", "B", "B*"):
                nums.clear()
                circle = _circle_from_path(path)
                if circle and fill[0]:
                    mapped = _user_circle_to_page(circle, ctm[0], page_tm)
                    if mapped:
                        plates.append((*mapped, fill[0]))
                elif path and path[0][0] == "re" and fill[0] and _is_near_white(fill[0]):
                    x0, y0, x1, y1 = _rect_to_page(*path[0][1:], ctm[0], page_tm)
                    for clip in clips[0]:
                        cx, cy, radius = clip
                        if (
                            abs(x0 - (cx - radius)) < 8
                            and abs(y0 - (cy - radius)) < 8
                            and abs(x1 - (cx + radius)) < 8
                            and abs(y1 - (cy + radius)) < 8
                        ):
                            plates.append((*clip, fill[0]))
                path = []
            elif word in ("n", "S", "s"):
                nums.clear()
                path = []
            elif word == "rg":
                vals = take(3)
                if vals:
                    fill[0] = _float_rgb_to_hex(tuple(vals))
            elif word == "g":
                vals = take(1)
                if vals:
                    fill[0] = _float_rgb_to_hex((vals[0], vals[0], vals[0]))
            elif word == "Do" and last_name:
                nums.clear()
                spec = xobjects.get(last_name)
                if not spec:
                    path = []
                    continue
                xref, kind = spec
                if kind == "Image":
                    image_clips.setdefault(xref, []).extend(
                        clip for clip in clips[0] if clip[2] >= 12
                    )
                elif xref not in seen_forms:
                    seen_forms.add(xref)
                    try:
                        inner = doc.xref_object(xref)
                        inner_stream = doc.xref_stream(xref)
                    except Exception:
                        path = []
                        continue
                    matrix = doc.xref_get_key(xref, "Matrix")
                    saved = ctm[0]
                    if matrix[0] == "array":
                        raw = [float(n) for n in re.findall(r"-?[0-9]*\.?[0-9]+", matrix[1])]
                        if len(raw) == 6:
                            ctm[0] = fitz.Matrix(*raw) * ctm[0]
                    walk(inner_stream, inner)
                    ctm[0] = saved
                path = []
            else:
                nums.clear()

    ctm = [fitz.Matrix(1, 0, 0, 1, 0, 0)]
    clips: list[list[tuple]] = [[]]
    fill: list[str | None] = [None]
    stack: list[tuple] = []
    try:
        page_obj = doc.xref_object(page.xref)
        resources = _resource_subsection(doc, page_obj, "Resources") or ""
        walk(page.read_contents(), resources)
    except Exception as exc:  # pragma: no cover - PDF exotique
        logger.debug("pdf_structural_extract: cercles photo illisibles: %s", exc)
        return {}, []
    return image_clips, plates


def _matching_photo_circle(rect, clips: list[tuple] | None):
    """Plus petit cercle qui tient dans le bitmap : c'est la photo visible."""
    import fitz

    if not clips:
        return None
    image = fitz.Rect(rect)
    best = None
    for cx, cy, radius in clips:
        if radius < 12:
            continue
        if not (image.x0 - 4 <= cx <= image.x1 + 4 and image.y0 - 4 <= cy <= image.y1 + 4):
            continue
        if (
            cx - radius < image.x0 - 6
            or cy - radius < image.y0 - 6
            or cx + radius > image.x1 + 6
            or cy + radius > image.y1 + 6
        ):
            continue
        if best is None or radius < best[2]:
            best = (cx, cy, radius)
    return best


def _crop_pixmap_to_page_rect(pix, src_rect, dest_rect):
    import fitz

    src = fitz.Rect(src_rect)
    dest = fitz.Rect(dest_rect) & src
    if dest.is_empty or dest.width < 2 or dest.height < 2 or pix.width < 2:
        return pix, src
    rw = src.width or 1
    rh = src.height or 1
    x0 = int((dest.x0 - src.x0) / rw * pix.width)
    y0 = int((dest.y0 - src.y0) / rh * pix.height)
    x1 = int(round((dest.x1 - src.x0) / rw * pix.width))
    y1 = int(round((dest.y1 - src.y0) / rh * pix.height))
    cropped = _crop_pixmap(pix, x0, y0, x1, y1)
    if cropped is None:
        return pix, src
    return cropped, dest


def _photo_plate_blocks(image_blocks: list[dict], plates: list[tuple], scale: float) -> list[dict]:
    """Cercle clair plus grand que la photo : l'anneau blanc autour du portrait."""
    blocks: list[dict] = []
    for cx, cy, radius, color in plates:
        if not _is_near_white(color):
            continue
        hosts = False
        for img in image_blocks:
            if (img.get("style") or {}).get("shape") != "circle":
                continue
            ix = (float(img.get("x") or 0) + float(img.get("w") or 0) / 2) / scale
            iy = (float(img.get("y") or 0) + float(img.get("h") or 0) / 2) / scale
            ir = float(img.get("w") or 0) / scale / 2
            if math.hypot(ix - cx, iy - cy) > 4:
                continue
            if radius <= ir + 1.2 or radius > ir * 1.45:
                continue
            hosts = True
            break
        if not hosts:
            continue
        side = 2 * radius * scale
        blocks.append(
            {
                "type": "shape:circle",
                "x": round(max(0.0, (cx - radius) * scale), 2),
                "y": round(max(0.0, (cy - radius) * scale), 2),
                "w": round(min(side, PAGE_W_MM), 2),
                "h": round(min(side, PAGE_H_MM), 2),
                "z": 1,
                "style": {"color": color, "stroke_width": 0, "photo_plate": True},
            }
        )
    return blocks


def _crop_image_to_white_frame(page, pix, rect):
    """Recadre une image sur le cadre blanc qui la contient vraiment.

    Certains PDF posent la photo dans un bitmap beaucoup plus large (marge
    noire ou transparente) et la limitent par un carré blanc. On garde ce
    cadre, pas le bitmap entier.
    """
    import fitz

    image = fitz.Rect(rect)
    image_area = image.width * image.height
    if image_area < 1 or pix.width < 2 or pix.height < 2:
        return pix, image
    best = None
    best_area = 0.0
    try:
        drawings = page.get_drawings()
    except Exception:
        return pix, image
    for drawing in drawings:
        if not _drawing_is_visible(drawing):
            continue
        fill = drawing.get("fill")
        fill_hex = _float_rgb_to_hex(fill) if fill is not None else None
        if not _is_near_white(fill_hex):
            continue
        rects = [it[1] for it in drawing.get("items") or [] if it and it[0] == "re"]
        if len(rects) != 1:
            continue
        frame = fitz.Rect(rects[0])
        if frame.width < 18 or frame.height < 18:
            continue
        if (
            frame.x0 < image.x0 - 3
            or frame.y0 < image.y0 - 3
            or frame.x1 > image.x1 + 3
            or frame.y1 > image.y1 + 3
        ):
            continue
        area = frame.width * frame.height
        if area < image_area * 0.08 or area > image_area * 0.8:
            continue
        if area > best_area:
            best, best_area = frame, area
    if best is None:
        return pix, image
    rw = image.width or 1
    rh = image.height or 1
    x0 = int((best.x0 - image.x0) / rw * pix.width)
    y0 = int((best.y0 - image.y0) / rh * pix.height)
    x1 = int(round((best.x1 - image.x0) / rw * pix.width))
    y1 = int(round((best.y1 - image.y0) / rh * pix.height))
    cropped = _crop_pixmap(pix, x0, y0, x1, y1)
    if cropped is None:
        return pix, image
    return cropped, best


def _hidden_photo_frame(drawing: dict, scale: float) -> dict | None:
    """Rectangle non peint qui borne la photo (le bitmap déborde souvent)."""
    import fitz

    if drawing.get("fill") is None:
        return None
    rects = [it[1] for it in drawing.get("items") or [] if it and it[0] == "re"]
    if len(rects) != 1:
        return None
    rect = fitz.Rect(rects[0])
    w_mm = rect.width * scale
    h_mm = rect.height * scale
    if not _is_photo_sized(w_mm, h_mm):
        return None
    return {
        "type": "shape:rect",
        "x": round(max(0.0, rect.x0 * scale), 2),
        "y": round(max(0.0, rect.y0 * scale), 2),
        "w": round(min(w_mm, PAGE_W_MM), 2),
        "h": round(min(h_mm, PAGE_H_MM), 2),
        "z": 0,
        "style": {"color": "#000000", "hidden_frame": True},
    }


def _drawing_is_visible(drawing: dict) -> bool:
    """Un aplat d'opacité 0 est une ombre PDF, pas une forme du CV."""
    fill = drawing.get("fill")
    fill_op = drawing.get("fill_opacity")
    fill_ok = fill is not None and (fill_op is None or float(fill_op) > 0.02)
    stroke = drawing.get("color")
    stroke_op = drawing.get("stroke_opacity")
    width = float(drawing.get("width") or 0)
    stroke_ok = (
        stroke is not None and width > 0.05 and (stroke_op is None or float(stroke_op) > 0.02)
    )
    return fill_ok or stroke_ok


def _hex_to_rgb01(color: str) -> tuple[float, float, float]:
    raw = (color or "").lstrip("#")
    if len(raw) != 6:
        return (0.0, 0.0, 0.0)
    return tuple(int(raw[i : i + 2], 16) / 255 for i in (0, 2, 4))


def _filled_polygon_block(drawing: dict, scale: float, fill_hex: str) -> dict | None:
    """Triangle ou chevron : on le rasterise, on n'en fait pas un rectangle."""
    import fitz

    items = [it for it in drawing.get("items") or [] if it]
    if any(it[0] != "l" for it in items) or len(items) < 3:
        return None
    points: list[tuple[float, float]] = []
    for item in items:
        start, end = item[1], item[2]
        if not points:
            points.append((float(start.x), float(start.y)))
        points.append((float(end.x), float(end.y)))
    if len(points) < 4:
        return None
    rect = fitz.Rect(drawing.get("rect"))
    if rect.is_empty:
        return None
    w_mm = rect.width * scale
    h_mm = rect.height * scale
    if min(w_mm, h_mm) <= LINE_MAX_THICKNESS_MM:
        return None
    if w_mm * h_mm < BACKGROUND_MIN_AREA_MM2:
        return None
    doc = fitz.open()
    try:
        raster = doc.new_page(width=rect.width, height=rect.height)
        shape = raster.new_shape()
        local = [(x - rect.x0, y - rect.y0) for x, y in points]
        shape.draw_polyline(local)
        shape.finish(color=None, fill=_hex_to_rgb01(fill_hex), closePath=True)
        shape.commit()
        pix = raster.get_pixmap(alpha=True)
    except Exception:
        return None
    finally:
        doc.close()
    data_url = _pixmap_to_data_url(pix)
    if not data_url:
        return None
    return {
        "type": "image",
        "image_src": data_url,
        "x": round(max(0.0, rect.x0 * scale), 2),
        "y": round(max(0.0, rect.y0 * scale), 2),
        "w": round(min(w_mm, PAGE_W_MM), 2),
        "h": round(min(h_mm, PAGE_H_MM), 2),
        "z": 1,
        "style": {"shape": "rect", "decorative": False, "vector_fill": True},
    }


def _extract_image_blocks(
    page, doc, scale: float, budget: list[int], image_clips: dict | None = None
) -> list[dict]:
    """Images embarquées (photo, logos) → blocs image data-URL."""
    import fitz

    blocks: list[dict] = []
    try:
        images = page.get_images(full=True)
    except Exception:  # pragma: no cover
        return blocks
    paint_opacity = _image_paint_opacity(doc, page)

    for img in images:
        if budget[0] <= 0:
            break
        xref = img[0]
        try:
            rects = page.get_image_rects(xref)
        except Exception:
            rects = []
        if not rects:
            continue
        try:
            pix = fitz.Pixmap(doc, xref)
        except Exception:
            continue
        pix, rect = _pixmap_visible_on_page(pix, rects[0], page.rect)
        if pix is None or rect is None:
            continue
        circle = _matching_photo_circle(rect, (image_clips or {}).get(xref))
        if circle is not None:
            import fitz

            cx, cy, radius = circle
            pix, rect = _crop_pixmap_to_page_rect(
                pix, rect, fitz.Rect(cx - radius, cy - radius, cx + radius, cy + radius)
            )
        else:
            pix, rect = _crop_image_to_white_frame(page, pix, rect)
        if pix is None or rect is None:
            continue
        w_mm = rect.width * scale
        h_mm = rect.height * scale
        if w_mm <= 2 or h_mm <= 2:
            continue
        page_covering = w_mm * h_mm > PAGE_W_MM * PAGE_H_MM * PAGE_BG_AREA_RATIO
        shape = "circle" if circle is not None else _infer_image_shape(w_mm, h_mm, pix)
        data_url = _pixmap_to_data_url(pix)
        if not data_url:
            continue
        style: dict[str, Any] = {"shape": shape, "decorative": page_covering}
        opacity = paint_opacity.get(xref)
        if opacity is not None and opacity < 0.985:
            style["opacity"] = opacity
        blocks.append(
            {
                "type": "image",
                "image_src": data_url,
                "x": round(max(0.0, rect.x0 * scale), 2),
                "y": round(max(0.0, rect.y0 * scale), 2),
                "w": round(min(w_mm, PAGE_W_MM), 2),
                "h": round(min(h_mm, PAGE_H_MM), 2),
                "z": 0 if page_covering else 2,
                "style": style,
            }
        )
        budget[0] -= 1
    return blocks


def _render_decoration_background(page, scale: float) -> dict | None:
    """Rasterise la couche graphique de la page (texte retiré) en image de fond.

    On retire le texte par *redaction* (sans repeindre de fond, ``fill=False``)
    tout en conservant images et tracés vectoriels, puis on rend la page en PNG.
    Résultat : sidebar, photo, filets, icônes, puces, timelines… reproduits au
    pixel près, sur lesquels on superpose ensuite le texte éditable.

    ⚠️ Mute la page (texte supprimé) : appeler APRÈS l'extraction du texte.
    """
    import fitz

    try:
        for blk in page.get_text("dict").get("blocks", []):
            for line in blk.get("lines", []):
                for span in line.get("spans", []):
                    rect = fitz.Rect(span.get("bbox"))
                    if not rect.is_empty:
                        page.add_redact_annot(rect, fill=False)
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
            text=fitz.PDF_REDACT_TEXT_REMOVE,
        )
        pix = page.get_pixmap(matrix=fitz.Matrix(BG_RENDER_SCALE, BG_RENDER_SCALE), alpha=False)
    except Exception as exc:  # pragma: no cover - dépend du PDF
        logger.info("pdf_structural_extract: fond graphique non rendu: %s", exc)
        return None

    try:
        data = pix.tobytes("png")
        if len(data) > MAX_BG_BYTES:
            data = pix.tobytes("jpeg", jpg_quality=82)
    except Exception:  # pragma: no cover
        return None
    if not data or len(data) > MAX_BG_BYTES:
        return None

    b64 = base64.b64encode(data).decode("ascii")
    mime = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
    w_mm = page.rect.width * scale
    h_mm = page.rect.height * scale
    return {
        "type": "image",
        "image_src": f"data:{mime};base64,{b64}",
        "x": 0.0,
        "y": 0.0,
        "w": round(min(w_mm, PAGE_W_MM), 2),
        "h": round(min(h_mm, PAGE_H_MM), 2),
        "z": 0,
        "style": {"shape": "rect", "decorative": True},
    }


def _cluster_drawings(drawings: list, gap_pt: float) -> list[list]:
    """Regroupe les dessins dont les bboxes se touchent (à ``gap_pt`` près).

    Permet de traiter un pictogramme composé de plusieurs tracés comme UNE seule
    vignette déplaçable (au lieu d'éclater chaque trait).
    """
    n = len(drawings)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    rects = [d.get("rect") for d in drawings]
    for i in range(n):
        ri = rects[i]
        if ri is None:
            continue
        infl = (ri.x0 - gap_pt, ri.y0 - gap_pt, ri.x1 + gap_pt, ri.y1 + gap_pt)
        for j in range(i + 1, n):
            rj = rects[j]
            if rj is None:
                continue
            # Intersection des bboxes (gonflées) → même groupe.
            if not (infl[2] < rj.x0 or infl[0] > rj.x1 or infl[3] < rj.y0 or infl[1] > rj.y1):
                parent[find(i)] = find(j)

    groups: dict[int, list] = {}
    for idx, d in enumerate(drawings):
        groups.setdefault(find(idx), []).append(d)
    return list(groups.values())


def _cluster_union_rect(cluster: list):
    import fitz

    clip = fitz.Rect(cluster[0]["rect"])
    for d in cluster[1:]:
        r = d.get("rect")
        if r is not None:
            clip |= fitz.Rect(r)
    return clip


def _dominant_cluster_color(cluster: list) -> str:
    for d in cluster:
        fill_hex = _float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None
        if fill_hex and not _is_near_white(fill_hex):
            return fill_hex
        stroke_hex = _float_rgb_to_hex(d.get("color")) if d.get("color") is not None else None
        if stroke_hex and not _is_near_white(stroke_hex):
            return stroke_hex
    return "#333333"


def _guess_icon_name(w_mm: float, h_mm: float, cluster: list) -> str:
    """Heuristique géométrique → nom d'icône canvas (react-icons/hi2)."""
    aspect = w_mm / h_mm if h_mm > 0 else 1.0
    n_items = sum(len(d.get("items") or []) for d in cluster)
    long_side = max(w_mm, h_mm)
    # Masque circulaire photo (plusieurs segments) ≠ icône lieu.
    if 0.85 <= aspect <= 1.35 and n_items >= 4 and long_side <= 8:
        return "HiMapPin"
    if h_mm > w_mm * 1.12 and h_mm <= 12:
        return "HiPhone"
    if w_mm > h_mm * 1.15:
        return "HiEnvelope"
    if max(w_mm, h_mm) <= 8:
        return "HiLink"
    return "HiSparkles"


def _blocks_overlap_ratio(a: dict, b: dict, min_ratio: float = 0.25) -> bool:
    """True si l'intersection couvre au moins ``min_ratio`` du plus petit bloc."""
    ax, ay, aw, ah = (
        float(a.get("x", 0)),
        float(a.get("y", 0)),
        float(a.get("w", 0)),
        float(a.get("h", 0)),
    )
    bx, by, bw, bh = (
        float(b.get("x", 0)),
        float(b.get("y", 0)),
        float(b.get("w", 0)),
        float(b.get("h", 0)),
    )
    if aw <= 0 or ah <= 0 or bw <= 0 or bh <= 0:
        return False
    x0, y0 = max(ax, bx), max(ay, by)
    x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    if x1 <= x0 or y1 <= y0:
        return False
    inter = (x1 - x0) * (y1 - y0)
    smaller = min(aw * ah, bw * bh)
    return smaller > 0 and (inter / smaller) >= min_ratio


def _cleanup_image_overlay_blocks(blocks: list[dict]) -> list[dict]:
    """Retire icônes / anneaux vectoriels parasites au-dessus des photos importées."""
    images = [b for b in blocks if b.get("type") == "image"]
    if not images:
        return blocks
    photo_images = [
        b for b in images if _is_photo_sized(float(b.get("w", 0)), float(b.get("h", 0)))
    ]
    targets = photo_images if photo_images else images

    for img in images:
        for other in blocks:
            if other.get("type") not in ("icon", "shape:circle"):
                continue
            side = max(float(other.get("w", 0)), float(other.get("h", 0)))
            if other["type"] == "shape:circle" and (
                side < MIN_PHOTO_MM or (other.get("style") or {}).get("photo_plate")
            ):
                continue
            if _blocks_overlap_ratio(other, img, 0.2):
                style = img.setdefault("style", {})
                if style.get("shape") != "circle":
                    style["shape"] = "circle"

    kept: list[dict] = []
    for block in blocks:
        if block.get("type") == "icon" and any(
            _blocks_overlap_ratio(block, img, 0.22) for img in targets
        ):
            continue
        if (
            block.get("type") == "shape:circle"
            and not (block.get("style") or {}).get("photo_plate")
            and any(
                _blocks_overlap_ratio(block, img, 0.18)
                for img in images
                if not (img.get("style") or {}).get("decorative")
                and float(img.get("w", 0)) * float(img.get("h", 0)) < PAGE_W_MM * PAGE_H_MM * 0.5
            )
        ):
            continue
        kept.append(block)
    return kept


def _crop_image_block_to_box(img: dict, box: dict) -> None:
    """Recadre le bitmap pour qu'il remplisse exactement le cadre visible."""
    import fitz

    src = str(img.get("image_src") or "")
    iw = float(img.get("w") or 0) or 1.0
    ih = float(img.get("h") or 0) or 1.0
    fx0 = (float(box.get("x") or 0) - float(img.get("x") or 0)) / iw
    fy0 = (float(box.get("y") or 0) - float(img.get("y") or 0)) / ih
    fx1 = fx0 + float(box.get("w") or 0) / iw
    fy1 = fy0 + float(box.get("h") or 0) / ih
    img["x"] = round(float(box.get("x") or 0), 2)
    img["y"] = round(float(box.get("y") or 0), 2)
    img["w"] = round(float(box.get("w") or 0), 2)
    img["h"] = round(float(box.get("h") or 0), 2)
    if not src.startswith("data:") or "," not in src:
        return
    try:
        pix = fitz.Pixmap(base64.b64decode(src.split(",", 1)[1]))
    except Exception:
        return
    cropped = _crop_pixmap(
        pix,
        int(fx0 * pix.width),
        int(fy0 * pix.height),
        int(round(fx1 * pix.width)),
        int(round(fy1 * pix.height)),
    )
    if cropped is None:
        return
    data_url = _pixmap_to_data_url(cropped)
    if data_url:
        img["image_src"] = data_url


def _fit_images_to_backing_rects(blocks: list[dict]) -> list[dict]:
    """Un aplat de même largeur, plus court, est la fenêtre visible de la photo.

    Le bitmap déborde souvent (hors page, sous un bandeau). On le recadre sur
    cet aplat et on retire le rectangle, sinon l'image paraît trop grande.
    """
    drop: set[int] = set()
    for img in blocks:
        if img.get("type") != "image" or (img.get("style") or {}).get("decorative"):
            continue
        iw = float(img.get("w") or 0)
        ih = float(img.get("h") or 0)
        if not _is_photo_sized(iw, ih):
            continue
        plate = None
        for rect in blocks:
            if rect.get("type") != "shape:rect" or id(rect) in drop:
                continue
            rw = float(rect.get("w") or 0)
            rh = float(rect.get("h") or 0)
            if rh >= ih - 0.8 or rh < ih * 0.55:
                continue
            if abs(float(rect.get("x") or 0) - float(img.get("x") or 0)) > 1.6:
                continue
            if abs((float(rect.get("x") or 0) + rw) - (float(img.get("x") or 0) + iw)) > 1.6:
                continue
            top = float(rect.get("y") or 0)
            if (
                top < float(img.get("y") or 0) - 1.2
                or top + rh > float(img.get("y") or 0) + ih + 1.2
            ):
                continue
            plate = rect
        if plate is None:
            continue
        _crop_image_block_to_box(img, plate)
        drop.add(id(plate))
    return [
        block
        for block in blocks
        if id(block) not in drop and not (block.get("style") or {}).get("hidden_frame")
    ]


def _plain_text_content(block: dict) -> str:
    raw = html.unescape(str(block.get("content") or ""))
    raw = re.sub(r"<[^>]+>", "", raw)
    return raw.replace("\xa0", " ").strip()


def _starts_with_bullet(block: dict) -> bool:
    text = _plain_text_content(block).lstrip()
    return bool(text) and bool(_BULLET_GLYPH_RE.fullmatch(text[0]))


def _is_gutter_marker(block: dict) -> bool:
    """Puce visuelle isolée (cercle vectoriel, glyphe, micro-vignette)."""
    w = float(block.get("w") or 0)
    h = float(block.get("h") or 0)
    if max(w, h) > MAX_BULLET_MM:
        return False
    btype = block.get("type")
    if btype == "shape:circle":
        return True
    if btype == "image" and w <= MAX_BULLET_MM and h <= MAX_BULLET_MM:
        return True
    if btype in ("text", "title"):
        return bool(_BULLET_GLYPH_RE.fullmatch(_plain_text_content(block)))
    return False


def _is_list_body_line(block: dict) -> bool:
    """Lignes de puces : pas les titres de poste gras ni les dates courtes italiques."""
    text = _plain_text_content(block)
    if len(text) < 3:
        return False
    style = block.get("style") if isinstance(block.get("style"), dict) else {}
    if style.get("italic") and len(text) < 28:
        return False
    if style.get("bold") and _JOB_TITLE_DASH_RE.search(text) and len(text) < 90:
        return False
    return True


def _snap_marker_to_text_line(marker: dict, text: dict) -> None:
    mh = float(marker.get("h") or 0)
    content = str(text.get("content") or "")
    style = text.get("style") if isinstance(text.get("style"), dict) else {}
    # Puce sur la première ligne du bloc, pas au milieu d'un item sur deux lignes.
    if "<br>" in content.lower() or style.get("multiline"):
        size = float(style.get("font_size") or 10)
        th = max(size * MM_PER_PT * 1.2, 3.2)
    else:
        th = float(text.get("h") or 0)
    ty = float(text.get("y") or 0)
    marker["y"] = round(max(0.0, ty + (th - mh) / 2.0), 2)


def _left_item_marker(line: dict, markers: list[dict]) -> dict | None:
    """Puce ou petite icône juste à gauche de la ligne : début d'un item, pas une suite."""
    lx = float(line.get("x") or 0)
    ly = float(line.get("y") or 0)
    best: dict | None = None
    best_dy = 10**9
    best_dx = 10**9
    limit = max(3.0, float(line.get("h") or 0) * 0.7)
    for marker in markers:
        side = max(float(marker.get("w") or 0), float(marker.get("h") or 0))
        if side > MAX_BULLET_MM:
            continue
        right = float(marker.get("x") or 0) + float(marker.get("w") or 0)
        if right > lx + 1.2:
            continue
        dx = lx - right
        if dx > MAX_GUTTER_GAP_MM or dx < -1.2:
            continue
        dy = abs(float(marker.get("y") or 0) - ly)
        if dy > limit:
            continue
        if dy < best_dy - 0.05 or (abs(dy - best_dy) <= 0.05 and dx < best_dx):
            best = marker
            best_dy = dy
            best_dx = dx
    return best


def _emphasis_html(block: dict) -> str:
    """Le gras partiel reste dans le HTML. Le flag de bloc ne doit pas tout graisser."""
    content = str(block.get("content") or "")
    style = block.get("style") if isinstance(block.get("style"), dict) else {}
    lowered = content.lower()
    if style.get("bold") and "<strong>" not in lowered:
        content = f"<strong>{content}</strong>"
    if style.get("italic") and "<em>" not in lowered:
        content = f"<em>{content}</em>"
    return content


def _text_styles_compatible(a: dict, b: dict) -> bool:
    sa = a.get("style") if isinstance(a.get("style"), dict) else {}
    sb = b.get("style") if isinstance(b.get("style"), dict) else {}
    if abs(float(sa.get("font_size") or 0) - float(sb.get("font_size") or 0)) > 0.8:
        return False
    if str(sa.get("color") or "") != str(sb.get("color") or ""):
        return False
    if str(sa.get("font_family") or "") != str(sb.get("font_family") or ""):
        return False
    return True


def coalesce_text_runs(blocks: list[dict]) -> list[dict]:
    """Regroupe un paragraphe ou une puce multi-lignes en un seul bloc.

    Une puce (cercle ou petite icône à gauche) ouvre un item. Les lignes
    suivantes, même colonne et même style, sans nouvelle puce, le rejoignent.
    Les colonnes (date | intitulé) restent séparées.
    """
    texts = [b for b in blocks if b.get("type") == "text"]
    others = [b for b in blocks if b.get("type") != "text"]
    markers = [
        b
        for b in others
        if b.get("type") in ("shape:circle", "image")
        and max(float(b.get("w") or 0), float(b.get("h") or 0)) <= MAX_BULLET_MM
    ]
    texts.sort(key=lambda b: (float(b.get("y") or 0), float(b.get("x") or 0)))
    used: set[int] = set()
    merged: list[dict] = []
    for index, line in enumerate(texts):
        if id(line) in used:
            continue
        run = [line]
        used.add(id(line))
        opener = _left_item_marker(line, markers)
        for nxt in texts[index + 1 :]:
            if id(nxt) in used:
                continue
            if abs(float(nxt.get("x") or 0) - float(run[-1].get("x") or 0)) > 2.4:
                continue
            gap = float(nxt.get("y") or 0) - (
                float(run[-1].get("y") or 0) + float(run[-1].get("h") or 0)
            )
            if gap > max(1.8, float(run[-1].get("h") or 0) * 0.55):
                break
            if gap < -1.2 or not _text_styles_compatible(run[-1], nxt):
                break
            if _starts_with_bullet(nxt):
                break
            nxt_marker = _left_item_marker(nxt, markers)
            if nxt_marker is not None and nxt_marker is not opener:
                break
            if opener is None and nxt_marker is not None:
                break
            run.append(nxt)
            used.add(id(nxt))
        if len(run) == 1:
            merged.append(line)
            continue
        first, last = run[0], run[-1]
        style = dict(first.get("style") or {})
        if not all((b.get("style") or {}).get("bold") for b in run):
            style.pop("bold", None)
        if not all((b.get("style") or {}).get("italic") for b in run):
            style.pop("italic", None)
        style["nowrap"] = False
        style["multiline"] = True
        style["lock_height"] = True
        height = (float(last.get("y") or 0) + float(last.get("h") or 0)) - float(
            first.get("y") or 0
        )
        size_mm = float(style.get("font_size") or 10) * MM_PER_PT
        if len(run) > 1 and size_mm > 0 and height > 0:
            style["line_height"] = round(height / (len(run) * size_mm), 3)
        merged.append(
            {
                **first,
                "content": "<br>".join(_emphasis_html(b) for b in run),
                "w": round(max(float(b.get("w") or 0) for b in run), 2),
                "h": round(height, 2),
                "style": style,
            }
        )
    return [*others, *merged]


def align_gutter_bullets(blocks: list[dict]) -> list[dict]:
    """Aligne les puces sur les lignes de corps, pas sur le titre / la date au-dessus.

    Appariement par colonne (même x) puis zip haut→bas : un matching « plus proche »
    accroche souvent le titre de poste, ce qui décale toute la liste d'une ligne.
    """
    if not blocks:
        return blocks
    targets = [
        b
        for b in blocks
        if b.get("type") in ("text", "title")
        and not _is_gutter_marker(b)
        and len(_plain_text_content(b)) >= 2
    ]
    markers = [b for b in blocks if _is_gutter_marker(b)]
    if not targets or not markers:
        return blocks

    columns: dict[int, list[dict]] = {}
    for marker in markers:
        key = round(float(marker.get("x") or 0) / 2.5)
        columns.setdefault(key, []).append(marker)

    for col_markers in columns.values():
        col_markers.sort(key=lambda b: float(b.get("y") or 0))
        mx = float(col_markers[0].get("x") or 0)
        mw = float(col_markers[0].get("w") or 0)
        marker_right = mx + mw
        col_texts = [
            t
            for t in targets
            if float(t.get("x") or 0) >= marker_right - 1.0
            and float(t.get("x") or 0) - marker_right <= MAX_GUTTER_GAP_MM
        ]
        col_texts.sort(key=lambda b: float(b.get("y") or 0))
        body = [t for t in col_texts if _is_list_body_line(t)]
        if len(body) < max(1, int(len(col_markers) * 0.6)):
            body = [
                t
                for t in col_texts
                if len(_plain_text_content(t)) >= 3
                and not ((t.get("style") or {}).get("italic") and len(_plain_text_content(t)) < 28)
            ]
        # Puces dupliquées (deux cercles au même endroit) : on n'en garde qu'une.
        deduped: list[dict] = []
        for marker in col_markers:
            cx = float(marker.get("x") or 0) + float(marker.get("w") or 0) / 2
            cy = float(marker.get("y") or 0) + float(marker.get("h") or 0) / 2
            if any(
                abs(cx - (float(other.get("x") or 0) + float(other.get("w") or 0) / 2)) < 1.2
                and abs(cy - (float(other.get("y") or 0) + float(other.get("h") or 0) / 2)) < 1.2
                for other in deduped
            ):
                marker["type"] = "_dropped_bullet"
                continue
            deduped.append(marker)
        used: set[int] = set()
        for marker in deduped:
            my = float(marker.get("y") or 0) + float(marker.get("h") or 0) / 2
            best: dict | None = None
            best_score: float | None = None
            for text in body:
                if id(text) in used:
                    continue
                ty = float(text.get("y") or 0)
                th = float(text.get("h") or 0)
                inside = ty - 0.4 <= my <= ty + th
                dy = abs(ty - float(marker.get("y") or 0))
                if not inside and dy > MAX_BULLET_ALIGN_DY_MM:
                    continue
                score = dy if inside else dy + 20
                if best is None or best_score is None or score < best_score:
                    best = text
                    best_score = score
            if best is None:
                continue
            used.add(id(best))
            _snap_marker_to_text_line(marker, best)
        if deduped:
            shared_x = round(
                sorted(float(m.get("x") or 0) for m in deduped)[len(deduped) // 2],
                2,
            )
            for marker in deduped:
                marker["x"] = shared_x

    return [b for b in blocks if b.get("type") != "_dropped_bullet"]


def _classify_graphic_cluster(cluster: list, scale: float) -> dict | None:
    """Convertit un cluster vectoriel en bloc forme/icône natif quand c'est possible."""
    if not cluster:
        return None
    clip = _cluster_union_rect(cluster)
    w_mm = (clip.x1 - clip.x0) * scale
    h_mm = (clip.y1 - clip.y0) * scale
    if w_mm <= 0.15 or h_mm <= 0.15:
        return None

    color = _dominant_cluster_color(cluster)
    long_side = max(w_mm, h_mm)
    short_side = min(w_mm, h_mm)
    aspect = w_mm / h_mm if h_mm > 0 else 1.0
    x_mm = max(0.0, clip.x0 * scale)
    y_mm = max(0.0, clip.y0 * scale)

    # Masque / cadre de photo (cercle vectoriel) → ne pas créer d'icône parasite.
    if _is_photo_sized(w_mm, h_mm) and 0.82 <= aspect <= 1.22:
        return None

    # Filet horizontal ou vertical
    if long_side >= MIN_SEPARATOR_LEN_MM and short_side <= LINE_MAX_THICKNESS_MM:
        stroke = round(max(short_side, 0.05), 2)
        if w_mm >= h_mm:
            return {
                "type": "shape:line",
                "x": round(x_mm, 2),
                "y": round(y_mm, 2),
                "w": round(w_mm, 2),
                "h": round(stroke, 2),
                "z": 1,
                "style": {"color": color, "stroke_width": stroke},
            }
        return {
            "type": "shape:line",
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": round(stroke, 2),
            "h": round(h_mm, 2),
            "z": 1,
            "style": {"color": color, "stroke_width": stroke, "orientation": "vertical"},
        }

    # Puce de liste. Un pictogramme plus gros ne doit pas devenir un disque noir.
    if long_side <= LIST_BULLET_MAX_MM and 0.55 <= aspect <= 1.85:
        d = round(max(long_side, 1.0), 2)
        return {
            "type": "shape:circle",
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": d,
            "h": d,
            "z": 2,
            "style": {"color": color, "stroke_color": color, "stroke_width": 0},
        }

    # Pictogramme (téléphone, email, pastille) : raster fidèle, pas une icône devinée.
    if (
        MIN_ICON_MM <= long_side <= MAX_CONTACT_ICON_MM
        and short_side >= MIN_ICON_MM
        and not _is_photo_sized(w_mm, h_mm)
    ):
        return None

    return None


def _pixmap_is_blank_plate(pix) -> bool:
    """Vignette quasi blanche et opaque : ce n'est pas un dessin du CV.

    Un aplat blanc rasterisé (ou un résidu de masque) apparaît comme un carré
    qui n'existe pas sur la page. Une icône claire sur fond transparent reste.
    """
    if pix is None or pix.width < 2 or pix.height < 2:
        return True
    channels = int(pix.n or 0)
    if channels < 1:
        return True
    samples = pix.samples
    total = int(pix.width) * int(pix.height)
    if total <= 0 or len(samples) < total * channels:
        return True
    has_alpha = bool(pix.alpha)
    ink = 0
    opaque_white = 0
    transparent = 0
    step = max(1, total // 20000)
    sampled = 0
    for index in range(0, total, step):
        sampled += 1
        base = index * channels
        if channels >= 3:
            red, green, blue = samples[base], samples[base + 1], samples[base + 2]
        else:
            red = green = blue = samples[base]
        alpha = samples[base + channels - 1] if has_alpha else 255
        if alpha < 24:
            transparent += 1
            continue
        if red >= 236 and green >= 236 and blue >= 236:
            opaque_white += 1
        else:
            ink += 1
    if sampled <= 0:
        return True
    if ink / sampled >= 0.08:
        return False
    if transparent / sampled >= 0.3 and (opaque_white + ink) / sampled >= 0.02:
        return False
    return opaque_white / sampled >= 0.65


def _resource_subsection(doc, obj_text: str, key: str) -> str | None:
    """Dictionnaire ``/key << ... >>`` ou ``/key N 0 R``.

    Ignore une valeur homonyme (``/Type /XObject`` n'est pas la clé ``/XObject``).
    """
    needle = f"/{key}"
    start = 0
    rest = ""
    while True:
        idx = obj_text.find(needle, start)
        if idx < 0:
            return None
        after = idx + len(needle)
        if after < len(obj_text) and obj_text[after] not in " \t\r\n/[<":
            start = after
            continue
        rest = obj_text[after:].lstrip()
        if rest.startswith("/") or rest.startswith("["):
            start = after
            continue
        break
    if rest.startswith("<<"):
        depth = 0
        i = 0
        while i < len(rest) - 1:
            if rest.startswith("<<", i):
                depth += 1
                i += 2
                continue
            if rest.startswith(">>", i):
                depth -= 1
                i += 2
                if depth == 0:
                    return rest[:i]
                continue
            i += 1
        return rest
    match = re.match(r"(\d+)\s+0\s+R", rest)
    if not match:
        return None
    try:
        return doc.xref_object(int(match.group(1)))
    except Exception:
        return None


def _named_refs(body: str) -> list[tuple[str, str]]:
    """Paires ``/Nom 12 0 R`` ou ``/Nom << ... >>`` d'un dictionnaire PDF."""
    found: list[tuple[str, str]] = []
    for match in re.finditer(r"/([^\s/\[\]<>()]+)\s+", body):
        name = match.group(1)
        rest = body[match.end() :].lstrip()
        if rest.startswith("<<"):
            depth = 0
            i = 0
            while i < len(rest) - 1:
                if rest.startswith("<<", i):
                    depth += 1
                    i += 2
                    continue
                if rest.startswith(">>", i):
                    depth -= 1
                    i += 2
                    if depth == 0:
                        found.append((name, rest[:i]))
                        break
                    continue
                i += 1
            continue
        ref = re.match(r"(\d+)\s+0\s+R", rest)
        if ref:
            found.append((name, ref.group(0)))
    return found


def _fill_opacity(doc, gs_body: str) -> float:
    body = gs_body
    ref = re.fullmatch(r"\s*(\d+)\s+0\s+R\s*", gs_body or "")
    if ref:
        try:
            body = doc.xref_object(int(ref.group(1)))
        except Exception:
            return 1.0
    match = re.search(r"(?<![A-Za-z])/ca\s+([0-9]*\.?[0-9]+)", body or "")
    if not match:
        return 1.0
    try:
        return max(0.0, min(1.0, float(match.group(1))))
    except ValueError:
        return 1.0


def _image_paint_opacity(doc, page) -> dict[int, float]:
    """Opacité réelle de chaque image (les formulaires la multiplient).

    Canva exporte souvent un fond « luminosité baissée » comme une image
    dessinée à 40 % : sans ça, le bitmap brut est trop contrasté.
    """
    opacities: dict[int, float] = {}
    seen_forms: set[tuple[int, float]] = set()

    def walk(stream: bytes, resources_text: str, inherited: float) -> None:
        gs_text = _resource_subsection(doc, resources_text, "ExtGState") or ""
        xo_text = _resource_subsection(doc, resources_text, "XObject") or ""
        gs_ca = {name: _fill_opacity(doc, body) for name, body in _named_refs(gs_text)}
        xobjects: dict[str, tuple[int, str]] = {}
        for name, body in _named_refs(xo_text):
            ref = re.fullmatch(r"\s*(\d+)\s+0\s+R\s*", body)
            if not ref:
                continue
            xref = int(ref.group(1))
            try:
                header = doc.xref_object(xref)
            except Exception:
                continue
            if "/Subtype /Image" in header or "/Subtype/Image" in header:
                kind = "Image"
            elif "/Subtype /Form" in header or "/Subtype/Form" in header:
                kind = "Form"
            else:
                continue
            xobjects[name] = (xref, kind)

        try:
            text = stream.decode("latin1", errors="replace")
        except Exception:
            return
        words = re.findall(r"/[^\s/\[\]<>()]+|[^\s]+", text)
        stack: list[float] = []
        current = 1.0
        for index, word in enumerate(words):
            if word == "q":
                stack.append(current)
            elif word == "Q":
                current = stack.pop() if stack else 1.0
            elif word == "gs" and index and words[index - 1].startswith("/"):
                current = gs_ca.get(words[index - 1][1:], 1.0)
            elif word == "Do" and index and words[index - 1].startswith("/"):
                spec = xobjects.get(words[index - 1][1:])
                if not spec:
                    continue
                xref, kind = spec
                if kind == "Image":
                    opacities[xref] = round(max(0.0, min(1.0, inherited * current)), 3)
                    continue
                key = (xref, round(inherited * current, 3))
                if key in seen_forms:
                    continue
                seen_forms.add(key)
                try:
                    inner = doc.xref_object(xref)
                    inner_stream = doc.xref_stream(xref)
                except Exception:
                    continue
                walk(inner_stream, inner, inherited * current)

    try:
        page_obj = doc.xref_object(page.xref)
        resources = _resource_subsection(doc, page_obj, "Resources") or ""
        walk(page.read_contents(), resources, 1.0)
    except Exception as exc:  # pragma: no cover - PDF exotique
        logger.debug("pdf_structural_extract: opacité images illisible: %s", exc)
    return opacities


def _cutout_block(page, clip, scale: float) -> tuple[dict | None, int]:
    """Rasterise une région de la page (texte déjà retiré) en vignette image.

    Retourne ``(bloc, octets)``. La vignette reste fidèle au PDF (icônes/puces)
    et devient un bloc déplaçable indépendamment.
    """
    import fitz

    try:
        pix = page.get_pixmap(
            matrix=fitz.Matrix(CUTOUT_RENDER_SCALE, CUTOUT_RENDER_SCALE), clip=clip, alpha=True
        )
    except Exception:  # pragma: no cover - dépend du PDF
        return None, 0
    w_mm = (clip.x1 - clip.x0) * scale
    h_mm = (clip.y1 - clip.y0) * scale
    if w_mm <= 0.4 or h_mm <= 0.4:
        return None, 0
    if _pixmap_is_blank_plate(pix):
        return None, 0
    shape = _infer_image_shape(w_mm, h_mm, pix)
    data_url = _pixmap_to_data_url(pix)
    if not data_url:
        return None, 0
    block = {
        "type": "image",
        "image_src": data_url,
        "x": round(max(0.0, clip.x0 * scale), 2),
        "y": round(max(0.0, clip.y0 * scale), 2),
        "w": round(min(w_mm, PAGE_W_MM), 2),
        "h": round(min(h_mm, PAGE_H_MM), 2),
        "z": 2,
        "style": {
            "shape": shape,
            "decorative": w_mm * h_mm > PAGE_W_MM * PAGE_H_MM * 0.5,
        },
    }
    return block, len(data_url)


def _extract_graphic_blocks(page, doc, scale: float, image_budget: list) -> list[dict] | None:
    """Décompose la couche graphique en blocs INDÉPENDANTS (déplaçables).

    - fonds pleins (sidebar/header) → ``shape:rect`` recolorable ;
    - filets / timelines → blocs fins ``shape:line``/``shape:rect`` ;
    - photos → blocs image ;
    - pictogrammes / puces / marqueurs (vecteurs complexes) → vignettes image
      rasterisées (fidèles) regroupées par proximité.

    Retourne ``None`` si la couche est trop fragmentée (→ repli sur fond plat).
    ⚠️ Mute la page (retire le texte) : appeler APRÈS l'extraction du texte.
    """
    import fitz

    try:
        drawings = page.get_drawings()
    except Exception as exc:  # pragma: no cover
        logger.debug("pdf_structural_extract: get_drawings échoué: %s", exc)
        drawings = []

    blocks: list[dict] = []
    seen_keys: set[tuple] = set()
    misc: list = []
    page_area = PAGE_W_MM * PAGE_H_MM

    def _push(blk: dict | None) -> None:
        if not blk:
            return
        key = (
            blk["type"],
            round(blk["x"], 1),
            round(blk["y"], 1),
            round(blk["w"], 1),
            round(blk["h"], 1),
        )
        if key in seen_keys:  # évite les traits dupliqués (fill + stroke)
            return
        seen_keys.add(key)
        blocks.append(blk)

    for d in drawings:
        if not _drawing_is_visible(d):
            frame = _hidden_photo_frame(d, scale)
            if frame:
                blocks.append(frame)
            continue
        rect = d.get("rect")
        if rect is None:
            continue
        w_mm = (rect.x1 - rect.x0) * scale
        h_mm = (rect.y1 - rect.y0) * scale

        items = [it for it in d.get("items", []) if it]
        re_items = [it[1] for it in items if it[0] == "re"]
        line_items = [it for it in items if it[0] == "l"]
        is_pure_segment = bool(line_items) and not re_items

        # Segments horizontaux/verticaux : bounding rect de hauteur ou largeur 0 →
        # on conserve si c'est un segment pur (items=['l']). Tout autre dessin
        # dégénéré est ignoré.
        if (w_mm <= 0 or h_mm <= 0) and not is_pure_segment:
            continue
        if w_mm > 0 and h_mm > 0 and w_mm * h_mm > page_area * PAGE_BG_AREA_RATIO:
            continue  # fond de page entier

        fill_hex = _float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None
        stroke_hex = _float_rgb_to_hex(d.get("color")) if d.get("color") is not None else None
        thin = min(w_mm, h_mm) <= LINE_MAX_THICKNESS_MM
        longish = max(w_mm, h_mm) >= MIN_SEPARATOR_LEN_MM
        area = w_mm * h_mm
        handled = False

        # Rectangle plein recolorable : soit un fond structurel (sidebar/bandeau),
        # soit un filet/timeline plein et fin (rectangle long).
        if fill_hex and not _is_near_white(fill_hex) and len(re_items) == 2:
            for strip in _frame_strips_from_rects(re_items[0], re_items[1], scale, fill_hex):
                _push(strip)
            handled = True
        elif (
            fill_hex
            and not _is_near_white(fill_hex)
            and len(re_items) == 1
            and ((not thin and area >= BACKGROUND_MIN_AREA_MM2) or (thin and longish))
        ):
            r0 = re_items[0]
            _push(_shape_block_from_box(r0.x0, r0.y0, r0.x1, r0.y1, scale, fill_hex))
            handled = True
        # Filet tracé (segments, y compris cadres fins à 4 traits) → bloc fin.
        elif stroke_hex and not _is_near_white(stroke_hex) and line_items and not re_items:
            blk = _separator_block_from_line_items(
                line_items, scale, stroke_hex, float(d.get("width") or 0)
            )
            if blk:
                _push(blk)
                handled = True
        elif fill_hex and not _is_near_white(fill_hex) and line_items and not re_items:
            poly = _filled_polygon_block(d, scale, fill_hex)
            if poly:
                _push(poly)
                handled = True

        if not handled:
            misc.append(d)

    # Filets isolés dans le reste vectoriel (évite de les fusionner en vignettes).
    remaining_misc: list = []
    for d in misc:
        rect = d.get("rect")
        if rect is None:
            remaining_misc.append(d)
            continue
        w_mm = (rect.x1 - rect.x0) * scale
        h_mm = (rect.y1 - rect.y0) * scale
        thin = min(w_mm, h_mm) <= LINE_MAX_THICKNESS_MM
        long_side = max(w_mm, h_mm)
        if thin and long_side >= MIN_SEPARATOR_LEN_MM:
            color = _dominant_cluster_color([d])
            blk = _shape_block_from_box(rect.x0, rect.y0, rect.x1, rect.y1, scale, color)
            if blk and blk.get("type") == "shape:line":
                _push(blk)
                continue
        remaining_misc.append(d)
    misc = remaining_misc

    # Rectangles blancs purs (fond structurel de page, masques CSS) : inutile
    # de les rasteriser — ils ne portent aucun dessin propre et, si on les
    # inclut dans un cluster, l'image produite duplique les shapes déjà
    # extraits (sidebar, filets) en les re-dessinant en pixels, puis les
    # masque (z=2 > shape:line z=1).
    misc = [
        d
        for d in misc
        if not (
            _is_near_white(_float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None)
            and not d.get("color")  # pas de stroke
            and all(it[0] == "re" for it in d.get("items", []) if it)  # que des rects
        )
    ]

    clusters = _cluster_drawings(misc, CLUSTER_GAP_PT) if misc else []
    if len(clusters) > MAX_CUTOUTS:  # trop fragmenté → repli sur fond plat
        return None

    # Photos (avant la redaction qui retire le texte).
    # L'anneau clair est posé avant la photo (même tri z : l'ordre du tableau).
    image_clips, plates = _photo_circle_geometry(doc, page)
    image_blocks = _extract_image_blocks(page, doc, scale, image_budget, image_clips)
    blocks.extend(_photo_plate_blocks(image_blocks, plates, scale))
    blocks.extend(image_blocks)

    if clusters:
        try:
            for blk in page.get_text("dict").get("blocks", []):
                for line in blk.get("lines", []):
                    for span in line.get("spans", []):
                        rr = fitz.Rect(span.get("bbox"))
                        if not rr.is_empty:
                            page.add_redact_annot(rr, fill=False)
            page.apply_redactions(
                images=fitz.PDF_REDACT_IMAGE_NONE,
                graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                text=fitz.PDF_REDACT_TEXT_REMOVE,
            )
        except Exception as exc:  # pragma: no cover
            logger.info("pdf_structural_extract: redaction cutouts échouée: %s", exc)
            return None

        total = 0
        for cluster in clusters:
            classified = _classify_graphic_cluster(cluster, scale)
            if classified:
                blocks.append(classified)
                continue
            clip = fitz.Rect(cluster[0]["rect"])
            for d in cluster[1:]:
                clip |= fitz.Rect(d["rect"])
            cx = (clip.x0 + clip.x1) / 2 * scale
            cy = (clip.y0 + clip.y1) / 2 * scale
            if any(
                b.get("type") == "image"
                and not (b.get("style") or {}).get("decorative")
                and float(b.get("w", 0)) * float(b.get("h", 0)) < PAGE_W_MM * PAGE_H_MM * 0.5
                and float(b.get("x", 0)) <= cx <= float(b.get("x", 0)) + float(b.get("w", 0))
                and float(b.get("y", 0)) <= cy <= float(b.get("y", 0)) + float(b.get("h", 0))
                for b in blocks
            ):
                continue
            block, nbytes = _cutout_block(page, clip, scale)
            if block:
                blocks.append(block)
                total += nbytes
                if total > MAX_CUTOUT_TOTAL_BYTES:
                    break

    return _cleanup_image_overlay_blocks(blocks)


def extract_layout_from_pdf(file_bytes: bytes, max_pages: int = MAX_PAGES) -> dict | None:
    """
    Reconstruit un layout v3 fidèle depuis un PDF natif (texte extractible).

    Retourne ``None`` si :
    - PyMuPDF indisponible,
    - PDF illisible,
    - trop peu de texte extractible (PDF scanné/rasterisé) → laisser un fallback agir.
    """
    if not file_bytes:
        return None
    try:
        import fitz
    except ImportError:
        logger.warning("pdf_structural_extract: PyMuPDF (fitz) indisponible")
        return None

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        logger.warning("pdf_structural_extract: ouverture PDF échouée: %s", exc)
        from backend.sentry_business import capture_business_event

        capture_business_event(
            "import",
            "PyMuPDF import en échec",
            kind="pymupdf_fail",
            size_bytes=len(file_bytes),
            provider_code=type(exc).__name__,
        )
        return None

    try:
        if doc.page_count < 1:
            return None
        pages_out: list[dict] = []
        total_chars = 0
        image_budget = [MAX_IMAGES_PER_DOC]
        n_pages = min(doc.page_count, max_pages)
        # Couleurs de design extraites avant toute rasterisation/mutation de page.
        # La première page prime (en-tête avec les couleurs dominantes du design).
        merged_theme_colors: dict = {}

        # Polices embarquées → rendu fidèle (mêmes largeurs que le PDF).
        try:
            font_faces, embedded_roots = extract_embedded_fonts(doc, max_pages=n_pages)
        except Exception as exc:  # pragma: no cover - dépend du PDF
            logger.info("pdf_structural_extract: extraction polices échouée: %s", exc)
            font_faces, embedded_roots = [], set()

        for page_index in range(n_pages):
            page = doc[page_index]
            fit = _fit_factor(page.rect.width, page.rect.height)
            pos_scale = MM_PER_PT * fit
            # Couleurs thème : lu AVANT que _extract_graphic_blocks mute la page.
            page_theme = _extract_theme_colors(page, pos_scale)
            for k, v in page_theme.items():
                if k not in merged_theme_colors:
                    merged_theme_colors[k] = v
            # Le texte D'ABORD (la décomposition/rasterisation retire le texte).
            text_blocks, chars = _extract_text_blocks(page, pos_scale, fit, embedded_roots)
            total_chars += chars
            # Couche graphique décomposée en blocs déplaçables (sidebar, filets,
            # photo, icônes/puces). Repli : fond plat rasterisé, puis vectoriel.
            graphic_blocks = _extract_graphic_blocks(page, doc, pos_scale, image_budget)
            if graphic_blocks is not None:
                blocks = [*graphic_blocks, *text_blocks]
            else:
                bg_block = _render_decoration_background(page, pos_scale)
                if bg_block:
                    blocks = [bg_block, *text_blocks]
                else:
                    shape_blocks = _extract_shape_blocks(page, pos_scale)
                    image_blocks = _extract_image_blocks(page, doc, pos_scale, image_budget)
                    blocks = [*shape_blocks, *image_blocks, *text_blocks]
            if not blocks:
                continue
            blocks = _cleanup_image_overlay_blocks(blocks)
            blocks = _fit_images_to_backing_rects(blocks)
            blocks = coalesce_text_runs(blocks)
            blocks = align_gutter_bullets(blocks)
            pages_out.append({"id": f"page_{page_index + 1}", "blocks": blocks})

        if not pages_out or total_chars < MIN_TEXT_CHARS_FOR_NATIVE:
            logger.info("pdf_structural_extract: PDF non natif (chars=%s) - fallback", total_chars)
            return None

        return {
            "version": 3,
            "format": "A4",
            "grid": "free",
            "unit": "mm",
            # Copie fidèle : positions absolues à préserver (pas de reflow colonne).
            "freeform": True,
            # Polices du PDF (data-URL) à injecter en @font-face côté frontend.
            "fonts": font_faces,
            "pages": pages_out,
            "theme": {
                "template_id": "imported",
                "font_heading": "Inter, sans-serif",
                "font_body": "Inter, sans-serif",
                "color_body": "#1a1a1a",
                **merged_theme_colors,
            },
            "source": "pdf_structural",
        }
    finally:
        doc.close()
