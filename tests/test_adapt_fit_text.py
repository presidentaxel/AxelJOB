"""Raccourcissement canvas : le texte déjà assez court ne part pas chez Gemini."""

import unittest

from backend.services.adapter import shorten_text_to_fit


class ShortenTextToFitTest(unittest.TestCase):
    def test_deja_assez_court(self):
        out = shorten_text_to_fit("Tech lead", 40, user_id=None)
        self.assertEqual(out, {"text": "Tech lead", "impossible": False})


if __name__ == "__main__":
    unittest.main()
