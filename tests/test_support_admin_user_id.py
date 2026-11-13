"""L'UID listé ouvre le monitoring en dev, pas en production."""

from backend import main


def test_user_id_is_support_admin_outside_production(monkeypatch) -> None:
    monkeypatch.setattr(main, "IS_PRODUCTION", False)
    monkeypatch.setattr(main, "SUPPORT_ADMIN_USER_IDS", {"user-dev"})
    monkeypatch.setattr(main, "SUPPORT_ADMIN_EMAILS", ["admin@example.test"])
    assert main._is_support_admin("other@example.test", "user-dev") is True


def test_user_id_does_not_grant_support_in_production(monkeypatch) -> None:
    monkeypatch.setattr(main, "IS_PRODUCTION", True)
    monkeypatch.setattr(main, "SUPPORT_ADMIN_USER_IDS", {"user-dev"})
    monkeypatch.setattr(main, "SUPPORT_ADMIN_EMAILS", ["admin@example.test"])
    assert main._is_support_admin("other@example.test", "user-dev") is False
    assert main._is_support_admin("admin@example.test", "someone-else") is True
