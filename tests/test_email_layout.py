"""AXE-502 : un seul gabarit pour tous les e-mails AxeL Job vus par un utilisateur."""

import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend.services import billing_notifications
from backend.services.account_password_link import _send_with_resend, password_setup_email_html
from backend.services.auth_email_templates import auth_templates
from backend.services.email_layout import (
    ACTION_BG,
    TOKEN_SOURCES,
    EmailButton,
    SafeHtml,
    link,
    multiline,
    paragraph,
    render_email,
)
from backend.services.support_ticket import support_reply_email_html, support_ticket_email_html

ROOT = Path(__file__).resolve().parent.parent
TOKENS = json.loads((ROOT / "frontend" / "src" / "design" / "tokens.json").read_text("utf-8"))
XSS = '<script>alert("x")</script>'
OLD_INDIGO = ("#4f46e5", "#6366f1", "#eef2ff", "#f1f5f9")


def _token(path: str) -> str:
    node = TOKENS
    for part in path.split("."):
        node = node[part]
    value = node["$value"]
    while value.startswith("{"):
        return _token(value.strip("{}"))
    return value


@pytest.mark.parametrize(("token_path", "hex_value"), sorted(TOKEN_SOURCES.items()))
def test_email_colors_match_design_tokens(token_path: str, hex_value: str) -> None:
    assert _token(token_path).lower() == hex_value.lower()


def test_layout_has_logo_title_button_and_footer() -> None:
    out = render_email(
        title="Bonjour",
        body=[paragraph("Corps")],
        button=EmailButton("Cliquer", "https://exemple.test/go"),
        footer_note="Note de pied",
    )
    assert "AxeL Job" in out
    assert "<h1" in out and "Bonjour" in out
    assert 'href="https://exemple.test/go"' in out and "Cliquer" in out
    assert f'bgcolor="{ACTION_BG}"' in out
    assert "Note de pied" in out
    assert "job.axelproject.fr" in out


def test_layout_has_no_css_variables_or_old_palette() -> None:
    out = render_email(title="t", body=[paragraph("x")], button=EmailButton("b", "https://a.test"))
    assert "var(--" not in out
    assert not any(color in out for color in OLD_INDIGO)


def test_plain_strings_are_escaped_and_safe_html_is_kept() -> None:
    out = render_email(
        title=XSS,
        body=[paragraph(XSS, link(XSS, "https://a.test/?q=1&x=2"))],
        preheader=XSS,
        footer_note=XSS,
    )
    assert "<script>" not in out
    assert "&lt;script&gt;" in out
    assert "&amp;x=2" in out


def test_multiline_escapes_and_keeps_line_breaks() -> None:
    out = multiline(f"a\r\n{XSS}\nb")
    assert isinstance(out, SafeHtml)
    assert "<script>" not in out
    assert str(out).count("<br>") == 2


def test_button_rejects_dangerous_schemes() -> None:
    with pytest.raises(ValueError):
        render_email(title="t", body=[], button=EmailButton("b", "javascript:alert(1)"))


def test_password_setup_email_has_a_real_button() -> None:
    out = password_setup_email_html("https://auth.test/recover?token=a&b=c")
    assert "Choisir un mot de passe" in out
    assert 'bgcolor="#c23709"' in out
    assert "token=a&amp;b=c" in out
    assert "Un compte existe déjà" in out


def test_password_setup_is_sent_with_the_template() -> None:
    fake = MagicMock()
    with (
        patch("backend.config.RESEND_API_KEY", "key"),
        patch("backend.config.RESEND_FROM_EMAIL", "AxeL <a@axel.test>"),
        patch.dict(sys.modules, {"resend": fake}),
    ):
        assert _send_with_resend("ada@example.com", "https://auth.test/x") is True
    payload = fake.Emails.send.call_args.args[0]
    assert payload["to"] == ["ada@example.com"]
    assert "<h1" in payload["html"] and "https://auth.test/x" in payload["html"]


def test_template_perso_email_uses_the_layout() -> None:
    out = billing_notifications.html_email_template_perso_confirmation(
        "https://front.test, https://autre.test", "aide@axel.test"
    )
    assert "https://front.test/app?open=template-perso" in out
    assert "aide@axel.test" in out
    assert "#4f46e5" not in out


def test_cancelled_email_escapes_the_period_label() -> None:
    out = billing_notifications.html_email_subscription_cancelled(XSS)
    assert "<script>" not in out
    assert "résiliation" in out
    assert 'href="mailto:contact@axelproject.fr"' in out


def test_cancelled_email_is_sent_with_the_template() -> None:
    fake = MagicMock()
    with patch.dict(sys.modules, {"resend": fake}):
        sent = billing_notifications.send_subscription_cancelled_email(
            "u@example.com", "31 décembre 2026", "key", "AxeL <a@axel.test>"
        )
    assert sent is True
    assert "31 décembre 2026" in fake.Emails.send.call_args.args[0]["html"]


def test_support_ticket_escapes_every_user_field() -> None:
    out = support_ticket_email_html(f"a{XSS}@x.test", XSS, f"ligne1\n{XSS}")
    assert "<script>" not in out
    assert "Nouveau ticket" in out
    assert "ligne1<br>" in out


def test_support_reply_escapes_the_message() -> None:
    out = support_reply_email_html(f"Bonjour\n{XSS}")
    assert "<script>" not in out
    assert "Réponse à ton ticket" in out
    assert "Bonjour<br>" in out


def test_supabase_templates_keep_go_variables_and_a_button() -> None:
    templates = auth_templates()
    assert {t.filename for t in templates} == {"confirmation.html", "recovery.html", "invite.html"}
    for template in templates:
        assert 'href="{{ .ConfirmationURL }}"' in template.html
        assert "placeholder.invalid" not in template.html
        assert "<h1" in template.html and "AxeL Job" in template.html


def test_supabase_template_files_are_up_to_date() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "build_supabase_email_templates.py"), "--check"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_monitoring_alert_stays_plain() -> None:
    source = (ROOT / "backend" / "monitoring_ops.py").read_text("utf-8")
    assert "email_layout" not in source
