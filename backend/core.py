from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks  # noqa: E402,F401
from starlette.middleware.cors import CORSMiddleware  # noqa: E402,F401
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from pymongo import ReturnDocument  # noqa: E402,F401
from pymongo.errors import DuplicateKeyError  # noqa: E402,F401
from pydantic import BaseModel, Field, EmailStr  # noqa: E402,F401
from typing import List, Optional  # noqa: E402,F401
from datetime import datetime, timezone, timedelta, date  # noqa: E402,F401
import logging  # noqa: E402
import uuid  # noqa: E402
import bcrypt  # noqa: E402
import requests  # noqa: E402
import stripe  # noqa: E402
import secrets  # noqa: E402,F401
import re  # noqa: E402
import ipaddress  # noqa: E402
import httpx  # noqa: E402
from html import escape  # noqa: E402,F401
from html.parser import HTMLParser  # noqa: E402
from urllib.parse import urlparse  # noqa: E402

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")

RESEND_FROM = os.environ.get("RESEND_FROM", "Réntalo en Línea <onboarding@resend.dev>")

def send_email(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        logging.getLogger("rentalo").info(f"[EMAIL:dev] Para: {to} | Asunto: {subject}\n{html}")
        return False
    try:
        requests.post("https://api.resend.com/emails",
                      headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                      json={"from": RESEND_FROM, "to": [to], "subject": subject, "html": html}, timeout=20)
        return True
    except Exception as e:
        logging.getLogger("rentalo").error(f"Resend error: {e}")
        return False

# --- Correo transaccional gestionado (Emergent) ---
EMAIL_BASE_URL = "https://integrations.emergentagent.com"

EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")

EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Réntalo en Línea")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")

_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "seed phrase", "recovery phrase", "verify your card", "social security number",
             "confirm your bank details", "confirm your card number", "your full card number")

_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened/numeric/credential URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != host {real!r} (G3)")

async def send_email_managed(to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    if not EMAIL_KEY:
        logging.getLogger("rentalo").info(f"[EMAIL:dev] Para: {to} | Asunto: {subject}")
        return None
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                 headers={"X-Email-Key": EMAIL_KEY}, json=payload)
    resp.raise_for_status()
    return resp.json().get("id")

mongo_url = os.environ['MONGO_URL']

client = AsyncIOMotorClient(mongo_url)

db = client[os.environ['DB_NAME']]

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"

STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

SESSION_DAYS = 7

# Object storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

APP_NAME = "rentalo-en-linea"

_storage_key = None

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp",
    "gif": "image/gif", "pdf": "application/pdf",
    "mp4": "video/mp4", "webm": "video/webm", "mov": "video/quicktime", "ogg": "video/ogg",
}

def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

app = FastAPI(title="Réntalo en Línea API")

api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger("rentalo")

PROPERTY_TYPES = ["casa", "departamento", "oficina", "local", "terreno", "bodega", "industrial"]

STAFF_ROLES = [
    "superadmin", "admin_general", "operaciones", "revision_propiedades",
    "soporte", "finanzas", "cobranza", "legal", "notaria",
]

ALL_PERMISSIONS = [
    "consultar", "crear", "editar", "aprobar", "rechazar", "descargar", "eliminar",
    "administrar_pagos", "administrar_contratos", "consultar_documentos_sensibles",
    "modificar_decisiones_automaticas", "administrar_usuarios",
]

STAFF_PERMISSIONS = {
    "superadmin": list(ALL_PERMISSIONS),
    "admin_general": ["consultar", "crear", "editar", "aprobar", "rechazar", "descargar",
                       "eliminar", "administrar_pagos", "administrar_contratos",
                       "consultar_documentos_sensibles", "modificar_decisiones_automaticas",
                       "administrar_usuarios"],
    "operaciones": ["consultar", "crear", "editar", "aprobar", "rechazar", "administrar_contratos"],
    "revision_propiedades": ["consultar", "editar", "aprobar", "rechazar"],
    "soporte": ["consultar", "crear", "editar"],
    "finanzas": ["consultar", "administrar_pagos", "descargar", "consultar_documentos_sensibles"],
    "cobranza": ["consultar", "editar", "administrar_pagos"],
    "legal": ["consultar", "administrar_contratos", "consultar_documentos_sensibles", "descargar"],
    "notaria": ["consultar", "aprobar", "descargar", "consultar_documentos_sensibles"],
}

EXTERNAL_PERMISSIONS = ["consultar", "crear", "editar", "descargar", "eliminar"]

# Grant hierarchy: a principal may only assign roles at or below its own level.
ROLE_RANK = {"superadmin": 3, "admin_general": 2}

def perms_for(user: dict) -> list:
    if user.get("account_type") == "internal":
        return STAFF_PERMISSIONS.get(user.get("staff_role"), [])
    return EXTERNAL_PERMISSIONS

def has_perm(user: dict, perm: str) -> bool:
    return perm in perms_for(user)

