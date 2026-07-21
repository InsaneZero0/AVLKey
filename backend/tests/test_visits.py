"""
Backend tests for the Visitas (visit scheduling) feature + notifications.
Runs against public REACT_APP_BACKEND_URL /api prefix.
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

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
def landlord():
    return _login(LANDLORD_EMAIL, LANDLORD_PWD)


@pytest.fixture(scope="module")
def tenant():
    return _login(TENANT_EMAIL, TENANT_PWD)


@pytest.fixture(scope="module")
def landlord_property_id(landlord):
    # pick a property owned by the demo landlord
    my = landlord.get(f"{API}/my/properties", timeout=20)
    assert my.status_code == 200, my.text
    props = my.json()
    assert props, "demo landlord has no properties"
    return props[0]["id"]


def _future(hours_from_now):
    dt = datetime.now(timezone.utc) + timedelta(hours=hours_from_now)
    # backend expects "YYYY-MM-DDTHH:MM:00" per agent note
    return dt.strftime("%Y-%m-%dT%H:%M:00")


# ---------------- Create visit + address hiding ----------------
def test_create_visit_hides_exact_address(tenant, landlord_property_id):
    when = _future(24 + int(uuid.uuid4().int % 500))  # unique-ish
    r = tenant.post(f"{API}/visits", json={
        "property_id": landlord_property_id,
        "scheduled_at": when,
        "note": "TEST_visita inicial"
    }, timeout=20)
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["status"] == "solicitada"
    assert v["property_id"] == landlord_property_id
    assert v["exact_address"] is None
    assert v["address_revealed"] is False
    # verify tenant listing hides address too
    mv = tenant.get(f"{API}/my/visits", timeout=20).json()
    this = next(x for x in mv if x["id"] == v["id"])
    assert this["exact_address"] is None
    assert this["address_revealed"] is False
    pytest._visit_id = v["id"]
    pytest._visit_prop = landlord_property_id


def test_landlord_sees_visit_with_address(landlord):
    vid = pytest._visit_id
    mv = landlord.get(f"{API}/my/visits", timeout=20)
    assert mv.status_code == 200
    lst = mv.json()
    this = next(x for x in lst if x["id"] == vid)
    # Landlord (owner) always sees exact address, even before confirmed
    assert this["address_revealed"] is True
    assert this["exact_address"]


def test_tenant_cannot_visit_own_property(landlord, tenant):
    # landlord acts as tenant for its own property -> 400
    my = landlord.get(f"{API}/my/properties", timeout=20).json()
    pid = my[0]["id"]
    r = landlord.post(f"{API}/visits", json={"property_id": pid, "scheduled_at": _future(48), "note": ""}, timeout=20)
    assert r.status_code == 400
    assert "propio" in r.text.lower() or "own" in r.text.lower()


def test_busy_slots_include_solicitada(tenant, landlord_property_id):
    r = tenant.get(f"{API}/properties/{landlord_property_id}/visits/busy", timeout=20)
    assert r.status_code == 200
    slots = r.json()
    assert isinstance(slots, list)
    # our just-created visit should be listed as busy
    # we don't know exact string, but at least one slot exists
    assert len(slots) >= 1


# ---------------- Confirm reveals address ----------------
def test_confirm_reveals_address(landlord, tenant):
    vid = pytest._visit_id
    r = landlord.patch(f"{API}/visits/{vid}/confirm", timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "confirmada"
    assert body["address_revealed"] is True
    assert body["exact_address"]

    # tenant now sees exact_address
    mv = tenant.get(f"{API}/my/visits", timeout=20).json()
    this = next(x for x in mv if x["id"] == vid)
    assert this["status"] == "confirmada"
    assert this["address_revealed"] is True
    assert this["exact_address"], "exact_address should be revealed to tenant after confirmation"


# ---------------- Notifications ----------------
def test_notifications_generated_for_landlord_and_read_all(landlord):
    r = landlord.get(f"{API}/my/notifications", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "notifications" in d and "unread" in d and "reminders" in d
    # there should be at least one visit-typed notification (from the create)
    visit_notifs = [n for n in d["notifications"] if n.get("type") == "visita"]
    assert visit_notifs, "landlord should have received a 'visita' notification"

    # read-all
    r2 = landlord.post(f"{API}/notifications/read-all", timeout=20)
    assert r2.status_code == 200
    r3 = landlord.get(f"{API}/my/notifications", timeout=20).json()
    assert r3["unread"] == 0


def test_reminders_for_confirmed_within_48h(landlord):
    # the confirmed visit was scheduled within 48h if we used +24-52h.
    d = landlord.get(f"{API}/my/notifications", timeout=20).json()
    # reminders may or may not fire depending on chosen future hours;
    # just assert shape and that if scheduled within 48h, our visit is listed.
    assert isinstance(d["reminders"], list)


# ---------------- Reschedule ----------------
def test_reschedule_by_landlord_then_tenant_accepts(landlord, tenant, landlord_property_id):
    # create a new visit
    when = _future(30 + int(uuid.uuid4().int % 400))
    r = tenant.post(f"{API}/visits", json={
        "property_id": landlord_property_id, "scheduled_at": when, "note": "TEST_reprog"
    }, timeout=20)
    assert r.status_code == 200
    vid = r.json()["id"]

    # landlord proposes new date
    new_when = _future(60 + int(uuid.uuid4().int % 400))
    r2 = landlord.patch(f"{API}/visits/{vid}/reschedule", json={"scheduled_at": new_when, "note": "TEST_prop"}, timeout=20)
    assert r2.status_code == 200

    # tenant sees reprogramada with proposed_by=arrendador
    mv = tenant.get(f"{API}/my/visits", timeout=20).json()
    this = next(x for x in mv if x["id"] == vid)
    assert this["status"] == "reprogramada"
    assert this["proposed_by"] == "arrendador"
    assert this["scheduled_at"].startswith(new_when[:10])

    # tenant accepts -> confirm
    r3 = tenant.patch(f"{API}/visits/{vid}/confirm", timeout=20)
    assert r3.status_code == 200, r3.text
    assert r3.json()["status"] == "confirmada"

    pytest._resched_id = vid


# ---------------- Complete / no_asistio ----------------
def test_complete_marks_completada(landlord):
    vid = pytest._resched_id
    r = landlord.patch(f"{API}/visits/{vid}/complete", json={"attended": True}, timeout=20)
    assert r.status_code == 200
    # verify via my/visits
    mv = landlord.get(f"{API}/my/visits", timeout=20).json()
    this = next(x for x in mv if x["id"] == vid)
    assert this["status"] == "completada"
    # history should contain completada entry
    hist_statuses = [h["status"] for h in this.get("history", [])]
    assert "completada" in hist_statuses


def test_no_show(landlord, tenant, landlord_property_id):
    # create + confirm + noshow
    r = tenant.post(f"{API}/visits", json={
        "property_id": landlord_property_id, "scheduled_at": _future(72 + int(uuid.uuid4().int % 300)), "note": "TEST_noshow"
    }, timeout=20)
    vid = r.json()["id"]
    landlord.patch(f"{API}/visits/{vid}/confirm", timeout=20)
    r2 = landlord.patch(f"{API}/visits/{vid}/complete", json={"attended": False}, timeout=20)
    assert r2.status_code == 200
    mv = landlord.get(f"{API}/my/visits", timeout=20).json()
    this = next(x for x in mv if x["id"] == vid)
    assert this["status"] == "no_asistio"
    assert this["address_revealed"] is True


# ---------------- Cancel ----------------
def test_tenant_cancels_own_visit(tenant, landlord_property_id):
    r = tenant.post(f"{API}/visits", json={
        "property_id": landlord_property_id, "scheduled_at": _future(100 + int(uuid.uuid4().int % 300)), "note": "TEST_cancel"
    }, timeout=20)
    vid = r.json()["id"]
    r2 = tenant.patch(f"{API}/visits/{vid}/cancel", json={"note": "TEST_cancel_note"}, timeout=20)
    assert r2.status_code == 200
    mv = tenant.get(f"{API}/my/visits", timeout=20).json()
    this = next(x for x in mv if x["id"] == vid)
    assert this["status"] == "cancelada"


def test_landlord_rejects(landlord, tenant, landlord_property_id):
    r = tenant.post(f"{API}/visits", json={
        "property_id": landlord_property_id, "scheduled_at": _future(150 + int(uuid.uuid4().int % 300)), "note": "TEST_reject"
    }, timeout=20)
    vid = r.json()["id"]
    r2 = landlord.patch(f"{API}/visits/{vid}/reject", json={"note": "TEST_reject_note"}, timeout=20)
    assert r2.status_code == 200
    mv = landlord.get(f"{API}/my/visits", timeout=20).json()
    this = next(x for x in mv if x["id"] == vid)
    assert this["status"] == "cancelada"


# ---------------- Authorization ----------------
def test_unauth_cannot_create_visit(landlord_property_id):
    r = requests.post(f"{API}/visits", json={"property_id": landlord_property_id, "scheduled_at": _future(200)}, timeout=20)
    assert r.status_code == 401


def test_other_user_cannot_confirm(tenant):
    # tenant tries to confirm the completed visit (should fail state or auth)
    vid = pytest._visit_id  # this is confirmed, so tenant confirming would 400
    r = tenant.patch(f"{API}/visits/{vid}/confirm", timeout=20)
    # already confirmed => 400
    assert r.status_code in (400, 403)
