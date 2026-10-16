"""AXE-337 : sonde Gemini, raison machine, alerte ok → down, pas de clé dans le détail."""

from __future__ import annotations

from backend.gemini_health import (
    classify_gemini_error,
    gemini_failure_detail,
    probe_gemini,
    reset_gemini_health_for_tests,
    scrub_gemini_text,
    take_gemini_down_alert,
)


def setup_function() -> None:
    reset_gemini_health_for_tests()


def test_classify_billing_quota_auth_model() -> None:
    assert classify_gemini_error(RuntimeError("Prepay billing required")) == "billing_prepay"
    assert classify_gemini_error(RuntimeError("429 RESOURCE_EXHAUSTED quota")) == "quota"
    assert classify_gemini_error(RuntimeError("API key not valid")) == "auth"
    assert classify_gemini_error(RuntimeError("404 models/gemini-x is not found")) == "model"
    assert classify_gemini_error(RuntimeError("connection reset")) == "unknown"


def test_scrub_removes_api_key() -> None:
    raw = "failed for key AIzaSyDUMMYKEY1234567890 please retry"
    cleaned = scrub_gemini_text(raw)
    assert "AIza" not in cleaned
    assert "[redacted]" in cleaned


def test_failure_detail_has_reason_without_key() -> None:
    exc = RuntimeError("billing prepay AIzaSyDUMMYKEY1234567890")
    detail = gemini_failure_detail(exc, "Erreur Gemini lors de l'import.")
    assert detail["reason"] == "billing_prepay"
    assert detail["message"] == "Erreur Gemini lors de l'import."
    assert "AIza" not in str(detail)


def test_missing_key_is_down(monkeypatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("AI_FEATURES_ENABLED", raising=False)
    snap = probe_gemini(force=True)
    assert snap["status"] == "down"
    assert snap["reason"] == "not_configured"
    assert take_gemini_down_alert() is None


def test_kill_switch_skips_the_call(monkeypatch) -> None:
    monkeypatch.setenv("AI_FEATURES_ENABLED", "0")
    called = {"n": 0}

    def generate() -> None:
        called["n"] += 1

    snap = probe_gemini(force=True, generate=generate)
    assert called["n"] == 0
    assert snap["status"] == "degraded"
    assert snap["reason"] == "disabled"


def test_ok_then_billing_queues_one_alert(monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("AI_FEATURES_ENABLED", raising=False)

    ok = probe_gemini(force=True, generate=lambda: None)
    assert ok["status"] == "ok"
    assert take_gemini_down_alert() is None

    def boom() -> None:
        raise RuntimeError("prepay balance is zero")

    down = probe_gemini(force=True, generate=boom)
    assert down["status"] == "down"
    assert down["reason"] == "billing_prepay"
    alert = take_gemini_down_alert()
    assert alert is not None
    assert "billing_prepay" in alert
    assert take_gemini_down_alert() is None


def test_staying_down_does_not_alert_again(monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("AI_FEATURES_ENABLED", raising=False)
    probe_gemini(force=True, generate=lambda: None)

    def boom() -> None:
        raise RuntimeError("prepay balance is zero")

    probe_gemini(force=True, generate=boom)
    assert take_gemini_down_alert() is not None
    probe_gemini(force=True, generate=boom)
    assert take_gemini_down_alert() is None


def test_snapshot_includes_cached_probe(monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("AI_FEATURES_ENABLED", raising=False)
    probe_gemini(force=True, generate=lambda: None)
    from backend.monitoring_ops import get_admin_snapshot

    snap = get_admin_snapshot()
    assert snap["gemini_health"]["status"] == "ok"
    assert snap["gemini_health"]["reason"] == "ok"
