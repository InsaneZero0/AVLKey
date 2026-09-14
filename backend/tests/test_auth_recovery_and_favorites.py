"""Backend tests for password recovery (forgot/reset) and favorites."""
import os
import re
import time
import uuid
import subprocess
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api"


def _new_email():
    return f"test_recover_{uuid.uuid4().hex[:10]}@example.com"


def _register(email, password=None, name="Test Recover"):
    password = password or os.environ.get("TEST_USER_PASSWORD", "Passw0rd!")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": name})
    return r


def _login(email, password):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": password})


def _extract_token_from_logs(email):
    """Backend logs 'restablecer?token=XYZ' when RESEND not configured."""
    for path in ("/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"):
        try:
            out = subprocess.check_output(["tail", "-n", "500", path], text=True, stderr=subprocess.DEVNULL)
        except Exception:
            continue
        # Look for the most recent token
        tokens = re.findall(r"restablecer\?token=([A-Za-z0-9_\-]+)", out)
        if tokens:
            return tokens[-1]
    return None


# ---------- Registration (minimal) ----------
class TestRegistration:
    def test_minimal_register_creates_arrendatario_and_session(self):
        email = _new_email()
        r = _register(email, "Passw0rd!", "Nuevo Usuario")
        assert r.status_code == 200, r.text
        data = r.json()
        # Session cookie should be set on register
        assert r.cookies.get("session_token"), "session cookie not set on register"
        assert "user" in data or "id" in data or "token" in data
        # Verify /auth/me returns arrendatario
        s = requests.Session()
        s.cookies.update(r.cookies)
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        me_data = me.json()
        assert me_data.get("email") == email
        assert me_data.get("role") == "arrendatario"


# ---------- Password recovery ----------
class TestPasswordRecovery:
    def test_forgot_password_always_success_even_for_unknown_email(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": "nobody_xyz@example.com", "origin_url": BASE})
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        # Should not reveal existence
        assert "no existe" not in (body.get("message") or "").lower()

    def test_full_reset_flow_new_password_works_and_reuse_fails(self):
        email = _new_email()
        old_pwd = "OldPass1!"
        new_pwd = "NewPass2!"
        reg = _register(email, old_pwd, "Reset Flow")
        assert reg.status_code == 200

        # Login with old works
        assert _login(email, old_pwd).status_code == 200

        # Request forgot
        fp = requests.post(f"{API}/auth/forgot-password", json={"email": email, "origin_url": BASE})
        assert fp.status_code == 200

        # Give logs a moment to flush
        time.sleep(1.0)
        token = _extract_token_from_logs(email)
        assert token, "reset token not found in backend logs (send_email should log link when RESEND not configured)"

        # Reset with valid token
        rp = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": new_pwd})
        assert rp.status_code == 200, rp.text

        # Old password no longer works
        bad = _login(email, old_pwd)
        assert bad.status_code in (400, 401), f"old password still valid: {bad.status_code}"

        # New password works
        good = _login(email, new_pwd)
        assert good.status_code == 200

        # Reusing the same token fails
        again = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "Yetanother1!"})
        assert again.status_code == 400

    def test_reset_with_invalid_token(self):
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": "nonexistent_" + uuid.uuid4().hex, "password": "Whatever1!"})
        assert r.status_code == 400

    def test_reset_invalidates_previous_sessions(self):
        email = _new_email()
        reg = _register(email, "InitPass1!", "Sess Invalidate")
        assert reg.status_code == 200
        # Session cookie from register
        sess = requests.Session()
        sess.cookies.update(reg.cookies)
        me1 = sess.get(f"{API}/auth/me")
        assert me1.status_code == 200

        # Forgot + reset
        requests.post(f"{API}/auth/forgot-password", json={"email": email, "origin_url": BASE})
        time.sleep(1.0)
        token = _extract_token_from_logs(email)
        assert token
        rp = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "NewPass9!"})
        assert rp.status_code == 200

        # Previous session should be invalidated
        me2 = sess.get(f"{API}/auth/me")
        assert me2.status_code in (401, 403), f"session not invalidated after reset: {me2.status_code}"


# ---------- Favorites ----------
class TestFavorites:
    @pytest.fixture(scope="class")
    def tenant_session(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": "arrendatario@demo.mx", "password": "Demo123!"})
        assert r.status_code == 200, r.text
        return s

    @pytest.fixture(scope="class")
    def some_property_id(self):
        r = requests.get(f"{API}/properties?limit=5")
        assert r.status_code == 200
        props = r.json()
        assert props, "no properties seeded"
        return props[0]["id"]

    def test_unauthenticated_favorite_returns_401(self, some_property_id):
        r = requests.post(f"{API}/favorites/{some_property_id}")
        assert r.status_code in (401, 403)

    def test_add_list_and_remove_favorite(self, tenant_session, some_property_id):
        # Ensure clean state (idempotent add anyway)
        tenant_session.delete(f"{API}/favorites/{some_property_id}")

        add = tenant_session.post(f"{API}/favorites/{some_property_id}")
        assert add.status_code == 200

        ids = tenant_session.get(f"{API}/my/favorites/ids")
        assert ids.status_code == 200
        assert some_property_id in ids.json()

        listing = tenant_session.get(f"{API}/my/favorites")
        assert listing.status_code == 200
        listed_ids = [p["id"] for p in listing.json()]
        assert some_property_id in listed_ids

        rem = tenant_session.delete(f"{API}/favorites/{some_property_id}")
        assert rem.status_code == 200
        ids2 = tenant_session.get(f"{API}/my/favorites/ids").json()
        assert some_property_id not in ids2

    def test_favorite_unknown_property_returns_404(self, tenant_session):
        r = tenant_session.post(f"{API}/favorites/does_not_exist_xyz")
        assert r.status_code == 404
