"""Supprime le compte Auth et les données CV de cet utilisateur seulement."""

from __future__ import annotations

import logging
import re

from fastapi import HTTPException

logger = logging.getLogger(__name__)

_USER_ID = re.compile(r"^[0-9a-fA-F-]{32,36}$")

# Chaque requête filtre l'identifiant du JWT. Aucune n'est globale.
OWNED_ROW_DELETES: tuple[tuple[str, str, str], ...] = (
    ("cv_base", "id", "DELETE FROM public.cv_base WHERE id = %s"),
    ("applications", "user_id", "DELETE FROM public.applications WHERE user_id = %s"),
    ("user_plans", "user_id", "DELETE FROM public.user_plans WHERE user_id = %s"),
    ("gemini_usage", "user_id", "DELETE FROM public.gemini_usage WHERE user_id = %s"),
    ("cv_templates", "owner_user_id", "DELETE FROM public.cv_templates WHERE owner_user_id = %s"),
)


_ACTIVE_SUBSCRIPTION = frozenset({"active", "trialing"})


def subscription_is_active(status: str | None) -> bool:
    """Un abonnement Stripe encore facturable (actif ou essai)."""
    return (status or "").strip().lower() in _ACTIVE_SUBSCRIPTION


def assert_subscription_cancel_confirmed(status: str | None, confirmed: bool) -> None:
    """Refuse la suppression tant que l'abonnement actif n'est pas explicitement annulé."""
    if subscription_is_active(status) and not confirmed:
        raise HTTPException(
            status_code=400,
            detail="Confirme l'annulation de l'abonnement avant de supprimer le compte.",
        )


def owned_delete_params(user_id: str) -> list[tuple[str, tuple[str, ...]]]:
    """SQL paramétré limité à user_id. Refuse un id vide ou le profil local « default »."""
    uid = (user_id or "").strip()
    if uid == "default" or not _USER_ID.fullmatch(uid):
        raise HTTPException(status_code=400, detail="Connecte-toi pour supprimer ton compte.")
    return [(sql, (uid,)) for _table, _column, sql in OWNED_ROW_DELETES]


def _delete_rows(user_id: str) -> None:
    from backend.db import _get_supabase
    from backend.supabase_pg import get_pool

    statements = owned_delete_params(user_id)
    pool = get_pool()
    if pool:
        with pool.connection() as conn:
            for sql, params in statements:
                try:
                    with conn.transaction():
                        with conn.cursor() as cur:
                            cur.execute(sql, params)
                except Exception as exc:
                    logger.warning("account delete row skipped: %s", type(exc).__name__)
        return
    sb = _get_supabase()
    if not sb:
        return
    for table, column, _sql in OWNED_ROW_DELETES:
        try:
            sb.table(table).delete().eq(column, user_id).execute()
        except Exception as exc:
            logger.warning("account delete rest %s skipped: %s", table, type(exc).__name__)


def delete_my_account(user_id: str) -> None:
    """Efface les lignes de ce compte, puis l'utilisateur Auth. Pas les autres comptes."""
    owned_delete_params(user_id)
    from backend.db import _get_supabase

    sb = _get_supabase()
    if not sb:
        raise HTTPException(
            status_code=503,
            detail="Suppression du compte indisponible pour le moment. Réessaie plus tard.",
        )
    _delete_rows(user_id)
    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as exc:
        logger.warning("account auth delete failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="Suppression du compte indisponible pour le moment. Réessaie plus tard.",
        ) from exc
