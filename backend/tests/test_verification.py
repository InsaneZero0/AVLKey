"""Backend tests for the Verification feature: documents, consent, fiscal info,
admin review, alerts, and RBAC/access control."""
import io
import os
import uuid
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://landlord-manager-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

TENANT = ("arrendatario@demo.mx", "Demo123!")
LANDLORD = ("arrendador@demo.mx", "Demo123!")
SUPERADMIN = ("superadmin@rentalo.mx", "Interno123!")
REVIEWER = ("revision_propiedades@rentalo.mx", "Interno123!")
FINANZAS = ("finanzas@rentalo.mx", "Interno123!")


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return s


# --- Minimal valid PNG (1x1) so uploads are real image bytes ---
PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f"
    b"\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\xa1a\xa5\xd8\x00\x00"
    b"\x00\x00IEND\xaeB`\x82"
)


def _upload(session, doc_type, category):
    files = {"file": (f"{doc_type}.png", io.BytesIO(PNG_1PX), "image/png")}
    data = {"doc_type": doc_type, "category": category}
    return session.post(f"{API}/documents/upload", files=files, data=data, timeout=30)


# ---------- Doc requirements ----------
def test_requirements_arrendatario():
    r = requests.get(f"{API}/verification/requirements", params={"category": "arrendatario"}, timeout=20)
    assert r.status_code == 200
    keys = [d["key"] for d in r.json()]
    for k in ("identificacion", "comprobante_domicilio", "comprobante_ingresos",
              "info_laboral", "referencias_personales", "referencias_laborales"):
        assert k in keys


def test_requirements_arrendador():
    r = requests.get(f"{API}/verification/requirements", params={"category": "arrendador"}, timeout=20)
    assert r.status_code == 200
    keys = [d["key"] for d in r.json()]
    for k in ("identificacion", "comprobante_domicilio", "rfc", "constancia_fiscal", "acreditacion_propiedad"):
        assert k in keys


# ---------- Upload / summary / history / download ----------
def test_tenant_upload_and_summary_and_version_and_download():
    s = _login(*TENANT)
    r = _upload(s, "identificacion", "arrendatario")
    assert r.status_code == 200, r.text
    doc1 = r.json()
    assert doc1["status"] == "pendiente"
    assert doc1["current"] is True
    assert doc1["doc_type"] == "identificacion"
    v1 = doc1["version"]

    # Re-upload same doc_type -> version increments, previous no longer current
    r2 = _upload(s, "identificacion", "arrendatario")
    assert r2.status_code == 200
    doc2 = r2.json()
    assert doc2["version"] == v1 + 1

    # Summary reflects current doc
    summ = s.get(f"{API}/my/documents", timeout=20).json()
    assert "items" in summ and "approved_required" in summ and "total_required" in summ
    ident = next(i for i in summ["items"] if i["key"] == "identificacion")
    assert ident["document"] is not None
    assert ident["document"]["version"] == doc2["version"]
    assert ident["document"]["current"] is True
    assert summ["verified"] is False  # nothing approved

    # History has both versions
    hist = s.get(f"{API}/my/documents/history", timeout=20).json()
    ids_of_ident = [h for h in hist if h["doc_type"] == "identificacion"]
    assert len(ids_of_ident) >= 2

    # Owner can download
    dl = s.get(f"{API}/documents/{doc2['id']}/download", timeout=20)
    assert dl.status_code == 200
    assert dl.content.startswith(b"\x89PNG")


def test_upload_invalid_category_and_type():
    s = _login(*TENANT)
    r = _upload(s, "identificacion", "bogus")
    assert r.status_code == 400
    r2 = _upload(s, "not_a_type", "arrendatario")
    assert r2.status_code == 400


def test_upload_requires_auth():
    files = {"file": ("x.png", io.BytesIO(PNG_1PX), "image/png")}
    r = requests.post(f"{API}/documents/upload", files=files,
                      data={"doc_type": "identificacion", "category": "arrendatario"}, timeout=20)
    assert r.status_code == 401


# ---------- Consent ----------
def test_consent_flow_records_metadata():
    s = _login(*TENANT)
    r = s.post(f"{API}/consent/credit-check", json={"accepted": True}, timeout=20)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec["accepted"] is True
    for k in ("ip_address", "date", "time", "timestamp", "consent_text",
              "consent_version", "user_agent", "evidence"):
        assert k in rec and rec[k] not in (None, "")
    # GET /my/consent returns latest
    g = s.get(f"{API}/my/consent", timeout=20).json()
    assert g["consent"]["accepted"] is True
    assert g["text"] and g["version"]


