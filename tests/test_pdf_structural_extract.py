"""Tests de l'extraction structurelle PDF → layout v3 (sans IA)."""

import unittest

from backend.services.pdf_structural_extract import (
    _cleanup_image_overlay_blocks,
    _collapse_tracked_caps,
    _contrast_ratio,
    _extract_shape_blocks,
    _float_rgb_to_hex,
    _frame_strips_from_rects,
    _image_paint_opacity,
    _int_color_to_hex,
    _is_hidden_ats_text,
    _is_near_white,
    _filter_underline_marks,
    _join_line_span_texts,
    _line_column_fragments,
    _mark_underlined_spans,
    _merge_baseline_fragments,
    _photo_circle_geometry,
    _photo_plate_blocks,
    _pixmap_is_blank_plate,
    _spans_to_html,
    _underline_mode,
    coalesce_text_runs,
    extract_layout_from_pdf,
    visible_text_excluding_hidden_ats,
)

MM_PER_PT = 25.4 / 72.0


def _build_sample_pdf() -> bytes | None:
    """Construit un petit PDF natif (texte + rectangle de fond) via PyMuPDF."""
    try:
        import fitz
    except ImportError:
        return None
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4 en points
    # Bandeau de fond coloré (sidebar) à gauche.
    page.draw_rect(fitz.Rect(0, 0, 180, 842), color=None, fill=(0.1, 0.2, 0.4))
    # Quelques lignes de texte (assez de caractères pour passer le seuil natif).
    page.insert_text((40, 60), "Louis Vedovato", fontsize=20, color=(0, 0, 0))
    page.insert_text((40, 100), "Fondateur - Entrepreneuriat / Creatif / Tech", fontsize=11)
    page.insert_text(
        (40, 140),
        "Experience professionnelle riche en automatisation et gestion de projet.",
        fontsize=10,
    )
    page.insert_text((40, 180), "Python, IA, Developpement web full-stack, VBA Excel.", fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


class ColorHelpersTest(unittest.TestCase):
    def test_int_color_to_hex(self):
        self.assertEqual(_int_color_to_hex(0), "#000000")
        self.assertEqual(_int_color_to_hex(0xFF0000), "#ff0000")
        self.assertEqual(_int_color_to_hex(None), "#1a1a1a")

    def test_float_rgb_to_hex(self):
        self.assertEqual(_float_rgb_to_hex((1.0, 0.0, 0.0)), "#ff0000")
        self.assertEqual(_float_rgb_to_hex((0.0, 0.0, 0.0)), "#000000")
        self.assertEqual(_float_rgb_to_hex(0.5), "#808080")
        self.assertIsNone(_float_rgb_to_hex(None))

    def test_is_near_white(self):
        self.assertTrue(_is_near_white("#ffffff"))
        self.assertTrue(_is_near_white("#fefefe"))
        self.assertFalse(_is_near_white("#1e2a3a"))

    def test_hidden_ats_is_low_contrast_micro_text(self):
        self.assertTrue(_is_hidden_ats_text(2.0, "#efeff0", "#ffffff"))
        self.assertTrue(_is_hidden_ats_text(5.0, "#ffffff", "#ffffff"))
        self.assertFalse(_is_hidden_ats_text(11.0, "#ffffff", "#2d3358"))
        self.assertFalse(_is_hidden_ats_text(10.0, "#1a1a1a", "#ffffff"))
        self.assertGreater(_contrast_ratio("#1a1a1a", "#ffffff"), 1.8)


class ExtractLayoutTest(unittest.TestCase):
    def setUp(self):
        self.pdf = _build_sample_pdf()
        if self.pdf is None:
            self.skipTest("PyMuPDF (fitz) indisponible")

    def test_returns_layout_with_blocks(self):
        layout = extract_layout_from_pdf(self.pdf)
        self.assertIsNotNone(layout)
        self.assertEqual(layout["version"], 3)
        self.assertEqual(layout["grid"], "free")
        self.assertEqual(layout["source"], "pdf_structural")
        self.assertGreaterEqual(len(layout["pages"]), 1)

    def test_decomposes_into_independent_blocks(self):
        # Nouvelle approche : la couche graphique est DÉCOMPOSÉE en blocs
        # déplaçables (fonds pleins → shape:rect, etc.) + texte éditable, et le
        # layout reste "freeform" (positions absolues, pas de reflow).
        layout = extract_layout_from_pdf(self.pdf)
        self.assertTrue(layout.get("freeform"))
        blocks = layout["pages"][0]["blocks"]
        types = {b["type"] for b in blocks}
        self.assertIn("text", types)
        # Le bandeau latéral plein est un rectangle indépendant (recolorable).
        self.assertIn("shape:rect", types)

    def test_complex_vector_becomes_shape_circle(self):
        # Une puce vectorielle (cercle plein) → forme circle native, pas une image.
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((40, 60), "Texte de section suffisant pour le seuil natif.", fontsize=11)
        page.insert_text(
            (40, 120), "Deuxieme ligne de contenu pour le minimum requis.", fontsize=11
        )
        page.draw_circle(fitz.Point(60, 200), 4, color=(0.2, 0.2, 0.2), fill=(0.2, 0.2, 0.2))
        data = doc.tobytes()
        doc.close()

        layout = extract_layout_from_pdf(data)
        self.assertIsNotNone(layout)
        blocks = layout["pages"][0]["blocks"]
        bullets = [b for b in blocks if b["type"] == "shape:circle"]
        self.assertGreaterEqual(len(bullets), 1)
        bullet = bullets[0]
        self.assertGreater(bullet["w"], 0)
        self.assertGreater(bullet["h"], 0)
        self.assertIn("color", bullet["style"])

    def test_text_block_has_content_and_position(self):
        layout = extract_layout_from_pdf(self.pdf)
        text_blocks = [b for b in layout["pages"][0]["blocks"] if b["type"] == "text"]
        self.assertTrue(text_blocks)
        joined = " ".join(b.get("content", "") for b in text_blocks)
        self.assertIn("Louis", joined)
        for b in text_blocks:
            self.assertIsInstance(b["x"], (int, float))
            self.assertIsInstance(b["y"], (int, float))
            self.assertLessEqual(b["x"], 210)
            self.assertLessEqual(b["y"], 297)
            self.assertIn("font_size", b["style"])

    def test_font_size_stays_in_points(self):
        # Régression : la taille de police ne doit PAS être convertie en mm.
        # Un titre inséré à 20pt sur une page A4 doit rester ~20pt (>= 18).
        layout = extract_layout_from_pdf(self.pdf)
        text_blocks = [b for b in layout["pages"][0]["blocks"] if b["type"] == "text"]
        title = max(text_blocks, key=lambda b: b["style"].get("font_size", 0))
        self.assertGreaterEqual(title["style"]["font_size"], 18)
        self.assertLessEqual(title["style"]["font_size"], 24)

    def test_separator_line_is_thin_vector_fallback(self):
        # Régression du repli vectoriel (_extract_shape_blocks, utilisé si la
        # rasterisation du fond échoue) : un filet tracé → bloc fin, pas un gros
        # rectangle (fusion du rect englobant du chemin).
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.draw_line(fitz.Point(40, 80), fitz.Point(540, 80), color=(0.5, 0.5, 0.5), width=0.8)
        page.draw_line(fitz.Point(40, 180), fitz.Point(540, 180), color=(0.5, 0.5, 0.5), width=0.8)
        try:
            blocks = _extract_shape_blocks(page, MM_PER_PT)
        finally:
            doc.close()

        lines = [b for b in blocks if b["type"] == "shape:line"]
        self.assertGreaterEqual(len(lines), 1)
        for line in lines:
            self.assertLessEqual(line["h"], 2.0)  # fin, pas un gros bloc
            self.assertGreater(line["w"], 100)  # s'étend sur la largeur
        big = [b for b in blocks if b["type"] == "shape:rect" and b["h"] > 50 and b["w"] > 100]
        self.assertEqual(big, [])

    def test_four_stroke_frame_becomes_separator_line(self):
        """Régression : filet de section en 4 segments (cadre fin) → shape:line."""
        import fitz

        from backend.services.pdf_structural_extract import _separator_block_from_line_items

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        # Rectangle fin horizontal simulé par 4 traits
        y = 100.0
        page.draw_line(fitz.Point(40, y), fitz.Point(540, y), color=(0, 0, 0), width=0.5)
        page.draw_line(
            fitz.Point(40, y + 1.2), fitz.Point(540, y + 1.2), color=(0, 0, 0), width=0.5
        )
        try:
            drawings = page.get_drawings()
            line_items = [it for d in drawings for it in d.get("items", []) if it[0] == "l"]
            blk = _separator_block_from_line_items(line_items, MM_PER_PT, "#000000")
        finally:
            doc.close()

        self.assertIsNotNone(blk)
        self.assertEqual(blk["type"], "shape:line")
        self.assertGreater(blk["w"], 80)

    def test_vertical_separator_line(self):
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.draw_line(fitz.Point(80, 40), fitz.Point(80, 400), color=(0.4, 0.4, 0.4), width=0.8)
        try:
            blocks = _extract_shape_blocks(page, MM_PER_PT)
        finally:
            doc.close()

        vlines = [
            b
            for b in blocks
            if b["type"] == "shape:line" and b["style"].get("orientation") == "vertical"
        ]
        self.assertGreaterEqual(len(vlines), 1)
        line = vlines[0]
        self.assertLessEqual(line["w"], 2.0)
        self.assertGreater(line["h"], 50)

    def test_even_odd_nested_rects_become_thin_underline(self):
        # Régression : deux rectangles imbriqués (remplissage even-odd) =
        # un soulignement de section. Seule la fine différence doit être peinte,
        # PAS deux gros rectangles pleins de ~5mm.
        import fitz

        # Bord bas plus haut de 1.5pt → un seul filet fin en bas, pleine largeur.
        outer = fitz.Rect(10, 100, 160, 105.0)
        inner = fitz.Rect(10, 100, 160, 103.5)
        strips = _frame_strips_from_rects(outer, inner, MM_PER_PT, "#1e2a3a")
        self.assertEqual(len(strips), 1)
        strip = strips[0]
        self.assertEqual(strip["type"], "shape:line")
        self.assertLessEqual(strip["h"], 1.0)  # fin, pas un gros bloc
        self.assertGreater(strip["w"], 40)  # s'étend sur la largeur

    def test_extract_layout_includes_separator_line(self):
        """Régression : filet horizontal importé en bloc shape:line (chemin graphique)."""
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((40, 60), "Titre de section avec assez de texte natif.", fontsize=14)
        page.insert_text(
            (40, 100), "Contenu supplementaire pour le seuil de caracteres.", fontsize=11
        )
        page.draw_line(fitz.Point(40, 130), fitz.Point(540, 130), color=(0.3, 0.3, 0.3), width=0.8)
        data = doc.tobytes()
        doc.close()

        layout = extract_layout_from_pdf(data)
        self.assertIsNotNone(layout)
        lines = [b for b in layout["pages"][0]["blocks"] if b["type"] == "shape:line"]
        self.assertGreaterEqual(len(lines), 1)

    def test_collapse_tracked_caps(self):
        self.assertEqual(_collapse_tracked_caps("ALT E R NANT"), "ALTERNANT")
        self.assertEqual(_collapse_tracked_caps("ESSEC Business School"), "ESSEC Business School")

    def test_merge_keeps_columns_and_joins_words(self):
        words = [
            {
                "x0": 249,
                "y0": 151,
                "x1": 305,
                "y1": 162,
                "spans": [{"text": "Conception ", "size": 10, "flags": 0, "font": "OpenSans"}],
            },
            {
                "x0": 313,
                "y0": 151,
                "x1": 325,
                "y1": 162,
                "spans": [{"text": "et ", "size": 10, "flags": 0, "font": "OpenSans"}],
            },
            {
                "x0": 333,
                "y0": 151,
                "x1": 380,
                "y1": 162,
                "spans": [{"text": "rédaction", "size": 10, "flags": 0, "font": "OpenSans"}],
            },
        ]
        # Trois lignes qui commencent aux mêmes x → deux colonnes, pas une phrase.
        columns = []
        for i in range(3):
            y = 400 + i * 16
            columns.append(
                {
                    "x0": 80,
                    "y0": y,
                    "x1": 130,
                    "y1": y + 11,
                    "spans": [{"text": f"202{i}", "size": 10, "flags": 0, "font": "OpenSans"}],
                }
            )
            columns.append(
                {
                    "x0": 150,
                    "y0": y,
                    "x1": 280,
                    "y1": y + 11,
                    "spans": [{"text": f"Ecole {i}", "size": 10, "flags": 0, "font": "OpenSans"}],
                }
            )
        merged = _merge_baseline_fragments([*words, *columns])
        texts = ["".join(s["text"] for s in frag["spans"]) for frag in merged]
        self.assertTrue(any("Conception" in t and "rédaction" in t for t in texts))
        self.assertEqual(sum(1 for t in texts if t.startswith("202")), 3)
        self.assertEqual(sum(1 for t in texts if t.startswith("Ecole")), 3)

        # Dernier mot d'une phrase longue, posé sur l'ancre des dates : même ligne.
        wrapped = [
            {
                "x0": 80,
                "y0": 500,
                "x1": 143,
                "y1": 511,
                "spans": [
                    {
                        "text": "Writing weekly advertisement emails to 1800 ",
                        "size": 8,
                        "flags": 0,
                        "font": "OpenSans",
                    }
                ],
            },
            {
                "x0": 150,
                "y0": 500,
                "x1": 200,
                "y1": 511,
                "spans": [{"text": "subscribers,", "size": 8, "flags": 0, "font": "OpenSans"}],
            },
        ]
        wrapped_merged = _merge_baseline_fragments([*columns, *wrapped])
        wrapped_text = ["".join(s["text"] for s in frag["spans"]) for frag in wrapped_merged]
        self.assertTrue(any("1800" in t and "subscribers" in t for t in wrapped_text))

    def test_coalesce_paragraph_and_keeps_separate_bullets(self):
        style = {"font_size": 11, "color": "#ffffff", "bold": False, "italic": False}
        summary = [
            {
                "type": "text",
                "content": "Ligne une du resume",
                "x": 100,
                "y": 4,
                "w": 90,
                "h": 5,
                "style": style,
            },
            {
                "type": "text",
                "content": "ligne deux du resume",
                "x": 100,
                "y": 9,
                "w": 90,
                "h": 5,
                "style": style,
            },
        ]
        bullet_style = {"font_size": 10, "color": "#111111", "bold": False, "italic": False}
        bullets = [
            {"type": "shape:circle", "x": 80, "y": 20, "w": 1.2, "h": 1.2},
            {
                "type": "text",
                "content": "Premiere puce debut",
                "x": 84,
                "y": 20,
                "w": 80,
                "h": 4,
                "style": bullet_style,
            },
            {
                "type": "text",
                "content": "suite de la premiere puce",
                "x": 84,
                "y": 24,
                "w": 70,
                "h": 4,
                "style": bullet_style,
            },
            {"type": "shape:circle", "x": 80, "y": 30, "w": 1.2, "h": 1.2},
            {
                "type": "text",
                "content": "Deuxieme puce seule",
                "x": 84,
                "y": 30,
                "w": 80,
                "h": 4,
                "style": bullet_style,
            },
        ]
        out = coalesce_text_runs([*summary, *bullets])
        texts = [b["content"] for b in out if b["type"] == "text"]
        self.assertTrue(any("Ligne une" in t and "ligne deux" in t and "<br>" in t for t in texts))
        self.assertTrue(any("Premiere puce" in t and "suite de la premiere" in t for t in texts))
        self.assertTrue(any(t == "Deuxieme puce seule" for t in texts))

    def test_join_line_span_texts_inserts_space_after_colon(self):
        spans = [
            {"text": "Organisation :", "bbox": (40, 100, 120, 112)},
            {"text": "Loulitos", "bbox": (121, 100, 170, 112)},
        ]
        self.assertEqual(_join_line_span_texts(spans), "Organisation : Loulitos")

    def test_join_line_span_texts_inserts_space_on_gap(self):
        spans = [
            {"text": "Louis", "bbox": (40, 60, 70, 80)},
            {"text": "Vedovato", "bbox": (78, 60, 130, 80)},
        ]
        self.assertEqual(_join_line_span_texts(spans), "Louis Vedovato")

    def test_empty_bytes_returns_none(self):
        self.assertIsNone(extract_layout_from_pdf(b""))

    def test_non_pdf_bytes_returns_none(self):
        self.assertIsNone(extract_layout_from_pdf(b"not a pdf at all"))

    def test_gutter_bullets_align_with_text_lines(self):
        """Cercles à gauche : y recalé sur la ligne, pas sur la suivante."""
        import fitz

        lines = [
            "Mise en place des equipes de ambassadeurs",
            "Gestion et ecoute des membres actifs",
            "Organisation d evenements internes",
            "Gestion des reseaux sociaux de l application",
        ]
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text(
            (40, 50),
            "Header enough characters for native extract threshold xxxxxx",
            fontsize=11,
        )
        for i, line in enumerate(lines):
            y = 120 + i * 14
            page.draw_circle(fitz.Point(48, y - 3), 2.2, color=(0, 0, 0), fill=(0, 0, 0))
            page.insert_text((58, y), line, fontsize=10)
        data = doc.tobytes()
        doc.close()

        layout = extract_layout_from_pdf(data)
        self.assertIsNotNone(layout)
        blocks = layout["pages"][0]["blocks"]
        bullets = sorted(
            [b for b in blocks if b["type"] == "shape:circle"],
            key=lambda b: b["y"],
        )
        texts = sorted(
            [b for b in blocks if b["type"] == "text" and "Header" not in (b.get("content") or "")],
            key=lambda b: b["y"],
        )
        self.assertEqual(len(bullets), 4)
        self.assertEqual(len(texts), 4)
        for bullet, text in zip(bullets, texts, strict=True):
            expected = text["y"] + (text["h"] - bullet["h"]) / 2
            self.assertLess(
                abs(bullet["y"] - expected),
                0.35,
                f"bullet y={bullet['y']} expected={expected:.2f} text={text.get('content')}",
            )
            self.assertLess(bullet["y"], text["y"] + text["h"] * 0.7)

    def test_gutter_bullets_skip_job_title_and_date(self):
        """Titre + date au-dessus de la liste ne doivent pas décaler les puces."""
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text(
            (40, 40),
            "Header enough characters for native extract threshold xxxxxx",
            fontsize=11,
        )
        page.insert_text(
            (58, 90),
            "Co-Presidente - Association HeForShe ESSEC campus",
            fontsize=11,
            fontname="hebo",
        )
        page.insert_text((58, 105), "mai 2024", fontsize=9, fontname="heit")
        bodies = [
            "Mise en place des equipes de ambassadeurs du campus",
            "Gestion et ecoute des membres et partenaires",
            "Organisation d evenements internes et webinaires",
        ]
        for i, line in enumerate(bodies):
            y = 130 + i * 14
            page.draw_circle(fitz.Point(48, y - 3), 2.2, color=(0, 0, 0), fill=(0, 0, 0))
            page.insert_text((58, y), line, fontsize=10)
        data = doc.tobytes()
        doc.close()

        layout = extract_layout_from_pdf(data)
        self.assertIsNotNone(layout)
        blocks = layout["pages"][0]["blocks"]
        bullets = sorted(
            [b for b in blocks if b["type"] == "shape:circle"],
            key=lambda b: b["y"],
        )
        first_body = next(
            b for b in blocks if b["type"] == "text" and "Mise en place" in (b.get("content") or "")
        )
        self.assertEqual(len(bullets), 3)
        expected = first_body["y"] + (first_body["h"] - bullets[0]["h"]) / 2
        self.assertLess(abs(bullets[0]["y"] - expected), 0.4)
        title = next(b for b in blocks if "HeForShe" in (b.get("content") or ""))
        self.assertGreater(bullets[0]["y"], title["y"] + 2)

    def test_hidden_ats_keywords_stay_out_of_the_layout(self):
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.draw_rect(fitz.Rect(0, 0, 595, 80), color=None, fill=(0.18, 0.20, 0.35))
        page.insert_text((40, 40), "Camille Martin", fontsize=16, color=(1, 1, 1))
        page.insert_text(
            (40, 120),
            "Experience en gestion de projet et analyse de donnees pour des equipes produit.",
            fontsize=11,
            color=(0.1, 0.1, 0.1),
        )
        page.insert_text(
            (40, 780),
            "mots cles caches pour un parseur automatique de candidatures",
            fontsize=2,
            color=(0.94, 0.94, 0.94),
        )
        data = doc.tobytes()
        doc.close()

        layout = extract_layout_from_pdf(data)
        self.assertIsNotNone(layout)
        blob = " ".join(
            str(block.get("content") or "") for page in layout["pages"] for block in page["blocks"]
        )
        self.assertIn("Camille Martin", blob)
        self.assertIn("gestion de projet", blob)
        self.assertNotIn("parseur automatique", blob)

        visible, hidden = visible_text_excluding_hidden_ats(data)
        self.assertGreaterEqual(hidden, 1)
        self.assertIn("Camille Martin", visible)
        self.assertNotIn("parseur automatique", visible)

    def test_weight_stays_uniform_inside_a_word(self):
        island = _spans_to_html(
            [
                {"text": "Bia", "font": "DMSans-Regular", "flags": 0},
                {"text": "nca", "font": "DMSans-Bold", "flags": 16},
            ]
        )
        self.assertNotIn("<strong>", island)
        self.assertIn("Bianca", island)
        mixed = _spans_to_html(
            [
                {"text": "Hello ", "font": "DMSans-Bold", "flags": 16},
                {"text": "world", "font": "DMSans-Regular", "flags": 0},
            ]
        )
        self.assertIn("<strong>Hello</strong>", mixed)
        self.assertNotIn("<strong>world</strong>", mixed)
        self.assertIn("world", mixed)

    def test_minority_color_stays_on_its_fragment(self):
        html = _spans_to_html(
            [
                {"text": "EDGAR", "font": "Montserrat-Bold", "flags": 16, "color": 0x545454},
                {"text": " ", "font": "Montserrat-Bold", "flags": 16, "color": 0x163853},
                {"text": "PRADEL", "font": "Montserrat-Bold", "flags": 16, "color": 0x163853},
            ]
        )
        self.assertIn("color:#545454", html)
        self.assertIn("EDGAR", html)
        self.assertNotIn("color:#163853", html)
        self.assertIn("PRADEL", html)
        links = _spans_to_html(
            [
                {"text": "12 rue des Lilas ", "font": "Times", "flags": 0, "color": 0x000000},
                {"text": "ada@exemple.fr", "font": "Times", "flags": 0, "color": 0x0000FF},
            ]
        )
        self.assertIn("color:#0000ff", links)
        self.assertNotIn("color:#000000", links)
        self.assertIn("12 rue des Lilas", links)

    def test_named_weight_is_not_forced_to_bold(self):
        medium = _spans_to_html(
            [{"text": "Amélie", "font": "Montserrat-Medium", "flags": 4, "size": 30}]
        )
        self.assertIn("font-weight:500", medium)
        self.assertNotIn("<strong>", medium)
        semibold = _spans_to_html(
            [{"text": "Contact", "font": "Montserrat-SemiBold", "flags": 20, "size": 15}]
        )
        self.assertIn("font-weight:600", semibold)
        self.assertNotIn("<strong>", semibold)
        bold = _spans_to_html(
            [{"text": "Titre", "font": "Montserrat-Bold", "flags": 16, "size": 12}]
        )
        self.assertIn("<strong>", bold)

    def test_white_circle_behind_a_photo_stays_a_plate(self):
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=300, height=300)
        page.draw_circle(fitz.Point(100, 80), 36, color=None, fill=(1, 1, 1))
        _clips, plates = _photo_circle_geometry(doc, page)
        self.assertTrue(plates)
        cx, cy, radius, color = plates[0]
        self.assertAlmostEqual(cx, 100, delta=4)
        self.assertAlmostEqual(cy, 80, delta=4)
        self.assertAlmostEqual(radius, 36, delta=4)
        self.assertEqual(color, "#ffffff")

        photo = {
            "type": "image",
            "x": 28.0,
            "y": 20.0,
            "w": 20.0,
            "h": 20.0,
            "style": {"shape": "circle"},
        }
        # Le cercle test fait ~25 mm de diamètre ; la photo est plus petite et concentrique.
        scale = 25.4 / 72
        photo["x"] = (cx - 28) * scale
        photo["y"] = (cy - 28) * scale
        photo["w"] = 56 * scale
        photo["h"] = 56 * scale
        plates_out = _photo_plate_blocks([photo], plates[:1], scale)
        self.assertEqual(len(plates_out), 1)
        self.assertTrue(plates_out[0]["style"]["photo_plate"])
        kept = _cleanup_image_overlay_blocks([*plates_out, photo])
        self.assertTrue(any(b.get("style", {}).get("photo_plate") for b in kept))
        self.assertEqual(photo["style"]["shape"], "circle")

    def test_blank_white_cutout_is_not_a_shape(self):
        import fitz

        white = fitz.Pixmap(fitz.csRGB, 20, 40, bytes([250, 250, 250]) * 20 * 40, False)
        self.assertTrue(_pixmap_is_blank_plate(white))
        dark = fitz.Pixmap(fitz.csRGB, 20, 20, bytes([30, 40, 80]) * 20 * 20, False)
        self.assertFalse(_pixmap_is_blank_plate(dark))

    def test_image_keeps_graphics_state_opacity(self):
        import fitz

        src = fitz.open()
        src_page = src.new_page(width=200, height=200)
        pix = fitz.Pixmap(fitz.csRGB, 8, 8, bytes([70, 120, 180]) * 64, False)
        src_page.insert_image(fitz.Rect(0, 0, 200, 200), pixmap=pix)
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text(
            (40, 70),
            "Experience professionnelle en gestion de projet et en analyse de donnees.",
            fontsize=12,
        )
        page.show_pdf_page(fitz.Rect(0, 180, 500, 700), src, 0)
        page.clean_contents()
        gs_xref = doc.get_new_xref()
        doc.update_object(gs_xref, "<< /Type /ExtGState /ca 0.4 >>")
        page_obj = doc.xref_object(page.xref)
        page_obj = page_obj.replace(
            "/XObject <<",
            f"/ExtGState << /Fade {gs_xref} 0 R >>\n    /XObject <<",
            1,
        )
        doc.update_object(page.xref, page_obj)
        import re

        contents_xref = int(re.search(r"/Contents\s+(\d+)\s+0\s+R", page_obj).group(1))
        stream = doc.xref_stream(contents_xref)
        doc.update_stream(contents_xref, stream.replace(b"/fzFrm0 Do", b"/Fade gs\n/fzFrm0 Do"))
        opacities = _image_paint_opacity(doc, page)
        doc.close()
        src.close()

        self.assertTrue(opacities)
        self.assertAlmostEqual(next(iter(opacities.values())), 0.4, places=2)


