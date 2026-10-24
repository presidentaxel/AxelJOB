"""Gabarit HTML unique des e-mails AxeL Job vus par un utilisateur.

Les clients mail ignorent les variables CSS : les couleurs sont des styles en ligne,
recopiées depuis `frontend/src/design/tokens.json`. `TOKEN_SOURCES` liste le token
d'origine de chaque valeur ; `tests/test_email_layout.py` vérifie qu'elles n'ont pas dérivé.

Tout texte passé en `str` est échappé. Le HTML de confiance passe par `SafeHtml`
(`strong`, `link`, `multiline`, `paragraph`...), jamais par une concaténation libre.
"""

from __future__ import annotations

import html
from collections.abc import Iterable
from dataclasses import dataclass

DEFAULT_SITE_URL = "https://job.axelproject.fr"
TAGLINE = "CV sur-mesure pour chaque annonce · Score ATS · IA"

# Couleurs (hex recopiés de tokens.json).
PAGE_BG = "#faf6ef"
CARD_BG = "#ffffff"
INK = "#121a25"
TEXT = "#3d4450"
TEXT_SUBTLE = "#675f55"
BORDER = "#e6dccb"
PANEL_BG = "#faf6ef"
LINK = "#a62f08"
ACTION_BG = "#c23709"
ACTION_FG = "#ffffff"
BRAND = "#fe5126"
HEADER_BG = "#121a25"
HEADER_FG = "#ffffff"
HIGHLIGHT = "#fde7c4"

TOKEN_SOURCES: dict[str, str] = {
    "color.bg.subtle": PAGE_BG,
    "color.bg.default": CARD_BG,
    "color.text.default": INK,
    "color.text.muted": TEXT,
    "color.text.subtle": TEXT_SUBTLE,
    "color.border.subtle": BORDER,
    "color.text.link": LINK,
    "color.action.primary.bg": ACTION_BG,
    "color.action.primary.fg": ACTION_FG,
    "color.accent.brand": BRAND,
    "color.bg.inverse": HEADER_BG,
    "color.text.inverse": HEADER_FG,
    "color.accent.highlight": HIGHLIGHT,
}

FONT_DISPLAY = "'Fraunces Variable','Fraunces',Georgia,'Times New Roman',serif"
FONT_BODY = "'Inter Variable','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

_RADIUS_CARD = "14px"
_RADIUS_ACTION = "8px"


class SafeHtml(str):
    """Fragment HTML déjà échappé, à insérer tel quel."""

    __slots__ = ()


@dataclass(frozen=True)
class EmailButton:
    label: str
    url: str


def _esc(value: str) -> str:
    return html.escape(value, quote=True)


def _render_part(part: str) -> str:
    return str(part) if isinstance(part, SafeHtml) else _esc(part)


def strong(text: str) -> SafeHtml:
    return SafeHtml(f'<strong style="color:{INK};font-weight:600;">{_esc(text)}</strong>')


def link(label: str, url: str) -> SafeHtml:
    return SafeHtml(
        f'<a href="{_esc(url)}" style="color:{LINK};font-weight:600;text-decoration:underline;">'
        f"{_esc(label)}</a>"
    )