def can_grant(actor: dict, target_staff_role: Optional[str], target_account_type: str) -> bool:
    if actor.get("account_type") != "internal":
        return False
    if "administrar_usuarios" not in perms_for(actor):
        return False
    actor_rank = ROLE_RANK.get(actor.get("staff_role"), 1)
    if target_account_type == "internal" and target_staff_role:
        target_rank = ROLE_RANK.get(target_staff_role, 1)
        return target_rank <= actor_rank
    return True

def with_perms(user: dict) -> dict:
    user = clean_user(user)
    user.setdefault("account_type", "internal" if user.get("staff_role") else "external")
    user["permissions"] = perms_for(user)
    user["public_id"] = public_id_for(user)
    return user

async def audit(actor: dict, action: str, resource: str, detail: str = ""):
    await db.audit_logs.insert_one({
        "actor_id": actor.get("id"), "actor_email": actor.get("email"),
        "actor_role": actor.get("staff_role") or actor.get("role"),
        "action": action, "resource": resource, "detail": detail,
        "at": now_utc().isoformat(),
    })

def now_utc():
    return datetime.now(timezone.utc)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"

async def next_member_no() -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": "member_no"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    return doc["seq"]

async def next_folio(prefix: str) -> str:
    ddmmyy = now_utc().strftime("%d%m%y")
    key = f"folio_{prefix}_{ddmmyy}"
    doc = await db.counters.find_one_and_update(
        {"_id": key}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    return f"{prefix}{ddmmyy}{doc['seq']:03d}"

def public_id_for(user: dict) -> Optional[str]:
    if user.get("account_type") == "internal":
        return None
    if user.get("subscriber_id"):
        return user["subscriber_id"]
    if user.get("member_no") is None:
        return None
    prefix = "A" if user.get("role") == "arrendador" else "I"
    return f"{prefix}{user['member_no']:05d}"

def set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key="session_token", value=token, httponly=True, secure=True,
        samesite="none", max_age=SESSION_DAYS * 24 * 3600, path="/",
    )

async def create_session(user_id: str) -> str:
    token = f"st_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": (now_utc() + timedelta(days=SESSION_DAYS)).isoformat(),
        "created_at": now_utc().isoformat(),
    })
    return token

def clean_user(user: dict) -> dict:
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user

async def get_token(request: Request) -> Optional[str]:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token

async def get_current_user(request: Request) -> dict:
    token = await get_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Sesión inválida")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Sesión expirada")
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return with_perms(user)

def require_permission(perm: str):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("account_type") != "internal" or not has_perm(user, perm):
            raise HTTPException(status_code=403, detail="Permiso insuficiente")
        return user
    return dep

async def require_internal(user: dict = Depends(get_current_user)):
    if user.get("account_type") != "internal":
        raise HTTPException(status_code=403, detail="Acceso restringido al personal interno")
    return user

class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: str = "arrendatario"
    phone: Optional[str] = None

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class SessionInput(BaseModel):
    session_id: str

class ActividadEconomica(BaseModel):
    actividad: Optional[str] = None
    descripcion: Optional[str] = Field(default=None, max_length=20)
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    empresa: Optional[str] = Field(default=None, max_length=25)
    jefe: Optional[str] = Field(default=None, max_length=25)

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    phone_code: Optional[str] = None
    role: Optional[str] = None
    rfc: Optional[str] = None
    curp: Optional[str] = None
    tipo_persona: Optional[str] = None
    empresa_datos: Optional[dict] = None
    actividad_economica_detalle: Optional[ActividadEconomica] = None
    empleos_anteriores: Optional[List[ActividadEconomica]] = None
    actividad_economica_submitted: Optional[bool] = None

VISIT_ACTIVE = ("solicitada", "confirmada", "reprogramada")

SLOT_TAKEN_MSG = "Ese horario ya fue reservado por otra persona. Elige otro horario."

def slot_key(property_id: str, scheduled_at: str):
    if not scheduled_at:
        return None
    try:
        dt = datetime.fromisoformat(scheduled_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return f"{property_id}|{dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M')}"
    except Exception:
        return f"{property_id}|{scheduled_at}"

async def _reserve_slot(visit_id: str, updates: dict, push: dict = None):
    """Atomic update; unique partial index on slot_key rejects double booking."""
    op = {"$set": updates}
    if push:
        op["$push"] = push
    try:
        await db.visits.update_one({"id": visit_id}, op)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail=SLOT_TAKEN_MSG)

class PropertyInput(BaseModel):
    title: str
    description: str = ""
    property_type: str
    address: str = ""
    city: str
    state: str = ""
    colonia: str = ""
    piso: str = ""
    numero_interior: str = ""
    price_month: float
    deposit: float = 0
    maintenance_fee: float = 0
    garantia_danos: bool = False
    garantia_pago_puntual: bool = False
    iva_rate: int = 0
    bedrooms: int = 0
    bathrooms: int = 0
    parking: int = 0
    work_areas: int = 0
    reception: bool = False
    area_m2: float = 0
    furnished: bool = False
    pets_allowed: bool = False
    amenities: List[str] = []
    images: List[str] = []
    review_stage: Optional[str] = None

