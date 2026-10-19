"""Client Stripe créé à l'auth, sans abonnement."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services import stripe_customer


def _reset_failures():
    stripe_customer._failed_until.clear()


def test_existing_customer_is_not_created_again():
    _reset_failures()
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=("cus_123", None)),
        patch.object(stripe_customer, "stripe_client") as factory,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1", "a@b.c") == "cus_123"
    factory.assert_not_called()


def test_creates_free_customer_without_subscription():
    _reset_failures()
    client = MagicMock()
    client.customers.search.return_value = SimpleNamespace(data=[])
    client.checkout.sessions.list.return_value = SimpleNamespace(data=[])
    client.customers.create.return_value = SimpleNamespace(id="cus_new")
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=(None, None)),
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "stripe_client", return_value=client),
        patch.object(stripe_customer, "get_user_plan", return_value="free"),
        patch.object(stripe_customer, "set_user_plan") as set_plan,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1", "a@b.c") == "cus_new"
    client.customers.create.assert_called_once_with(
        params={"metadata": {"user_id": "user-1"}, "email": "a@b.c"},
        options={"idempotency_key": "axeljob-customer-user-1"},
    )
    client.subscriptions.create.assert_not_called()
    set_plan.assert_called_once_with("user-1", "free", stripe_customer_id="cus_new")


def test_reuses_customer_found_by_metadata():
    _reset_failures()
    client = MagicMock()
    client.customers.search.return_value = SimpleNamespace(data=[SimpleNamespace(id="cus_old")])
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=(None, None)),
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "stripe_client", return_value=client),
        patch.object(stripe_customer, "get_user_plan", return_value="pro"),
        patch.object(stripe_customer, "set_user_plan") as set_plan,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1") == "cus_old"
    client.customers.create.assert_not_called()
    set_plan.assert_called_once_with("user-1", "pro", stripe_customer_id="cus_old")


def test_stripe_failure_does_not_raise_and_retries_later():
    _reset_failures()
    client = MagicMock()
    client.customers.search.side_effect = RuntimeError("stripe down")
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=(None, None)),
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "stripe_client", return_value=client),
        patch.object(stripe_customer, "set_user_plan") as set_plan,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1") is None
        assert stripe_customer.ensure_stripe_customer("user-1") is None
    set_plan.assert_not_called()
    assert client.customers.search.call_count == 1