def test_consent_rejected_when_not_accepted():
    s = _login(*TENANT)
    r = s.post(f"{API}/consent/credit-check", json={"accepted": False}, timeout=20)
    assert r.status_code == 400


# ---------- Fiscal ----------
def test_landlord_fiscal_update_and_get():
    s = _login(*LANDLORD)
    payload = {"rfc": "TEST010101ABC", "bank_name": "BBVA", "account_holder": "Demo Arrendador",
               "clabe": "012345678901234567", "fiscal_regime": "RIF"}
    r = s.patch(f"{API}/users/me/fiscal", json=payload, timeout=20)
    assert r.status_code == 200
    g = s.get(f"{API}/my/fiscal", timeout=20).json()
    for k, v in payload.items():
        assert g.get(k) == v


# ---------- Admin review + permission matrix ----------
def _get_pending_doc_id(admin_session):
    docs = admin_session.get(f"{API}/admin/verification/documents", params={"status": "pendiente"}, timeout=20).json()
    assert isinstance(docs, list) and len(docs) > 0, "expected at least one pending doc"
    return docs[0]["id"]


def test_finanzas_cannot_approve():
    # Ensure a pending doc exists
    t = _login(*TENANT)
    _upload(t, "comprobante_domicilio", "arrendatario")

    s = _login(*FINANZAS)
    doc_id = _get_pending_doc_id(s)
    r = s.patch(f"{API}/admin/verification/documents/{doc_id}/review",
                json={"decision": "aprobado", "note": "TEST"}, timeout=20)
    assert r.status_code == 403


def test_external_cannot_list_admin_documents():
    t = _login(*TENANT)
    r = t.get(f"{API}/admin/verification/documents", timeout=20)
    assert r.status_code == 403


def test_reviewer_can_approve_reject_and_correction():
    # produce three fresh pending docs
    t = _login(*TENANT)
    for k in ("comprobante_ingresos", "info_laboral", "referencias_personales"):
        _upload(t, k, "arrendatario")

    admin = _login(*REVIEWER)
    docs = admin.get(f"{API}/admin/verification/documents", params={"status": "pendiente"}, timeout=20).json()
    assert len(docs) >= 3

    # approve one (with expiry), reject one, request correction on one
    approve_id = docs[0]["id"]
    reject_id = docs[1]["id"]
    correction_id = docs[2]["id"]

    r = admin.patch(f"{API}/admin/verification/documents/{approve_id}/review",
                    json={"decision": "aprobado", "note": "OK", "expiry_date": "2099-12-31"}, timeout=20)
    assert r.status_code == 200

    r = admin.patch(f"{API}/admin/verification/documents/{reject_id}/review",
                    json={"decision": "rechazado", "note": "ilegible"}, timeout=20)
    assert r.status_code == 200

    r = admin.patch(f"{API}/admin/verification/documents/{correction_id}/review",
                    json={"decision": "correccion", "note": "sube versión más clara"}, timeout=20)
    assert r.status_code == 200

    # Verify statuses persisted in tenant's own view / alerts
    summ = t.get(f"{API}/my/documents", timeout=20).json()
    doc_map = {i["key"]: i["document"] for i in summ["items"] if i["document"]}
    # find them by id
    approved = next(d for d in doc_map.values() if d["id"] == approve_id)
    assert approved["status"] == "aprobado"
    assert approved["expiry_date"] == "2099-12-31"

    alerts = t.get(f"{API}/my/alerts", timeout=20).json()
    types = {a["type"] for a in alerts}
    assert "rechazado" in types
    assert "correccion" in types


# ---------- Download access control ----------
def test_download_access_control():
    tenant = _login(*TENANT)
    r = _upload(tenant, "referencias_laborales", "arrendatario")
    doc_id = r.json()["id"]

    # Landlord (another external user) should NOT access
    landlord = _login(*LANDLORD)
    r2 = landlord.get(f"{API}/documents/{doc_id}/download", timeout=20)
    assert r2.status_code in (403, 404)

    # Internal with permission (superadmin) CAN access
    admin = _login(*SUPERADMIN)
    r3 = admin.get(f"{API}/documents/{doc_id}/download", timeout=20)
    assert r3.status_code == 200


# ---------- Admin consents list ----------
def test_admin_consents_requires_permission():
    # tenant blocked
    tenant = _login(*TENANT)
    r = tenant.get(f"{API}/admin/consents", timeout=20)
    assert r.status_code == 403
    # superadmin OK
    admin = _login(*SUPERADMIN)
    r2 = admin.get(f"{API}/admin/consents", timeout=20)
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)