class ApplicationInput(BaseModel):
    property_id: str
    monthly_income: float
    occupation: str = ""
    employment_type: str = "empleado_formal"
    num_occupants: int = 1
    has_guarantor: bool = False
    stay_months: int = 6
    video_url: str = ""
    message: str = ""

class StatusUpdate(BaseModel):
    status: str

class RentCheckoutInput(BaseModel):
    contract_id: str
    origin_url: str
    concept: str = "renta"

def compute_risk(income: float, rent: float, employment_type: str, has_guarantor: bool, num_occupants: int):
    score = 0
    ratio = (income / rent) if rent > 0 else 0
    if ratio >= 3:
        score += 40
    elif ratio >= 2.5:
        score += 32
    elif ratio >= 2:
        score += 24
    elif ratio >= 1.5:
        score += 12
    emp = {"empleado_formal": 25, "empresario": 22, "independiente": 15, "estudiante": 6, "otro": 6}
    score += emp.get(employment_type, 6)
    if has_guarantor:
        score += 20
    if num_occupants and num_occupants > 5:
        score -= 8
    score = max(0, min(100, score))
    if score >= 70:
        level = "bajo"
    elif score >= 45:
        level = "medio"
    else:
        level = "alto"
    return score, level, round(ratio, 2)

def compute_risk_auto(total_income, rent, num_occupants, registro_stage, has_consent):
    """Riesgo basado en reglas: ingresos (solicitante + habitantes) vs renta,
    estado de validación del registro (documentos) y consentimiento."""
    score = 0
    ratio = (total_income / rent) if rent > 0 else 0
    if ratio >= 3:
        score += 45
    elif ratio >= 2.5:
        score += 36
    elif ratio >= 2:
        score += 26
    elif ratio >= 1.5:
        score += 14
    stage_pts = {"autorizado": 35, "aprobado": 30, "en_revision": 12, "recibido": 8, "doc_faltante": 0, "rechazado": -25}
    score += stage_pts.get(registro_stage or "", 0)
    if has_consent:
        score += 10
    if num_occupants and num_occupants > 5:
        score -= 8
    score = max(0, min(100, score))
    if score >= 70:
        level = "bajo"
    elif score >= 45:
        level = "medio"
    else:
        level = "alto"
    return score, level, round(ratio, 2)

def monthly_total_to_pay(rent: float, iva_rate) -> dict:
    """Total mensual a pagar por el arrendatario: renta + cuota Réntalo 4% + mantenimiento 4% + IVA."""
    fee = round(rent * 0.04, 2)
    maintenance = round(rent * 0.04, 2)
    iva = round(rent * float(iva_rate or 0) / 100, 2)
    return {"rent": rent, "platform_fee": fee, "maintenance": maintenance, "iva": iva, "total": round(rent + fee + maintenance + iva, 2)}

VISIT_STATUSES = ["solicitada", "confirmada", "reprogramada", "cancelada", "completada", "no_asistio"]

REVEAL_ADDRESS_STATUSES = {"confirmada", "completada", "no_asistio"}

async def notify(user_id: str, ntype: str, title: str, message: str, link: str = ""):
    await db.notifications.insert_one({
        "id": new_id("ntf"), "user_id": user_id, "type": ntype, "title": title,
        "message": message, "link": link, "read": False, "created_at": now_utc().isoformat(),
    })

def exact_address(prop: dict) -> str:
    street = prop.get("address") or ""
    extras = []
    if prop.get("piso"):
        extras.append(f"Piso {prop['piso']}")
    if prop.get("numero_interior"):
        extras.append(f"Int. {prop['numero_interior']}")
    if extras:
        street = (street + (", " if street else "") + ", ".join(extras)).strip()
    parts = [street, prop.get("colonia"), prop.get("city"), prop.get("state")]
    return ", ".join([p for p in parts if p])

def _money(v) -> str:
    try:
        return f"${float(v):,.2f} MXN"
    except Exception:
        return f"${v} MXN"

def serialize_visit(v: dict, viewer_id: str, prop: Optional[dict] = None) -> dict:
    v = dict(v)
    v.pop("_id", None)
    reveal = viewer_id == v["landlord_id"] or v["status"] in REVEAL_ADDRESS_STATUSES
    if reveal and prop:
        v["exact_address"] = exact_address(prop)
    else:
        v["exact_address"] = None
    v["address_revealed"] = bool(reveal)
    return v

def property_display_status(p: dict) -> str:
    if p.get("review_stage"):
        return p["review_stage"]
    rs = p.get("review_status")
    st = p.get("status")
    if rs == "rechazada":
        return "rechazada"
    if rs == "pendiente":
        return "recibida"
    if st == "rentado":
        return "rentada"
    if st == "pausado":
        return "pausada"
    if st == "en_proceso":
        return "en_revision"
    return "publicada"

__all__ = [n for n in dir() if not n.startswith('__')]
