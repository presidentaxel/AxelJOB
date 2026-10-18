"""Un e-mail déjà social reçoit un mot de passe, pas un second compte."""

from backend.services.account_password_link import (
    needs_password_setup,
    password_setup_for_email,
)


def test_social_only_needs_a_password() -> None:
    assert needs_password_setup({"google"}) is True
    assert needs_password_setup({"linkedin_oidc"}) is True
    assert needs_password_setup({"linkedin"}) is True


def test_email_identity_is_left_alone() -> None:
    assert needs_password_setup({"email"}) is False
    assert needs_password_setup({"google", "email"}) is False
    assert needs_password_setup(set()) is False


def test_unknown_email_does_not_send(monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.services.account_password_link.providers_for_email",
        lambda email: set(),
    )
    monkeypatch.setattr(
        "backend.services.account_password_link.recently_sent",
        lambda email: False,
    )
    assert password_setup_for_email("nouveau@example.com") == {"sent": False, "channel": ""}


def test_social_account_asks_the_client_to_send_when_resend_is_off(monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.services.account_password_link.providers_for_email",
        lambda email: {"google"},
    )
    monkeypatch.setattr(
        "backend.services.account_password_link.recently_sent",
        lambda email: False,
    )
    monkeypatch.setattr(
        "backend.services.account_password_link._recovery_link",
        lambda email: "",
    )
    monkeypatch.setattr(
        "backend.services.account_password_link._remember",
        lambda email: None,
    )
    result = password_setup_for_email("ada@example.com")
    assert result["sent"] is True
    assert result["channel"] == "supabase"
