"""Lecture des comptes inactifs et journal d'envoi (AXE-508).

Le journal garde l'identifiant et la date. Pas le corps du mail, pas l'adresse.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from backend.services.inactivity_reminders import as_utc, should_send_reminder

logger = logging.getLogger(__name__)

_USER_ID = re.compile(r"^[0-9a-fA-F-]{32,36}$")
SEND_CAP = 100


class InactivityReminderUnavailable(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _pool():
    from backend.supabase_pg import get_pool

    pool = get_pool()
    if not pool:
        raise InactivityReminderUnavailable("unavailable")
    return pool


def _missing_table(exc: Exception) -> bool:
    text = str(exc).lower()
    return "inactivity_reminder_sends" in text and "does not exist" in text


_ROWS_SQL = """
    SELECT
      u.id::text AS user_id,
      (
        COALESCE(p.plan, 'free') = 'pro'
        AND NULLIF(btrim(COALESCE(p.stripe_subscription_id, '')), '') IS NOT NULL
      ) AS paying,
      u.last_sign_in_at AS last_sign_in_at,
      GREATEST(cv.updated_at, apps.last_app) AS last_product_at,
      rem.last_reminder_at AS last_reminder_at
    FROM auth.users u
    LEFT JOIN public.user_plans p ON p.user_id = u.id::text
    LEFT JOIN public.cv_base cv ON cv.id = u.id::text
    LEFT JOIN LATERAL (
      SELECT max(a.updated_at) AS last_app
      FROM public.applications a
      WHERE a.user_id = u.id::text
    ) apps ON true
    LEFT JOIN LATERAL (
      SELECT max(r.sent_at) AS last_reminder_at
      FROM public.inactivity_reminder_sends r
      WHERE r.user_id = u.id::text AND r.kind = 'reminder'
    ) rem ON true
    WHERE (%s::uuid IS NULL OR u.id = %s::uuid)
"""


def _load_rows(user_id: str | None = None) -> list[dict]:
    pool = _pool()
    try:
        from psycopg.rows import dict_row

        with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_ROWS_SQL, (user_id, user_id))
            return list(cur.fetchall() or [])
    except Exception as exc:
        if _missing_table(exc):
            raise InactivityReminderUnavailable("migration_required") from exc
        logger.info("inactivity reminder load failed: %s", type(exc).__name__)
        raise InactivityReminderUnavailable("unavailable") from exc


def eligible_user_ids(*, days: int, now: datetime | None = None) -> list[str]:
    moment = as_utc(now or datetime.now(timezone.utc))
    chosen = []
    for row in _load_rows():
        if should_send_reminder(
            paying=bool(row.get("paying")),
            last_sign_in=row.get("last_sign_in_at"),
            last_product=row.get("last_product_at"),
            last_reminder_at=row.get("last_reminder_at"),
            now=moment,
            days=days,
        ):
            user_id = str(row.get("user_id") or "")
            if _USER_ID.match(user_id):
                chosen.append(user_id)
    return chosen


def claim_reminder(user_id: str, *, days: int, now: datetime | None = None) -> int | None:
    """Réserve l'envoi avant Resend. None si un autre envoi a déjà pris ce compte."""
    uid = (user_id or "").strip()
    if not _USER_ID.match(uid):
        raise ValueError("identifiant de compte invalide")
    moment = as_utc(now or datetime.now(timezone.utc))
    pool = _pool()
    try:
        with pool.connection() as conn:
            with conn.transaction():
                from psycopg.rows import dict_row

                with conn.cursor(row_factory=dict_row) as cur:
                    cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (uid,))
                    cur.fetchone()
                    cur.execute(_ROWS_SQL, (uid, uid))
                    row = cur.fetchone()
                    if row is None or not should_send_reminder(
                        paying=bool(row.get("paying")),
                        last_sign_in=row.get("last_sign_in_at"),
                        last_product=row.get("last_product_at"),
                        last_reminder_at=row.get("last_reminder_at"),
                        now=moment,
                        days=days,
                    ):
                        return None
                    cur.execute(
                        """
                        INSERT INTO public.inactivity_reminder_sends (user_id, kind)
                        VALUES (%s, 'reminder')
                        RETURNING id
                        """,
                        (uid,),
                    )
                    claimed = cur.fetchone()
                return int(claimed["id"]) if claimed else None
    except InactivityReminderUnavailable:
        raise
    except Exception as exc:
        if _missing_table(exc):
            raise InactivityReminderUnavailable("migration_required") from exc
        logger.info("inactivity reminder claim failed: %s", type(exc).__name__)
        raise InactivityReminderUnavailable("unavailable") from exc


def release_claim(claim_id: int) -> None:
    """Retire une réservation si l'envoi n'a pas abouti."""
    pool = _pool()
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM public.inactivity_reminder_sends
                WHERE id = %s AND kind = 'reminder'
                """,
                (int(claim_id),),
            )
            conn.commit()
    except Exception as exc:
        if _missing_table(exc):
            raise InactivityReminderUnavailable("migration_required") from exc
        logger.info("inactivity reminder release failed: %s", type(exc).__name__)
        raise InactivityReminderUnavailable("unavailable") from exc


def record_send(user_id: str, *, kind: str) -> None:
    uid = (user_id or "").strip()
    if not _USER_ID.match(uid):
        raise ValueError("identifiant de compte invalide")
    if kind not in ("reminder", "test"):
        raise ValueError("type d'envoi invalide")
    pool = _pool()
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.inactivity_reminder_sends (user_id, kind)
                VALUES (%s, %s)
                """,
                (uid, kind),
            )
            conn.commit()
    except Exception as exc:
        if _missing_table(exc):
            raise InactivityReminderUnavailable("migration_required") from exc
        logger.info("inactivity reminder journal failed: %s", type(exc).__name__)
        raise InactivityReminderUnavailable("unavailable") from exc
    logger.info("inactivity_reminder sent user_id=%s kind=%s", uid, kind)


def list_journal(*, limit: int = 50) -> list[dict]:
    cap = max(1, min(int(limit), 100))
    pool = _pool()
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id, sent_at, kind
                FROM public.inactivity_reminder_sends
                ORDER BY sent_at DESC
                LIMIT %s
                """,
                (cap,),
            )
            rows = cur.fetchall() or []
    except Exception as exc:
        if _missing_table(exc):
            raise InactivityReminderUnavailable("migration_required") from exc
        logger.info("inactivity reminder journal read failed: %s", type(exc).__name__)
        raise InactivityReminderUnavailable("unavailable") from exc
    items = []
    for user_id, sent_at, kind in rows:
        moment = as_utc(sent_at)
        items.append(
            {
                "user_id": user_id,
                "sent_at": moment.isoformat() if moment else None,
                "kind": kind,
            }
        )
    return items


def send_cap() -> int:
    return SEND_CAP


def auth_email(user_id: str) -> str | None:
    """Adresse utilisée uniquement pour l'appel Resend. Ne pas la journaliser."""
    uid = (user_id or "").strip()
    if not _USER_ID.match(uid):
        return None
    pool = _pool()
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT email FROM auth.users WHERE id = %s::uuid LIMIT 1", (uid,))
            row = cur.fetchone()
    except Exception as exc:
        logger.info("inactivity reminder recipient lookup failed: %s", type(exc).__name__)
        return None
    if not row or not row[0]:
        return None
    return str(row[0]).strip() or None
