"""AXE-906 : un ping base échoué une seule fois (ex. 471 ms) n'envoie pas de mail."""

from __future__ import annotations

import pytest


class _Cursor:
    def __enter__(self) -> _Cursor:
        return self

    def __exit__(self, *_args: object) -> bool:
        return False

    def execute(self, sql: str) -> None:
        assert sql == "SELECT 1"


class _Conn:
    def cursor(self) -> _Cursor:
        return _Cursor()


class _Checkout:
    def __init__(self, conn: _Conn) -> None:
        self._conn = conn

    def __enter__(self) -> _Conn:
        return self._conn

    def __exit__(self, *_args: object) -> bool:
        return False


class _FlakyPool:
    def __init__(self) -> None:
        self.calls = 0

    def connection(self, timeout: float = 2.0) -> _Checkout:
        assert timeout == 2.0
        self.calls += 1
        if self.calls == 1:
            raise ConnectionError("server closed the connection")
        return _Checkout(_Conn())


class _DownPool:
    def connection(self, timeout: float = 2.0) -> _Checkout:
        assert timeout == 2.0
        raise TimeoutError("timeout expired")


def _arm(monkeypatch: pytest.MonkeyPatch):
    import backend.monitoring_ops as m

    monkeypatch.setattr(m, "MONITORING_ALERT_ENABLED", True)
    monkeypatch.setattr(m, "USE_SUPABASE_PG", True)
    if hasattr(m, "_dispatch_gemini_down_alert"):
        monkeypatch.setattr(m, "_dispatch_gemini_down_alert", lambda: None)
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(m, "_send_alert_email", lambda subject, body: sent.append((subject, body)))
    m._last_alert_at.clear()
    m._cpu_high_streak = 0
    m._cpu_samples.clear()
    m._recent_http.clear()
    m._db_down_streak = 0
    m._last_snap["system_cpu"] = 3.0
    m._last_snap["system_mem_pct"] = 20.0
    m._last_db_check.update({"ok": True, "ms": 12.0, "ts": 0.0, "error": ""})
    return m, sent


def test_dead_connection_is_dropped_before_retry() -> None:
    import backend.monitoring_ops as m

    class _Pool(_FlakyPool):
        def __init__(self) -> None:
            super().__init__()
            self.checks = 0

        def check(self) -> None:
            self.checks += 1

    pool = _Pool()
    ok, err = m._select_one(pool)
    assert ok is True
    assert err == ""
    assert pool.checks == 1
    assert pool.calls == 2


def test_retry_succeeds_after_a_dead_connection() -> None:
    import backend.monitoring_ops as m

    pool = _FlakyPool()
    ok, err = m._select_one(pool)
    assert ok is True
    assert err == ""
    assert pool.calls == 2


def test_two_failures_keep_the_error_class_only() -> None:
    import backend.monitoring_ops as m

    ok, err = m._select_one(_DownPool())
    assert ok is False
    assert err == "TimeoutError"


def test_one_failed_ping_does_not_email(monkeypatch: pytest.MonkeyPatch) -> None:
    m, sent = _arm(monkeypatch)
    m._last_db_check.update({"ok": False, "ms": 471.7, "error": "OperationalError"})
    m.evaluate_alerts()
    assert sent == []
    assert m._db_down_streak == 1


def test_two_failed_pings_email_without_the_old_wording(monkeypatch: pytest.MonkeyPatch) -> None:
    m, sent = _arm(monkeypatch)
    m._last_db_check.update({"ok": False, "ms": 471.7, "error": "OperationalError"})
    m.evaluate_alerts()
    m.evaluate_alerts()
    assert len(sent) == 1
    subject, body = sent[0]
    assert subject == "[AxeL Job] Alerte base de données"
    assert "471.7" in body
    assert "OperationalError" in body
    assert "2 fois de suite" in body
    assert "dernière latence mesurée" not in body


def test_recovery_resets_the_streak(monkeypatch: pytest.MonkeyPatch) -> None:
    m, sent = _arm(monkeypatch)
    m._last_db_check.update({"ok": False, "ms": 471.7, "error": "OperationalError"})
    m.evaluate_alerts()
    m._last_db_check.update({"ok": True, "ms": 18.0, "error": ""})
    m.evaluate_alerts()
    assert sent == []
    assert m._db_down_streak == 0
