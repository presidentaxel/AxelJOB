"""AXE-508 : éligibilité du rappel et lien du mail."""

import unittest
from datetime import datetime, timedelta, timezone

from backend.services.billing_notifications import html_inactivity_reminder
from backend.services.inactivity_reminders import should_send_reminder

NOW = datetime(2026, 10, 30, tzinfo=timezone.utc)
QUIET = NOW - timedelta(days=100)


def _send(**overrides):
    payload = {
        "paying": True,
        "last_sign_in": QUIET,
        "last_product": QUIET,
        "last_reminder_at": None,
        "now": NOW,
        "days": 90,
    }
    payload.update(overrides)
    return should_send_reminder(**payload)


class TestShouldSendReminder(unittest.TestCase):
    def test_quiet_paying_account_is_eligible(self):
        self.assertTrue(_send())

    def test_free_account_is_skipped(self):
        self.assertFalse(_send(paying=False))

    def test_recent_login_is_skipped(self):
        self.assertFalse(_send(last_sign_in=NOW - timedelta(days=2)))

    def test_recent_product_write_is_skipped(self):
        self.assertFalse(_send(last_product=NOW - timedelta(days=2)))

    def test_one_mail_per_quiet_spell(self):
        self.assertFalse(_send(last_reminder_at=NOW - timedelta(days=10)))

    def test_a_new_quiet_spell_after_a_return_can_send_again(self):
        came_back = NOW - timedelta(days=120)
        self.assertTrue(
            _send(
                last_sign_in=came_back,
                last_product=came_back,
                last_reminder_at=NOW - timedelta(days=200),
            )
        )

    def test_sixty_day_option(self):
        almost = NOW - timedelta(days=70)
        self.assertTrue(_send(last_sign_in=almost, last_product=almost, days=60))
        self.assertFalse(_send(last_sign_in=almost, last_product=almost, days=90))


class TestReminderEmail(unittest.TestCase):
    def test_link_opens_the_account_not_a_stripe_session(self):
        html = html_inactivity_reminder("https://job.axelproject.fr")
        self.assertIn("https://job.axelproject.fr/app/profil", html)
        self.assertNotIn("stripe.com", html)
        self.assertNotIn("create-portal-session", html)
        self.assertIn("ne résilie rien", html)
        self.assertIn("continuent", html)
