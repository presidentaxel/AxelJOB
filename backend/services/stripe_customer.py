"""Client Stripe du compte, avec l'abonnement Free à 0€."""

from __future__ import annotations

import logging
import time

from backend.config import STRIPE_PRICE_ID_FREE, STRIPE_SECRET_KEY
from backend.db import get_user_plan, get_user_stripe_ids, set_user_plan
from backend.services.billing_notifications import stripe_client

logger = logging.getLogger(__name__)

_RETRY_AFTER_SEC = 300.0
_failed_until: dict[str, float] = {}


def ensure_stripe_customer(user_id: str, email: str | None = None) -> str | None:
    """Retrouve ou crée le Customer Stripe et, en plan free, l'abonnement à 0€.

    Un compte Pro n'en reçoit pas un deuxième. Si Stripe ne répond pas, retourne
    None : le compte Auth reste valide et un passage suivant reprend l'id.
    """
    uid = (user_id or "").strip()
    if not uid or uid == "default" or "'" in uid or '"' in uid:
        return None
    customer_id, subscription_id = get_user_stripe_ids(uid)
    plan = get_user_plan(uid) or "free"
    if plan not in ("free", "pro"):
        plan = "free"
    if customer_id and (subscription_id or plan == "pro"):
        return customer_id
    if not STRIPE_SECRET_KEY:
        return customer_id
    now = time.monotonic()
    if _failed_until.get(uid, 0.0) > now:
        return customer_id
    try:
        client = stripe_client(STRIPE_SECRET_KEY)
        if not customer_id:
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
        customer_id = str(customer_id)
        if plan == "pro" or not STRIPE_PRICE_ID_FREE:
            set_user_plan(uid, plan, stripe_customer_id=customer_id)
            _failed_until.pop(uid, None)
            return customer_id
        active_id = _first_active_subscription_id(client, customer_id)
        if not active_id:
            created_sub = client.subscriptions.create(
                params={
                    "customer": customer_id,
                    "items": [{"price": STRIPE_PRICE_ID_FREE}],
                    "metadata": {"user_id": uid, "plan": "free"},
                }
            )
            active_id = getattr(created_sub, "id", None)
        set_user_plan(
            uid,
            "free",
            stripe_customer_id=customer_id,
            stripe_subscription_id=str(active_id) if active_id else None,
        )
        _failed_until.pop(uid, None)
        return customer_id
    except Exception:
        logger.warning("ensure_stripe_customer failed for %s", uid, exc_info=True)
        _failed_until[uid] = now + _RETRY_AFTER_SEC
        return customer_id


def cancel_free_subscriptions(customer_id: str, keep_subscription_id: str | None = None) -> None:
    """Annule les abonnements à 0€ du client, sauf celui qu'on garde (le Pro)."""
    if not customer_id or not STRIPE_SECRET_KEY or not STRIPE_PRICE_ID_FREE:
        return
    client = stripe_client(STRIPE_SECRET_KEY)
    listed = client.subscriptions.list(
        params={"customer": customer_id, "status": "active", "limit": 10}
    )
    for sub in getattr(listed, "data", None) or []:
        sub_id = str(getattr(sub, "id", "") or "")
        if not sub_id or sub_id == (keep_subscription_id or ""):
            continue
        if subscription_price_id(sub) != STRIPE_PRICE_ID_FREE:
            continue
        client.subscriptions.cancel(sub_id)


def subscription_uses_free_price(sub) -> bool:
    """True si l'objet abonnement porte le price Free à 0€."""
    price_id = subscription_price_id(sub)
    return bool(price_id and STRIPE_PRICE_ID_FREE and price_id == STRIPE_PRICE_ID_FREE)


def subscription_price_id(sub) -> str | None:
    items = _attr(sub, "items")
    data = _attr(items, "data") or []
    if not data:
        return None
    price = _attr(data[0], "price")
    if isinstance(price, str):
        return price
    found = _attr(price, "id")
    return str(found) if found else None


def _first_active_subscription_id(client, customer_id: str) -> str | None:
    listed = client.subscriptions.list(
        params={"customer": customer_id, "status": "active", "limit": 10}
    )
    for sub in getattr(listed, "data", None) or []:
        sub_id = getattr(sub, "id", None)
        if sub_id:
            return str(sub_id)
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


def _attr(obj, name: str):
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)
