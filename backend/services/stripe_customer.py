"""Client Stripe du compte, créé dès l'auth, sans abonnement Free."""

from __future__ import annotations

import logging
import time

from backend.config import STRIPE_SECRET_KEY
from backend.db import get_user_plan, get_user_stripe_ids, set_user_plan
from backend.services.billing_notifications import stripe_client

logger = logging.getLogger(__name__)

_RETRY_AFTER_SEC = 300.0
_failed_until: dict[str, float] = {}


def ensure_stripe_customer(user_id: str, email: str | None = None) -> str | None:
    """Retrouve ou crée le Customer Stripe et l'écrit dans user_plans.

    Aucune subscription n'est ouverte. Si Stripe ne répond pas, retourne None :
    le compte Auth reste valide et un passage suivant reprend l'id.
    """
    uid = (user_id or "").strip()
    if not uid or uid == "default" or "'" in uid or '"' in uid:
        return None
    existing, _subscription_id = get_user_stripe_ids(uid)
    if existing:
        return existing
    if not STRIPE_SECRET_KEY:
        return None
    now = time.monotonic()
    if _failed_until.get(uid, 0.0) > now:
        return None
    try:
        client = stripe_client(STRIPE_SECRET_KEY)
        customer_id = _find_customer_id(client, uid)
        if not customer_id:
            params: dict[str, object] = {"metadata": {"user_id": uid}}
            mail = (email or "").strip()
            if mail:
                params["email"] = mail
            created = client.customers.create(
                params=params,
                options={"idempotency_key": f"axeljob-customer-{uid}"},
            )
            customer_id = getattr(created, "id", None)
        if not customer_id:
            return None
        plan = get_user_plan(uid) or "free"
        if plan not in ("free", "pro"):
            plan = "free"
        set_user_plan(uid, plan, stripe_customer_id=str(customer_id))
        _failed_until.pop(uid, None)
        return str(customer_id)
    except Exception:
        logger.warning("ensure_stripe_customer failed for %s", uid, exc_info=True)
        _failed_until[uid] = now + _RETRY_AFTER_SEC
        return None


def _find_customer_id(client, user_id: str) -> str | None:
    customers = client.customers.search(params={"query": f"metadata['user_id']:'{user_id}'"})
    data = getattr(customers, "data", None) or []
    if data:
        found = getattr(data[0], "id", None)
        if found:
            return str(found)
    sessions = client.checkout.sessions.list(params={"limit": 100})
    for session in getattr(sessions, "data", None) or []:
        if getattr(session, "client_reference_id", None) != user_id:
            continue
        customer = getattr(session, "customer", None)
        if not customer:
            continue
        if isinstance(customer, str):
            return customer
        found = getattr(customer, "id", None)
        if found:
            return str(found)
    return None
