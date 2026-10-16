"""Santé plateforme Gemini : sonde, raison d'échec, alerte ok → down.

La clé API n'est jamais recopiée dans le statut ni dans le détail.
"""

from __future__ import annotations

import os
import re
import threading
import time
from collections.abc import Callable
from typing import Any

from backend.config import GEMINI_MODEL_DEFAULT

_KEY_RE = re.compile(r"AIza[0-9A-Za-z\-_]{8,}")
_ALERT_REASONS = frozenset({"billing_prepay", "auth", "quota"})
_lock = threading.Lock()
_state: dict[str, Any] = {
    "status": "degraded",
    "reason": "unknown",
    "detail": "Pas encore sondé.",
    "checked_at": None,
}
_pending_alert: str | None = None
_previous_status: str | None = None


def scrub_gemini_text(text: str) -> str:
    """Retire une clé Google éventuelle et borne la longueur."""
    cleaned = _KEY_RE.sub("[redacted]", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:180]


def classify_gemini_error(exc: BaseException) -> str:
    """billing_prepay | quota | auth | model | unknown."""
    text = scrub_gemini_text(str(exc)).lower()
    status = _status_code(exc)
    if any(word in text for word in ("prepay", "billing", "credit", "spend cap")):
        return "billing_prepay"
    if status == 429 or "resource_exhausted" in text or "quota" in text:
        return "quota"
    if (
        status in (401, 403)
        or "api key" in text
        or "unauthenticated" in text
        or "permission" in text
    ):
        return "auth"
    if status == 404 or ("model" in text and "not found" in text):
        return "model"
    return "unknown"


def gemini_failure_detail(exc: BaseException, message: str) -> dict[str, str]:
    """Corps HTTP : message utilisateur + reason, sans la clé."""
    return {"message": message, "reason": classify_gemini_error(exc)}


def gemini_health_snapshot() -> dict[str, Any]:
    with _lock:
        out = dict(_state)
    out["model"] = GEMINI_MODEL_DEFAULT
    return out


def take_gemini_down_alert() -> str | None:
    """Message à envoyer une fois, après une transition ok → down."""
    global _pending_alert
    with _lock:
        message = _pending_alert
        _pending_alert = None
    return message


def reset_gemini_health_for_tests() -> None:
    global _pending_alert, _previous_status
    with _lock:
        _state.update(
            status="degraded",
            reason="unknown",
            detail="Pas encore sondé.",
            checked_at=None,
        )
        _pending_alert = None
        _previous_status = None


def probe_gemini(
    *,
    force: bool = False,
    generate: Callable[[], None] | None = None,
    now: float | None = None,
) -> dict[str, Any]:
    """Sonde generate_content, au plus une fois par intervalle.

    En pytest, sans ``force`` ni ``generate``, aucun appel réseau.
    """
    if not force and generate is None and os.environ.get("PYTEST_CURRENT_TEST"):
        return gemini_health_snapshot()

    moment = time.time() if now is None else now
    if not _ai_features_enabled():
        return _store("degraded", "disabled", "AI_FEATURES_ENABLED=0", moment)
    if not os.environ.get("GEMINI_API_KEY", "").strip():
        return _store("down", "not_configured", "GEMINI_API_KEY absente", moment)

    if not force and _is_fresh(moment):
        return gemini_health_snapshot()

    caller = generate or _default_generate
    try:
        caller()
    except Exception as exc:
        reason = classify_gemini_error(exc)
        detail = scrub_gemini_text(str(exc)) or reason
        return _store("down", reason, detail, moment)
    return _store("ok", "ok", "Sonde generate_content réussie.", moment)


def _ai_features_enabled() -> bool:
    raw = os.environ.get("AI_FEATURES_ENABLED")
    if raw is None or not raw.strip():
        return True
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _interval_sec() -> float:
    try:
        return max(60.0, float(os.environ.get("GEMINI_HEALTH_INTERVAL_SEC", "600")))
    except ValueError:
        return 600.0


def _is_fresh(moment: float) -> bool:
    with _lock:
        checked = _state.get("checked_at")
    if not isinstance(checked, int | float):
        return False
    return moment - float(checked) < _interval_sec()


def _store(status: str, reason: str, detail: str, moment: float) -> dict[str, Any]:
    global _pending_alert, _previous_status
    safe = scrub_gemini_text(detail) or reason
    with _lock:
        previous = _previous_status
        _state.update(status=status, reason=reason, detail=safe, checked_at=moment)
        if previous == "ok" and status == "down" and reason in _ALERT_REASONS:
            _pending_alert = f"Gemini down ({reason}) : {safe}"
        _previous_status = status
    return gemini_health_snapshot()


def _status_code(exc: BaseException) -> int | None:
    for attr in ("code", "status_code"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    return None


def _default_generate() -> None:
    from google import genai
    from google.genai import types

    key = os.environ.get("GEMINI_API_KEY", "").strip()
    client = genai.Client(api_key=key)
    client.models.generate_content(
        model=GEMINI_MODEL_DEFAULT,
        contents="ping",
        config=types.GenerateContentConfig(max_output_tokens=8, temperature=0),
    )
