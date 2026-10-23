"""Message affiché quand l'envoi d'un ticket support échoue."""

from __future__ import annotations

from backend.services.billing_notifications import primary_frontend_base_url
from backend.services.email_layout import detail, multiline, paragraph, quote, render_email

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


def support_ticket_email_html(
    user_email: str, subject: str, message: str, frontend_url: str | None = None
) -> str:
    """E-mail reçu par l'équipe : le contenu de l'utilisateur est toujours échappé."""
    return render_email(
        title="Nouveau ticket",
        highlight="ticket",
        preheader=f"{user_email} : {subject}"[:140],
        body=[
            detail("De", user_email),
            detail("Sujet", subject),
            quote(multiline(message)),
            paragraph("Réponds à cet e-mail pour envoyer ta réponse à l’utilisateur."),
        ],
        site_url=primary_frontend_base_url(frontend_url),
    )


def support_reply_email_html(message: str, frontend_url: str | None = None) -> str:
    """E-mail reçu par l'utilisateur : la réponse du support est échappée."""
    return render_email(
        title="Réponse à ton ticket",
        highlight="ticket",
        preheader="Le support AxeL Job t’a répondu.",
        body=[
            quote(multiline(message)),
            paragraph("Si tu as d’autres questions, rouvre un ticket depuis l’app (Support)."),
        ],
        site_url=primary_frontend_base_url(frontend_url),
    )
