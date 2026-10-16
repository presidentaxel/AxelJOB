"""Message affiché quand l'envoi d'un ticket support échoue."""

from __future__ import annotations

SUPPORT_TICKET_SEND_FAILED = "Envoi du ticket impossible. Réessaie ou contacte-nous par email."

SUPPORT_TICKET_RESEND_SANDBOX = (
    "En développement, Resend n'accepte que l'adresse email du compte de test. "
    "Le destinataire SUPPORT_EMAIL n'est pas cette adresse tant que l'expéditeur "
    "reste onboarding@resend.dev. Pour un envoi réel : domaine vérifié chez Resend, "
    "puis RESEND_FROM_EMAIL sur ce domaine."
)


def _error_text(exc: BaseException) -> str:
    parts = [str(exc)]
    message = getattr(exc, "message", None)
    if isinstance(message, str):
        parts.append(message)
    return " ".join(parts).lower()


def is_resend_testing_recipient_error(exc: BaseException) -> bool:
    """True si Resend refuse le destinataire hors du compte sandbox."""
    text = _error_text(exc)
    return "testing email" in text and "own email address" in text


def support_ticket_failure_detail(exc: BaseException | None, *, production: bool) -> str:
    if exc is not None and not production and is_resend_testing_recipient_error(exc):
        return SUPPORT_TICKET_RESEND_SANDBOX
    return SUPPORT_TICKET_SEND_FAILED
