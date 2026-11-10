"""La note Compétences doit bouger quand l'adaptation écrit les mots de l'offre."""

import unittest

from backend.services.rules import appliquer_regles


OFFRE = {
    "titre": "Tech lead",
    "mots_cles_extraits": ["python", "michelin"],
    "competences_requises": [],
}


class SkillsMatchTests(unittest.TestCase):
    def test_logiciels_et_resume_compte(self):
        avant = appliquer_regles(
            {
                "competences": {"techniques": [], "logiciels": ["Excel"]},
                "resume": "Étudiant ESSEC.",
                "experiences": [],
            },
            OFFRE,
        )
        apres = appliquer_regles(
            {
                "competences": {"techniques": [], "logiciels": ["Excel"]},
                "resume": "Tech lead, Python et opérations chez Michelin.",
                "experiences": [],
            },
            OFFRE,
        )
        self.assertLess(avant["rapport"]["detail"]["skills_match"], 50)
        self.assertGreater(
            apres["rapport"]["detail"]["skills_match"],
            avant["rapport"]["detail"]["skills_match"],
        )
        self.assertGreater(apres["rapport"]["detail"]["skills_match"], 0)


if __name__ == "__main__":
    unittest.main()
