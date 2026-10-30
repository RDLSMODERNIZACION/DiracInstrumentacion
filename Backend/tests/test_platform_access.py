"""Offline lockout checks; no production DB, device commands, or reporter runs.

Run with the backend dependencies plus httpx installed:
    python -m unittest discover -s Backend/tests -v
"""

import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Import the actual application without creating a real connection pool or
# enabling the scheduled reporter. TestClient is not used as a lifespan context.
with patch.dict(os.environ, {
    "DATABASE_URL": "postgresql://localhost/lockout_test",
    "TELEGRAM_ENABLED": "0",
    "TELEGRAM_SEND_ON_STARTUP": "0",
    "LOG_LEVEL": "WARNING",
}), patch("psycopg_pool.ConnectionPool"):
    from app.main import app
    from app import platform_access

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient


class PlatformAccessTests(unittest.TestCase):
    def setUp(self):
        self.db_patch = patch.object(platform_access, "get_conn")
        self.db = self.db_patch.start()
        self.cursor = MagicMock()
        self.db.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = self.cursor
        self.cursor.fetchone.return_value = (False,)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db_patch.stop()

    def test_every_application_route_installs_the_guard(self):
        routes = [r for r in app.routes if isinstance(r, APIRoute)]
        self.assertGreater(len(routes), 100)
        for route in routes:
            with self.subTest(path=route.path):
                self.assertIn(
                    platform_access.require_platform_access,
                    [dep.call for dep in route.dependant.dependencies],
                )

    def test_disabled_accounts_block_live_reads_and_human_commands(self):
        cases = [
            ("GET", "/tanks/config"),
            ("GET", "/pumps/config"),
            ("GET", "/dirac/me"),
            ("GET", "/kpi/pumps/status"),
            ("GET", "/mapa/assets/live"),
            ("GET", "/components/network_analyzers/1/latest"),
            ("POST", "/dirac/pumps/1/command"),
            ("POST", "/arduino-controler/command"),
            ("POST", "/infraestructura/location_alarm"),
            ("GET", "/dirac/admin/manifolds/1/signals"),
            ("GET", "/mapa/distribucion/instrumentation/pressure/1/readings"),
            ("GET", "/mapa/distribucion/instrumentation/flow/1/readings"),
            ("POST", "/dirac/activity/session/heartbeat"),
        ]
        for method, path in cases:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, json={} if method == "POST" else None)
                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual(response.json()["detail"]["code"], "platform_access_disabled")
                self.assertEqual(response.headers["cache-control"], "no-store")

    def test_device_and_health_exemptions_match_real_routes_without_db_check(self):
        routes = {
            (method, route.path): route
            for route in app.routes if isinstance(route, APIRoute)
            for method in route.methods
        }
        for key in platform_access._DEVICE_ROUTES | platform_access._HEALTH_ROUTES:
            with self.subTest(route=key):
                self.assertIn(key, routes)
                request = Request({
                    "type": "http", "method": key[0], "path": key[1],
                    "route": routes[key], "headers": [], "query_string": b"",
                })
                platform_access.require_platform_access(request)
        self.db.assert_not_called()

    def test_no_other_registered_route_bypasses_the_lockout(self):
        exempt = platform_access._DEVICE_ROUTES | platform_access._HEALTH_ROUTES
        for route in app.routes:
            if not isinstance(route, APIRoute):
                continue
            for method in route.methods:
                if (method, route.path) in exempt or method == "OPTIONS":
                    continue
                with self.subTest(method=method, path=route.path):
                    request = Request({
                        "type": "http", "method": method, "path": route.path,
                        "route": route, "headers": [], "query_string": b"",
                    })
                    with self.assertRaises(HTTPException) as raised:
                        platform_access.require_platform_access(request)
                    self.assertEqual(raised.exception.status_code, 403)

    def test_status_is_rechecked_and_reactivation_is_reversible(self):
        sample = FastAPI(dependencies=[Depends(platform_access.require_platform_access)])
        handler = MagicMock(return_value={"ok": True})

        @sample.get("/interactive")
        def interactive():
            return handler()

        self.cursor.fetchone.side_effect = [(False,), (True,), (False,)]
        with TestClient(sample) as client:
            self.assertEqual(client.get("/interactive").status_code, 403)
            self.assertEqual(client.get("/interactive").status_code, 200)
            self.assertEqual(client.get("/interactive").status_code, 403)
        handler.assert_called_once()
        self.assertEqual(self.cursor.execute.call_count, 3)

    def test_existing_user_authentication_still_applies_when_enabled(self):
        self.cursor.fetchone.return_value = (True,)
        self.assertEqual(self.client.get("/dirac/me").status_code, 401)

    def test_database_error_fails_closed_without_error_details(self):
        self.db.side_effect = RuntimeError("private-test-database-error")
        with self.assertLogs(platform_access.logger, level="ERROR"):
            response = self.client.get("/pumps/config")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private-test-database-error", response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_health_and_cors_remain_available(self):
        self.assertEqual(self.client.get("/health").status_code, 200)
        preflight = self.client.options("/pumps/config", headers={
            "Origin": "https://www.diracserviciosenergia.com",
            "Access-Control-Request-Method": "GET",
        })
        self.assertEqual(preflight.status_code, 200)
        self.db.assert_not_called()
        denied = self.client.get("/pumps/config", headers={
            "Origin": "https://www.diracserviciosenergia.com",
        })
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.headers["access-control-allow-origin"], "https://www.diracserviciosenergia.com")


if __name__ == "__main__":
    unittest.main()
