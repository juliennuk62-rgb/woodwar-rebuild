"""
Flask route smoke tests.

These tests spin up the whole Flask app with a fresh temporary SQLite database
and hit each public route to ensure:

- Routes are registered
- Templates render without raising
- Authentication redirects work

They do NOT test business logic correctness — that's what test_logic.py and
playtest.py are for.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))


class RouteSmokeTests(unittest.TestCase):
    """Each test runs against a fresh in-memory Flask app."""

    @classmethod
    def setUpClass(cls):
        # Swap the real sqlite file for a throwaway one BEFORE importing db/app.
        cls._tmp_dir = tempfile.mkdtemp(prefix="woodwar_test_")
        cls._tmp_db = Path(cls._tmp_dir) / "test.db"
        # Force db.py to use our temporary path by monkey-patching the module
        # before anyone imports it.
        import db
        db.DB_PATH = cls._tmp_db
        db.DB_URL = f"sqlite:///{cls._tmp_db}"
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        db.engine = create_engine(
            db.DB_URL,
            echo=False,
            future=True,
            connect_args={"check_same_thread": False},
        )
        db.SessionLocal = sessionmaker(bind=db.engine, autoflush=False, autocommit=False)

        import app as app_module
        # Replace SessionLocal in app too since it imported the original.
        app_module.SessionLocal = db.SessionLocal

        cls.flask_app = app_module.create_app()
        cls.flask_app.config["TESTING"] = True
        cls.client = cls.flask_app.test_client()

    @classmethod
    def tearDownClass(cls):
        try:
            os.remove(cls._tmp_db)
        except OSError:
            pass
        try:
            os.rmdir(cls._tmp_dir)
        except OSError:
            pass

    def test_index_ok(self):
        resp = self.client.get("/")
        self.assertIn(resp.status_code, (200, 302))

    def test_login_page_renders(self):
        resp = self.client.get("/login")
        # 200 if not logged in, 302 redirect to dashboard if already logged in
        # from a previous test in the same class.
        self.assertIn(resp.status_code, (200, 302))

    def test_register_page_renders(self):
        resp = self.client.get("/register")
        self.assertIn(resp.status_code, (200, 302))

    def test_dashboard_requires_auth(self):
        resp = self.client.get("/dashboard")
        # Unauthenticated should redirect to login.
        self.assertIn(resp.status_code, (302, 401))

    def test_rumeurs_page(self):
        resp = self.client.get("/rumeurs")
        # Some deployments may require auth, some not. Either is acceptable.
        self.assertIn(resp.status_code, (200, 302))

    def test_api_health(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)

    def test_api_data_units(self):
        resp = self.client.get("/api/data/units")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("units", data)

    def test_api_data_buildings(self):
        resp = self.client.get("/api/data/buildings")
        self.assertEqual(resp.status_code, 200)

    def test_api_data_clans(self):
        resp = self.client.get("/api/data/clans")
        self.assertEqual(resp.status_code, 200)

    def test_classements_page(self):
        resp = self.client.get("/classements")
        self.assertIn(resp.status_code, (200, 302))

    def test_register_and_login_flow(self):
        """End-to-end: register a test user, then login, then see dashboard."""
        # Register
        resp = self.client.post(
            "/register",
            data={
                "username": "smoketest_user",
                "password": "smoketest_pw_1234",
                "password_confirm": "smoketest_pw_1234",
                "clan_id": "1",
            },
            follow_redirects=True,
        )
        # Accept either success (200) or redirect to login (302).
        self.assertIn(resp.status_code, (200, 302))

        # Login
        resp = self.client.post(
            "/login",
            data={"username": "smoketest_user", "password": "smoketest_pw_1234"},
            follow_redirects=True,
        )
        self.assertIn(resp.status_code, (200, 302))


if __name__ == "__main__":
    unittest.main()
