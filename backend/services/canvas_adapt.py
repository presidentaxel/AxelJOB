"""Lit le texte figé d'un canvas Canva quand le CV n'a pas d'expériences structurées.

Les imports Canva posent chaque mot en gras dans un bloc séparé, souvent au même y
que la phrase, avec un <br> dans le bloc principal à l'endroit du trou. On reconstruit
la phrase, on l'envoie au modèle comme résumé / expériences, puis on réécrit les blocs.
"""

from __future__ import annotations

import html
import re
import unicodedata
from typing import Any

_MONTH = r"(?:janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)[a-zé.]*"
_YEAR = r"(?:19|20)\d{2}"
_POINT = rf"(?:{_MONTH}\s+)?{_YEAR}"
_END = rf"(?:aujourd['’]hui|présent|present|{_POINT})"
_RANGE_RE = re.compile(rf"{_POINT}\s*[-–—]\s*{_END}", re.IGNORECASE)
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s.\-]{7,}\d)")
_HEADINGS = (
    "education",
    "formation",
    "formations",
    "experiences",
    "experience",
    "competences",
    "langues",
    "loisirs",
    "informatique",
)
_Y_TOL_MM = 0.8
_COLUMN_GAP_MM = 24.0
_BULLET_MARK_RE = re.compile(r"^[•·●◦▪▸►\-*]+$")


def _plain_parts(content: object) -> list[str]:
    text = re.sub(r"(?i)<br\s*/?>", "\n", str(content or ""))
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text).replace("\xa0", " ").replace("\u200b", "")
    parts: list[str] = []
    for part in text.split("\n"):
        cleaned = re.sub(r"\s+", " ", part).strip()
        if cleaned:
            parts.append(cleaned)
    return parts


def _plain(content: object) -> str:
    return re.sub(r"\s+", " ", " ".join(_plain_parts(content))).strip()


def _fold(value: str) -> str:
    raw = unicodedata.normalize("NFD", value or "")
    raw = "".join(ch for ch in raw if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z]", "", raw.lower())


def _unspace_heading(text: str) -> str:
    tokens = text.split()
    if len(tokens) >= 4 and sum(len(token) == 1 for token in tokens) / len(tokens) >= 0.6:
        return "".join(tokens)
    return text


def _is_heading(text: str) -> bool:
    folded = _fold(_unspace_heading(text))
    if not folded or len(folded) > 32:
        return False
    return any(folded == name or folded.startswith(name) for name in _HEADINGS)


def _is_phone(text: str) -> bool:
    return bool(_PHONE_RE.search(text or ""))


def _line_text(blocks: list[dict[str, Any]]) -> str:
    """Reconstruit un paragraphe. Chaque <br> est une ligne, les blocs du même y se lisent de gauche à droite."""
    rows: list[tuple[float, list[str]]] = []
    for block in blocks:
        parts = _plain_parts(block.get("content"))
        if parts:
            rows.append((float(block.get("x") or 0), parts))
    if not rows:
        return ""
    height = max(len(parts) for _, parts in rows)
    lines: list[str] = []
    for index in range(height):
        chunks = [parts[index] for _, parts in sorted(rows) if index < len(parts)]
        if chunks:
            lines.append(" ".join(chunks))
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def _main_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Garde la colonne qui porte les dates. L'autre est la barre latérale (compétences, langues)."""
    xs = sorted({round(float(block.get("x") or 0), 1) for block in blocks})
    gap_at = None
    best = 0.0
    for left, right in zip(xs, xs[1:], strict=False):
        gap = right - left
        if gap > best:
            best = gap
            gap_at = (left + right) / 2
    if gap_at is None or best < _COLUMN_GAP_MM:
        return blocks
    left = [block for block in blocks if float(block.get("x") or 0) < gap_at]
    right = [block for block in blocks if float(block.get("x") or 0) >= gap_at]

    def dates(group: list[dict[str, Any]]) -> int:
        return sum(1 for block in group if _RANGE_RE.search(_plain(block.get("content"))))

    if dates(right) > dates(left):
        return right
    if dates(left) > dates(right):
        return left
    return blocks


