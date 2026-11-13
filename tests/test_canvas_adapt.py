"""Le canvas Canva sans expériences structurées est lu puis réécrit."""

from backend.services.canvas_adapt import canvas_adapt_plan, paint_canvas_plan, seed_cv_from_canvas


def _layout():
    return {
        "pages": [
            {
                "blocks": [
                    {
                        "id": "intro",
                        "type": "text",
                        "x": 90,
                        "y": 4,
                        "w": 100,
                        "h": 8,
                        "content": (
                            "Étudiant curieux<br>technologie et les projets concrets, "
                            "rigueur et organisation."
                        ),
                    },
                    {
                        "id": "intro-a",
                        "type": "text",
                        "x": 120,
                        "y": 4,
                        "w": 12,
                        "h": 4,
                        "content": "en",
                    },
                    {
                        "id": "title",
                        "type": "text",
                        "x": 46,
                        "y": 8,
                        "w": 30,
                        "h": 5,
                        "content": "ALTERNANT",
                    },
                    {
                        "id": "side",
                        "type": "text",
                        "x": 10,
                        "y": 50,
                        "w": 30,
                        "h": 5,
                        "content": "Techniques et outils",
                    },
                    {
                        "id": "head",
                        "type": "text",
                        "x": 82,
                        "y": 42,
                        "w": 90,
                        "h": 5,
                        "content": "Harris Interactive | Mai 2024 - Août 2024 Chargé d'étude junior",
                    },
                    {
                        "id": "bullet",
                        "type": "text",
                        "x": 88,
                        "y": 53.4,
                        "w": 105,
                        "h": 9,
                        "content": "Conception<br>questionnaires adaptés aux objectifs des études quantitatives.",
                    },
                    {
                        "id": "w-et",
                        "type": "text",
                        "x": 110,
                        "y": 53.4,
                        "w": 8,
                        "h": 4,
                        "content": "et",
                    },
                    {
                        "id": "w-red",
                        "type": "text",
                        "x": 118,
                        "y": 53.4,
                        "w": 20,
                        "h": 4,
                        "content": "rédaction",
                    },
                    {
                        "id": "w-de",
                        "type": "text",
                        "x": 137,
                        "y": 53.4,
                        "w": 8,
                        "h": 4,
                        "content": "de",
                    },
                    {
                        "id": "w-q",
                        "type": "text",
                        "x": 145,
                        "y": 53.4,
                        "w": 28,
                        "h": 4,
                        "content": "questionnaires",
                    },
                    {
                        "id": "w-colon",
                        "type": "text",
                        "x": 173,
                        "y": 53.4,
                        "w": 4,
                        "h": 4,
                        "content": ":",
                    },
                    {
                        "id": "w-elab",
                        "type": "text",
                        "x": 178,
                        "y": 53.4,
                        "w": 18,
                        "h": 4,
                        "content": "Élaborer",
                    },
                    {
                        "id": "w-des",
                        "type": "text",
                        "x": 196,
                        "y": 53.4,
                        "w": 10,
                        "h": 4,
                        "content": "des",
                    },
                    {
                        "id": "edu",
                        "type": "text",
                        "x": 82,
                        "y": 240,
                        "w": 30,
                        "h": 5,
                        "content": "ÉDUCATION",
                    },
                    {
                        "id": "school",
                        "type": "text",
                        "x": 82,
                        "y": 250,
                        "w": 80,
                        "h": 5,
                        "content": "2023 - 2027 ESSEC Business School",
                    },
                ]
            }
        ]
    }


def test_canvas_plan_reconstructs_bullet_and_skips_sidebar():
    cv = {"titre_professionnel": "ALTERNANT", "resume": "", "experiences": [], "layout": _layout()}
    plan = canvas_adapt_plan(cv)
    assert plan is not None
    assert plan["resume_text"].startswith("Étudiant curieux en technologie")
    assert len(plan["experiences"]) == 1
    exp = plan["experiences"][0]
    assert exp["entreprise"] == "Harris Interactive"
    assert exp["poste"] == "Chargé d'étude junior"
    bullet = exp["bullets"][0]["text"]
    assert bullet == (
        "Conception et rédaction de questionnaires : Élaborer des "
        "questionnaires adaptés aux objectifs des études quantitatives."
    )
    assert "Techniques et outils" not in bullet
    assert "ESSEC Business School" not in bullet


