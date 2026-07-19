"""
End-to-end backend tests for Réntalo en Línea.
Runs against the public REACT_APP_BACKEND_URL /api prefix.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://landlord-manager-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

LANDLORD_EMAIL = "arrendador@demo.mx"
LANDLORD_PWD = "Demo123!"
TENANT_EMAIL = "arrendatario@demo.mx"
TENANT_PWD = "Demo123!"


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def landlord_session():
    return _login(LANDLORD_EMAIL, LANDLORD_PWD)


@pytest.fixture(scope="module")
def tenant_session():
    return _login(TENANT_EMAIL, TENANT_PWD)


# ---------------- Health ----------------
def test_root():
    r = requests.get(f"{API}/", timeout=20)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------------- Auth ----------------
def test_register_and_me_and_logout():
    email = f"test_user_{uuid.uuid4().hex[:8]}@test.mx"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "Test User", "role": "arrendatario"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == email
    assert data["role"] == "arrendatario"
    assert "password_hash" not in data
    # /me with cookie
    me = s.get(f"{API}/auth/me", timeout=20)
    assert me.status_code == 200
    assert me.json()["email"] == email
    # logout
    lo = s.post(f"{API}/auth/logout", timeout=20)
    assert lo.status_code == 200
    me2 = s.get(f"{API}/auth/me", timeout=20)
    assert me2.status_code == 401


def test_login_demo_landlord(landlord_session):
    r = landlord_session.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200
    assert r.json()["role"] == "arrendador"


def test_login_demo_tenant(tenant_session):
    r = tenant_session.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200
    assert r.json()["role"] == "arrendatario"


def test_login_bad_credentials():
    r = requests.post(f"{API}/auth/login", json={"email": TENANT_EMAIL, "password": "wrong"}, timeout=20)
    assert r.status_code == 401


def test_bearer_token_works():
    # login and use returned cookie value as Bearer token
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": TENANT_EMAIL, "password": TENANT_PWD}, timeout=20)
    assert r.status_code == 200
    token = s.cookies.get("session_token")
    assert token
    r2 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=20)
    assert r2.status_code == 200


# ---------------- Properties (public) ----------------
def test_public_properties_seeded():
    r = requests.get(f"{API}/properties", timeout=20)
    assert r.status_code == 200
    props = r.json()
    assert len(props) >= 8, f"expected >=8 seeded properties, got {len(props)}"
    # Check schema
    for p in props[:1]:
        for k in ("id", "title", "property_type", "city", "price_month"):
            assert k in p


def test_properties_filters():
    r = requests.get(f"{API}/properties", params={"property_type": "departamento"}, timeout=20)
    assert r.status_code == 200
    for p in r.json():
        assert p["property_type"] == "departamento"

    r2 = requests.get(f"{API}/properties", params={"city": "Ciudad de México", "min_price": 10000, "max_price": 30000}, timeout=20)
    assert r2.status_code == 200
    for p in r2.json():
        assert 10000 <= p["price_month"] <= 30000

    r3 = requests.get(f"{API}/properties", params={"q": "Condesa"}, timeout=20)
    assert r3.status_code == 200
    assert any("Condesa" in (p.get("title", "") + p.get("colonia", "")) for p in r3.json())


def test_property_detail():
    r = requests.get(f"{API}/properties", timeout=20)
    pid = r.json()[0]["id"]
    d = requests.get(f"{API}/properties/{pid}", timeout=20)
    assert d.status_code == 200
    data = d.json()
    assert data["id"] == pid
    assert "owner" in data


# ---------------- Landlord create / list / delete ----------------
def test_landlord_create_and_delete_property(landlord_session):
    payload = {
        "title": "TEST_Depto", "description": "test", "property_type": "departamento",
        "city": "Test City", "state": "TS", "price_month": 12000, "deposit": 12000,
        "bedrooms": 2, "bathrooms": 1, "images": [],
    }
    r = landlord_session.post(f"{API}/properties", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]

    my = landlord_session.get(f"{API}/my/properties", timeout=20)
    assert my.status_code == 200
    assert any(p["id"] == pid for p in my.json())

    d = landlord_session.delete(f"{API}/properties/{pid}", timeout=20)
    assert d.status_code == 200
    # verify gone
    g = requests.get(f"{API}/properties/{pid}", timeout=20)
    assert g.status_code == 404


def test_tenant_cannot_create_property(tenant_session):
    payload = {"title": "T", "property_type": "casa", "city": "X", "price_month": 1000}
    r = tenant_session.post(f"{API}/properties", json=payload, timeout=20)
    assert r.status_code == 403


# ---------------- Applications, risk, approval->contract ----------------
@pytest.fixture(scope="module")
def seeded_property_id():
    r = requests.get(f"{API}/properties", timeout=20)
    # pick one owned by demo landlord: any that has price 16000 (estudio Roma) - clean/no active app
    props = r.json()
    # prefer "Estudio luminoso en Roma Norte" (16000) for lower risk chance
    for p in props:
        if "Roma Norte" in p.get("colonia", ""):
            return p["id"]
    return props[0]["id"]


def test_application_flow_creates_contract(tenant_session, landlord_session, seeded_property_id):
    # tenant creates application (may already exist)
    payload = {
        "property_id": seeded_property_id, "monthly_income": 60000,
        "occupation": "Ingeniero", "employment_type": "empleado_formal",
        "num_occupants": 2, "has_guarantor": True, "message": "TEST_msg",
    }
    r = tenant_session.post(f"{API}/applications", json=payload, timeout=20)
    if r.status_code == 400 and "activa" in r.text:
        # fetch existing
        my = tenant_session.get(f"{API}/my/applications", timeout=20).json()
        app_doc = next(a for a in my if a["property_id"] == seeded_property_id and a["status"] in ("pendiente", "en_revision", "aprobada"))
    else:
        assert r.status_code == 200, r.text
        app_doc = r.json()
        assert "risk_score" in app_doc and 0 <= app_doc["risk_score"] <= 100
        assert app_doc["risk_level"] in ("bajo", "medio", "alto")
        assert app_doc["status"] == "pendiente"

    # landlord sees it
    la = landlord_session.get(f"{API}/landlord/applications", timeout=20)
    assert la.status_code == 200
    assert any(a["id"] == app_doc["id"] for a in la.json())

    # approve -> contract
    ap = landlord_session.patch(f"{API}/applications/{app_doc['id']}/status", json={"status": "aprobada"}, timeout=20)
    assert ap.status_code == 200, ap.text
    body = ap.json()
    assert body["ok"] is True
    # contract may be None if approval already done previously; then check existing contract via my/contracts
    contracts = landlord_session.get(f"{API}/my/contracts", timeout=20).json()
    ctr = next((c for c in contracts if c["application_id"] == app_doc["id"]), None)
    assert ctr is not None, "Contract not generated after approval"
    assert ctr["monthly_rent"] > 0
    # tenant can see contract
    tc = tenant_session.get(f"{API}/my/contracts", timeout=20).json()
    assert any(c["id"] == ctr["id"] for c in tc)

    # activate contract
    act = landlord_session.patch(f"{API}/contracts/{ctr['id']}/status", json={"status": "activo"}, timeout=20)
    assert act.status_code == 200

    # stash for payments test
    pytest._contract_id = ctr["id"]


# ---------------- Payments ----------------
def test_rent_checkout(tenant_session):
    ctr_id = getattr(pytest, "_contract_id", None)
    assert ctr_id, "contract id not set from prior test"
    r = tenant_session.post(f"{API}/payments/rent/checkout", json={
        "contract_id": ctr_id, "origin_url": BASE_URL, "concept": "renta",
    }, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["checkout_url"].startswith("https://")
    assert data["session_id"]
    # status
    st = requests.get(f"{API}/payments/status/{data['session_id']}", timeout=20)
    assert st.status_code == 200
    body = st.json()
    assert body["session_id"] == data["session_id"]
    assert body["payment_status"] in ("pending", "paid", "unpaid")


# ---------------- Dashboard ----------------
def test_dashboard_stats_landlord(landlord_session):
    r = landlord_session.get(f"{API}/dashboard/stats", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["role"] == "arrendador"
    for k in ("properties", "available", "pending_applications", "active_contracts", "income"):
        assert k in d


def test_dashboard_stats_tenant(tenant_session):
    r = tenant_session.get(f"{API}/dashboard/stats", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["role"] == "arrendatario"
    for k in ("applications", "approved", "contracts", "spent"):
        assert k in d


def test_unauthenticated_dashboard():
    r = requests.get(f"{API}/dashboard/stats", timeout=20)
    assert r.status_code == 401
