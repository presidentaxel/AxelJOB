"""AXE-487 : le 503 dev explique la limite sandbox Resend."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from backend import main
from backend.main import SupportTicketBody
from backend.services.support_ticket import (
    SUPPORT_TICKET_RESEND_SANDBOX,
    SUPPORT_TICKET_SEND_FAILED,
    support_ticket_failure_detail,
)

SANDBOX = RuntimeError(
    "You can only send testing emails to your own email address "
    "(compte@example.test). To send emails to other recipients, please verify a domain."
)


def test_dev_sandbox_explains_resend_test_account() -> None:
    detail = support_ticket_failure_detail(SANDBOX, production=False)
    assert detail == SUPPORT_TICKET_RESEND_SANDBOX
    assert "compte de test" in detail
    assert "onboarding@resend.dev" in detail


def test_production_keeps_generic_message() -> None:
    assert support_ticket_failure_detail(SANDBOX, production=True) == SUPPORT_TICKET_SEND_FAILED


class _Request:
    def __init__(self) -> None:
        self.headers: dict[str, str] = {}
        self.state = SimpleNamespace()


def _raise_sandbox(_params: object) -> None:
    raise RuntimeError(
        "You can only send testing emails to your own email address (compte@example.test)."
    )


def test_api_dev_returns_sandbox_detail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "IS_PRODUCTION", False)
    monkeypatch.setattr(main, "SUPPORT_EMAIL", "support@example.test")
    monkeypatch.setattr(main, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(main, "RESEND_FROM_EMAIL", "AxeL Job <onboarding@resend.dev>")
    monkeypatch.setattr(main, "_require_user_id", lambda _request: "user_test")
    monkeypatch.setattr(main, "_get_user_email_from_jwt", lambda _request: "user@example.test")
    body = SupportTicketBody(subject="Sujet", message="Bonjour")
    with patch("resend.Emails.send", _raise_sandbox):
        with pytest.raises(HTTPException) as exc:
            main.api_support_ticket(_Request(), body)
    assert exc.value.status_code == 503
    assert exc.value.detail == SUPPORT_TICKET_RESEND_SANDBOX


def test_api_production_keeps_generic_detail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "IS_PRODUCTION", True)
    monkeypatch.setattr(main, "SUPPORT_EMAIL", "support@example.test")
    monkeypatch.setattr(main, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(main, "RESEND_FROM_EMAIL", "AxeL Job <onboarding@resend.dev>")
    monkeypatch.setattr(main, "_require_user_id", lambda _request: "user_test")
    monkeypatch.setattr(main, "_get_user_email_from_jwt", lambda _request: "user@example.test")
    body = SupportTicketBody(subject="Sujet", message="Bonjour")
    with patch("resend.Emails.send", _raise_sandbox):
        with pytest.raises(HTTPException) as exc:
            main.api_support_ticket(_Request(), body)
    assert exc.value.status_code == 503
    assert exc.value.detail == SUPPORT_TICKET_SEND_FAILED


def test_other_failure_stays_generic() -> None:
    assert (
        support_ticket_failure_detail(RuntimeError("network down"), production=False)
        == SUPPORT_TICKET_SEND_FAILED
    )
    assert support_ticket_failure_detail(None, production=False) == SUPPORT_TICKET_SEND_FAILED