def test_seed_and_paint_replace_the_canvas_line():
    cv = {"titre_professionnel": "ALTERNANT", "resume": "", "experiences": [], "layout": _layout()}
    plan = canvas_adapt_plan(cv)
    seed_cv_from_canvas(cv, plan)
    assert cv["experiences"][0]["id"] == "canvas-exp-0"
    assert "Conception et rédaction" in cv["experiences"][0]["bullet_points"][0]
    adapted = {
        "resume": "Résumé adapté aux institutions publiques.",
        "experiences": [
            {
                "id": "canvas-exp-0",
                "poste": "Chargé d'étude junior",
                "entreprise": "Harris Interactive",
                "bullet_points": ["Conception de questionnaires pour des études nationales."],
            }
        ],
    }
    layout, painted = paint_canvas_plan(cv["layout"], plan, adapted)
    assert painted == 2
    by_id = {block["id"]: block for block in layout["pages"][0]["blocks"]}
    assert "études nationales" in by_id["bullet"]["content"]
    assert by_id["bullet"]["content"].count("<br>") == 1
    assert by_id["bullet"]["style"]["align"] == "justify"
    assert "cv-changed" in by_id["bullet"]["content"]
    assert by_id["bullet"]["y"] == 53.4
    assert by_id["bullet"]["h"] == 9
    assert by_id["bullet"]["w"] == 105
    assert "w-et" not in by_id
    assert "w-elab" not in by_id
    assert "institutions publiques" in by_id["intro"]["content"]
    assert "intro-a" not in by_id
    assert by_id["title"]["content"] == "ALTERNANT"


def test_a_longer_bullet_keeps_every_block_in_place():
    layout = {
        "pages": [
            {
                "blocks": [
                    {
                        "id": "a",
                        "type": "text",
                        "x": 20,
                        "y": 40,
                        "w": 70,
                        "h": 6,
                        "content": "Short original<br>bullet about the study.",
                        "style": {"font_size": 10, "line_height": 1.372, "nowrap": False},
                    },
                    {
                        "id": "bold",
                        "type": "text",
                        "x": 48,
                        "y": 41,
                        "w": 20,
                        "h": 4,
                        "content": "questionnaires",
                    },
                    {
                        "id": "skill",
                        "type": "text",
                        "x": 4,
                        "y": 52,
                        "w": 8,
                        "h": 4,
                        "content": "Rigueur",
                    },
                    {"id": "dot", "type": "text", "x": 12, "y": 52, "w": 4, "h": 4, "content": "•"},
                    {
                        "id": "b",
                        "type": "text",
                        "x": 20,
                        "y": 52,
                        "w": 70,
                        "h": 6,
                        "content": "Second original bullet about the study.",
                        "style": {"font_size": 10},
                    },
                    {
                        "id": "orphan",
                        "type": "text",
                        "x": 12,
                        "y": 64,
                        "w": 4,
                        "h": 4,
                        "content": "•",
                    },
                    {
                        "id": "gone",
                        "type": "text",
                        "x": 20,
                        "y": 64,
                        "w": 70,
                        "h": 6,
                        "content": "Third original bullet that the model drops.",
                    },
                    {
                        "id": "head",
                        "type": "text",
                        "x": 20,
                        "y": 76,
                        "w": 80,
                        "h": 6,
                        "content": "Genius ESSEC | 2023 - Aujourd'hui Trésorier",
                    },
                ]
            }
        ]
    }
    plan = {
        "resume_block_ids": [],
        "resume_text": "",
        "experiences": [
            {
                "id": "canvas-exp-0",
                "bullets": [
                    {"text": "Short original bullet about the study.", "block_ids": ["a"]},
                    {"text": "Second original bullet about the study.", "block_ids": ["b"]},
                    {"text": "Third original bullet that the model drops.", "block_ids": ["gone"]},
                ],
            }
        ],
    }
    adapted = {
        "experiences": [
            {
                "id": "canvas-exp-0",
                "bullet_points": [
                    (
                        "Conception de questionnaires adaptés aux objectifs des études "
                        "quantitatives pour des organisations de premier plan."
                    ),
                    (
                        "Synthèse des données et rédaction de rapports stratégiques "
                        "incluant des recommandations décisionnelles."
                    ),
                ],
            }
        ]
    }
    out, painted = paint_canvas_plan(layout, plan, adapted)
    assert painted == 2
    by_id = {block["id"]: block for block in out["pages"][0]["blocks"]}
    assert by_id["a"]["y"] == 40
    assert by_id["a"]["h"] == 6
    assert by_id["a"]["w"] == 70
    assert by_id["a"]["style"]["font_size"] == 10
    assert by_id["a"]["style"]["line_height"] == 1.372
    assert by_id["a"]["style"].get("nowrap") is False
    assert by_id["a"]["content"].count("<br>") == 1
    assert by_id["a"]["style"]["align"] == "justify"
    assert by_id["b"]["style"].get("align") != "justify"
    assert by_id["b"]["y"] == 52
    assert by_id["dot"]["y"] == 52
    assert by_id["head"]["y"] == 76
    assert by_id["bold"]["y"] == 41
    assert by_id["skill"]["y"] == 52
    assert by_id["gone"]["content"] == "Third original bullet that the model drops."
    assert by_id["orphan"]["content"] == "•"