class ColumnSplitTest(unittest.TestCase):
    def test_wide_space_run_splits_columns_and_keeps_them_apart(self):
        def glyph(text, x0, x1, font, flags):
            return {
                "c": text,
                "bbox": (x0, 10, x1, 20),
            }

        line = {
            "bbox": (36, 10, 200, 22),
            "spans": [
                {
                    "font": "Times-Roman",
                    "flags": 0,
                    "size": 10,
                    "color": 0,
                    "bbox": (36, 10, 80, 22),
                    "chars": [glyph("2024", 36, 60, "Times-Roman", 0)],
                },
                {
                    "font": "Times-Bold",
                    "flags": 16,
                    "size": 10,
                    "color": 0,
                    "bbox": (90, 10, 140, 22),
                    "chars": [glyph("RWE", 90, 120, "Times-Bold", 16)],
                },
            ],
        }
        pieces = _line_column_fragments(line)
        self.assertEqual(len(pieces), 2)
        self.assertTrue(pieces[1]["column_break"])
        merged = _merge_baseline_fragments(pieces)
        texts = ["".join(span["text"] for span in frag["spans"]) for frag in merged]
        self.assertEqual(texts, ["2024", "RWE"])

    def test_bullet_line_does_not_join_the_title_above(self):
        style = {"font_size": 10, "color": "#000000", "font_family": "Times"}
        out = coalesce_text_runs(
            [
                {
                    "type": "text",
                    "content": "Global Employer Branding Intern",
                    "x": 38,
                    "y": 40,
                    "w": 80,
                    "h": 4,
                    "style": style,
                },
                {
                    "type": "text",
                    "content": "• Analyzed company career websites",
                    "x": 38.6,
                    "y": 44.2,
                    "w": 90,
                    "h": 4,
                    "style": style,
                },
            ]
        )
        texts = [b["content"] for b in out if b["type"] == "text"]
        self.assertEqual(len(texts), 2)
        self.assertTrue(any(t.startswith("•") for t in texts))

    def test_page_rule_is_not_an_underline_and_a_short_stroke_is(self):
        page_w = 600.0
        rule = [
            (36.0, 62.0, 102.0, 63.0),
            (103.0, 62.0, 453.0, 63.0),
            (454.0, 62.0, 579.0, 63.0),
        ]
        email = (310.0, 51.0, 412.0, 51.6)
        self.assertEqual(_filter_underline_marks(rule, page_w), [])
        self.assertEqual(_filter_underline_marks([email], page_w), [email])

    def test_partial_underline_wraps_only_the_covered_span(self):
        spans = [
            {
                "text": "adresse ",
                "x0": 20.0,
                "x1": 80.0,
                "size": 10,
                "flags": 0,
                "font": "Times",
                "color": 0,
            },
            {
                "text": "ada@example.com",
                "x0": 90.0,
                "x1": 180.0,
                "size": 10,
                "flags": 0,
                "font": "Times",
                "color": 255,
            },
        ]
        _mark_underlined_spans(spans, 52.0, [(88.0, 51.0, 182.0, 51.5)], set())
        self.assertEqual(_underline_mode(spans), "partial")
        html = _spans_to_html(spans, underline="partial")
        self.assertIn("<u>", html)
        self.assertIn("ada@example.com", html)
        self.assertNotIn("<u>adresse", html)


if __name__ == "__main__":
    unittest.main()
