"""Tests pour le flow d'abonnement Pro 10EUR/mois (Stripe).

Couvre :
- Le quota gratuit (3 adaptations IA, 5 candidatures actives).
- /api/create-checkout-session : 503 si Stripe non configure,
  succes (URL Stripe retournee) sinon.
- /api/stripe-webhook : checkout.session.completed met le user en Pro ;
  customer.subscription.deleted le repasse en free.
- /api/create-portal-session : portail Stripe pour la gestion d'abo.
- /api/cancel-subscription : resiliation a la fin de la periode payee
  (cancel_at_period_end=True).
- /api/cancel-feedback : enregistre le feedback de resiliation.
- /api/usage : reflete correctement le plan free vs pro et le snapshot
  d'abonnement Stripe.
- Override `paywall_disabled` : admin/support contourne les limites.
"""

import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend import main


class _FakeRequest:
    def __init__(self, auth_header: str | None = None, body: bytes = b""):
        self.headers = {}
        if auth_header is not None:
            self.headers["Authorization"] = auth_header
        self.state = SimpleNamespace()
        self._body = body

    async def body(self) -> bytes:
        return self._body


class TestFreeQuotas(unittest.TestCase):
    """L'abonnement Pro est obligatoire au-dela de la limite gratuite."""

    def test_free_user_blocked_after_3_adaptations(self):
        """Au-dela de 3 adaptations IA, le user free est bloque (402)."""
        with (
            patch.object(main, "get_user_plan", return_value="free"),
            patch.object(main, "get_paywall_disabled", return_value=False),
            patch.object(main, "get_free_adaptation_count_anchor", return_value=0),
            patch.object(main, "get_free_adaptation_bonus", return_value=0),
            patch.object(main, "count_quota_adaptations", return_value=3),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main._enforce_free_adaptations_quota("user_1")
        self.assertEqual(ctx.exception.status_code, 402)

    def test_free_user_allowed_below_quota(self):
        with (
            patch.object(main, "get_user_plan", return_value="free"),
            patch.object(main, "get_paywall_disabled", return_value=False),
            patch.object(main, "get_free_adaptation_count_anchor", return_value=0),
            patch.object(main, "get_free_adaptation_bonus", return_value=0),
            patch.object(main, "count_quota_adaptations", return_value=2),
        ):
            main._enforce_free_adaptations_quota("user_1")

    def test_pro_user_not_blocked_by_quota(self):
        with (
            patch.object(main, "get_user_plan", return_value="pro"),
            patch.object(main, "get_paywall_disabled", return_value=False),
            patch.object(main, "count_quota_adaptations", return_value=42),
        ):
            main._enforce_free_adaptations_quota("user_1")

    def test_paywall_disabled_user_bypasses_quota(self):
        """L'override admin paywall_disabled contourne le quota."""
        with (
            patch.object(main, "get_user_plan", return_value="free"),
            patch.object(main, "get_paywall_disabled", return_value=True),
            patch.object(main, "count_quota_adaptations", return_value=42),
        ):
            main._enforce_free_adaptations_quota("user_1")

    def test_free_bonus_extends_quota(self):
        """Un bonus configurable etend la limite gratuite."""
        with (
            patch.object(main, "get_user_plan", return_value="free"),
            patch.object(main, "get_paywall_disabled", return_value=False),
            patch.object(main, "get_free_adaptation_count_anchor", return_value=0),
            patch.object(main, "get_free_adaptation_bonus", return_value=2),
            patch.object(main, "count_quota_adaptations", return_value=4),
        ):
            main._enforce_free_adaptations_quota("user_1")

    def test_letter_features_require_pro(self):
        """La lettre de motivation IA est reservee aux Pro."""
        with (
            patch.object(main, "get_user_plan", return_value="free"),
            patch.object(main, "get_paywall_disabled", return_value=False),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main._require_pro_for_letter_features("user_1")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_letter_features_allowed_for_pro(self):
        with (
            patch.object(main, "get_user_plan", return_value="pro"),
            patch.object(main, "get_paywall_disabled", return_value=False),
        ):
            main._require_pro_for_letter_features("user_1")


class TestCreateCheckoutSession(unittest.TestCase):
    """Endpoint /api/create-checkout-session : Stripe Checkout en mode subscription."""

    def test_create_checkout_session_returns_503_without_stripe_config(self):
        req = _FakeRequest()
        with (
            patch.object(main, "_require_user_id", return_value="user_1"),
            patch.object(main, "STRIPE_SECRET_KEY", ""),
            patch.object(main, "STRIPE_PRICE_ID_PRO_MONTHLY", ""),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_create_checkout_session(req)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_create_checkout_session_returns_url_when_configured(self):
        """Avec une cle Stripe valide, retourne l'URL de la session Checkout."""
        fake_session = SimpleNamespace(url="https://checkout.stripe.com/c/pay/cs_test_123")
        fake_client = MagicMock()
        fake_client.checkout.sessions.create.return_value = fake_session
        fake_stripe = MagicMock()
        fake_stripe.StripeClient.return_value = fake_client

        req = _FakeRequest()
        with (
            patch.object(main, "_require_user_id", return_value="user_1"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test_xxx"),
            patch.object(main, "STRIPE_PRICE_ID_PRO_MONTHLY", "price_pro_monthly_123"),
            patch.object(main, "ensure_stripe_customer", return_value="cus_123"),
            patch.object(main, "_get_user_email_from_jwt", return_value="a@b.c"),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
        ):
            out = main.api_create_checkout_session(req)

        self.assertEqual(out["url"], "https://checkout.stripe.com/c/pay/cs_test_123")
        fake_client.checkout.sessions.create.assert_called_once()
        params = fake_client.checkout.sessions.create.call_args.kwargs["params"]
        self.assertEqual(params["mode"], "subscription")
        self.assertEqual(params["client_reference_id"], "user_1")
        self.assertEqual(params["customer"], "cus_123")
        self.assertEqual(params["line_items"], [{"price": "price_pro_monthly_123", "quantity": 1}])

    def test_create_checkout_session_requires_auth(self):
        req = _FakeRequest()
        with (
            patch.object(main, "USE_SUPABASE", True),
            patch.object(main, "_get_user_id", return_value=None),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_create_checkout_session(req)
        self.assertEqual(ctx.exception.status_code, 401)


class TestStripeWebhook(unittest.TestCase):
    """Endpoint /api/stripe-webhook : reception des events Stripe."""

    def _run(self, coro):
        return asyncio.new_event_loop().run_until_complete(coro)

    def test_webhook_rejects_when_secret_missing(self):
        req = _FakeRequest(body=b"{}")
        with (
            patch.object(main, "STRIPE_WEBHOOK_SECRET", ""),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                self._run(main.api_stripe_webhook(req))
        self.assertEqual(ctx.exception.status_code, 503)

    def test_webhook_rejects_invalid_signature(self):
        req = _FakeRequest(body=b"{}")
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.side_effect = Exception("Invalid signature")
        with (
            patch.object(main, "STRIPE_WEBHOOK_SECRET", "whsec_test"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
        ):
            with self.assertRaises(HTTPException) as ctx:
                self._run(main.api_stripe_webhook(req))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_checkout_session_completed_marks_user_pro(self):
        """checkout.session.completed -> set_user_plan(user_id, 'pro') avec ids Stripe."""
        event = {
            "type": "checkout.session.completed",
            "id": "evt_test_1",
            "data": {
                "object": {
                    "client_reference_id": "user_1",
                    "customer": "cus_123",
                    "subscription": "sub_456",
                }
            },
        }
        body = json.dumps(event).encode()
        req = _FakeRequest(body=body)
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event

        with (
            patch.object(main, "STRIPE_WEBHOOK_SECRET", "whsec_test"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
            patch.object(main, "set_user_plan") as fake_set,
            patch.object(main, "cancel_free_subscriptions") as cancel_free,
            patch.object(main, "_invalidate_stripe_caches_for_user"),
            patch.object(main, "_invalidate_usage_cache"),
        ):
            out = self._run(main.api_stripe_webhook(req))

        self.assertEqual(out, {"received": True})
        fake_set.assert_called_once_with(
            "user_1",
            "pro",
            stripe_customer_id="cus_123",
            stripe_subscription_id="sub_456",
        )
        cancel_free.assert_called_once_with("cus_123", "sub_456")

    def test_subscription_deleted_reverts_to_free(self):
        """customer.subscription.deleted -> set_user_plan(user_id, 'free')."""
        event = {
            "type": "customer.subscription.deleted",
            "id": "evt_test_2",
            "data": {"object": {"id": "sub_456", "customer": "cus_123"}},
        }
        body = json.dumps(event).encode()
        req = _FakeRequest(body=body)
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event

        with (
            patch.object(main, "STRIPE_WEBHOOK_SECRET", "whsec_test"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
            patch.object(main, "find_user_id_by_stripe_subscription_id", return_value="user_1"),
            patch.object(main, "set_user_plan") as fake_set,
            patch.object(main, "ensure_stripe_customer"),
            patch.object(main, "_invalidate_stripe_caches_for_user"),
            patch.object(main, "_invalidate_usage_cache"),
        ):
            out = self._run(main.api_stripe_webhook(req))

        self.assertEqual(out, {"received": True})
        fake_set.assert_called_once()
        args, kwargs = fake_set.call_args
        self.assertEqual(args[0], "user_1")
        self.assertEqual(args[1], "free")

    def test_free_price_deletion_does_not_reset_the_plan(self):
        event = {
            "type": "customer.subscription.deleted",
            "id": "evt_free",
            "data": {"object": {"id": "sub_free", "metadata": {"user_id": "user_1"}}},
        }
        req = _FakeRequest(body=json.dumps(event).encode())
        fake_stripe = MagicMock()
        fake_stripe.Webhook.construct_event.return_value = event
        with (
            patch.object(main, "STRIPE_WEBHOOK_SECRET", "whsec_test"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
            patch.object(main, "subscription_uses_free_price", return_value=True),
            patch.object(main, "set_user_plan") as fake_set,
        ):
            out = self._run(main.api_stripe_webhook(req))
        self.assertEqual(out, {"received": True})
        fake_set.assert_not_called()


class TestCreatePortalSession(unittest.TestCase):
    """Endpoint /api/create-portal-session : portail Stripe pour gestion d'abo."""

    def test_returns_503_without_stripe_config(self):
        req = _FakeRequest()
        with (
            patch.object(main, "_require_user_id", return_value="user_1"),
            patch.object(main, "STRIPE_SECRET_KEY", ""),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_create_portal_session(req)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_returns_404_when_no_customer_found(self):
        """Aucun customer Stripe associe au user_id -> 404 (pas de portail accessible)."""
        req = _FakeRequest()
        fake_client = MagicMock()
        fake_client.customers.search.return_value = SimpleNamespace(data=[])
        fake_client.checkout.sessions.list.return_value = SimpleNamespace(data=[])
        fake_stripe = MagicMock()
        fake_stripe.StripeClient.return_value = fake_client

        with (
            patch.object(main, "_require_user_id", return_value="user_1"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_create_portal_session(req)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_returns_portal_url_when_customer_exists(self):
        req = _FakeRequest()
        fake_session = SimpleNamespace(url="https://billing.stripe.com/p/session/test_123")
        fake_client = MagicMock()
        fake_client.customers.search.return_value = SimpleNamespace(
            data=[SimpleNamespace(id="cus_123")]
        )
        fake_client.billing_portal.sessions.create.return_value = fake_session
        fake_stripe = MagicMock()
        fake_stripe.StripeClient.return_value = fake_client

        with (
            patch.object(main, "_require_user_id", return_value="user_1"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
        ):
            out = main.api_create_portal_session(req)

        self.assertEqual(out["url"], "https://billing.stripe.com/p/session/test_123")
        fake_client.billing_portal.sessions.create.assert_called_once()
        params = fake_client.billing_portal.sessions.create.call_args.kwargs["params"]
        self.assertEqual(params["customer"], "cus_123")


class TestCancelSubscription(unittest.TestCase):
    """Endpoint /api/cancel-subscription : resiliation a la fin de periode."""

    def test_returns_503_without_stripe_config(self):
        req = _FakeRequest()
        with (
            patch.object(main, "_require_user_id", return_value="user_1"),
            patch.object(main, "STRIPE_SECRET_KEY", ""),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cancel_subscription(req)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_returns_400_when_paywall_disabled_user(self):
        """Un user avec paywall_disabled (override admin) ne peut pas resilier."""
        req = _FakeRequest()
        with (
            patch.object(main, "_require_user_id", return_value="user_1"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.object(main, "get_paywall_disabled", return_value=True),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cancel_subscription(req)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_returns_404_when_no_active_subscription(self):
        req = _FakeRequest()
        fake_client = MagicMock()
        fake_stripe = MagicMock()
        fake_stripe.StripeClient.return_value = fake_client
        with (
            patch.object(main, "_require_user_id", return_value="user_1"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.object(main, "get_paywall_disabled", return_value=False),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
            patch.object(main, "_resolve_pro_subscription_id", return_value=(None, None)),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cancel_subscription(req)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_schedules_cancellation_at_period_end(self):
        """Active -> cancel_at_period_end=True (fin de periode payee uniquement)."""
        req = _FakeRequest()
        sub_active = MagicMock()
        sub_active.status = "active"
        sub_active.cancel_at_period_end = False
        sub_active.customer = "cus_123"
        sub_active.current_period_end = 1_800_000_000
        sub_updated = MagicMock()
        sub_updated.status = "active"
        sub_updated.cancel_at_period_end = True
        sub_updated.customer = "cus_123"
        sub_updated.current_period_end = 1_800_000_000

        fake_client = MagicMock()
        fake_client.subscriptions.retrieve.return_value = sub_active
        fake_client.subscriptions.update.return_value = sub_updated
        fake_stripe = MagicMock()
        fake_stripe.StripeClient.return_value = fake_client

        with (
            patch.object(main, "_require_user_id", return_value="user_1"),
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.object(main, "get_paywall_disabled", return_value=False),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
            patch.object(main, "_resolve_pro_subscription_id", return_value=("cus_123", "sub_456")),
            patch.object(main, "_stripe_subscription_snapshot_dict", return_value=None),
            patch.object(main, "_STRIPE_SNAPSHOT_CACHE"),
            patch.object(main, "get_user_stripe_ids", return_value=("cus_123", "sub_456")),
            patch.object(main, "_get_user_email_from_jwt", return_value=""),
        ):
            out = main.api_cancel_subscription(req)

        self.assertTrue(out["ok"])
        self.assertFalse(out["already_scheduled"])
        fake_client.subscriptions.update.assert_called_once_with(
            "sub_456", params={"cancel_at_period_end": True}
        )


class TestCancelFeedback(unittest.TestCase):
    """Endpoint /api/cancel-feedback : feedback optionnel sur resiliation."""

    def test_accepts_feedback(self):
        req = _FakeRequest()
        body = main.CancelFeedbackBody(reason="too_expensive", comment="10E c'est trop")
        with patch.object(main, "_get_user_id", return_value="user_1"):
            out = main.api_cancel_feedback(req, body)
        self.assertEqual(out, {"ok": True})

    def test_accepts_empty_feedback(self):
        req = _FakeRequest()
        body = main.CancelFeedbackBody(reason=None, comment=None)
        with patch.object(main, "_get_user_id", return_value="user_1"):
            out = main.api_cancel_feedback(req, body)
        self.assertEqual(out, {"ok": True})


class TestUsageEndpoint(unittest.TestCase):
    """Endpoint /api/usage : reflete le plan et le snapshot d'abonnement."""

    def setUp(self):
        main._USAGE_CACHE = main._TTLCache(max_size=5000, ttl_sec=15.0)

    def test_free_user_reports_free_plan_and_limit(self):
        req = _FakeRequest()
        with (
            patch.object(main, "_get_user_id", return_value="user_1"),
            patch.object(main, "ensure_implicit_free_adaptation_anchor"),
            patch.object(main, "get_user_plan", return_value="free"),
            patch.object(main, "get_paywall_disabled", return_value=False),
            patch.object(main, "count_quota_adaptations", return_value=1),
            patch.object(main, "count_active_applications", return_value=2),
            patch.object(main, "get_free_adaptation_count_anchor", return_value=0),
            patch.object(main, "get_free_adaptation_bonus", return_value=0),
            patch.object(main, "_get_user_email_from_jwt", return_value=""),
            patch.object(main, "_is_support_admin", return_value=False),
            patch.object(main, "STRIPE_SECRET_KEY", ""),
        ):
            out = main.api_usage(req)
        self.assertEqual(out["plan"], "free")
        self.assertFalse(out["paywall_disabled"])
        self.assertEqual(out["adaptations_used"], 1)
        self.assertEqual(out["adaptations_limit"], 3)
        self.assertEqual(out["applications_count"], 2)
        self.assertEqual(out["applications_limit"], 5)
        self.assertIsNone(out["stripe_subscription"])

    def test_pro_user_reports_pro_plan_and_unlimited(self):
        req = _FakeRequest()
        with (
            patch.object(main, "_get_user_id", return_value="user_1"),
            patch.object(main, "ensure_implicit_free_adaptation_anchor"),
            patch.object(main, "get_user_plan", return_value="pro"),
            patch.object(main, "get_paywall_disabled", return_value=False),
            patch.object(main, "count_quota_adaptations", return_value=42),
            patch.object(main, "count_active_applications", return_value=80),
            patch.object(main, "get_free_adaptation_count_anchor", return_value=0),
            patch.object(main, "get_free_adaptation_bonus", return_value=0),
            patch.object(main, "_get_user_email_from_jwt", return_value=""),
            patch.object(main, "_is_support_admin", return_value=False),
            patch.object(main, "STRIPE_SECRET_KEY", ""),
        ):
            out = main.api_usage(req)
        self.assertEqual(out["plan"], "pro")
        self.assertEqual(out["adaptations_used"], 42)
        self.assertEqual(out["adaptations_limit"], 999999)
        self.assertEqual(out["applications_limit"], 999999)

    def test_paywall_disabled_user_reports_pro_plan(self):
        """Override admin paywall_disabled : reporte plan=pro + paywall_disabled=True."""
        req = _FakeRequest()
        with (
            patch.object(main, "_get_user_id", return_value="user_1"),
            patch.object(main, "ensure_implicit_free_adaptation_anchor"),
            patch.object(main, "get_user_plan", return_value="free"),
            patch.object(main, "get_paywall_disabled", return_value=True),
            patch.object(main, "count_quota_adaptations", return_value=5),
            patch.object(main, "count_active_applications", return_value=10),
            patch.object(main, "get_free_adaptation_count_anchor", return_value=0),
            patch.object(main, "get_free_adaptation_bonus", return_value=0),
            patch.object(main, "_get_user_email_from_jwt", return_value=""),
            patch.object(main, "_is_support_admin", return_value=False),
            patch.object(main, "STRIPE_SECRET_KEY", ""),
        ):
            out = main.api_usage(req)
        self.assertEqual(out["plan"], "pro")
        self.assertTrue(out["paywall_disabled"])
        self.assertEqual(out["adaptations_limit"], 999999)


class TestAccountDeletionCancelsSubscriptions(unittest.TestCase):
    """La suppression annule le Free à 0€ et le Pro, sans créer de client."""

    def _sub(self, sub_id: str, price: str, status: str = "active"):
        return SimpleNamespace(
            id=sub_id,
            status=status,
            customer="cus_1",
            items={"data": [{"price": {"id": price}}]},
        )

    def _cancel(self, confirmed: bool, subs: list):
        client = MagicMock()
        fake_stripe = MagicMock()
        fake_stripe.StripeClient.return_value = client
        with (
            patch.object(main, "STRIPE_SECRET_KEY", "sk_test"),
            patch.object(main, "get_paywall_disabled", return_value=False),
            patch.object(main, "ensure_stripe_customer", return_value="cus_1") as lookup,
            patch.object(main, "get_user_stripe_ids", return_value=("cus_1", None)),
            patch.object(main, "list_billable_subscriptions", return_value=subs),
            patch.object(main, "_invalidate_stripe_caches_for_user"),
            patch.object(main, "_invalidate_usage_cache"),
            patch("backend.services.stripe_customer.STRIPE_PRICE_ID_FREE", "price_free"),
            patch.dict("sys.modules", {"stripe": fake_stripe}),
        ):
            main._cancel_subscription_for_account_deletion("user-1", confirmed)
        lookup.assert_called_once_with("user-1", create_if_missing=False)
        return client

    def test_free_and_pro_are_both_cancelled_once_confirmed(self):
        subs = [self._sub("sub_free", "price_free"), self._sub("sub_pro", "price_pro")]
        client = self._cancel(True, subs)
        cancelled = {call.args[0] for call in client.subscriptions.cancel.call_args_list}
        self.assertEqual(cancelled, {"sub_free", "sub_pro"})

    def test_paid_subscription_blocks_delete_until_confirmed(self):
        subs = [self._sub("sub_free", "price_free"), self._sub("sub_pro", "price_pro")]
        with self.assertRaises(HTTPException) as ctx:
            self._cancel(False, subs)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_free_subscription_is_cancelled_without_the_pro_checkbox(self):
        client = self._cancel(False, [self._sub("sub_free", "price_free")])
        client.subscriptions.cancel.assert_called_once_with("sub_free")


class TestStripePeriodEndOnItems(unittest.TestCase):
    def tearDown(self):
        main._STRIPE_SNAPSHOT_CACHE.clear()

    def test_cancel_flag_is_kept_when_period_end_lives_on_the_item(self):
        item = SimpleNamespace(current_period_end=1_800_000_000)
        sub = SimpleNamespace(
            current_period_end=None,
            cancel_at_period_end=True,
            status="active",
            items=SimpleNamespace(data=[item]),
        )
        client = MagicMock()
        client.subscriptions.retrieve.return_value = sub
        snap = main._stripe_subscription_snapshot_dict(client, "sub_item_period")
        self.assertTrue(snap["cancel_at_period_end"])
        self.assertEqual(snap["current_period_end"], 1_800_000_000)
        self.assertTrue(snap["current_period_end_label"])

    def test_reminder_targets_stop_stripe_work_at_the_send_cap(self):
        raw = [str(i) for i in range(150)]
        seen: list[str] = []

        def _keep(user_ids):
            seen.extend(user_ids)
            return list(user_ids)

        with (
            patch(
                "backend.services.inactivity_reminder_store.eligible_user_ids",
                return_value=raw,
            ),
            patch("backend.services.inactivity_reminder_store.send_cap", return_value=100),
            patch.object(main, "_without_scheduled_cancel", side_effect=_keep),
        ):
            kept, truncated = main._reminder_targets(90)
        self.assertEqual(len(seen), 100)
        self.assertEqual(kept, raw[:100])
        self.assertTrue(truncated)


if __name__ == "__main__":
    unittest.main()
