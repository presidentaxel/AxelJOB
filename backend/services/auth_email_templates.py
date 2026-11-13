"""E-mails Supabase Auth (confirmation, mot de passe oublié, invitation).

Supabase envoie ces e-mails depuis son Dashboard (Authentication > Emails), hors de ce dépôt.
On génère donc le HTML avec le même gabarit que les e-mails Resend, dans `supabase/templates/`,
à coller dans le Dashboard. Les variables `{{ .ConfirmationURL }}` sont celles de Supabase.
"""

from __future__ import annotations

from dataclasses import dataclass

from backend.services.email_layout import (
    DEFAULT_SITE_URL,
    EmailButton,
    paragraph,
    render_email,
    strong,
)

CONFIRMATION_URL_VAR = "{{ .ConfirmationURL }}"
EMAIL_VAR = "{{ .Email }}"

# `render_email` refuse les URLs qui ne sont pas http(s) : on rend avec ce repère,
# puis on le remplace par la variable Supabase.
_URL_PLACEHOLDER = "https://placeholder.invalid/supabase-confirmation-url"


@dataclass(frozen=True)
class AuthTemplate:
    filename: str
    subject: str
    dashboard_section: str
    html: str


def _render(
    *,
    title: str,
    highlight: str,
    preheader: str,
    body: list,
    button_label: str,
    footer_note: str,
) -> str:
    rendered = render_email(
        title=title,
        highlight=highlight,
        preheader=preheader,
        body=body,
        button=EmailButton(button_label, _URL_PLACEHOLDER),
        footer_note=footer_note,
        site_url=DEFAULT_SITE_URL,
        show_link_fallback=True,
    )
    return rendered.replace(_URL_PLACEHOLDER, CONFIRMATION_URL_VAR)


def auth_templates() -> list[AuthTemplate]:
    return [
        AuthTemplate(
            filename="confirmation.html",
            subject="Confirme ton adresse e-mail - AxeL Job",
            dashboard_section="Confirm sign up",
            html=_render(
                title="Confirme ton adresse e-mail",
                highlight="e-mail",
                preheader="Une dernière étape pour activer ton compte AxeL Job.",
                body=[
                    paragraph("Bienvenue sur AxeL Job !"),
                    paragraph(
                        "Confirme ton adresse ",
                        strong("{{ .Email }}"),
                        " pour activer ton compte et créer ton premier CV adapté.",
                    ),
                ],
                button_label="Confirmer mon adresse",
                footer_note="Tu n’as pas créé de compte ? Ignore simplement cet e-mail.",
            ),
        ),
        AuthTemplate(
            filename="recovery.html",
            subject="Réinitialise ton mot de passe - AxeL Job",
            dashboard_section="Reset password",
            html=_render(
                title="Réinitialise ton mot de passe",
                highlight="mot de passe",
                preheader="Choisis un nouveau mot de passe pour ton compte AxeL Job.",
                body=[
                    paragraph(
                        "Tu as demandé à réinitialiser le mot de passe de ton compte AxeL Job."
                    ),
                    paragraph("Clique sur le bouton pour en choisir un nouveau."),
                ],
                button_label="Choisir un nouveau mot de passe",
                footer_note="Tu n’es pas à l’origine de cette demande ? Ignore cet e-mail : ton mot de passe ne change pas.",
            ),
        ),
        AuthTemplate(
            filename="invite.html",
            subject="Tu es invité(e) sur AxeL Job",
            dashboard_section="Invite user",
            html=_render(
                title="Tu es invité(e) sur AxeL Job",
                highlight="invité(e)",
                preheader="Accepte l’invitation pour créer ton compte.",
                body=[
                    paragraph(
                        "On t’a invité(e) à rejoindre AxeL Job, pour créer un CV sur-mesure "
                        "pour chaque annonce."
                    ),
                    paragraph("Accepte l’invitation pour créer ton compte."),
                ],
                button_label="Accepter l’invitation",
                footer_note="Tu ne connais pas AxeL Job ? Ignore simplement cet e-mail.",
            ),
        ),
    ]
