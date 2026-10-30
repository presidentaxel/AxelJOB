"""Persistance des connexions et lecture admin (AXE-507).

Aucun e-mail, aucune adresse : seulement l'identifiant de compte et des dates.
L'historique `user_sign_ins` est conservé 12 mois.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from backend.services.account_activity import (
    SIGN_IN_RETENTION_MONTHS,
    as_utc,
    inactivity_flags,
)

logger = logging.getLogger(__name__)

_USER_ID = re.compile(r"^[0-9a-fA-F-]{32,36}$")


class AccountActivityUnavailable(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _validate_user_id(user_id: str) -> str:
    uid = (user_id or "").strip()
    if not _USER_ID.match(uid):
        raise ValueError("identifiant de compte invalide")
    return uid


def _pool():
    from backend.supabase_pg import get_pool

    pool = get_pool()
    if not pool:
        raise AccountActivityUnavailable("unavailable")
    return pool


def _is_missing_table(exc: Exception) -> bool:
    text = str(exc).lower()
    return "user_sign_ins" in text and "does not exist" in text


def record_user_sign_in(user_id: str, *, now: datetime | None = None) -> bool:
    """Enregistre une connexion. Ignore un doublon dans les 2 minutes. Purge au-delà de 12 mois."""
    uid = _validate_user_id(user_id)
    moment = as_utc(now or datetime.now(timezone.utc))
    pool = _pool()
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM public.user_sign_ins
                WHERE signed_in_at < now() - interval '12 months'
                """
            )
            cur.execute(
                """
                SELECT 1
                FROM public.user_sign_ins
                WHERE user_id = %s::uuid
                  AND signed_in_at > %s::timestamptz - interval '2 minutes'
                LIMIT 1
                """,
                (uid, moment),
            )
            if cur.fetchone():
                conn.commit()
                return False
            cur.execute(
                """
                INSERT INTO public.user_sign_ins (user_id, signed_in_at)
                VALUES (%s::uuid, %s::timestamptz)
                """,
                (uid, moment),
            )
            conn.commit()
        return True
    except AccountActivityUnavailable:
        raise
    except Exception as exc:
        if _is_missing_table(exc):
            raise AccountActivityUnavailable("migration_required") from exc
        logger.info("record_user_sign_in failed: %s", type(exc).__name__)
        raise AccountActivityUnavailable("unavailable") from exc


_ACCOUNTS_SQL = """
    SELECT
      u.id::text AS user_id,
      COALESCE(p.plan, 'free') AS plan,
      (
        COALESCE(p.plan, 'free') = 'pro'
        AND NULLIF(btrim(COALESCE(p.stripe_subscription_id, '')), '') IS NOT NULL
      ) AS paying,
      GREATEST(u.last_sign_in_at, signs.last_sign_in) AS last_sign_in_at,
      GREATEST(cv.updated_at, apps.last_app) AS last_product_at
    FROM auth.users u
    LEFT JOIN public.user_plans p ON p.user_id = u.id::text
    LEFT JOIN public.cv_base cv ON cv.id = u.id::text
    LEFT JOIN LATERAL (
      SELECT max(s.signed_in_at) AS last_sign_in
      FROM public.user_sign_ins s
      WHERE s.user_id = u.id
    ) signs ON true
    LEFT JOIN LATERAL (
      SELECT max(a.updated_at) AS last_app
      FROM public.applications a
      WHERE a.user_id = u.id::text
    ) apps ON true
    WHERE true
    ORDER BY last_sign_in_at NULLS FIRST
    LIMIT %s
"""

_PAYING_ACCOUNTS_SQL = """
    SELECT
      u.id::text AS user_id,
      COALESCE(p.plan, 'free') AS plan,
      (
        COALESCE(p.plan, 'free') = 'pro'
        AND NULLIF(btrim(COALESCE(p.stripe_subscription_id, '')), '') IS NOT NULL
      ) AS paying,
      GREATEST(u.last_sign_in_at, signs.last_sign_in) AS last_sign_in_at,
      GREATEST(cv.updated_at, apps.last_app) AS last_product_at
    FROM auth.users u
    LEFT JOIN public.user_plans p ON p.user_id = u.id::text
    LEFT JOIN public.cv_base cv ON cv.id = u.id::text
    LEFT JOIN LATERAL (
      SELECT max(s.signed_in_at) AS last_sign_in
      FROM public.user_sign_ins s
      WHERE s.user_id = u.id
    ) signs ON true
    LEFT JOIN LATERAL (
      SELECT max(a.updated_at) AS last_app
      FROM public.applications a
      WHERE a.user_id = u.id::text
    ) apps ON true
    WHERE COALESCE(p.plan, 'free') = 'pro'
      AND NULLIF(btrim(COALESCE(p.stripe_subscription_id, '')), '') IS NOT NULL
    ORDER BY last_sign_in_at NULLS FIRST
    LIMIT %s
"""


def list_account_activity(*, paying_only: bool, limit: int = 200) -> dict:
    """Liste admin : dernière connexion, dernière action produit, repères 60/90 jours."""
    cap = max(1, min(int(limit), 200))
    pool = _pool()
    now = datetime.now(timezone.utc)
    sql = _PAYING_ACCOUNTS_SQL if paying_only else _ACCOUNTS_SQL
    try:
        from psycopg.rows import dict_row

        with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (cap,))
            rows = cur.fetchall() or []
    except Exception as exc:
        if _is_missing_table(exc):
            raise AccountActivityUnavailable("migration_required") from exc
        logger.info("list_account_activity failed: %s", type(exc).__name__)
        raise AccountActivityUnavailable("unavailable") from exc

    accounts = []
    for row in rows:
        last_sign_in = as_utc(row.get("last_sign_in_at"))
        last_product = as_utc(row.get("last_product_at"))
        flags = inactivity_flags(last_sign_in, last_product, now)
        accounts.append(
            {
                "user_id": row.get("user_id"),
                "plan": row.get("plan") or "free",
                "paying": bool(row.get("paying")),
                "last_sign_in_at": last_sign_in.isoformat() if last_sign_in else None,
                "last_product_at": last_product.isoformat() if last_product else None,
                **flags,
            }
        )
    return {
        "retention_months": SIGN_IN_RETENTION_MONTHS,
        "paying_only": paying_only,
        "accounts": accounts,
    }


def list_sign_ins(user_id: str, *, limit: int = 100) -> dict:
    uid = _validate_user_id(user_id)
    cap = max(1, min(int(limit), 200))
    pool = _pool()
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT signed_in_at
                FROM public.user_sign_ins
                WHERE user_id = %s::uuid
                  AND signed_in_at >= now() - interval '12 months'
                ORDER BY signed_in_at DESC
                LIMIT %s
                """,
                (uid, cap),
            )
            rows = cur.fetchall() or []
    except Exception as exc:
        if _is_missing_table(exc):
            raise AccountActivityUnavailable("migration_required") from exc
        logger.info("list_sign_ins failed: %s", type(exc).__name__)
        raise AccountActivityUnavailable("unavailable") from exc
    moments = []
    for row in rows:
        moment = as_utc(row[0])
        if moment:
            moments.append(moment.isoformat())
    return {
        "user_id": uid,
        "retention_months": SIGN_IN_RETENTION_MONTHS,
        "sign_ins": moments,
    }
