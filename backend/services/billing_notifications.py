"""Billing helper services (emails and frontend URL resolution)."""

from __future__ import annotations

from urllib.parse import quote as url_quote

from backend.services.email_layout import (
    EmailButton,
    SafeHtml,
    link,
    paragraph,
    render_email,
    strong,
)


def primary_frontend_base_url(frontend_url: str | None) -> str:
    raw = (frontend_url or "").strip()
    if not raw:
        return "https://job.axelproject.fr"
    first = raw.split(",")[0].strip().rstrip("/")
    return first or "https://job.axelproject.fr"


def html_email_template_perso_confirmation(
    frontend_url: str | None, support_email: str | None
) -> str:
    base = primary_frontend_base_url(frontend_url).rstrip("/")
    contact = (support_email or "contact@axelproject.fr").strip()
    mailto = f"mailto:{contact}?subject={url_quote('Template perso - ')}"
    return render_email(
        title="Paiement bien reçu, merci !",
        highlight="merci",
        preheader="Envoie-nous ton design pour qu’on l’intègre dans AxeL Job.",
        body=[
            paragraph(
                "Ta commande de ",
                strong("template personnalisé"),
                " est enregistrée. Voici la suite pour qu’on intègre ton design dans AxeL Job.",
            ),
            paragraph(
                "Envoie-nous ton design (PDF ou maquette) en répondant à cet e-mail, ou via ",
                link(contact, mailto),
                ".",
            ),
        ],
        button=EmailButton("Ouvrir AxeL Job", f"{base}/app?open=template-perso"),
        footer_note="Des questions ? Réponds simplement à ce message.",
        site_url=base,
    )


def send_template_perso_email(
    to_email: str,
    resend_api_key: str | None,
    resend_from_email: str | None,
    frontend_url: str | None,
    support_email: str | None,
) -> bool:
    if not resend_api_key or not to_email:
        return False
    try:
        import resend

        resend.api_key = resend_api_key
        html_content = html_email_template_perso_confirmation(frontend_url, support_email)
        resend.Emails.send(
            {
                "from": resend_from_email,
                "to": [to_email],
                "subject": "Template personnalisé AxeL Job - prochaine étape",
                "html": html_content,
            }
        )
        return True
    except Exception:
        return False


def html_email_subscription_cancelled(
    period_end_label: str, frontend_url: str | None = None
) -> str:
    base = primary_frontend_base_url(frontend_url).rstrip("/")
    return render_email(
        title="Résiliation confirmée",
        highlight="confirmée",
        preheader="Ton abonnement AxeL Job Pro prend fin à la fin de la période payée.",
        body=[
            paragraph("Bonjour,"),
            paragraph(
                "Nous confirmons la ",
                strong("résiliation de ton abonnement AxeL Job Pro"),
                ". Elle prend effet à la ",
                strong("fin de la période déjà payée"),
                " (au plus tard le ",
                strong(period_end_label or "la fin de ta période payée"),
                ").",
            ),
            paragraph(
                "Jusqu’à cette date, tu conserves l’accès à ton compte et à tes données comme d’habitude."
            ),
            paragraph(
                "Si tu as une question, réponds à ce message ou écris-nous à ",
                link("contact@axelproject.fr", "mailto:contact@axelproject.fr"),
                ".",
            ),
            paragraph("À bientôt,", SafeHtml("<br>"), "L’équipe AxeL Job"),
        ],
        site_url=base,
    )


def send_subscription_cancelled_email(
    to_email: str,
    period_end_label: str,
    resend_api_key: str | None,
    resend_from_email: str | None,
    frontend_url: str | None = None,
) -> bool:
    if not resend_api_key or not to_email:
        return False
    try:
        import resend

        resend.api_key = resend_api_key
        html_content = html_email_subscription_cancelled(period_end_label, frontend_url)
        resend.Emails.send(
            {
                "from": resend_from_email,
                "to": [to_email],
                "subject": "Confirmation de résiliation - AxeL Job Pro",
                "html": html_content,
            }
        )
        return True
    except Exception:
        return False


def stripe_client(stripe_secret_key: str):
    import stripe

    return stripe.StripeClient(stripe_secret_key)
