"""Coupure Postgres : 503, pas 401, et pas de rafale de connexions."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend import auth_user_verify, main
from backend.config import _pg_pool_max, _session_mode_database_url
from backend.supabase_pg import (
    _SentryAwarePool,
    is_pg_connect_outage,
    note_pg_connect_failure,
    pg_connect_cooling_down,
    reset_pg_connect_cooldown,
)


def test_session_mode_caps_pool_below_supabase_limit(monkeypatch) -> None:
    monkeypatch.setenv(
        "SUPABASE_DATABASE_URL",
        "postgresql://user:secret@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    )
    monkeypatch.setenv("SUPABASE_PG_POOL_MAX", "32")
    assert _session_mode_database_url("postgresql://pooler.supabase.com:5432/postgres")
    assert not _session_mode_database_url("postgresql://pooler.supabase.com:6543/postgres")
    assert _pg_pool_max() == 4


def test_transaction_mode_keeps_a_higher_ceiling(monkeypatch) -> None:
    monkeypatch.setenv(
        "SUPABASE_DATABASE_URL",
        "postgresql://user:secret@aws-1-eu-central-1.pooler.supabase.com:6543/postgres",
    )
    monkeypatch.setenv("SUPABASE_PG_POOL_MAX", "12")
    assert _pg_pool_max() == 12


def test_pooler_host_is_the_parsed_hostname_only() -> None:
    assert not _session_mode_database_url(
        "postgresql://evil.example/postgres?x=pooler.supabase.com"
    )
    assert _session_mode_database_url(
        "postgresql://user:secret@aws-1-eu-central-1.pooler.supabase.com/postgres"
    )


def test_exists_via_rest_does_not_raise_unbound_local(monkeypatch) -> None:
    class _Admin:
        def get_user_by_id(self, uid: str):
            raise RuntimeError("failed to resolve host")

    class _Auth:
        admin = _Admin()

    class _Client:
        auth = _Auth()

    monkeypatch.setattr(
        "backend.db._get_supabase",
        lambda: _Client(),
    )
    assert auth_user_verify._exists_via_rest("11111111-1111-1111-1111-111111111111") is None


def test_unreachable_verify_is_503_not_401(monkeypatch) -> None:
    monkeypatch.setattr(auth_user_verify, "USE_SUPABASE", True)
    monkeypatch.setattr(auth_user_verify, "_positive_cache", {})
    monkeypatch.setattr(auth_user_verify, "auth_user_still_exists", lambda uid: None)
    with pytest.raises(HTTPException) as exc:
        auth_user_verify.ensure_supabase_user_still_exists("11111111-1111-1111-1111-111111111111")
    assert exc.value.status_code == 503


def test_get_user_id_propagates_503(monkeypatch) -> None:
    req = SimpleNamespace(
        headers={"Authorization": "Bearer token"},
        state=SimpleNamespace(),
    )
    monkeypatch.setattr(main, "USE_SUPABASE", True)
    monkeypatch.setattr(
        main,
        "_resolve_jwt_payload_for_request",
        lambda request: {"sub": "11111111-1111-1111-1111-111111111111"},
    )

    def _boom(user_id: str) -> None:
        raise HTTPException(status_code=503, detail="vérif impossible")

    monkeypatch.setattr(
        "backend.auth_user_verify.ensure_supabase_user_still_exists",
        _boom,
    )
    with pytest.raises(HTTPException) as exc:
        main._get_user_id(req)
    assert exc.value.status_code == 503


def test_acquire_failure_on_enter_opens_cooldown() -> None:
    reset_pg_connect_cooldown()

    class _CM:
        def __enter__(self) -> None:
            raise OSError("failed to resolve host")

        def __exit__(self, *_args: object) -> None:
            raise AssertionError("pas de restitution si la connexion n'a pas été prise")

    class _Pool:
        def __init__(self) -> None:
            self.checked = False

        def connection(self) -> _CM:
            return _CM()

        def check(self) -> None:
            self.checked = True

    pool = _Pool()
    wrapper = _SentryAwarePool(pool)
    with pytest.raises(OSError, match="failed to resolve"):
        with wrapper.connection():
            pass
    assert pg_connect_cooling_down()
    assert pool.checked
    reset_pg_connect_cooldown()


def test_pool_timeout_with_live_connections_does_not_cooldown() -> None:
    reset_pg_connect_cooldown()

    class PoolTimeout(Exception):
        pass

    class _CM:
        def __init__(self, exc: Exception) -> None:
            self._exc = exc

        def __enter__(self) -> None:
            raise self._exc

        def __exit__(self, *_args: object) -> None:
            return None

    class _Pool:
        def __init__(self, pool_size: int) -> None:
            self.pool_size = pool_size

        def connection(self) -> _CM:
            return _CM(PoolTimeout("couldn't get a connection after 5.00 sec"))

        def get_stats(self) -> dict[str, int]:
            return {"pool_size": self.pool_size}

    busy = _SentryAwarePool(_Pool(4))
    with pytest.raises(PoolTimeout):
        with busy.connection():
            pass
    assert not pg_connect_cooling_down()

    empty = _SentryAwarePool(_Pool(0))
    with pytest.raises(PoolTimeout):
        with empty.connection():
            pass
    assert pg_connect_cooling_down()
    reset_pg_connect_cooldown()


def test_connect_outage_opens_cooldown() -> None:
    reset_pg_connect_cooldown()
    assert is_pg_connect_outage(OSError("failed to resolve host"))
    note_pg_connect_failure()
    assert pg_connect_cooling_down()

    class _Pool:
        def connection(self):
            raise AssertionError("ne doit pas ouvrir de connexion pendant le cooldown")

    wrapper = _SentryAwarePool(_Pool())
    with pytest.raises(RuntimeError, match="temporairement injoignable"):
        wrapper.connection()
    reset_pg_connect_cooldown()