def _cluster_lines(blocks: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    ordered = sorted(
        blocks, key=lambda block: (float(block.get("y") or 0), float(block.get("x") or 0))
    )
    lines: list[list[dict[str, Any]]] = []
    for block in ordered:
        y = float(block.get("y") or 0)
        if lines and abs(y - float(lines[-1][0].get("y") or 0)) <= _Y_TOL_MM:
            lines[-1].append(block)
        else:
            lines.append([block])
    return lines


def _split_header(text: str) -> tuple[str, str]:
    match = _RANGE_RE.search(text)
    if not match:
        return "", text.strip()
    entreprise = text[: match.start()]
    entreprise = re.sub(r"\s+I$", "", entreprise.strip())
    entreprise = entreprise.strip(" |-–—")
    poste = text[match.end() :].strip(" |-–—")
    return entreprise, poste


def _block_ids(blocks: list[dict[str, Any]]) -> list[str]:
    primary = max(blocks, key=lambda block: len(_plain(block.get("content"))))
    others = [block for block in blocks if block is not primary]
    ordered = [primary, *sorted(others, key=lambda block: float(block.get("x") or 0))]
    return [str(block.get("id")) for block in ordered if block.get("id")]


def _primary_block(group: list[dict[str, Any]]) -> dict[str, Any]:
    return max(
        group,
        key=lambda block: (
            len(_plain_parts(block.get("content"))),
            float(block.get("w") or 0),
            len(_plain(block.get("content"))),
        ),
    )


def _inside_multiline(group: list[dict[str, Any]], host: dict[str, Any] | None) -> bool:
    """Mots en gras d'une ligne intérieure : leur y est celui de la ligne, pas du bloc."""
    if not host:
        return False
    y0 = float(host.get("y") or 0)
    bottom = y0 + float(host.get("h") or 0)
    if bottom - y0 < 8:
        return False
    x0 = float(host.get("x") or 0)
    x1 = x0 + float(host.get("w") or 0)
    for block in group:
        if len(_plain_parts(block.get("content"))) > 1 and float(block.get("h") or 0) > 8:
            return False
        y = float(block.get("y") or 0)
        if y <= y0 + _Y_TOL_MM or y >= bottom - 0.6:
            return False
        bx0 = float(block.get("x") or 0)
        bx1 = bx0 + float(block.get("w") or 0)
        if min(x1, bx1) - max(x0, bx0) < 2:
            return False
    return True


def canvas_adapt_plan(cv: dict | None) -> dict[str, Any] | None:
    """Plan de lecture. None si le CV a déjà des expériences structurées, ou rien à lire."""
    if not isinstance(cv, dict) or cv.get("experiences"):
        return None
    layout = cv.get("layout") or {}
    pages = layout.get("pages") or []
    blocks: list[dict[str, Any]] = []
    for page in pages:
        for block in page.get("blocks") or []:
            if block.get("type") not in ("text", "title"):
                continue
            if not _plain(block.get("content")):
                continue
            blocks.append(block)
    if not blocks:
        return None
    main = _main_blocks(blocks)
    titre = _plain(cv.get("titre_professionnel")).lower()
    resume_ids: list[str] = []
    resume_chunks: list[str] = []
    experiences: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    host: dict[str, Any] | None = None
    opened = False
    for group in _cluster_lines(main):
        text = _line_text(group)
        if not text or _is_phone(text):
            continue
        if titre and text.lower() == titre:
            continue
        if opened and _is_heading(text):
            current = None
            host = None
            continue
        if _RANGE_RE.search(text):
            entreprise, poste = _split_header(text)
            current = {
                "id": f"canvas-exp-{len(experiences)}",
                "poste": poste,
                "entreprise": entreprise,
                "bullets": [],
            }
            experiences.append(current)
            opened = True
            host = None
            continue
        if current is not None:
            if current["bullets"] and _inside_multiline(group, host):
                current["bullets"][-1]["block_ids"].extend(_block_ids(group))
                continue
            if len(text) < 20:
                continue
            bullet = {"text": text, "block_ids": _block_ids(group)}
            current["bullets"].append(bullet)
            primary = _primary_block(group)
            host = primary if len(_plain_parts(primary.get("content"))) >= 2 else None
            continue
        if not opened and len(text) >= 40:
            resume_chunks.append(text)
            resume_ids.extend(_block_ids(group))
    experiences = [exp for exp in experiences if exp["bullets"]]
    resume_text = " ".join(resume_chunks).strip()
    if not experiences and not resume_text:
        return None
    return {
        "resume_text": resume_text,
        "resume_block_ids": resume_ids,
        "experiences": experiences,
    }


def seed_cv_from_canvas(cv: dict, plan: dict[str, Any]) -> None:
    """Remplit resume et experiences sur la copie de travail. Ne touche pas au profil enregistré."""
    if not cv.get("experiences") and plan.get("experiences"):
        cv["experiences"] = [
            {
                "id": exp["id"],
                "poste": exp.get("poste") or "",
                "entreprise": exp.get("entreprise") or "",
                "bullet_points": [bullet["text"] for bullet in exp.get("bullets") or []],
            }
            for exp in plan["experiences"]
        ]
    if not str(cv.get("resume") or "").strip() and plan.get("resume_text"):
        cv["resume"] = plan["resume_text"]


_FONT_FAMILY_RE = re.compile(r"font-family\s*:\s*([^;}{]+)", re.IGNORECASE)
_FONT_SIZE_RE = re.compile(r"font-size\s*:\s*([0-9.]+)\s*pt", re.IGNORECASE)


def _keep_block_typography(block: dict[str, Any]) -> None:
    """La police et le corps restent ceux du bloc Canva. On ne les recalcule pas."""
    style = dict(block.get("style") or {})
    raw = str(block.get("content") or "")
    if not str(style.get("font_family") or "").strip():
        match = _FONT_FAMILY_RE.search(raw)
        if match:
            family = match.group(1).strip().strip("'\"")
            if family:
                style["font_family"] = family
    if style.get("font_size") in (None, ""):
        match = _FONT_SIZE_RE.search(raw)
        if match:
            try:
                style["font_size"] = float(match.group(1))
            except ValueError:
                pass
    block["style"] = style


def _as_html_lines(lines: list[str]) -> str:
    """Une ligne d'origine = une ligne. Le <br> garde l'interligne du bloc."""
    body = "<br>".join(html.escape(line) for line in lines)
    return f'<span class="cv-changed">{body}</span>'


def _split_words(text: str, count: int) -> list[str]:
    """Répartit le nouveau texte sur les lignes déjà présentes, sans en ajouter."""
    words = [part for part in re.split(r"\s+", (text or "").strip()) if part]
    if count <= 1:
        return [" ".join(words)]
    lines = [""] * count
    index = 0
    for slot in range(count):
        remaining_lines = count - slot
        remaining = words[index:]
        if slot == count - 1:
            chunk = remaining
        elif len(remaining) <= remaining_lines:
            chunk = remaining[:1]
        else:
            take = max(1, round(len(remaining) / remaining_lines))
            take = min(take, len(remaining) - (remaining_lines - 1))
            chunk = remaining[:take]
        index += len(chunk)
        lines[slot] = " ".join(chunk)
    return lines


def _line_slots(
    blocks: list[dict[str, Any]]
) -> tuple[list[tuple[dict[str, Any], int]], list[dict[str, Any]]]:
    """Chaque ligne visuelle (un <br>) reste un emplacement. Les mots posés dessus sont à vider."""
    grouped = [(_primary_block(group), group) for group in _cluster_lines(blocks)]
    hosts = [
        primary for primary, _group in grouped if len(_plain_parts(primary.get("content"))) >= 2
    ]
    slots: list[tuple[dict[str, Any], int]] = []
    overlays: list[dict[str, Any]] = []
    for primary, group in grouped:
        if any(host is not primary and _inside_multiline(group, host) for host in hosts):
            overlays.extend(group)
            continue
        count = max(1, len(_plain_parts(primary.get("content"))))
        for index in range(count):
            slots.append((primary, index))
        for block in group:
            if block is not primary:
                overlays.append(block)
    return slots, overlays


def _clear_words_inside_rewritten_lines(found: dict[str, dict[str, Any]]) -> None:
    """Un mot en gras posé sur une ligne intérieure du bloc réécrit est retiré."""
    hosts = [
        block
        for block in found.values()
        if "cv-changed" in str(block.get("content") or "") and float(block.get("h") or 0) >= 8
    ]
    for host in hosts:
        y0 = float(host.get("y") or 0)
        bottom = y0 + float(host.get("h") or 0)
        x0 = float(host.get("x") or 0)
        x1 = x0 + float(host.get("w") or 0)
        for block in found.values():
            if block is host or block.get("_cleared"):
                continue
            if block.get("type") not in ("text", "title"):
                continue
            if "cv-changed" in str(block.get("content") or ""):
                continue
            y = float(block.get("y") or 0)
            if y <= y0 + _Y_TOL_MM or y >= bottom - 0.6:
                continue
            bx0 = float(block.get("x") or 0)
            bx1 = bx0 + float(block.get("w") or 0)
            if min(x1, bx1) - max(x0, bx0) < 2:
                continue
            if len(_plain_parts(block.get("content"))) > 1 and float(block.get("h") or 0) > 8:
                continue
            block["content"] = ""
            block["_cleared"] = True


def _same(left: str, right: str) -> bool:
    return (
        re.sub(r"\s+", " ", left or "").strip().lower()
        == re.sub(r"\s+", " ", right or "").strip().lower()
    )


def _index_blocks(layout: dict[str, Any]) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for page in layout.get("pages") or []:
        for block in page.get("blocks") or []:
            if block.get("id"):
                found[str(block["id"])] = block
    return found


def _clear_bullet_marker(found: dict[str, dict[str, Any]], text_block: dict[str, Any]) -> None:
    """La puce « • » est un bloc à part. On la retire avec le texte qu'elle introduisait."""
    y0 = float(
        text_block.get("_y0") if text_block.get("_y0") is not None else text_block.get("y") or 0
    )
    x0 = float(text_block.get("x") or 0)
    for block in found.values():
        if block is text_block or block.get("_cleared"):
            continue
        y = float(block.get("_y0") if block.get("_y0") is not None else block.get("y") or 0)
        x = float(block.get("x") or 0)
        if abs(y - y0) > 1.2 or x > x0 + 1:
            continue
        mark = _plain(block.get("content"))
        if mark and _BULLET_MARK_RE.match(mark):
            block["content"] = ""
            block["_cleared"] = True


def _paint_group(found: dict[str, dict[str, Any]], block_ids: list[str], text: str | None) -> int:
    """Remplace le texte de chaque ligne. La position, la police et l'interligne restent."""
    blocks = [found[bid] for bid in block_ids if bid in found]
    if not blocks:
        return 0
    if not text:
        for block in blocks:
            block["content"] = ""
            block["_cleared"] = True
            _clear_bullet_marker(found, block)
        return 1
    slots, overlays = _line_slots(blocks)
    if not slots:
        return 0
    pieces = _split_words(text, len(slots))
    grouped: dict[int, list[str]] = {}
    order: list[dict[str, Any]] = []
    for (primary, _), line in zip(slots, pieces, strict=True):
        key = id(primary)
        if key not in grouped:
            grouped[key] = []
            order.append(primary)
        grouped[key].append(line)
    for primary in order:
        _keep_block_typography(primary)
        lines = grouped[id(primary)]
        primary["content"] = _as_html_lines(lines)
        if len(lines) >= 2:
            style = dict(primary.get("style") or {})
            if style.get("align") not in ("center", "right"):
                style["align"] = "justify"
            primary["style"] = style
    for block in overlays:
        block["content"] = ""
        block["_cleared"] = True
    return 1


def paint_canvas_plan(
    layout: dict | None, plan: dict[str, Any], adapted: dict | None
) -> tuple[dict, int]:
    """Écrit le texte adapté sur les lignes sources. Les mots en gras séparés sont vidés."""
    if not isinstance(layout, dict):
        return layout or {}, 0
    found = _index_blocks(layout)
    painted = 0
    cv = adapted or {}
    new_resume = str(cv.get("resume") or "")
    if (
        plan.get("resume_block_ids")
        and new_resume
        and not _same(new_resume, plan.get("resume_text") or "")
    ):
        painted += _paint_group(found, plan["resume_block_ids"], new_resume)
    by_id = {
        exp.get("id"): exp
        for exp in (cv.get("experiences") or [])
        if isinstance(exp, dict) and exp.get("id")
    }
    for source in plan.get("experiences") or []:
        adapted_exp = by_id.get(source.get("id")) or {}
        new_bullets = [
            str(bullet)
            for bullet in (adapted_exp.get("bullet_points") or [])
            if str(bullet or "").strip()
        ]
        for index, bullet in enumerate(source.get("bullets") or []):
            replacement = new_bullets[index] if index < len(new_bullets) else None
            # Une ligne sans nouveau texte reste telle quelle, puce comprise.
            if replacement is None or _same(replacement, bullet.get("text") or ""):
                continue
            painted += _paint_group(found, bullet.get("block_ids") or [], replacement)
    _clear_words_inside_rewritten_lines(found)
    for page in layout.get("pages") or []:
        page["blocks"] = [block for block in page.get("blocks") or [] if not block.get("_cleared")]
        for block in page["blocks"]:
            block.pop("_y0", None)
            block.pop("_h0", None)
            block.pop("_extra", None)
            block.pop("_cleared", None)
    return layout, painted
