"""Ajoute un mot de passe au compte social existant, sans créer un second utilisateur."""

from __future__ import annotations

import html
import logging
import time

logger = logging.getLogger(__name__)

SOCIAL_PROVIDERS = frozenset({"google", "linkedin", "linkedin_oidc"})
_MAX_EMAIL_LEN = 320
_RECENT_S = 600.0
_recent: dict[str, float] = {}

ACCOUNT_EXISTS_SENTENCE = (
    "Un compte existe déjà avec cet e-mail (connexion Google ou LinkedIn). "
    "Choisis un mot de passe : ensuite, la connexion sociale et le mot de passe ouvrent le même compte."
)


def _is_plausible_email(value: str) -> bool:
    """Contrôle linéaire : pas d'expression régulière sur une saisie utilisateur."""
    if not value or len(value) > _MAX_EMAIL_LEN:
        return False
    if any(ch.isspace() for ch in value):
        return False
    local, separator, domain = value.partition("@")
    if separator != "@" or not local or not domain or "@" in domain:
        return False
    host, dot, tld = domain.rpartition(".")
    return bool(dot and host and tld)


def needs_password_setup(providers: set[str], *, has_password: bool = False) -> bool:
    """Vrai seulement si le compte a un social et pas encore de mot de passe."""
    if has_password:
        return False
    normalized = {p.strip().lower() for p in providers if p}
    return bool(normalized & SOCIAL_PROVIDERS) and "email" not in normalized


def _remember(email: str) -> None:
    now = time.monotonic()
    stale = [key for key, at in _recent.items() if now - at > _RECENT_S]
    for key in stale:
        _recent.pop(key, None)
    _recent[email] = now


def recently_sent(email: str) -> bool:
    at = _recent.get(email)
    return at is not None and (time.monotonic() - at) < _RECENT_S


def providers_for_email(email: str) -> tuple[set[str], bool] | None:
    """Providers et présence d'un mot de passe. None si la lecture échoue."""
    from backend.supabase_pg import get_pool

    pool = get_pool()
    if not pool:
        return None
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(
                        array_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL),
                        '{}'
                    ),
                    (COALESCE(u.encrypted_password, '') <> '')
                FROM auth.users u
                LEFT JOIN auth.identities i ON i.user_id = u.id
                WHERE lower(u.email) = lower(%s)
                GROUP BY u.id, u.encrypted_password
                LIMIT 1
                """,
                (email,),
            )
            row = cur.fetchone()
    except Exception as exc:
        logger.warning("password setup lookup failed: %s", type(exc).__name__)
        return None
    if not row:
        return set(), False
    providers = row[0] or []
    return {str(item) for item in providers}, bool(row[1])


def _send_with_resend(email: str, link: str) -> bool:
    from backend.config import RESEND_API_KEY, RESEND_FROM_EMAIL

    if not RESEND_API_KEY or not RESEND_FROM_EMAIL or not link:
        return False
    try:
        import resend

        resend.api_key = RESEND_API_KEY
        safe_link = html.escape(link, quote=True)
        resend.Emails.send(
            {
                "from": RESEND_FROM_EMAIL,
                "to": [email],
                "subject": "Un compte existe déjà — choisis ton mot de passe",
                "html": (
                    f"<p>{ACCOUNT_EXISTS_SENTENCE}</p>"
                    f'<p><a href="{safe_link}">Choisir un mot de passe</a></p>'
                ),
            }
        )
        return True
    except Exception as exc:
        logger.warning("password setup resend failed: %s", type(exc).__name__)
        return False


def _recovery_link(email: str) -> str:
    from backend.config import FRONTEND_URL
    from backend.db import _get_supabase

    sb = _get_supabase()
    if not sb:
        return ""
    redirect = ""
    if FRONTEND_URL:
        redirect = FRONTEND_URL.split(",")[0].strip().rstrip("/") + "/login"
    try:
        response = sb.auth.admin.generate_link(
            {
                "type": "recovery",
                "email": email,
                "options": {"redirect_to": redirect} if redirect else {},
            }
        )
    except Exception as exc:
        logger.warning("password setup link failed: %s", type(exc).__name__)
        return ""
    properties = getattr(response, "properties", None)
    return str(getattr(properties, "action_link", "") or "")


def password_setup_for_email(email: str) -> dict[str, str | bool]:
    """N'envoie rien si le compte n'est pas social-only. Ne crée jamais d'utilisateur."""
    normalized = (email or "").strip().lower()
    if not _is_plausible_email(normalized):
        return {"sent": False, "channel": ""}
    account = providers_for_email(normalized)
    if account is None:
        return {"sent": False, "channel": ""}
    providers, has_password = account
    if not needs_password_setup(providers, has_password=has_password):
        return {"sent": False, "channel": ""}
    if recently_sent(normalized):
        return {"sent": True, "channel": "already"}
    link = _recovery_link(normalized)
    if link and _send_with_resend(normalized, link):
        _remember(normalized)
        return {"sent": True, "channel": "resend"}
    # Le client envoie l'e-mail Supabase de récupération, sur le même utilisateur.
    return {"sent": True, "channel": "supabase"}
