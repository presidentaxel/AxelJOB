"""Le client Gemini doit viser v1beta : les modèles preview n'existent pas sur v1."""

from __future__ import annotations


def test_gemini_client_uses_v1beta(monkeypatch) -> None:
    captured: dict = {}

    class FakeClient:
        def __init__(self, **kwargs: object) -> None:
            captured.update(kwargs)

    monkeypatch.setattr("google.genai.Client", FakeClient)
    from backend.config import gemini_client

    gemini_client("test-key")
    assert captured["api_key"] == "test-key"
    assert captured["http_options"].api_version == "v1beta"
