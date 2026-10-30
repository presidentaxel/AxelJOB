"""AXE-507 : repères 60/90 jours, sans donnée personnelle."""

import unittest
from datetime import datetime, timedelta, timezone

from backend.services.account_activity import inactivity_flags, is_older_than

NOW = datetime(2026, 10, 30, tzinfo=timezone.utc)


class TestInactivityFlags(unittest.TestCase):
    def test_missing_dates_are_inactive(self):
        flags = inactivity_flags(None, None, NOW)
        self.assertTrue(flags["inactive_60"])
        self.assertTrue(flags["inactive_90"])

    def test_recent_login_is_not_inactive_even_without_product_write(self):
        flags = inactivity_flags(NOW - timedelta(days=3), None, NOW)
        self.assertFalse(flags["inactive_60"])
        self.assertFalse(flags["inactive_90"])

    def test_recent_product_write_is_not_inactive(self):
        flags = inactivity_flags(NOW - timedelta(days=120), NOW - timedelta(days=2), NOW)
        self.assertFalse(flags["inactive_60"])
        self.assertFalse(flags["inactive_90"])

    def test_both_quiet_for_70_days_flags_60_only(self):
        quiet = NOW - timedelta(days=70)
        flags = inactivity_flags(quiet, quiet, NOW)
        self.assertTrue(flags["inactive_60"])
        self.assertFalse(flags["inactive_90"])

    def test_both_quiet_for_100_days_flags_60_and_90(self):
        quiet = NOW - timedelta(days=100)
        flags = inactivity_flags(quiet, quiet, NOW)
        self.assertTrue(flags["inactive_60"])
        self.assertTrue(flags["inactive_90"])

    def test_boundary_is_inclusive(self):
        self.assertTrue(is_older_than(NOW - timedelta(days=60), NOW, 60))
        self.assertFalse(is_older_than(NOW - timedelta(days=59), NOW, 60))
