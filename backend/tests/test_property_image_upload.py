"""Tests for property image upload endpoint and public media serving."""
import io
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")

LANDLORD = {"email": "arrendador@demo.mx", "password": "Demo123!"}

# minimal valid PNG (1x1 transparent)
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f"
    b"\x00\x01\x01\x01\x00\x1b\xb6\xee\x56\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(scope="module")
def landlord_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=LANDLORD)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


class TestPropertyImageUpload:
    def test_upload_image_returns_path(self, landlord_session):
        files = {"file": ("test.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = landlord_session.post(f"{BASE_URL}/api/properties/upload-image", files=files)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "path" in data
        assert data["path"].startswith("rentalo-en-linea/properties/")
        assert data["path"].endswith(".png")
        # store for next test
        pytest.image_path = data["path"]

    def test_media_public_get(self, landlord_session):
        path = pytest.image_path
        # anonymous request (no cookie)
        r = requests.get(f"{BASE_URL}/api/media/{path}")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 0

    def test_media_docs_prefix_forbidden(self):
        r = requests.get(f"{BASE_URL}/api/media/rentalo-en-linea/docs/anything.pdf")
        assert r.status_code == 404

    def test_upload_invalid_extension(self, landlord_session):
        files = {"file": ("x.txt", io.BytesIO(b"nope"), "text/plain")}
        r = landlord_session.post(f"{BASE_URL}/api/properties/upload-image", files=files)
        assert r.status_code == 400

    def test_upload_requires_auth(self):
        files = {"file": ("test.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = requests.post(f"{BASE_URL}/api/properties/upload-image", files=files)
        assert r.status_code in (401, 403)

    def test_create_property_with_uploaded_image(self, landlord_session):
        # upload image
        files = {"file": ("cover.png", io.BytesIO(PNG_BYTES), "image/png")}
        up = landlord_session.post(f"{BASE_URL}/api/properties/upload-image", files=files)
        assert up.status_code == 200
        media_url = f"{BASE_URL}/api/media/{up.json()['path']}"

        payload = {
            "title": "TEST_prop_upload",
            "description": "test",
            "property_type": "departamento",
            "city": "CDMX", "state": "CDMX", "colonia": "Roma", "address": "",
            "price_month": 15000, "deposit": 15000, "maintenance_fee": 0,
            "bedrooms": 2, "bathrooms": 1, "parking": 0, "area_m2": 70,
            "furnished": False, "pets_allowed": False,
            "amenities": [], "images": [media_url],
        }
        r = landlord_session.post(f"{BASE_URL}/api/properties", json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert media_url in created.get("images", [])
        pid = created["id"]

        # verify persistence
        g = landlord_session.get(f"{BASE_URL}/api/properties/{pid}")
        assert g.status_code == 200
        assert media_url in g.json().get("images", [])

        # cleanup
        landlord_session.delete(f"{BASE_URL}/api/properties/{pid}")