def multiline(text: str) -> SafeHtml:
    """Texte libre (message d'un utilisateur) : échappé, retours à la ligne conservés."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    return SafeHtml(_esc(normalized).replace("\n", "<br>"))


def paragraph(*parts: str) -> SafeHtml:
    inner = "".join(_render_part(part) for part in parts)
    return SafeHtml(
        f'<p style="margin:0 0 16px;font-family:{FONT_BODY};font-size:16px;'
        f'line-height:1.55;color:{TEXT};">{inner}</p>'
    )


def quote(content: SafeHtml) -> SafeHtml:
    """Encadré pour un message cité (ticket, réponse du support)."""
    return SafeHtml(
        f'<div style="margin:0 0 16px;padding:16px 18px;background-color:{PANEL_BG};'
        f"border:1px solid {BORDER};border-left:4px solid {BRAND};border-radius:8px;"
        f'font-family:{FONT_BODY};font-size:15px;line-height:1.6;color:{TEXT};">{content}</div>'
    )


def detail(label: str, value: str) -> SafeHtml:
    """Ligne « libellé / valeur » (expéditeur, sujet...)."""
    return SafeHtml(
        f'<div style="margin:0 0 14px;font-family:{FONT_BODY};">'
        f'<div style="font-size:12px;font-weight:600;letter-spacing:0.04em;'
        f'text-transform:uppercase;color:{TEXT_SUBTLE};">{_esc(label)}</div>'
        f'<div style="margin-top:2px;font-size:16px;line-height:1.4;color:{INK};">'
        f"{_esc(value)}</div></div>"
    )


def _title_html(title: str, highlight: str) -> str:
    """Titre échappé ; `highlight` (sous-chaîne du titre) est surligné comme `.ds-highlight`."""
    if not highlight or highlight not in title:
        return _esc(title)
    before, _, after = title.partition(highlight)
    return (
        f"{_esc(before)}"
        f'<span style="font-style:italic;background-color:{HIGHLIGHT};padding:0 4px;">'
        f"{_esc(highlight)}</span>{_esc(after)}"
    )


def _font_face(base: str) -> str:
    """Polices du site (Apple Mail, iOS...) ; les autres clients retombent sur Georgia / système."""
    return (
        "@font-face{font-family:'Fraunces Variable';font-weight:100 900;font-style:normal;"
        f"src:url('{base}/fonts/fraunces-latin-wght-normal.woff2') format('woff2');}}"
        "@font-face{font-family:'Fraunces Variable';font-weight:100 900;font-style:italic;"
        f"src:url('{base}/fonts/fraunces-latin-wght-italic.woff2') format('woff2');}}"
        "@font-face{font-family:'Inter Variable';font-weight:100 900;font-style:normal;"
        f"src:url('{base}/fonts/inter-latin-wght-normal.woff2') format('woff2');}}"
    )


def _is_safe_url(url: str) -> bool:
    return url.startswith(("https://", "http://", "mailto:"))


def _logo() -> str:
    return (
        f'<span style="font-family:{FONT_DISPLAY};font-size:24px;font-weight:500;'
        f'letter-spacing:-0.34px;color:{HEADER_FG};line-height:1;">AxeL Job</span>'
    )


def _button(button: EmailButton) -> str:
    # Gabarit « bulletproof » : le fond est porté par la cellule, donc Outlook l'affiche aussi.
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'style="border-collapse:collapse;margin:8px 0 8px;"><tr>'
        f'<td align="center" bgcolor="{ACTION_BG}" style="background-color:{ACTION_BG};'
        f'border-radius:{_RADIUS_ACTION};">'
        f'<a href="{_esc(button.url)}" style="display:inline-block;padding:14px 28px;'
        f"font-family:{FONT_BODY};font-size:16px;font-weight:600;line-height:1.2;"
        f'color:{ACTION_FG};text-decoration:none;border-radius:{_RADIUS_ACTION};">'
        f"{_esc(button.label)}</a></td></tr></table>"
    )


def _fallback_link(button: EmailButton) -> str:
    shown = _esc(button.url)
    return (
        f'<p style="margin:16px 0 0;font-family:{FONT_BODY};font-size:13px;line-height:1.5;'
        f'color:{TEXT_SUBTLE};">Le bouton ne s’affiche pas ? Copie ce lien dans ton navigateur :<br>'
        f'<a href="{shown}" style="color:{LINK};word-break:break-all;">{shown}</a></p>'
    )


def render_email(
    *,
    title: str,
    body: Iterable[SafeHtml],
    highlight: str = "",
    button: EmailButton | None = None,
    preheader: str = "",
    footer_note: str = "",
    site_url: str = DEFAULT_SITE_URL,
    show_link_fallback: bool = False,
) -> str:
    """Document HTML complet : logo, fond, titre, corps, bouton, pied."""
    if button is not None and not _is_safe_url(button.url):
        raise ValueError("L'URL du bouton doit commencer par https://, http:// ou mailto:")
    base = site_url.rstrip("/") or DEFAULT_SITE_URL
    body_html = "".join(str(part) for part in body)
    button_html = ""
    if button is not None:
        button_html = _button(button) + (_fallback_link(button) if show_link_fallback else "")
    preheader_html = (
        '<div style="display:none;max-height:0;overflow:hidden;opacity:0;'
        f'color:{PAGE_BG};font-size:1px;line-height:1px;">{_esc(preheader)}</div>'
        if preheader
        else ""
    )
    note_html = (
        f'<p style="margin:0 0 10px;font-family:{FONT_BODY};font-size:13px;line-height:1.5;'
        f'color:{TEXT_SUBTLE};">{_esc(footer_note)}</p>'
        if footer_note
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>{_esc(title)}</title>
<style>{_font_face(base)}</style>
</head>
<body style="margin:0;padding:0;background-color:{PAGE_BG};">
{preheader_html}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{PAGE_BG}" style="background-color:{PAGE_BG};border-collapse:collapse;">
<tr><td align="center" style="padding:32px 16px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border-collapse:collapse;">
<tr><td style="background-color:{HEADER_BG};border-bottom:3px solid {BRAND};border-radius:{_RADIUS_CARD} {_RADIUS_CARD} 0 0;padding:22px 28px;">{_logo()}</td></tr>
<tr><td style="background-color:{CARD_BG};border:1px solid {BORDER};border-top:0;border-radius:0 0 {_RADIUS_CARD} {_RADIUS_CARD};padding:36px 28px 32px;">
<h1 style="margin:0 0 20px;font-family:{FONT_DISPLAY};font-size:30px;font-weight:500;line-height:1.15;letter-spacing:-0.34px;color:{INK};">{_title_html(title, highlight)}</h1>
{body_html}
{button_html}
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:{FONT_BODY};">
{note_html}<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:{TEXT_SUBTLE};">{_esc(TAGLINE)}</p>
<p style="margin:0;font-size:13px;line-height:1.5;"><a href="{_esc(base)}" style="color:{TEXT_SUBTLE};text-decoration:underline;">{_esc(base.removeprefix("https://").removeprefix("http://"))}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
"""