def test_bold_word_on_an_inner_line_is_cleared_with_that_line():
    cv = {
        "titre_professionnel": "",
        "resume": "",
        "experiences": [],
        "layout": {
            "pages": [
                {
                    "blocks": [
                        {
                            "id": "head",
                            "type": "text",
                            "x": 82,
                            "y": 20,
                            "w": 110,
                            "h": 5,
                            "content": "Studio | Mai 2021 - Août 2024 Directeur artistique",
                        },
                        {
                            "id": "bullet",
                            "type": "text",
                            "x": 88,
                            "y": 30,
                            "w": 118,
                            "h": 14.5,
                            "content": (
                                "Réalisation de visuels pour des comptes majeurs<br>"
                                "Illustrator,<br>"
                                "Disney+, Bolt et TV5 Monde."
                            ),
                            "style": {"font_size": 10, "line_height": 1.376, "nowrap": False},
                        },
                        {
                            "id": "w-mod",
                            "type": "text",
                            "x": 96,
                            "y": 34.9,
                            "w": 28,
                            "h": 4.8,
                            "content": "modélisation",
                            "style": {"bold": True, "nowrap": True, "font_size": 10},
                        },
                        {
                            "id": "w-de",
                            "type": "text",
                            "x": 110,
                            "y": 34.9,
                            "w": 8,
                            "h": 4.8,
                            "content": "de",
                            "style": {"nowrap": True, "font_size": 10},
                        },
                        {
                            "id": "clients",
                            "type": "text",
                            "x": 82,
                            "y": 46,
                            "w": 110,
                            "h": 4.8,
                            "content": "Clients : Disney+, Bolt, Serenity Advertising",
                        },
                    ]
                }
            ]
        },
    }
    plan = canvas_adapt_plan(cv)
    assert plan is not None
    bullets = plan["experiences"][0]["bullets"]
    assert len(bullets) == 2
    assert "w-mod" in bullets[0]["block_ids"]
    assert "w-de" in bullets[0]["block_ids"]
    assert "modélisation" not in bullets[0]["text"]
    seed_cv_from_canvas(cv, plan)
    adapted = {
        "experiences": [
            {
                "id": "canvas-exp-0",
                "bullet_points": [
                    "Direction de projets techniques et visuels pour des comptes majeurs.",
                ],
            }
        ]
    }
    layout, _painted = paint_canvas_plan(cv["layout"], plan, adapted)
    by_id = {block["id"]: block for block in layout["pages"][0]["blocks"]}
    assert "w-mod" not in by_id
    assert "w-de" not in by_id
    assert by_id["bullet"]["y"] == 30
    assert by_id["bullet"]["h"] == 14.5
    assert by_id["bullet"]["style"]["line_height"] == 1.376
    assert by_id["bullet"]["content"].count("<br>") == 2
    assert by_id["clients"]["content"] == "Clients : Disney+, Bolt, Serenity Advertising"


def test_structured_experiences_are_left_alone():
    cv = {"experiences": [{"id": "e1", "bullet_points": ["Déjà structuré"]}], "layout": _layout()}
    assert canvas_adapt_plan(cv) is None
