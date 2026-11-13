"""Éligibilité au mail de rappel de résiliation (AXE-508).

« Rien fait » = pas de connexion et pas d'écriture produit depuis le seuil.
Un seul mail par période d'inactivité. Un retour ou une résiliation bloque l'envoi.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_older_than(value: datetime | None, now: datetime, days: int) -> bool:
    moment = as_utc(value)
    if moment is None:
        return True
    return moment <= as_utc(now) - timedelta(days=days)


def is_quiet(last_sign_in, last_product, now: datetime, days: int) -> bool:
    return is_older_than(last_sign_in, now, days) and is_older_than(last_product, now, days)


def should_send_reminder(
    *,
    paying: bool,
    last_sign_in: datetime | None,
    last_product: datetime | None,
    last_reminder_at: datetime | None,
    now: datetime,
    days: int,
) -> bool:
    if not paying:
        return False
    if not is_quiet(last_sign_in, last_product, now, days):
        return False
    if last_reminder_at is None:
        return True
    reminder = as_utc(last_reminder_at)
    moments = [m for m in (as_utc(last_sign_in), as_utc(last_product)) if m is not None]
    if not moments:
        return False
    return max(moments) > reminder
