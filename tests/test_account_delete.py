"""La suppression de compte ne vise que l'utilisateur demandé."""

import pytest
from fastapi import HTTPException

from backend.services.account_delete import OWNED_ROW_DELETES, owned_delete_params

_UID = "11111111-1111-1111-1111-111111111111"
_OTHER = "22222222-2222-2222-2222-222222222222"


def test_statements_are_scoped_to_the_jwt_user() -> None:
    statements = owned_delete_params(_UID)
    assert len(statements) == len(OWNED_ROW_DELETES)
    for sql, params in statements:
        assert "WHERE" in sql
        assert params == (_UID,)
        assert _OTHER not in sql
        assert "default" not in sql


def test_default_profile_is_refused() -> None:
    with pytest.raises(HTTPException) as exc:
        owned_delete_params("default")
    assert exc.value.status_code == 400


def test_empty_user_is_refused() -> None:
    with pytest.raises(HTTPException) as exc:
        owned_delete_params("")
    assert exc.value.status_code == 400
