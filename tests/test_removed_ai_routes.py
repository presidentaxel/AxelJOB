"""AXE-1107 : routes IA que le frontend n'appelait plus (dont une ouverte vers Gemini)."""

from backend import main


def _paths() -> set[str]:
    return {getattr(r, "path", "") for r in main.app.routes}


def test_unused_ai_routes_removed():
    for path in ("/api/adapt-run", "/api/adapt-plan-explain", "/api/adapt-fit-text"):
        assert path not in _paths(), path


def test_adapt_routes_kept():
    assert "/api/adapt-run-stream" in _paths()
    assert "/api/adapt" in _paths()
