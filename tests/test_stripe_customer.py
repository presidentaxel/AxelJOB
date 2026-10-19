"""Client Stripe créé à l'auth, avec l'abonnement Free à 0€."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services import stripe_customer

FREE_PRICE = "price_1USHy0JGqri52lIWa3xd5Ha3"


def _reset_failures():
    stripe_customer._failed_until.clear()


def test_existing_customer_and_subscription_are_not_created_again():
    _reset_failures()
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=("cus_123", "sub_free")),
        patch.object(stripe_customer, "get_user_plan", return_value="free"),
        patch.object(stripe_customer, "stripe_client") as factory,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1", "a@b.c") == "cus_123"
    factory.assert_not_called()


def test_creates_free_customer_and_zero_subscription():
    _reset_failures()
    client = MagicMock()
    client.customers.search.return_value = SimpleNamespace(data=[])
    client.checkout.sessions.list.return_value = SimpleNamespace(data=[])
    client.customers.create.return_value = SimpleNamespace(id="cus_new")
    client.subscriptions.list.return_value = SimpleNamespace(data=[])
    client.subscriptions.create.return_value = SimpleNamespace(id="sub_free")
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=(None, None)),
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "STRIPE_PRICE_ID_FREE", FREE_PRICE),
        patch.object(stripe_customer, "stripe_client", return_value=client),
        patch.object(stripe_customer, "get_user_plan", return_value="free"),
        patch.object(stripe_customer, "attach_user_stripe_ids") as set_plan,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1", "a@b.c") == "cus_new"
    client.customers.create.assert_called_once()
    client.subscriptions.create.assert_called_once_with(
        params={
            "customer": "cus_new",
            "items": [{"price": FREE_PRICE}],
            "metadata": {"user_id": "user-1", "plan": "free"},
        }
    )
    set_plan.assert_called_once_with(
        "user-1",
        "cus_new",
        stripe_subscription_id="sub_free",
    )


def test_existing_customer_without_subscription_gets_the_free_price():
    _reset_failures()
    client = MagicMock()
    client.subscriptions.list.return_value = SimpleNamespace(data=[])
    client.subscriptions.create.return_value = SimpleNamespace(id="sub_free")
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=("cus_old", None)),
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "STRIPE_PRICE_ID_FREE", FREE_PRICE),
        patch.object(stripe_customer, "stripe_client", return_value=client),
        patch.object(stripe_customer, "get_user_plan", return_value="free"),
        patch.object(stripe_customer, "attach_user_stripe_ids") as set_plan,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1") == "cus_old"
    client.customers.create.assert_not_called()
    client.subscriptions.create.assert_called_once()
    set_plan.assert_called_once_with(
        "user-1",
        "cus_old",
        stripe_subscription_id="sub_free",
    )


def test_pro_account_does_not_receive_a_free_subscription():
    _reset_failures()
    client = MagicMock()
    client.customers.search.return_value = SimpleNamespace(data=[])
    client.checkout.sessions.list.return_value = SimpleNamespace(data=[])
    client.customers.create.return_value = SimpleNamespace(id="cus_pro")
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=(None, None)),
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "STRIPE_PRICE_ID_FREE", FREE_PRICE),
        patch.object(stripe_customer, "stripe_client", return_value=client),
        patch.object(stripe_customer, "get_user_plan", return_value="pro"),
        patch.object(stripe_customer, "attach_user_stripe_ids") as set_plan,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1") == "cus_pro"
    client.subscriptions.create.assert_not_called()
    set_plan.assert_called_once_with("user-1", "cus_pro")


def test_cancel_free_subscriptions_keeps_the_pro_one():
    client = MagicMock()
    client.subscriptions.list.return_value = SimpleNamespace(
        data=[
            SimpleNamespace(
                id="sub_free",
                items=SimpleNamespace(data=[SimpleNamespace(price=SimpleNamespace(id=FREE_PRICE))]),
            ),
            SimpleNamespace(
                id="sub_pro",
                items=SimpleNamespace(
                    data=[SimpleNamespace(price=SimpleNamespace(id="price_pro"))]
                ),
            ),
        ]
    )
    with (
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "STRIPE_PRICE_ID_FREE", FREE_PRICE),
        patch.object(stripe_customer, "stripe_client", return_value=client),
    ):
        stripe_customer.cancel_free_subscriptions("cus_123", "sub_pro")
    client.subscriptions.cancel.assert_called_once_with("sub_free")


def test_stripe_failure_does_not_raise_and_retries_later():
    _reset_failures()
    client = MagicMock()
    client.customers.search.side_effect = RuntimeError("stripe down")
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=(None, None)),
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "STRIPE_PRICE_ID_FREE", FREE_PRICE),
        patch.object(stripe_customer, "stripe_client", return_value=client),
        patch.object(stripe_customer, "get_user_plan", return_value="free"),
        patch.object(stripe_customer, "attach_user_stripe_ids") as set_plan,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1") is None
        assert stripe_customer.ensure_stripe_customer("user-1") is None
    set_plan.assert_not_called()
    assert client.customers.search.call_count == 1


def test_lookup_without_create_does_not_open_a_customer():
    _reset_failures()
    client = MagicMock()
    client.customers.search.return_value = SimpleNamespace(data=[])
    client.checkout.sessions.list.return_value = SimpleNamespace(data=[])
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=(None, None)),
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "stripe_client", return_value=client),
        patch.object(stripe_customer, "attach_user_stripe_ids") as attach,
    ):
        assert stripe_customer.ensure_stripe_customer("user-1", create_if_missing=False) is None
    client.customers.create.assert_not_called()
    client.subscriptions.create.assert_not_called()
    attach.assert_not_called()


def test_checkout_pages_are_walked_before_creating_a_customer():
    _reset_failures()
    client = MagicMock()
    client.customers.search.return_value = SimpleNamespace(data=[])
    client.checkout.sessions.list.return_value = SimpleNamespace(
        data=[],
        auto_paging_iter=lambda: [
            SimpleNamespace(client_reference_id="user-1", customer="cus_old"),
        ],
    )
    client.subscriptions.list.return_value = SimpleNamespace(data=[])
    client.subscriptions.create.return_value = SimpleNamespace(id="sub_free")
    with (
        patch.object(stripe_customer, "get_user_stripe_ids", return_value=(None, None)),
        patch.object(stripe_customer, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(stripe_customer, "STRIPE_PRICE_ID_FREE", FREE_PRICE),
        patch.object(stripe_customer, "stripe_client", return_value=client),
        patch.object(stripe_customer, "get_user_plan", return_value="free"),
        patch.object(stripe_customer, "attach_user_stripe_ids"),
    ):
        assert stripe_customer.ensure_stripe_customer("user-1") == "cus_old"
    client.customers.create.assert_not_called()
