"""Repères d'inactivité (AXE-507). Pas de donnée personnelle."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

# Historique des connexions conservé 12 mois, puis purgé.
SIGN_IN_RETENTION_MONTHS = 12
INACTIVE_DAYS = (60, 90)


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_older_than(value: datetime | None, now: datetime, days: int) -> bool:
    """Vrai s'il n'y a pas d'horodatage, ou s'il date d'au moins `days` jours."""
    moment = as_utc(value)
    if moment is None:
        return True
    return moment <= as_utc(now) - timedelta(days=days)


def inactivity_flags(
    last_sign_in: datetime | None,
    last_product: datetime | None,
    now: datetime,
) -> dict[str, bool]:
    """Le compte est inactif si connexion ET action produit sont toutes les deux anciennes."""
    flags: dict[str, bool] = {}
    for days in INACTIVE_DAYS:
        flags[f"inactive_{days}"] = is_older_than(last_sign_in, now, days) and is_older_than(
            last_product, now, days
        )
    return flags
