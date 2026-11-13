"""Masque les détails techniques renvoyés au client en production (AXE-489)."""

from __future__ import annotations

import re
from typing import Any

_TECHNICAL = re.compile(
    r"GEMINI_API_KEY|SUPPORT_EMAIL|RESEND_|webhook|API_KEY|"
    r"Paiement non configuré|Vérifie Resend|Traceback",
    re.IGNORECASE,
)

_PUBLIC = {
    500: "Un problème est survenu. Réessaie ou contacte le support.",
    502: "Le service n'a pas répondu. Réessaie.",
    503: "Ce service n'est pas disponible pour le moment.",
    504: "Le serveur ne répond pas. Réessaie dans un instant.",
}


def public_http_detail(status_code: int, detail: Any, *, production: bool) -> Any:
    """En production, remplace un detail technique par la phrase du catalogue."""
    if not production or not isinstance(detail, str):
        return detail
    text = detail.strip()
    if not text:
        return detail
    if text.startswith("<") or _TECHNICAL.search(text):
        return _PUBLIC.get(status_code, _PUBLIC[500])
    return detail
