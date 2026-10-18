"""Les détails de configuration ne sortent pas en production."""

from backend.services.public_error import public_http_detail


def test_production_hides_config_details() -> None:
    assert "GEMINI" not in public_http_detail(500, "GEMINI_API_KEY manquante.", production=True)
    assert "SUPPORT_EMAIL" not in public_http_detail(
        503, "Support non configuré (SUPPORT_EMAIL).", production=True
    )
    assert "Resend" not in public_http_detail(
        503, "Envoi impossible. Vérifie Resend.", production=True
    )
    assert public_http_detail(503, "Paiement non configuré.", production=True).startswith(
        "Ce service"
    )
    assert public_http_detail(502, "<html>nginx</html>", production=True).startswith("Le service")


def test_dev_keeps_the_technical_detail() -> None:
    raw = "GEMINI_API_KEY manquante."
    assert public_http_detail(500, raw, production=False) == raw


def test_user_sentence_stays() -> None:
    sentence = "Impossible de vérifier ton compte pour le moment."
    assert public_http_detail(503, sentence, production=True) == sentence
