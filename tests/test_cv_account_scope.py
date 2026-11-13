"""AXE-498 : GET /api/cv?profile=1 ne sert pas le CV d'un autre compte."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from backend import main


class _FakeRequest:
    def __init__(self, auth_header: str | None = None):
        self.headers = {}
        if auth_header is not None:
            self.headers["Authorization"] = auth_header
        self.state = SimpleNamespace()


class TestCvProfileScopedToJwtUser(unittest.TestCase):
    def test_profile_without_user_does_not_load_the_shared_default_row(self):
        req = _FakeRequest()
        with (
            patch.object(main, "USE_SUPABASE", False),
            patch.object(main, "_get_user_id", return_value=None),
            patch.object(main, "load_cv_base") as load,
        ):
            out = main.api_cv(req, profile=True)
        self.assertEqual(out, {})
        load.assert_not_called()

    def test_profile_loads_the_jwt_user_row(self):
        req = _FakeRequest("Bearer token")
        with (
            patch.object(main, "USE_SUPABASE", True),
            patch.object(main, "_get_user_id", return_value="user-b"),
            patch.object(main, "load_cv_base", return_value={}) as load,
            patch("backend.db.get_cv_photo_public_url_for_user", return_value=None),
        ):
            out = main.api_cv(req, profile=True)
        self.assertEqual(out, {})
        load.assert_called_once_with("user-b")

    def test_profile_without_session_is_unauthorized_when_supabase_is_on(self):
        req = _FakeRequest()
        with (
            patch.object(main, "USE_SUPABASE", True),
            patch.object(main, "_get_user_id", return_value=None),
            patch.object(main, "load_cv_base") as load,
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cv(req, profile=True)
        self.assertEqual(ctx.exception.status_code, 401)
        load.assert_not_called()
