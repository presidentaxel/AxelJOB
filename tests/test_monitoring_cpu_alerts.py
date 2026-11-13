"""AXE-763 : un pic CPU d'un seul relevé ne déclenche plus le mail."""

from __future__ import annotations

import pytest


def _arm(monkeypatch: pytest.MonkeyPatch):
    import backend.monitoring_ops as m

    monkeypatch.setattr(m, "MONITORING_ALERT_ENABLED", True)
    monkeypatch.setattr(m, "USE_SUPABASE_PG", False)
    if hasattr(m, "_dispatch_gemini_down_alert"):
        monkeypatch.setattr(m, "_dispatch_gemini_down_alert", lambda: None)
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(m, "_send_alert_email", lambda subject, body: sent.append((subject, body)))
    m._last_alert_at.clear()
    m._cpu_high_streak = 0
    m._cpu_spike_streak = 0
    m._cpu_sample_seq = 0
    m._cpu_spike_seen_seq = 0
    m._cpu_samples.clear()
    m._recent_http.clear()
    m._last_snap["system_cpu"] = 6.0
    m._last_snap["process_cpu"] = 4.0
    m._last_snap["system_mem_pct"] = 20.0
    m._cpu_percent_primed = False
    return m, sent


def test_first_psutil_sample_is_discarded() -> None:
    import backend.monitoring_ops as m

    m._cpu_percent_primed = False
    assert m.take_system_cpu_percent(100.0) is None
    assert m.take_system_cpu_percent(73.3) == 73.3


def test_single_spike_does_not_email(monkeypatch: pytest.MonkeyPatch) -> None:
    m, sent = _arm(monkeypatch)
    for _ in range(29):
        m._cpu_samples.append(6.0)
    m._cpu_samples.append(100.0)
    m._last_snap["system_cpu"] = 100.0
    m.note_fresh_cpu_sample()
    m.evaluate_alerts()
    m.evaluate_alerts()
    assert sent == []
    assert m._cpu_spike_streak == 1


def test_spike_held_two_ticks_emails_with_process_cpu(monkeypatch: pytest.MonkeyPatch) -> None:
    m, sent = _arm(monkeypatch)
    for _ in range(29):
        m._cpu_samples.append(6.0)
    m._cpu_samples.append(93.8)
    m._last_snap["system_cpu"] = 93.8
    m._last_snap["process_cpu"] = 80.0
    m.note_fresh_cpu_sample()
    m.evaluate_alerts()
    m._cpu_samples.append(93.8)
    m.note_fresh_cpu_sample()
    m.evaluate_alerts()
    assert len(sent) == 1
    subject, body = sent[0]
    assert subject == "[AxeL Job] Pic CPU suspect"
    assert "93.8%" in body
    assert "80.0%" in body
    assert "2 relevés" in body


def test_quiet_cpu_resets_the_streak(monkeypatch: pytest.MonkeyPatch) -> None:
    m, sent = _arm(monkeypatch)
    for _ in range(8):
        m._cpu_samples.append(6.0)
    m._last_snap["system_cpu"] = 100.0
    m._cpu_samples.append(100.0)
    m.note_fresh_cpu_sample()
    m.evaluate_alerts()
    m._last_snap["system_cpu"] = 6.0
    m._cpu_samples.append(6.0)
    m.note_fresh_cpu_sample()
    m.evaluate_alerts()
    assert sent == []
    assert m._cpu_spike_streak == 0
