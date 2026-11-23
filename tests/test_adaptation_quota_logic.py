"""Comptages quota adaptations (sans dépendre de Supabase ni de pytest en optionnel)."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import db, main


class TestAdaptationQuotaRow(unittest.TestCase):
    def test_manual_prefix_excluded(self):
        self.assertFalse(
            db._application_counts_toward_adaptation_quota(
                "manual_abc123",
                {"full_cv": {"nom": "X"}, "archived": False},
            )
        )

    def test_requires_non_empty_full_cv(self):
        self.assertFalse(
            db._application_counts_toward_adaptation_quota(
                "adapt_123",
                {"archived": False},
            )
        )
        self.assertFalse(
            db._application_counts_toward_adaptation_quota(
                "adapt_123",
                {"full_cv": {}, "archived": False},
            )
        )

    def test_archived_counts(self):
        self.assertTrue(
            db._application_counts_toward_adaptation_quota(
                "adapt_123",
                {"full_cv": {"nom": "X"}, "archived": True},
            )
        )

    def test_ai_row_counts(self):
        self.assertTrue(
            db._application_counts_toward_adaptation_quota(
                "adapt_123",
                {"full_cv": {"nom": "X"}, "archived": False},
            )
        )


class TestActiveApplicationRow(unittest.TestCase):
    def test_archived_inactive(self):
        self.assertFalse(db._application_is_active_non_archived({"archived": True}))

    def test_active_default(self):
        self.assertTrue(db._application_is_active_non_archived({}))
        self.assertTrue(db._application_is_active_non_archived({"archived": False}))


class TestArchivedStillCountsEndToEnd(unittest.TestCase):
    """AXE-1101 : 3 adaptations archivées, la 4e est refusée (402)."""

    def test_fourth_adaptation_refused_after_archiving_three(self):
        with tempfile.TemporaryDirectory() as tmp:
            for i in range(3):
                Path(tmp, f"adapt_{i}.json").write_text(
                    json.dumps({"user_id": "u1", "full_cv": {"nom": "X"}, "archived": True}),
                    encoding="utf-8",
                )
            with (
                patch.object(db, "ADAPTATIONS_DIR", Path(tmp)),
                patch.object(db, "_get_supabase", return_value=None),
            ):
                self.assertEqual(db.count_quota_adaptations("u1"), 3)
                self.assertEqual(db.count_active_applications("u1"), 0)
                with (
                    patch.object(main, "get_user_plan", return_value="free"),
                    patch.object(main, "get_paywall_disabled", return_value=False),
                    patch.object(main, "get_free_adaptation_count_anchor", return_value=0),
                    patch.object(main, "get_free_adaptation_bonus", return_value=0),
                    patch.object(main, "count_quota_adaptations", db.count_quota_adaptations),
                    self.assertRaises(HTTPException) as ctx,
                ):
                    main._enforce_free_adaptations_quota("u1")
        self.assertEqual(ctx.exception.status_code, 402)
