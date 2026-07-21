"""
RBAC end-to-end tests for Réntalo en Línea — internal roles, granular permissions,
property review workflow, risk override, audit, and dual external accounts.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://landlord-manager-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

INTERNO_PWD = "Interno123!"
DEMO_PWD = "Demo123!"


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s, r.json()


# ----------------------- Fixtures -----------------------
@pytest.fixture(scope="module")
def superadmin():
    return _login("superadmin@rentalo.mx", INTERNO_PWD)

@pytest.fixture(scope="module")
def admin_general():
    return _login("admin_general@rentalo.mx", INTERNO_PWD)

@pytest.fixture(scope="module")
def finanzas():
    return _login("finanzas@rentalo.mx", INTERNO_PWD)

@pytest.fixture(scope="module")
def revision():
    return _login("revision_propiedades@rentalo.mx", INTERNO_PWD)

@pytest.fixture(scope="module")
def operaciones():
    return _login("operaciones@rentalo.mx", INTERNO_PWD)

@pytest.fixture(scope="module")
def tenant():
    return _login("arrendatario@demo.mx", DEMO_PWD)

@pytest.fixture(scope="module")
def landlord():
    return _login("arrendador@demo.mx", DEMO_PWD)


# ----------------------- Login / /me shape -----------------------
def test_internal_login_returns_permissions(superadmin, finanzas, revision, operaciones):
    _, u = superadmin
    assert u["account_type"] == "internal"
    assert u["staff_role"] == "superadmin"
    assert "administrar_usuarios" in u["permissions"]
    assert "consultar_documentos_sensibles" in u["permissions"]

    _, uf = finanzas
    assert uf["staff_role"] == "finanzas"
    assert "administrar_pagos" in uf["permissions"]
    assert "administrar_usuarios" not in uf["permissions"]

    _, ur = revision
    assert ur["staff_role"] == "revision_propiedades"
    assert set(ur["permissions"]) >= {"aprobar", "rechazar"}
    assert "administrar_pagos" not in ur["permissions"]

    _, uo = operaciones
    assert set(uo["permissions"]) >= {"aprobar", "administrar_contratos"}


def test_me_reflects_permissions(finanzas):
    s, _ = finanzas
    r = s.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["account_type"] == "internal"
    assert "administrar_pagos" in d["permissions"]


def test_external_has_no_staff(tenant):
    _, u = tenant
    assert u["account_type"] == "external"
    assert u.get("staff_role") in (None, "")


# ----------------------- Permission matrix -----------------------
def test_finanzas_can_get_payments_but_not_manage_users(finanzas, tenant):
    s, _ = finanzas
    r = s.get(f"{API}/admin/payments", timeout=20)
    assert r.status_code == 200
    # Cannot PATCH a user
    tenant_id = tenant[1]["id"]
    r2 = s.patch(f"{API}/admin/users/{tenant_id}", json={"account_type": "external", "role": "arrendatario"}, timeout=20)
    assert r2.status_code == 403


def test_revision_cannot_get_payments_but_can_review_properties(revision, landlord):
    s, _ = revision
    r = s.get(f"{API}/admin/payments", timeout=20)
    assert r.status_code == 403
    # Create a property to review
    sland, _ = landlord
    payload = {"title": f"TEST_review_{uuid.uuid4().hex[:6]}", "property_type": "departamento",
               "city": "CDMX", "state": "CDMX", "price_month": 10000, "bedrooms": 1, "bathrooms": 1}
    cp = sland.post(f"{API}/properties", json=payload, timeout=20)
    assert cp.status_code == 200, cp.text
    pid = cp.json()["id"]
    assert cp.json()["review_status"] == "pendiente"
    # revision approves
    ap = s.patch(f"{API}/admin/properties/{pid}/review", json={"decision": "aprobada"}, timeout=20)
    assert ap.status_code == 200
    # Cleanup
    sland.delete(f"{API}/properties/{pid}")


def test_external_cannot_hit_admin_endpoints(tenant):
    s, _ = tenant
    for path in ["/admin/stats", "/admin/users", "/admin/payments", "/admin/audit",
                 "/admin/documents", "/admin/applications", "/admin/properties", "/admin/meta"]:
        r = s.get(f"{API}{path}", timeout=20)
        assert r.status_code == 403, f"{path} => {r.status_code}"


def test_superadmin_can_access_audit_documents_users(superadmin):
    s, _ = superadmin
    for path in ["/admin/users", "/admin/audit", "/admin/documents", "/admin/payments"]:
        r = s.get(f"{API}{path}", timeout=20)
        assert r.status_code == 200, f"{path} => {r.status_code}"


# ----------------------- User management + hierarchy -----------------------
def test_admin_general_cannot_grant_superadmin(admin_general, superadmin):
    s_ag, _ = admin_general
    # Pick an existing internal target (operaciones@)
    s_sa, _ = superadmin
    users = s_sa.get(f"{API}/admin/users", timeout=20).json()
    target = next(u for u in users if u["email"] == "operaciones@rentalo.mx")
    r = s_ag.patch(f"{API}/admin/users/{target['id']}",
                   json={"account_type": "internal", "staff_role": "superadmin"}, timeout=20)
    assert r.status_code == 403


def test_superadmin_can_change_roles_and_audit_registers(superadmin):
    s, _ = superadmin
    # Create a throw-away external user via register
    email = f"test_rbac_{uuid.uuid4().hex[:8]}@test.mx"
    reg = requests.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!",
                                                     "name": "TEST RBAC", "role": "arrendatario"}, timeout=20)
    assert reg.status_code == 200
    uid = reg.json()["id"]
    # Promote to internal soporte
    r = s.patch(f"{API}/admin/users/{uid}", json={"account_type": "internal", "staff_role": "soporte"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["account_type"] == "internal"
    assert r.json()["staff_role"] == "soporte"
    # Audit log has entry
    audit = s.get(f"{API}/admin/audit", timeout=20)
    assert audit.status_code == 200
    logs = audit.json()
    assert any(l.get("resource") == uid and l.get("action") == "update_user_role" for l in logs)
    # Revert to external
    s.patch(f"{API}/admin/users/{uid}", json={"account_type": "external", "role": "arrendatario"})


# ----------------------- Property review + public list exclusion -----------------------
def test_rejected_properties_excluded_from_public(landlord, superadmin):
    sland, _ = landlord
    s_sa, _ = superadmin
    payload = {"title": f"TEST_reject_{uuid.uuid4().hex[:6]}", "property_type": "casa",
               "city": "CDMX", "state": "CDMX", "price_month": 9000, "bedrooms": 1, "bathrooms": 1}
    cp = sland.post(f"{API}/properties", json=payload, timeout=20)
    pid = cp.json()["id"]
    # Reject
    r = s_sa.patch(f"{API}/admin/properties/{pid}/review", json={"decision": "rechazada"}, timeout=20)
    assert r.status_code == 200
    # Public list must not include it
    pubs = requests.get(f"{API}/properties", timeout=20).json()
    assert not any(p["id"] == pid for p in pubs)
    # Audit registered
    audit = s_sa.get(f"{API}/admin/audit", timeout=20).json()
    assert any(l.get("resource") == pid and "review_property" in l.get("action", "") for l in audit)
    # cleanup
    sland.delete(f"{API}/properties/{pid}")


# ----------------------- Risk override -----------------------
def test_only_authorised_roles_can_override_risk(revision, superadmin, tenant, landlord):
    # Need an application. Use tenant's existing or create against a fresh property.
    sland, _ = landlord
    stenant, _ = tenant
    s_sa, _ = superadmin
    # Create a fresh property (approved) so tenant can apply cleanly
    payload = {"title": f"TEST_risk_{uuid.uuid4().hex[:6]}", "property_type": "departamento",
               "city": "CDMX", "state": "CDMX", "price_month": 8000, "bedrooms": 1, "bathrooms": 1}
    cp = sland.post(f"{API}/properties", json=payload, timeout=20)
    pid = cp.json()["id"]
    s_sa.patch(f"{API}/admin/properties/{pid}/review", json={"decision": "aprobada"})
    app_r = stenant.post(f"{API}/applications", json={"property_id": pid, "monthly_income": 40000,
                                                     "occupation": "QA", "employment_type": "empleado_formal",
                                                     "num_occupants": 1, "has_guarantor": False}, timeout=20)
    assert app_r.status_code == 200, app_r.text
    aid = app_r.json()["id"]
    # revision_propiedades has no modificar_decisiones_automaticas
    s_rev, _ = revision
    r_forbid = s_rev.patch(f"{API}/admin/applications/{aid}/risk", json={"risk_level": "alto", "reason": "x"}, timeout=20)
    assert r_forbid.status_code == 403
    # superadmin can
    r_ok = s_sa.patch(f"{API}/admin/applications/{aid}/risk", json={"risk_level": "alto", "reason": "test"}, timeout=20)
    assert r_ok.status_code == 200
    # audit
    audit = s_sa.get(f"{API}/admin/audit", timeout=20).json()
    assert any(l.get("resource") == aid and l.get("action") == "override_risk" for l in audit)
    # cleanup
    sland.patch(f"{API}/applications/{aid}/status", json={"status": "rechazada"})
    sland.delete(f"{API}/properties/{pid}")


# ----------------------- Dual external accounts -----------------------
def test_tenant_can_create_property_and_switch_role(tenant):
    s, u = tenant
    payload = {"title": f"TEST_dual_{uuid.uuid4().hex[:6]}", "property_type": "departamento",
               "city": "CDMX", "state": "CDMX", "price_month": 7000, "bedrooms": 1, "bathrooms": 1}
    cp = s.post(f"{API}/properties", json=payload, timeout=20)
    assert cp.status_code == 200, cp.text
    pid = cp.json()["id"]
    # Switch role
    up = s.patch(f"{API}/users/me", json={"role": "arrendador"}, timeout=20)
    assert up.status_code == 200
    assert up.json()["role"] == "arrendador"
    # revert
    s.patch(f"{API}/users/me", json={"role": "arrendatario"})
    s.delete(f"{API}/properties/{pid}")


# ----------------------- Admin meta -----------------------
def test_admin_meta_requires_internal(superadmin, tenant):
    s, _ = superadmin
    r = s.get(f"{API}/admin/meta", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "superadmin" in d["staff_roles"]
    assert "administrar_usuarios" in d["permissions"]

    st, _ = tenant
    assert st.get(f"{API}/admin/meta", timeout=20).status_code == 403
