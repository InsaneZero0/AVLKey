from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File, Form, Header, Query, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import logging
import uuid
import bcrypt
import requests
import stripe
import secrets
import re
import ipaddress
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

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

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# RBAC — roles internos y permisos granulares (una sola organización)
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Risk scoring (simple rules)
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(data: RegisterInput, response: Response):
    email = data.email.lower()
    if data.role not in ("arrendador", "arrendatario"):
        raise HTTPException(status_code=400, detail="Rol inválido")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    user = {
        "id": new_id("user"),
        "email": email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "account_type": "external",
        "member_no": await next_member_no(),
        "subscriber_id": await next_folio("A" if data.role == "arrendador" else "I"),
        "staff_role": None,
        "phone": data.phone,
        "picture": None,
        "auth_provider": "password",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(dict(user))
    token = await create_session(user["id"])
    set_session_cookie(response, token)
    return with_perms(dict(user))


@api.post("/auth/login")
async def login(data: LoginInput, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    token = await create_session(user["id"])
    set_session_cookie(response, token)
    return with_perms(dict(user))


@api.post("/auth/session")
async def google_session(data: SessionInput, response: Response):
    try:
        r = requests.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": data.session_id}, timeout=15)
        r.raise_for_status()
        info = r.json()
    except Exception:
        raise HTTPException(status_code=400, detail="No se pudo validar la sesión de Google")
    email = info["email"].lower()
    user = await db.users.find_one({"email": email})
    if not user:
        user = {
            "id": new_id("user"),
            "email": email,
            "name": info.get("name", email),
            "password_hash": None,
            "role": "arrendatario",
            "account_type": "external",
            "member_no": await next_member_no(),
            "subscriber_id": await next_folio("I"),
            "staff_role": None,
            "phone": None,
            "picture": info.get("picture"),
            "auth_provider": "google",
            "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(dict(user))
    else:
        await db.users.update_one({"id": user["id"]}, {"$set": {"picture": info.get("picture")}})
    token = info.get("session_token") or f"st_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user["id"],
        "expires_at": (now_utc() + timedelta(days=SESSION_DAYS)).isoformat(),
        "created_at": now_utc().isoformat(),
    })
    set_session_cookie(response, token)
    return with_perms(dict(user))


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = await get_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


class ForgotInput(BaseModel):
    email: EmailStr
    origin_url: str


class ResetInput(BaseModel):
    token: str
    password: str = Field(min_length=6)


@api.post("/auth/forgot-password")
async def forgot_password(data: ForgotInput):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    # Always respond success to avoid leaking which emails exist
    if user and user.get("password_hash") is not None:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token,
            "user_id": user["id"],
            "expires_at": (now_utc() + timedelta(hours=1)).isoformat(),
            "used": False,
            "created_at": now_utc().isoformat(),
        })
        link = f"{data.origin_url.rstrip('/')}/restablecer?token={token}"
        html = (f"<div style='font-family:sans-serif'><h2>Restablece tu contraseña</h2>"
                f"<p>Hola {user['name']}, recibimos una solicitud para restablecer tu contraseña.</p>"
                f"<p><a href='{link}' style='background:#C05C3D;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none'>Restablecer contraseña</a></p>"
                f"<p>Este enlace expira en 1 hora y solo puede usarse una vez. Si no lo solicitaste, ignora este correo.</p></div>")
        send_email(email, "Restablece tu contraseña · Réntalo en Línea", html)
    return {"ok": True, "message": "Si el correo existe, enviamos un enlace de recuperación."}


@api.post("/auth/reset-password")
async def reset_password(data: ResetInput):
    record = await db.password_reset_tokens.find_one({"token": data.token})
    if not record or record.get("used"):
        raise HTTPException(status_code=400, detail="Enlace inválido o ya utilizado")
    expires_at = record["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=400, detail="El enlace ha expirado")
    await db.users.update_one({"id": record["user_id"]}, {"$set": {"password_hash": hash_password(data.password)}})
    await db.password_reset_tokens.update_one({"token": data.token}, {"$set": {"used": True, "used_at": now_utc().isoformat()}})
    await db.user_sessions.delete_many({"user_id": record["user_id"]})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Favoritos
# ---------------------------------------------------------------------------
@api.post("/favorites/{property_id}")
async def add_favorite(property_id: str, user: dict = Depends(get_current_user)):
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"favorites": property_id}})
    return {"ok": True}


@api.delete("/favorites/{property_id}")
async def remove_favorite(property_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"favorites": property_id}})
    return {"ok": True}


@api.get("/my/favorites/ids")
async def my_favorite_ids(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "favorites": 1})
    return u.get("favorites") or []


@api.get("/my/favorites")
async def my_favorites(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "favorites": 1})
    ids = u.get("favorites") or []
    props = await db.properties.find({"id": {"$in": ids}, "review_status": {"$ne": "rechazada"}}, {"_id": 0}).to_list(200)
    return props


@api.patch("/users/me")
async def update_profile(data: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {}
    if data.name is not None:
        updates["name"] = data.name
    if data.phone is not None:
        updates["phone"] = data.phone
    if data.phone_code is not None:
        updates["phone_code"] = data.phone_code
    if data.role in ("arrendador", "arrendatario"):
        updates["role"] = data.role
    if data.rfc is not None:
        updates["rfc"] = data.rfc
    if data.curp is not None:
        updates["curp"] = data.curp
    if data.tipo_persona in ("fisica", "moral"):
        updates["tipo_persona"] = data.tipo_persona
    if data.empresa_datos is not None:
        updates["empresa_datos"] = data.empresa_datos
    if data.actividad_economica_detalle is not None:
        updates["actividad_economica_detalle"] = data.actividad_economica_detalle.model_dump()
    if data.empleos_anteriores is not None:
        updates["empleos_anteriores"] = [e.model_dump() for e in data.empleos_anteriores]
    if data.actividad_economica_submitted is not None:
        updates["actividad_economica_submitted"] = data.actividad_economica_submitted
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return with_perms(updated)


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------
async def enrich_property(prop: dict) -> dict:
    owner = await db.users.find_one({"id": prop["owner_id"]}, {"_id": 0})
    prop["owner"] = {"public_id": public_id_for(owner), "name": owner.get("name"), "picture": owner.get("picture")} if owner else None
    return prop


@api.post("/properties")
async def create_property(data: PropertyInput, user: dict = Depends(get_current_user)):
    if not (user.get("account_type") == "external" or has_perm(user, "crear")):
        raise HTTPException(status_code=403, detail="No autorizado para publicar inmuebles")
    if data.property_type not in PROPERTY_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de inmueble inválido")
    prop = data.model_dump()
    prop.update({
        "id": new_id("prop"),
        "public_id": await next_folio("P"),
        "owner_id": user["id"],
        "status": "disponible",
        "review_status": "pendiente",
        "created_at": now_utc().isoformat(),
    })
    await db.properties.insert_one(dict(prop))
    prop.pop("_id", None)
    return prop


@api.get("/properties")
async def list_properties(
    q: Optional[str] = None,
    property_type: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    colonia: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    bedrooms: Optional[int] = None,
    bathrooms: Optional[int] = None,
    min_area: Optional[float] = None,
    furnished: Optional[bool] = None,
    parking: Optional[int] = None,
    pets_allowed: Optional[bool] = None,
    status: Optional[str] = "disponible",
):
    query = {}
    if status:
        query["status"] = status
    query["review_stage"] = "publicado"
    if property_type and property_type != "todos":
        query["property_type"] = property_type
    if state and state != "todos":
        query["state"] = {"$regex": state, "$options": "i"}
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if colonia:
        query["colonia"] = {"$regex": colonia, "$options": "i"}
    if bedrooms:
        query["bedrooms"] = {"$gte": bedrooms}
    if bathrooms:
        query["bathrooms"] = {"$gte": bathrooms}
    if min_area:
        query["area_m2"] = {"$gte": min_area}
    if furnished:
        query["furnished"] = True
    if parking:
        query["parking"] = {"$gte": parking}
    if pets_allowed:
        query["pets_allowed"] = True
    if min_price is not None or max_price is not None:
        price_q = {}
        if min_price is not None:
            price_q["$gte"] = min_price
        if max_price is not None:
            price_q["$lte"] = max_price
        query["price_month"] = price_q
    if q:
        query["$or"] = [
            {"public_id": {"$regex": q.strip(), "$options": "i"}},
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
            {"colonia": {"$regex": q, "$options": "i"}},
        ]
    props = await db.properties.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return props


@api.get("/properties/by-folio/{folio}")
async def get_property_by_folio(folio: str):
    prop = await db.properties.find_one(
        {"public_id": folio.strip().upper(), "review_stage": "publicado"},
        {"_id": 0, "id": 1, "public_id": 1, "title": 1},
    )
    if not prop:
        raise HTTPException(status_code=404, detail="No encontramos una propiedad publicada con ese ID")
    return prop


@api.get("/properties/{property_id}")
async def get_property(property_id: str):
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    return await enrich_property(prop)


@api.put("/properties/{property_id}")
async def update_property(property_id: str, data: PropertyInput, user: dict = Depends(get_current_user)):
    prop = await db.properties.find_one({"id": property_id})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    if prop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    await db.properties.update_one({"id": property_id}, {"$set": data.model_dump()})
    updated = await db.properties.find_one({"id": property_id}, {"_id": 0})
    return updated


@api.patch("/properties/{property_id}/status")
async def update_property_status(property_id: str, data: StatusUpdate, user: dict = Depends(get_current_user)):
    prop = await db.properties.find_one({"id": property_id})
    if not prop or prop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    await db.properties.update_one({"id": property_id}, {"$set": {"status": data.status}})
    return {"ok": True}


@api.delete("/properties/{property_id}")
async def delete_property(property_id: str, user: dict = Depends(get_current_user)):
    prop = await db.properties.find_one({"id": property_id})
    if not prop or prop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    await db.properties.delete_one({"id": property_id})
    return {"ok": True}


@api.get("/my/properties")
async def my_properties(user: dict = Depends(get_current_user)):
    props = await db.properties.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for p in props:
        p["applications_count"] = await db.applications.count_documents({"property_id": p["id"]})
        p["display_status"] = property_display_status(p)
        p["admin_note"] = user.get("admin_note")
    return props


@api.post("/properties/upload-image")
async def upload_property_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        raise HTTPException(status_code=400, detail="Formato no permitido (usa JPG, PNG, WEBP o GIF)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen excede 10 MB")
    path = f"{APP_NAME}/properties/{user['id']}/{uuid.uuid4()}.{ext}"
    content_type = MIME_TYPES.get(ext, file.content_type or "image/jpeg")
    try:
        put_object(path, data, content_type)
    except Exception as e:
        logger.error(f"Storage upload error: {e}")
        raise HTTPException(status_code=500, detail="No se pudo subir la imagen")
    return {"path": path}


@api.post("/applications/upload-video")
async def upload_application_video(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    if ext not in ("mp4", "webm", "mov", "ogg"):
        raise HTTPException(status_code=400, detail="Formato no permitido (usa MP4, WEBM, MOV u OGG)")
    data = await file.read()
    if len(data) > 60 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El video excede 60 MB")
    path = f"{APP_NAME}/properties/applications/{user['id']}/{uuid.uuid4()}.{ext}"
    content_type = MIME_TYPES.get(ext, file.content_type or "video/mp4")
    try:
        put_object(path, data, content_type)
    except Exception as e:
        logger.error(f"Storage upload error: {e}")
        raise HTTPException(status_code=500, detail="No se pudo subir el video")
    return {"path": path}


@api.get("/media/{file_path:path}")
async def get_media(file_path: str):
    if not file_path.startswith(f"{APP_NAME}/properties/"):
        raise HTTPException(status_code=404, detail="No encontrado")
    try:
        data, ct = get_object(file_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Imagen no disponible")
    return Response(content=data, media_type=ct)


# ---------------------------------------------------------------------------
# Applications (solicitudes)
# ---------------------------------------------------------------------------
@api.post("/applications")
async def create_application(data: ApplicationInput, user: dict = Depends(get_current_user)):
    if user.get("account_type") != "external":
        raise HTTPException(status_code=403, detail="Solo los usuarios externos pueden solicitar")
    prop = await db.properties.find_one({"id": data.property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    existing = await db.applications.find_one({"property_id": data.property_id, "tenant_id": user["id"], "status": {"$in": ["pendiente", "en_revision", "aprobada"]}})
    if existing:
        raise HTTPException(status_code=400, detail="Ya tienes una solicitud activa para este inmueble")
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    fi = fresh.get("fiscal_info") or {}
    cohab_income = sum(float(c.get("ingreso_mensual") or 0) for c in (fi.get("cohabitantes") or []))
    total_income = float(fi.get("ingreso_mensual") or 0) + cohab_income
    num_occ = int((fi.get("adultos_18") or 0) + (fi.get("menores_12_17") or 0) + (fi.get("ninos_0_11") or 0)) or (data.num_occupants or 1)
    rent_total = float(prop["price_month"]) + float(prop.get("maintenance_fee") or 0)
    registro_stage = fresh.get("registro_stage")
    consent_doc = await db.consents.find_one({"user_id": user["id"], "type": "credit_check"})
    has_consent = bool(consent_doc)
    score, level, ratio = compute_risk_auto(total_income, rent_total, num_occ, registro_stage, has_consent)
    capacity = round(total_income * 0.30, 2)
    app_doc = data.model_dump()
    app_doc.update({
        "id": new_id("app"),
        "tenant_id": user["id"],
        "tenant_name": user["name"],
        "owner_id": prop["owner_id"],
        "property_title": prop["title"],
        "property_price": prop["price_month"],
        "monthly_income": total_income,
        "income_total": total_income,
        "cohabitants_income": cohab_income,
        "capacity": capacity,
        "num_occupants": num_occ,
        "registro_stage": registro_stage,
        "has_consent": has_consent,
        "risk_score": score,
        "risk_level": level,
        "income_ratio": ratio,
        "status": "pendiente",
        "created_at": now_utc().isoformat(),
    })
    await db.applications.insert_one(dict(app_doc))
    app_doc.pop("_id", None)
    await notify(prop["owner_id"], "solicitud", "Nueva solicitud de arrendamiento",
                 f"{user['name']} envió una solicitud para '{prop['title']}'.", "/panel/solicitudes")
    staff = await db.users.find({"account_type": "internal"}, {"_id": 0, "id": 1}).to_list(200)
    for s in staff:
        await notify(s["id"], "solicitud", "Nueva solicitud de arrendamiento",
                     f"{user['name']} envió una solicitud para '{prop['title']}'.", "/admin/solicitudes")
    return app_doc


class LandlordVisitInput(BaseModel):
    scheduled_at: str
    note: str = ""


@api.post("/applications/{application_id}/schedule-visit")
async def schedule_visit_for_application(application_id: str, data: LandlordVisitInput, user: dict = Depends(get_current_user)):
    app_doc = await db.applications.find_one({"id": application_id}, {"_id": 0})
    if not app_doc or app_doc["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    try:
        dt = datetime.fromisoformat(data.scheduled_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="Fecha y hora inválidas")
    if dt < now_utc():
        raise HTTPException(status_code=400, detail="La fecha de la cita debe ser futura")
    prop = await db.properties.find_one({"id": app_doc["property_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    entry = {"status": "confirmada", "by": user["name"], "at": now_utc().isoformat(), "note": data.note}
    visit = {
        "id": new_id("visit"),
        "property_id": app_doc["property_id"],
        "property_title": prop["title"],
        "property_city": prop["city"],
        "property_image": (prop.get("images") or [None])[0],
        "tenant_id": app_doc["tenant_id"],
        "tenant_name": app_doc["tenant_name"],
        "landlord_id": user["id"],
        "scheduled_at": data.scheduled_at,
        "proposed_at": None,
        "proposed_by": None,
        "status": "confirmada",
        "note": data.note,
        "history": [entry],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "slot_key": slot_key(app_doc["property_id"], data.scheduled_at),
    }
    try:
        await db.visits.insert_one(dict(visit))
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail=SLOT_TAKEN_MSG)
    visit.pop("_id", None)
    await notify(app_doc["tenant_id"], "visita", "El arrendador agendó una cita",
                 f"El arrendador agendó una cita para visitar '{prop['title']}'.", "/panel/visitas")
    return serialize_visit(visit, user["id"], prop)


@api.get("/my/applications")
async def my_applications(user: dict = Depends(get_current_user)):
    apps = await db.applications.find({"tenant_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return apps


@api.get("/landlord/applications")
async def landlord_applications(user: dict = Depends(get_current_user)):
    apps = await db.applications.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return apps


@api.patch("/applications/{application_id}/status")
async def update_application_status(application_id: str, data: StatusUpdate, user: dict = Depends(get_current_user)):
    app_doc = await db.applications.find_one({"id": application_id}, {"_id": 0})
    if not app_doc or app_doc["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    if data.status not in ("pendiente", "en_revision", "aprobada", "rechazada"):
        raise HTTPException(status_code=400, detail="Estado inválido")
    await db.applications.update_one({"id": application_id}, {"$set": {"status": data.status}})
    contract = None
    if data.status == "aprobada":
        existing = await db.contracts.find_one({"application_id": application_id}, {"_id": 0})
        if not existing:
            prop = await db.properties.find_one({"id": app_doc["property_id"]}, {"_id": 0})
            commission = round(prop["price_month"] * 0.04, 2)
            start = now_utc()
            contract = {
                "id": new_id("ctr"),
                "application_id": application_id,
                "property_id": app_doc["property_id"],
                "property_title": app_doc["property_title"],
                "tenant_id": app_doc["tenant_id"],
                "tenant_name": app_doc["tenant_name"],
                "landlord_id": user["id"],
                "landlord_name": user["name"],
                "monthly_rent": prop["price_month"],
                "deposit": prop["price_month"],
                "commission": commission,
                "maintenance_fund": prop.get("maintenance_fee", 0),
                "iva_rate": int(prop.get("iva_rate") or 0),
                "iva_amount": round(prop["price_month"] * (prop.get("iva_rate") or 0) / 100, 2),
                "start_date": start.date().isoformat(),
                "end_date": (start + timedelta(days=365)).date().isoformat(),
                "term_months": 12,
                "status": "borrador",
                "created_at": now_utc().isoformat(),
            }
            await db.contracts.insert_one(dict(contract))
            contract.pop("_id", None)
            await db.properties.update_one({"id": app_doc["property_id"]}, {"$set": {"status": "en_proceso"}})
    return {"ok": True, "contract": contract}


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------
@api.get("/my/contracts")
async def my_contracts(user: dict = Depends(get_current_user)):
    q = {"$or": [{"tenant_id": user["id"]}, {"landlord_id": user["id"]}]}
    contracts = await db.contracts.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # El arrendatario no ve contratos que aún están en revisión del administrador
    contracts = [c for c in contracts if not (c.get("status") == "en_revision_admin" and c.get("tenant_id") == user["id"] and c.get("landlord_id") != user["id"])]
    for c in contracts:
        c["paid_months"] = await db.payment_transactions.count_documents({"contract_id": c["id"], "payment_status": "paid", "concept": "renta"})
        c["deposit_paid"] = bool(c.get("deposit_registered")) or (await db.payment_transactions.count_documents({"contract_id": c["id"], "payment_status": "paid", "concept": "deposito"})) > 0
    return contracts


@api.post("/my/contracts/{contract_id}/signed-pdf")
async def upload_signed_contract(contract_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    c = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not c or user["id"] not in (c["tenant_id"], c["landlord_id"]):
        raise HTTPException(status_code=403, detail="No autorizado")
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext != "pdf":
        raise HTTPException(status_code=400, detail="Solo se permite PDF")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El PDF excede 15 MB")
    path = f"{APP_NAME}/contracts/{contract_id}/firmado_{uuid.uuid4()}.pdf"
    try:
        put_object(path, data, "application/pdf")
    except Exception as e:
        logger.error(f"Storage upload error: {e}")
        raise HTTPException(status_code=500, detail="No se pudo subir el contrato")
    now = now_utc().isoformat()
    await db.contracts.update_one({"id": contract_id}, {"$set": {
        "signed_pdf_path": path, "signed_pdf_uploaded_at": now, "signed_pdf_uploaded_by": user["id"], "signed_pdf_filename": file.filename}})
    other = c["landlord_id"] if user["id"] == c["tenant_id"] else c["tenant_id"]
    await notify(other, "contrato", "Contrato firmado cargado", f"{user['name']} subió el contrato firmado de '{c['property_title']}'.", "/panel/contratos")
    return {"path": path, "uploaded_at": now}


@api.get("/my/contracts/{contract_id}/signed-pdf")
async def download_signed_contract(contract_id: str, user: dict = Depends(get_current_user)):
    c = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not c or not c.get("signed_pdf_path"):
        raise HTTPException(status_code=404, detail="Contrato firmado no disponible")
    if user["id"] not in (c["tenant_id"], c["landlord_id"]) and user.get("account_type") != "internal":
        raise HTTPException(status_code=403, detail="No autorizado")
    try:
        data, ct = get_object(c["signed_pdf_path"])
    except Exception:
        raise HTTPException(status_code=404, detail="Archivo no disponible")
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="contrato_firmado_{c.get("property_public_id") or contract_id}.pdf"'})


@api.get("/contracts/{contract_id}")
async def get_contract(contract_id: str, user: dict = Depends(get_current_user)):
    c = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not c or user["id"] not in (c["tenant_id"], c["landlord_id"]):
        raise HTTPException(status_code=403, detail="No autorizado")
    c["payments"] = await db.payment_transactions.find({"contract_id": contract_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return c


@api.patch("/contracts/{contract_id}/status")
async def update_contract_status(contract_id: str, data: StatusUpdate, user: dict = Depends(get_current_user)):
    c = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not c or c["landlord_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    if data.status not in ("borrador", "activo", "finalizado"):
        raise HTTPException(status_code=400, detail="Estado inválido")
    await db.contracts.update_one({"id": contract_id}, {"$set": {"status": data.status}})
    if data.status == "activo":
        await db.properties.update_one({"id": c["property_id"]}, {"$set": {"status": "rentado"}})
    elif data.status == "finalizado":
        await db.properties.update_one({"id": c["property_id"]}, {"$set": {"status": "disponible"}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Payments (Stripe)
# ---------------------------------------------------------------------------
@api.post("/payments/rent/checkout")
async def rent_checkout(data: RentCheckoutInput, user: dict = Depends(get_current_user)):
    contract = await db.contracts.find_one({"id": data.contract_id}, {"_id": 0})
    if not contract or contract["tenant_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    concept = data.concept
    if concept == "deposito":
        amount = float(contract.get("deposit", 0))
        label = "Depósito en garantía"
        already = contract.get("deposit_registered") or await db.payment_transactions.find_one({"contract_id": contract["id"], "payment_status": "paid", "concept": "deposito"})
        if already:
            raise HTTPException(status_code=400, detail="El depósito en garantía ya fue pagado")
    else:
        amount = float(contract["monthly_rent"])
        label = "Renta mensual"
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Monto inválido")
    origin = data.origin_url.rstrip("/")
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": "mxn",
                    "product_data": {"name": f"{label} - {contract['property_title']}"},
                    "unit_amount": int(round(amount * 100)),
                },
                "quantity": 1,
            }],
            success_url=f"{origin}/pago/exito?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/pago/cancelado",
            metadata={"contract_id": data.contract_id, "tenant_id": user["id"], "concept": concept},
        )
    except Exception as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(status_code=500, detail="Error al crear la sesión de pago")
    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "contract_id": data.contract_id,
        "tenant_id": user["id"],
        "landlord_id": contract["landlord_id"],
        "property_title": contract["property_title"],
        "concept": concept,
        "amount": amount,
        "currency": "mxn",
        "status": "initiated",
        "payment_status": "pending",
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    })
    return {"checkout_url": session.url, "session_id": session.id}


@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "stripe_payment_intent_id": s.payment_intent,
                              "updated_at": now_utc().isoformat()}},
                )
                record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
                await _reconcile_checkout_payment(record)
        except Exception:
            pass
    return {"session_id": record["session_id"], "status": record["status"], "payment_status": record["payment_status"], "concept": record.get("concept"), "amount": record.get("amount")}


async def _reconcile_checkout_payment(record: dict):
    """Reflect a paid Stripe Checkout in rent_charges / contract so statements show it."""
    if not record or record.get("payment_status") != "paid" or record.get("reconciled"):
        return
    contract = await db.contracts.find_one({"id": record["contract_id"]}, {"_id": 0})
    if not contract:
        return
    now = now_utc().isoformat()
    if record.get("concept") == "deposito":
        await db.contracts.update_one({"id": contract["id"], "deposit_registered": {"$ne": True}}, {"$set": {
            "deposit_registered": True, "deposit_registered_at": now, "deposit_reference": f"Stripe {record.get('stripe_payment_intent_id') or record['session_id']}"}})
        period = None
    else:
        charge = await db.rent_charges.find_one({"contract_id": contract["id"], "status": {"$ne": "pagado"}}, {"_id": 0}, sort=[("period", 1)])
        if not charge:
            prop = await db.properties.find_one({"id": contract["property_id"]}, {"_id": 0}) or {}
            period = now_utc().strftime("%Y-%m")
            is_first = (await db.rent_charges.count_documents({"contract_id": contract["id"]})) == 0
            charge = await _ensure_charge(contract, prop, period, is_first)
        period = charge["period"]
        await db.rent_charges.update_one({"id": charge["id"]}, {"$set": {
            "status": "pagado", "paid_at": now, "last_error": None, "payment_method": "stripe_checkout",
            "stripe_payment_intent_id": record.get("stripe_payment_intent_id") or record["session_id"]}})
    await db.payment_transactions.update_one({"session_id": record["session_id"]}, {"$set": {
        "reconciled": True, "period": period, "tenant_name": contract.get("tenant_name", ""), "landlord_name": contract.get("landlord_name", "")}})


@api.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Firma inválida")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                      "stripe_payment_intent_id": obj.get("payment_intent"),
                      "updated_at": now_utc().isoformat()}},
        )
        await _reconcile_checkout_payment(await db.payment_transactions.find_one({"session_id": obj["id"]}, {"_id": 0}))
    return {"status": "ok"}


@api.get("/my/payments")
async def my_payments(user: dict = Depends(get_current_user)):
    q = {"$or": [{"tenant_id": user["id"]}, {"landlord_id": user["id"]}]}
    payments = await db.payment_transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return payments

# ---------------------------------------------------------------------------
# Cobros / Stripe Connect (modelo retenido: plataforma cobra y dispersa)
# ---------------------------------------------------------------------------
class OriginInput(BaseModel):
    origin_url: str


class SessionInput(BaseModel):
    session_id: str


class DisperseInput(BaseModel):
    reference: str = ""


CRON_SECRET = os.environ.get("CRON_SECRET", "rentalo-cron-2026")


def compute_charge_amounts(contract: dict, prop: dict, is_first: bool) -> dict:
    rent = float(contract.get("monthly_rent") or 0)
    maintenance = round(rent * 0.04, 2)
    commission = round(rent * 0.04, 2)
    g_danos = round(rent * 0.05, 2) if prop.get("garantia_danos") else 0.0
    g_pago = round(rent * 0.05, 2) if prop.get("garantia_pago_puntual") else 0.0
    deposit = float(contract.get("deposit") or rent) if is_first else 0.0
    base_total = round(rent + maintenance + deposit, 2)
    net_landlord = round(rent - commission - g_danos - g_pago, 2)
    retained = round(deposit + g_danos + g_pago + maintenance, 2)
    return {
        "rent": rent, "maintenance": maintenance, "commission": commission,
        "guarantee_danos": g_danos, "guarantee_pago": g_pago, "deposit": deposit,
        "base_total": base_total, "late_fee": 0.0, "tenant_total": base_total,
        "net_landlord": net_landlord, "retained": retained,
    }


async def get_or_create_customer(udoc: dict) -> str:
    if udoc.get("stripe_customer_id"):
        return udoc["stripe_customer_id"]
    cust = stripe.Customer.create(email=udoc["email"], name=udoc.get("name", ""), metadata={"user_id": udoc["id"]})
    await db.users.update_one({"id": udoc["id"]}, {"$set": {"stripe_customer_id": cust.id}})
    return cust.id


def _period_now() -> str:
    return now_utc().strftime("%Y-%m")


async def _ensure_charge(contract: dict, prop: dict, period: str, is_first: bool) -> dict:
    existing = await db.rent_charges.find_one({"contract_id": contract["id"], "period": period}, {"_id": 0})
    if existing:
        return existing
    a = compute_charge_amounts(contract, prop, is_first)
    doc = {
        "id": new_id("chg"),
        "contract_id": contract["id"],
        "property_id": contract.get("property_id"),
        "property_public_id": prop.get("public_id", ""),
        "property_title": contract.get("property_title", ""),
        "tenant_id": contract["tenant_id"],
        "tenant_name": contract.get("tenant_name", ""),
        "landlord_id": contract["landlord_id"],
        "landlord_name": contract.get("landlord_name", ""),
        "period": period,
        "due_date": f"{period}-05",
        "is_first": is_first,
        **a,
        "status": "pendiente",
        "stripe_payment_intent_id": None,
        "last_error": None,
        "paid_at": None,
        "dispersed": False,
        "dispersed_at": None,
        "dispersal_ref": None,
        "dispersal_method": None,
        "created_at": now_utc().isoformat(),
    }
    await db.rent_charges.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def _charge_now(charge: dict, tenant: dict) -> dict:
    if charge.get("status") == "pagado":
        return charge
    try:
        pi = stripe.PaymentIntent.create(
            amount=int(round(charge["tenant_total"] * 100)),
            currency="mxn",
            customer=tenant["stripe_customer_id"],
            payment_method=tenant["default_payment_method_id"],
            off_session=True, confirm=True,
            description=f"Renta {charge['period']} - {charge['property_title']}",
            metadata={"charge_id": charge["id"], "contract_id": charge["contract_id"]},
        )
        await db.rent_charges.update_one(
            {"id": charge["id"]},
            {"$set": {"status": "pagado", "stripe_payment_intent_id": pi.id, "paid_at": now_utc().isoformat(), "last_error": None}},
        )
        await db.payment_transactions.update_one(
            {"session_id": pi.id},
            {"$set": {
                "session_id": pi.id,
                "contract_id": charge["contract_id"],
                "tenant_id": charge["tenant_id"],
                "tenant_name": charge.get("tenant_name", ""),
                "landlord_id": charge["landlord_id"],
                "landlord_name": charge.get("landlord_name", ""),
                "property_title": charge.get("property_title", ""),
                "property_public_id": charge.get("property_public_id", ""),
                "concept": "renta",
                "period": charge["period"],
                "amount": charge["tenant_total"],
                "currency": "mxn",
                "status": "completed",
                "payment_status": "paid",
                "stripe_payment_intent_id": pi.id,
                "created_at": now_utc().isoformat(),
                "updated_at": now_utc().isoformat(),
            }},
            upsert=True,
        )
        await notify(charge["tenant_id"], "pago", "Pago de renta procesado",
                     f"Se cobró el periodo {charge['period']} por ${charge['tenant_total']:,.0f} MX.", "/panel/pagos")
        charge.update({"status": "pagado", "stripe_payment_intent_id": pi.id})
        try:
            await _send_receipt_email(tenant, charge)
        except Exception as e:
            logger.error(f"receipt email error: {e}")
    except stripe.error.CardError as e:
        err = str(getattr(e, "user_message", None) or e)
        await db.rent_charges.update_one({"id": charge["id"]}, {"$set": {"status": "fallido", "last_error": err}})
        charge["status"] = "fallido"
        charge["last_error"] = err
    except stripe.error.StripeError as e:
        err = str(getattr(e, "user_message", None) or e)
        await db.rent_charges.update_one({"id": charge["id"]}, {"$set": {"status": "fallido", "last_error": err}})
        charge["status"] = "fallido"
        charge["last_error"] = err
    return charge


async def _attempt_autocharge(charge: dict) -> dict:
    tenant = await db.users.find_one({"id": charge["tenant_id"]})
    if not tenant or not tenant.get("default_payment_method_id"):
        return charge
    return await _charge_now(charge, tenant)


async def _generate_period(period: str) -> list:
    contracts = await db.contracts.find({"status": "activo"}, {"_id": 0}).to_list(1000)
    results = []
    for c in contracts:
        prop = await db.properties.find_one({"id": c["property_id"]}, {"_id": 0}) or {}
        is_first = (await db.rent_charges.count_documents({"contract_id": c["id"]})) == 0
        charge = await _ensure_charge(c, prop, period, is_first)
        charge = await _attempt_autocharge(charge)
        results.append(charge)
    return results


# --- Recargos por atraso y correos (recibo / recordatorio) ---
def _fmt_money(v) -> str:
    return f"${float(v or 0):,.0f} MX"


async def _apply_late_fee(charge: dict) -> dict:
    if charge.get("status") == "pagado" or float(charge.get("late_fee") or 0) > 0:
        return charge
    today = now_utc().date().isoformat()
    if charge.get("due_date") and today > charge["due_date"]:
        late = round(float(charge.get("rent") or 0) * 0.10, 2)
        base = float(charge.get("base_total") or charge.get("tenant_total") or 0)
        new_total = round(base + late, 2)
        await db.rent_charges.update_one({"id": charge["id"]}, {"$set": {"late_fee": late, "tenant_total": new_total}})
        charge["late_fee"] = late
        charge["tenant_total"] = new_total
    return charge


def _receipt_html(charge: dict, tenant_name: str) -> str:
    rows = [("Renta mensual", charge.get("rent"))]
    if float(charge.get("maintenance") or 0) > 0:
        rows.append(("Mantenimiento (4%)", charge.get("maintenance")))
    if float(charge.get("deposit") or 0) > 0:
        rows.append(("Depósito en garantía", charge.get("deposit")))
    if float(charge.get("late_fee") or 0) > 0:
        rows.append(("Recargo por pago tardío (10%)", charge.get("late_fee")))
    row_html = "".join(
        f'<tr><td style="padding:6px 0;color:#57534e">{escape(lbl)}</td>'
        f'<td style="padding:6px 0;text-align:right;color:#1c1917">{_fmt_money(val)}</td></tr>'
        for lbl, val in rows)
    return (
        f'<table role="presentation" width="100%" style="max-width:560px;margin:auto;'
        f'font-family:Arial,sans-serif"><tr><td style="padding:24px">'
        f'<h2 style="color:#0f2740;margin:0 0 4px">Recibo de pago de renta</h2>'
        f'<p style="color:#57534e;margin:0 0 16px">Hola {escape(tenant_name)}, recibimos tu pago correctamente.</p>'
        f'<p style="color:#1c1917;margin:0 0 12px"><strong>Inmueble:</strong> {escape(charge.get("property_title",""))}'
        f'<br><strong>Periodo:</strong> {escape(charge.get("period",""))}</p>'
        f'<table role="presentation" width="100%" style="border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4">'
        f'{row_html}</table>'
        f'<p style="text-align:right;font-size:18px;color:#0f2740;margin:12px 0"><strong>Total pagado: {_fmt_money(charge.get("tenant_total"))}</strong></p>'
        f'<p style="font-size:12px;color:#a8a29e;margin-top:20px">Enviado por {escape(EMAIL_FROM_NAME)}. '
        f'Nunca te pediremos tu contraseña ni datos de tarjeta por correo.</p>'
        f'</td></tr></table>')


def _reminder_html(charge: dict, tenant_name: str) -> str:
    late = float(charge.get("late_fee") or 0)
    extra = (f'<p style="color:#b91c1c;margin:0 0 12px">Se aplicó un recargo por pago tardío del 10% '
             f'({_fmt_money(late)}).</p>' if late > 0 else "")
    return (
        f'<table role="presentation" width="100%" style="max-width:560px;margin:auto;'
        f'font-family:Arial,sans-serif"><tr><td style="padding:24px">'
        f'<h2 style="color:#0f2740;margin:0 0 4px">Tu renta está vencida</h2>'
        f'<p style="color:#57534e;margin:0 0 12px">Hola {escape(tenant_name)}, tu renta del periodo '
        f'<strong>{escape(charge.get("period",""))}</strong> del inmueble '
        f'{escape(charge.get("property_title",""))} aún no ha sido pagada.</p>'
        f'{extra}'
        f'<p style="color:#1c1917;margin:0 0 12px">Total a pagar: <strong>{_fmt_money(charge.get("tenant_total"))}</strong>. '
        f'Ingresa a tu panel de Réntalo en Línea, sección Pagos, para liquidarlo.</p>'
        f'<p style="font-size:12px;color:#a8a29e;margin-top:20px">Enviado por {escape(EMAIL_FROM_NAME)}. '
        f'Nunca te pediremos tu contraseña ni datos de tarjeta por correo.</p>'
        f'</td></tr></table>')


async def _send_receipt_email(tenant: dict, charge: dict):
    if not tenant or not tenant.get("email"):
        return
    subject = f"Recibo de tu renta {charge.get('period','')} · {EMAIL_FROM_NAME}"
    await send_email_managed(tenant["email"], subject, _receipt_html(charge, tenant.get("name", "arrendatario")))


async def _send_reminder_email(tenant: dict, charge: dict):
    if not tenant or not tenant.get("email"):
        return
    subject = f"Renta vencida {charge.get('period','')} · {EMAIL_FROM_NAME}"
    await send_email_managed(tenant["email"], subject, _reminder_html(charge, tenant.get("name", "arrendatario")))


async def _payments_daily():
    today = now_utc().date().isoformat()
    charges = await db.rent_charges.find({"status": {"$in": ["pendiente", "fallido"]}}, {"_id": 0}).to_list(3000)
    for c in charges:
        if c.get("due_date") and today > c["due_date"]:
            c = await _apply_late_fee(c)
            await notify(c["tenant_id"], "pago", "Renta vencida",
                         f"Tu renta del periodo {c['period']} está vencida. Se aplicó un recargo del 10%. "
                         f"Total a pagar: ${c['tenant_total']:,.0f} MX.", "/panel/pagos")
            tenant = await db.users.find_one({"id": c["tenant_id"]})
            try:
                await _send_reminder_email(tenant, c)
            except Exception as e:
                logger.error(f"reminder email error: {e}")


# --- Tarjeta guardada del arrendatario (Stripe Checkout setup) ---
@api.post("/payments/card/setup-session")
async def card_setup_session(data: OriginInput, user: dict = Depends(get_current_user)):
    udoc = await db.users.find_one({"id": user["id"]})
    cust_id = await get_or_create_customer(udoc)
    origin = data.origin_url.rstrip("/")
    session = stripe.checkout.Session.create(
        mode="setup", customer=cust_id, payment_method_types=["card"],
        success_url=f"{origin}/panel/pagos?card_session={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/panel/pagos?card=cancel",
    )
    return {"checkout_url": session.url}


@api.post("/payments/card/confirm")
async def card_confirm(data: SessionInput, user: dict = Depends(get_current_user)):
    session = stripe.checkout.Session.retrieve(data.session_id)
    si = stripe.SetupIntent.retrieve(session.setup_intent)
    pm = stripe.PaymentMethod.retrieve(si.payment_method)
    cust_id = session.customer
    stripe.Customer.modify(cust_id, invoice_settings={"default_payment_method": pm.id})
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "stripe_customer_id": cust_id, "default_payment_method_id": pm.id,
        "card_brand": pm.card.brand, "card_last4": pm.card.last4,
    }})
    return {"brand": pm.card.brand, "last4": pm.card.last4}


@api.get("/payments/card")
async def get_card(user: dict = Depends(get_current_user)):
    udoc = await db.users.find_one({"id": user["id"]})
    if not udoc.get("default_payment_method_id"):
        return {"has_card": False}
    return {"has_card": True, "brand": udoc.get("card_brand"), "last4": udoc.get("card_last4")}


# --- Onboarding Connect del arrendador ---
@api.post("/payments/connect/onboard")
async def connect_onboard(data: OriginInput, user: dict = Depends(get_current_user)):
    if user.get("role") != "arrendador":
        raise HTTPException(status_code=403, detail="Solo arrendadores")
    udoc = await db.users.find_one({"id": user["id"]})
    acct_id = udoc.get("stripe_connect_account_id")
    try:
        if not acct_id:
            acct = stripe.Account.create(
                type="express", country="MX", email=udoc["email"],
                capabilities={"transfers": {"requested": True}},
                business_type="individual", metadata={"user_id": user["id"]},
            )
            acct_id = acct.id
            await db.users.update_one({"id": user["id"]}, {"$set": {"stripe_connect_account_id": acct_id, "connect_status": "pending"}})
        origin = data.origin_url.rstrip("/")
        link = stripe.AccountLink.create(
            account=acct_id,
            refresh_url=f"{origin}/panel/pagos?connect=refresh",
            return_url=f"{origin}/panel/pagos?connect=done",
            type="account_onboarding",
        )
        return {"enabled": True, "url": link.url}
    except stripe.error.StripeError as e:
        msg = str(getattr(e, "user_message", None) or e)
        return {"enabled": False, "message": "Stripe Connect aún no está habilitado en la plataforma; el administrador debe activarlo en el panel de Stripe.", "detail": msg[:160]}


@api.get("/payments/connect/status")
async def connect_status(user: dict = Depends(get_current_user)):
    udoc = await db.users.find_one({"id": user["id"]})
    acct_id = udoc.get("stripe_connect_account_id")
    if not acct_id:
        return {"connected": False, "status": "none"}
    try:
        acct = stripe.Account.retrieve(acct_id)
        status = "active" if (acct.charges_enabled and acct.payouts_enabled) else "pending"
        await db.users.update_one({"id": user["id"]}, {"$set": {"connect_status": status}})
        return {"connected": True, "status": status, "charges_enabled": acct.charges_enabled, "payouts_enabled": acct.payouts_enabled}
    except stripe.error.StripeError:
        return {"connected": True, "status": udoc.get("connect_status", "pending")}


# --- Cobros de renta ---
@api.post("/payments/contracts/{cid}/start-billing")
async def start_billing(cid: str, user: dict = Depends(get_current_user)):
    c = await db.contracts.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if not user.get("staff_role") and user["id"] not in (c["landlord_id"], c["tenant_id"]):
        raise HTTPException(status_code=403, detail="No autorizado")
    prop = await db.properties.find_one({"id": c["property_id"]}, {"_id": 0}) or {}
    period = _period_now()
    is_first = (await db.rent_charges.count_documents({"contract_id": cid})) == 0
    charge = await _ensure_charge(c, prop, period, is_first)
    await db.contracts.update_one({"id": cid}, {"$set": {"billing_active": True}})
    charge = await _attempt_autocharge(charge)
    return charge


@api.post("/payments/charges/{chg_id}/pay")
async def pay_charge(chg_id: str, user: dict = Depends(get_current_user)):
    charge = await db.rent_charges.find_one({"id": chg_id}, {"_id": 0})
    if not charge or charge["tenant_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    if charge.get("status") == "pagado":
        return charge
    tenant = await db.users.find_one({"id": user["id"]})
    if not tenant.get("default_payment_method_id"):
        raise HTTPException(status_code=400, detail="Primero guarda una tarjeta para poder pagar")
    charge = await _apply_late_fee(charge)
    charge = await _charge_now(charge, tenant)
    if charge.get("status") != "pagado":
        raise HTTPException(status_code=400, detail=charge.get("last_error") or "No se pudo procesar el pago con tu tarjeta")
    return charge


@api.get("/my/rent-charges")
async def my_rent_charges(user: dict = Depends(get_current_user)):
    q = {"$or": [{"tenant_id": user["id"]}, {"landlord_id": user["id"]}]}
    return await db.rent_charges.find(q, {"_id": 0}).sort("period", -1).to_list(300)


# --- Panel admin de finanzas ---
@api.get("/admin/finance/summary")
async def finance_summary(user: dict = Depends(require_permission("administrar_pagos"))):
    charges = await db.rent_charges.find({}, {"_id": 0}).to_list(5000)
    paid = [c for c in charges if c["status"] == "pagado"]
    return {
        "total_charges": len(charges),
        "total_collected": round(sum(c["tenant_total"] for c in paid), 2),
        "commission_earned": round(sum(c["commission"] for c in paid), 2),
        "retained": round(sum(c["retained"] for c in paid), 2),
        "pending_dispersal": round(sum(c["net_landlord"] for c in paid if not c.get("dispersed")), 2),
        "dispersed_total": round(sum(c["net_landlord"] for c in paid if c.get("dispersed")), 2),
        "pending_count": len([c for c in charges if c["status"] == "pendiente"]),
        "failed_count": len([c for c in charges if c["status"] == "fallido"]),
    }


@api.get("/admin/finance/charges")
async def finance_charges(user: dict = Depends(require_permission("administrar_pagos"))):
    return await db.rent_charges.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.get("/admin/finance/statement/{user_id}")
async def finance_statement(user_id: str, user: dict = Depends(require_permission("consultar"))):
    ll = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not ll:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    charges = await db.rent_charges.find({"landlord_id": user_id}, {"_id": 0}).sort("period", -1).to_list(1000)
    paid = [c for c in charges if c["status"] == "pagado"]
    totals = {
        "gross_collected": round(sum(c["tenant_total"] for c in paid), 2),
        "commission": round(sum(c["commission"] for c in paid), 2),
        "net_total": round(sum(c["net_landlord"] for c in paid), 2),
        "dispersed": round(sum(c["net_landlord"] for c in paid if c.get("dispersed")), 2),
        "pending_dispersal": round(sum(c["net_landlord"] for c in paid if not c.get("dispersed")), 2),
        "retained": round(sum(c["retained"] for c in paid), 2),
        "paid_count": len(paid), "total_count": len(charges),
    }
    landlord = {
        "id": ll["id"], "name": ll.get("name"), "email": ll.get("email"),
        "public_id": public_id_for(with_perms(dict(ll))), "phone": ll.get("phone"),
        "connect_status": ll.get("connect_status", "none"),
    }
    contracts = await db.contracts.find({"landlord_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    paid_deposit_contracts = {c["contract_id"] for c in charges if c.get("is_first") and c.get("status") == "pagado"}
    deposits = [{
        "contract_id": c["id"],
        "property_title": c.get("property_title", ""),
        "tenant_name": c.get("tenant_name", ""),
        "deposit_amount": float(c.get("deposit") or 0),
        "registered": bool(c.get("deposit_registered")),
        "registered_at": c.get("deposit_registered_at"),
        "reference": c.get("deposit_reference"),
    } for c in contracts if float(c.get("deposit") or 0) > 0 and c["id"] in paid_deposit_contracts]
    payments = await db.payment_transactions.find({"landlord_id": user_id, "payment_status": "paid"}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    totals["stripe_paid"] = round(sum(float(p.get("amount") or 0) for p in payments), 2)
    return {"landlord": landlord, "charges": charges, "totals": totals, "deposits": deposits, "payments": payments}


@api.get("/admin/finance/tenant-statement/{user_id}")
async def tenant_statement(user_id: str, user: dict = Depends(require_permission("consultar"))):
    t = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    charges = await db.rent_charges.find({"tenant_id": user_id}, {"_id": 0}).sort("period", -1).to_list(1000)
    paid = [c for c in charges if c["status"] == "pagado"]
    pending = [c for c in charges if c["status"] != "pagado"]
    totals = {
        "paid_total": round(sum(c["tenant_total"] for c in paid), 2),
        "pending_total": round(sum(c["tenant_total"] for c in pending), 2),
        "late_fees": round(sum(float(c.get("late_fee") or 0) for c in charges), 2),
        "deposits": round(sum(float(c.get("deposit") or 0) for c in paid), 2),
        "paid_count": len(paid), "total_count": len(charges),
    }
    contracts = await db.contracts.find({"tenant_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    tenant = {"id": t["id"], "name": t.get("name"), "email": t.get("email"), "phone": t.get("phone"),
              "public_id": public_id_for(with_perms(dict(t)))}
    payments = await db.payment_transactions.find({"tenant_id": user_id, "payment_status": "paid"}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    totals["stripe_paid"] = round(sum(float(p.get("amount") or 0) for p in payments), 2)
    return {"tenant": tenant, "charges": charges, "totals": totals, "payments": payments, "contracts": [{
        "id": c["id"], "property_title": c.get("property_title", ""), "landlord_name": c.get("landlord_name", ""),
        "monthly_rent": c.get("monthly_rent", 0), "status": c.get("status"), "start_date": c.get("start_date"), "end_date": c.get("end_date"),
        "deposit": float(c.get("deposit") or 0), "deposit_registered": bool(c.get("deposit_registered")),
    } for c in contracts]}


@api.post("/admin/finance/contracts/{cid}/register-deposit")
async def register_deposit(cid: str, data: DisperseInput, user: dict = Depends(require_permission("administrar_pagos"))):
    c = await db.contracts.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if c.get("deposit_registered"):
        raise HTTPException(status_code=400, detail="El depósito ya está registrado")
    await db.contracts.update_one({"id": cid}, {"$set": {
        "deposit_registered": True,
        "deposit_registered_at": now_utc().isoformat(),
        "deposit_reference": data.reference or "",
    }})
    await notify(c["landlord_id"], "pago", "Depósito en garantía registrado",
                 f"Se registró el depósito en garantía de {_money(c.get('deposit'))} del inmueble "
                 f"{c.get('property_title','')} (retenido en custodia).", "/panel/pagos")
    return {"ok": True}


@api.post("/admin/finance/generate")
async def finance_generate(user: dict = Depends(require_permission("administrar_pagos"))):
    period = _period_now()
    results = await _generate_period(period)
    return {"period": period, "generated": len(results)}


@api.post("/admin/finance/charges/{chg_id}/disperse")
async def finance_disperse(chg_id: str, data: DisperseInput, user: dict = Depends(require_permission("administrar_pagos"))):
    charge = await db.rent_charges.find_one({"id": chg_id}, {"_id": 0})
    if not charge:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    if charge["status"] != "pagado":
        raise HTTPException(status_code=400, detail="Solo puedes dispersar cobros pagados")
    if charge.get("dispersed"):
        raise HTTPException(status_code=400, detail="Este cobro ya fue dispersado")
    method = "manual"
    ref = data.reference or ""
    landlord = await db.users.find_one({"id": charge["landlord_id"]})
    acct_id = (landlord or {}).get("stripe_connect_account_id")
    connect_status = (landlord or {}).get("connect_status")
    if acct_id and connect_status == "active":
        try:
            tr = stripe.Transfer.create(
                amount=int(round(charge["net_landlord"] * 100)), currency="mxn",
                destination=acct_id, metadata={"charge_id": chg_id},
            )
            method = "stripe_transfer"
            ref = tr.id
        except stripe.error.StripeError as e:
            method = "manual"
            ref = ref or f"transfer_error:{str(e)[:60]}"
    await db.rent_charges.update_one({"id": chg_id}, {"$set": {
        "dispersed": True, "dispersed_at": now_utc().isoformat(),
        "dispersal_ref": ref, "dispersal_method": method,
    }})
    await notify(charge["landlord_id"], "pago", "Dispersión registrada",
                 f"Se registró tu pago neto de ${charge['net_landlord']:,.0f} MX del periodo {charge['period']}.", "/panel/pagos")
    return {"ok": True, "method": method, "reference": ref}


@api.post("/cron/rent-billing")
async def cron_rent_billing(request: Request, background_tasks: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not secrets.compare_digest(token, os.environ.get("WEBHOOK_CRON_SECRET", "")):
        raise HTTPException(status_code=401, detail="No autorizado")
    period = _period_now()
    background_tasks.add_task(_generate_period, period)
    return {"ok": True, "period": period}


@api.post("/cron/payments-daily")
async def cron_payments_daily(request: Request, background_tasks: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not secrets.compare_digest(token, os.environ.get("WEBHOOK_CRON_SECRET", "")):
        raise HTTPException(status_code=401, detail="No autorizado")
    background_tasks.add_task(_payments_daily)
    return {"ok": True}




# ---------------------------------------------------------------------------
# Visitas (agendamiento) + notificaciones
# ---------------------------------------------------------------------------
VISIT_STATUSES = ["solicitada", "confirmada", "reprogramada", "cancelada", "completada", "no_asistio"]
REVEAL_ADDRESS_STATUSES = {"confirmada", "completada", "no_asistio"}


class VisitCreate(BaseModel):
    property_id: str
    scheduled_at: str = ""
    availability: List[dict] = []
    note: str = ""


class RescheduleInput(BaseModel):
    scheduled_at: str
    note: str = ""


class CancelInput(BaseModel):
    note: str = ""


class CompleteInput(BaseModel):
    attended: bool = True


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


DAY_INDEX = {"lunes": 0, "martes": 1, "miercoles": 2, "miércoles": 2, "jueves": 3,
             "viernes": 4, "sabado": 5, "sábado": 5, "domingo": 6}


class FormalizeVisit(BaseModel):
    day: str
    time: str


@api.post("/visits/{visit_id}/formalize")
async def formalize_visit(visit_id: str, data: FormalizeVisit, user: dict = Depends(get_current_user)):
    v = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    if v["landlord_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    idx = DAY_INDEX.get(data.day.strip().lower())
    if idx is None:
        raise HTTPException(status_code=400, detail="Día inválido")
    try:
        hh, mm = [int(x) for x in data.time.split(":")]
    except Exception:
        raise HTTPException(status_code=400, detail="Hora inválida")
    now = now_utc()
    days_ahead = (idx - now.weekday()) % 7
    candidate = (now + timedelta(days=days_ahead)).replace(hour=hh, minute=mm, second=0, microsecond=0)
    if candidate <= now:
        candidate = candidate + timedelta(days=7)
    scheduled = candidate.isoformat()
    entry = {"status": "confirmada", "by": user["name"], "at": now.isoformat(),
             "note": f"Cita formalizada: {data.day} {data.time}"}
    await _reserve_slot(visit_id, {"status": "confirmada", "scheduled_at": scheduled, "updated_at": now.isoformat(),
                                   "slot_key": slot_key(v["property_id"], scheduled)}, {"history": entry})
    await notify(v["tenant_id"], "visita", "Cita formalizada",
                 f"El arrendador formalizó tu cita para '{v['property_title']}'.", "/panel/visitas")
    prop = await db.properties.find_one({"id": v["property_id"]}, {"_id": 0})
    v.update({"status": "confirmada", "scheduled_at": scheduled})
    return serialize_visit(v, user["id"], prop)


async def notify_staff(permission: str, ntype: str, title: str, message: str, link: str = ""):
    staff = await db.users.find({"account_type": "internal"}, {"_id": 0, "id": 1, "staff_role": 1}).to_list(200)
    for s in staff:
        if permission in STAFF_PERMISSIONS.get(s.get("staff_role"), []):
            await notify(s["id"], ntype, title, message, link)


def _money(v) -> str:
    try:
        return f"${float(v):,.2f} MXN"
    except Exception:
        return f"${v} MXN"


def add_months(d, months: int):
    import calendar
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    day = min(d.day, calendar.monthrange(y, m)[1])
    return d.replace(year=y, month=m, day=day)


def build_contract_text(prop: dict, landlord: dict, tenant: dict, c: dict) -> str:
    dir_completa = exact_address(prop)
    recargo = round(float(c["monthly_rent"]) * 0.10, 2)
    pena = float(c["monthly_rent"])
    iva_rate = int(c.get("iva_rate") or 0)
    iva_amount = float(c.get("iva_amount") or 0)
    iva_txt = (f" Adicionalmente, la renta causará el Impuesto al Valor Agregado (IVA) a la tasa del {iva_rate}%, equivalente a {_money(iva_amount)} mensuales, para un total de {_money(float(c['monthly_rent']) + iva_amount)} mensuales."
               if iva_rate else " La renta no causa IVA por tratarse de un inmueble destinado a casa habitación sin amueblar.")
    return f"""CONTRATO DE ARRENDAMIENTO (BORRADOR DE PRUEBA — PENDIENTE DE REVISIÓN Y AJUSTE POR EL ADMINISTRADOR)

Folio del contrato: {c['id']}
Inmueble (folio): {prop.get('public_id', prop['id'])}

DECLARAN LAS PARTES:

EL ARRENDADOR: {landlord.get('name', '')}, en su carácter de propietario del inmueble materia de este contrato.
EL ARRENDATARIO: {tenant.get('name', '')}, quien manifiesta su interés en arrendar el inmueble.

CLÁUSULAS

PRIMERA. OBJETO. El ARRENDADOR otorga en arrendamiento al ARRENDATARIO el inmueble ubicado en: {dir_completa}, descrito como "{prop['title']}" ({prop.get('property_type','')}).

SEGUNDA. DESTINO Y USO. El inmueble se destinará EXCLUSIVAMENTE para uso HABITACIONAL. Queda prohibido destinarlo a un fin distinto, así como subarrendar o ceder los derechos de este contrato sin autorización previa y por escrito del ARRENDADOR.

TERCERA. VIGENCIA. El presente contrato tendrá una vigencia forzosa de {c['term_months']} meses, iniciando el {c['start_date']} y concluyendo el {c['end_date']}.

CUARTA. RENTA. El ARRENDATARIO pagará una renta mensual de {_money(c['monthly_rent'])}, pagadera por adelantado dentro de los primeros CINCO (5) días naturales de cada mes.{iva_txt}

QUINTA. INCREMENTO ANUAL. La renta se incrementará automáticamente cada doce (12) meses conforme al Índice Nacional de Precios al Consumidor (INPC) publicado por el INEGI correspondiente al periodo inmediato anterior, aplicándose sobre la última renta vigente.

SEXTA. DEPÓSITO EN GARANTÍA. El ARRENDATARIO entregará un depósito en garantía por {_money(c['deposit'])}, reembolsable al término del contrato una vez verificado el buen estado del inmueble y cubiertos los adeudos que existieran.

SÉPTIMA. FONDO DE MANTENIMIENTO. Se establece una cuota mensual de mantenimiento de {_money(c['maintenance_fund'])}.

OCTAVA. RECARGO POR PAGO TARDÍO. En caso de que la renta no se cubra dentro de los primeros cinco (5) días del mes, el ARRENDATARIO pagará un recargo equivalente al 10% de la renta mensual, es decir {_money(recargo)}, por cada mensualidad pagada de forma extemporánea.

NOVENA. PENA POR TERMINACIÓN ANTICIPADA. Si el ARRENDATARIO da por terminado el contrato antes de concluir la vigencia forzosa pactada, cubrirá al ARRENDADOR una pena convencional equivalente a UNA (1) mensualidad de renta, es decir {_money(pena)}, sin perjuicio de las rentas devengadas y no pagadas.

DÉCIMA. COMISIÓN DE ADMINISTRACIÓN. La plataforma Réntalo en Línea percibirá una comisión de {_money(c['commission'])} por concepto de administración e intermediación.

DÉCIMA PRIMERA. OBLIGACIONES DEL ARRENDATARIO. Conservar el inmueble en buen estado, cubrir los servicios a su cargo (agua, luz, gas, internet y demás), respetar el reglamento interno y permitir las inspecciones acordadas.

DÉCIMA SEGUNDA. MEDIACIÓN. Ante cualquier controversia derivada de este contrato, las partes se obligan a agotar de manera previa un procedimiento de MEDIACIÓN a través de la plataforma rentaloenlinea.com, buscando una solución conciliatoria antes de acudir a instancias judiciales.

DÉCIMA TERCERA. JURISDICCIÓN. Agotada la mediación sin acuerdo, las partes se someten a las leyes y tribunales competentes de los Estados Unidos Mexicanos, renunciando a cualquier otro fuero.

——— DOCUMENTO FICTICIO DE PRUEBA. Este borrador debe ser revisado y ajustado por el administrador antes de coordinar firmas o rutearlo a notaría. ———
"""


def build_contract_pdf(c: dict) -> bytes:
    import io
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import cm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=2 * cm, bottomMargin=2 * cm,
                            leftMargin=2.2 * cm, rightMargin=2.2 * cm, title="Contrato de arrendamiento")
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=10, leading=15, alignment=TA_JUSTIFY, spaceAfter=8)
    story = []
    text = c.get("contract_text") or "Sin contenido de contrato."
    for block in text.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        safe = (block.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>"))
        story.append(Paragraph(safe, body))
        story.append(Spacer(1, 4))
    doc.build(story)
    return buf.getvalue()


class ContractFromVisit(BaseModel):
    start_date: Optional[str] = None
    term_months: Optional[int] = 12


@api.post("/visits/{visit_id}/create-contract")
async def create_contract_from_visit(visit_id: str, data: ContractFromVisit = ContractFromVisit(), user: dict = Depends(get_current_user)):
    v = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    if v["landlord_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    prop = await db.properties.find_one({"id": v["property_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    start = now_utc()
    if data.start_date:
        try:
            sd = datetime.fromisoformat(data.start_date)
        except Exception:
            raise HTTPException(status_code=400, detail="Fecha inválida")
        min_d = (start + timedelta(days=4)).date()
        max_d = (start + timedelta(days=10)).date()
        if sd.date() < min_d or sd.date() > max_d:
            raise HTTPException(status_code=400, detail="La fecha debe estar dentro de la ventana permitida (del 4º al 10º día).")
        start = sd
    existing = await db.contracts.find_one(
        {"property_id": v["property_id"], "tenant_id": v["tenant_id"], "status": {"$in": ["borrador", "por_firmar", "activo"]}},
        {"_id": 0})
    if existing:
        return {"ok": True, "contract": existing, "existing": True}
    commission = round(prop["price_month"] * 0.04, 2)
    tenant = await db.users.find_one({"id": v["tenant_id"]}, {"_id": 0}) or {"name": v["tenant_name"]}
    term_months = data.term_months if data.term_months in (6, 12, 24) else 12
    end = add_months(start.date(), term_months)
    contract = {
        "id": new_id("ctr"),
        "application_id": None,
        "property_id": v["property_id"],
        "property_public_id": prop.get("public_id", prop["id"]),
        "property_title": prop["title"],
        "tenant_id": v["tenant_id"],
        "tenant_name": v["tenant_name"],
        "landlord_id": user["id"],
        "landlord_name": user["name"],
        "monthly_rent": prop["price_month"],
        "deposit": prop["price_month"],
        "commission": commission,
        "maintenance_fund": prop.get("maintenance_fee", 0),
        "iva_rate": int(prop.get("iva_rate") or 0),
        "iva_amount": round(prop["price_month"] * (prop.get("iva_rate") or 0) / 100, 2),
        "start_date": start.date().isoformat(),
        "end_date": end.isoformat(),
        "term_months": term_months,
        "status": "en_revision_admin",
        "source": "visita",
        "created_at": now_utc().isoformat(),
    }
    contract["contract_text"] = build_contract_text(prop, user, tenant, contract)
    await db.contracts.insert_one(dict(contract))
    contract.pop("_id", None)
    await db.properties.update_one({"id": v["property_id"]}, {"$set": {"status": "en_proceso"}})
    # Enviar SOLO al administrador para revisión/ajuste (no al arrendatario ni al notario)
    await notify_staff("administrar_contratos", "contrato", "Contrato para revisión",
                       f"El arrendador {user['name']} generó un contrato (borrador de prueba) para '{prop['title']}'. Revísalo y ajústalo.",
                       "/admin/contratos")
    return {"ok": True, "contract": contract}


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


@api.post("/visits")
async def create_visit(data: VisitCreate, user: dict = Depends(get_current_user)):
    if user.get("account_type") != "external":
        raise HTTPException(status_code=403, detail="Solo usuarios externos pueden agendar visitas")
    if not data.availability and not data.scheduled_at:
        raise HTTPException(status_code=400, detail="Selecciona al menos un día y horario")
    if data.scheduled_at and not data.availability:
        try:
            dt = datetime.fromisoformat(data.scheduled_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(status_code=400, detail="Fecha y hora inválidas")
        if dt < now_utc():
            raise HTTPException(status_code=400, detail="La fecha de la visita debe ser futura")
    prop = await db.properties.find_one({"id": data.property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    if prop["owner_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="No puedes agendar una visita a tu propio inmueble")
    dispo = "; ".join([f"{a.get('day', '')} {a.get('time', '')}".strip() for a in data.availability]) if data.availability else ""
    entry = {"status": "solicitada", "by": user["name"], "at": now_utc().isoformat(), "note": data.note}
    visit = {
        "id": new_id("visit"),
        "property_id": data.property_id,
        "property_title": prop["title"],
        "property_city": prop["city"],
        "property_image": (prop.get("images") or [None])[0],
        "tenant_id": user["id"],
        "tenant_name": user["name"],
        "landlord_id": prop["owner_id"],
        "scheduled_at": data.scheduled_at or "",
        "availability": data.availability,
        "proposed_at": None,
        "proposed_by": None,
        "status": "solicitada",
        "note": data.note,
        "history": [entry],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    key = slot_key(data.property_id, data.scheduled_at if not data.availability else "")
    if key:
        visit["slot_key"] = key
    try:
        await db.visits.insert_one(dict(visit))
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail=SLOT_TAKEN_MSG)
    visit.pop("_id", None)
    msg = f"{user['name']} solicitó visitar {prop['title']}" + (f". Disponibilidad: {dispo}" if dispo else "")
    await notify(prop["owner_id"], "visita", "Nueva solicitud de visita", msg, "/panel/visitas")
    return serialize_visit(visit, user["id"], prop)


async def _get_visit_and_check(visit_id: str, user: dict):
    v = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    if user["id"] not in (v["tenant_id"], v["landlord_id"]):
        raise HTTPException(status_code=403, detail="No autorizado")
    return v


async def _apply_visit_status(v: dict, status: str, user: dict, note: str = "", scheduled_at: str = None):
    updates = {"status": status, "updated_at": now_utc().isoformat()}
    if scheduled_at:
        updates["scheduled_at"] = scheduled_at
    entry = {"status": status, "by": user["name"], "at": now_utc().isoformat(), "note": note}
    if status in VISIT_ACTIVE:
        key = slot_key(v["property_id"], scheduled_at or v.get("scheduled_at"))
        if key:
            updates["slot_key"] = key
        await _reserve_slot(v["id"], updates, {"history": entry})
    else:
        await db.visits.update_one({"id": v["id"]}, {"$set": updates, "$unset": {"slot_key": ""}, "$push": {"history": entry}})


@api.patch("/visits/{visit_id}/confirm")
async def confirm_visit(visit_id: str, user: dict = Depends(get_current_user)):
    v = await _get_visit_and_check(visit_id, user)
    if v["status"] not in ("solicitada", "reprogramada"):
        raise HTTPException(status_code=400, detail="La visita no puede confirmarse en su estado actual")
    await _apply_visit_status(v, "confirmada", user)
    other = v["tenant_id"] if user["id"] == v["landlord_id"] else v["landlord_id"]
    await notify(other, "visita", "Visita confirmada", f"La visita a {v['property_title']} fue confirmada.", "/panel/visitas")
    prop = await db.properties.find_one({"id": v["property_id"]}, {"_id": 0})
    v = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    return serialize_visit(v, user["id"], prop)


@api.patch("/visits/{visit_id}/reject")
async def reject_visit(visit_id: str, data: CancelInput, user: dict = Depends(get_current_user)):
    v = await _get_visit_and_check(visit_id, user)
    if user["id"] != v["landlord_id"]:
        raise HTTPException(status_code=403, detail="Solo el arrendador puede rechazar")
    await _apply_visit_status(v, "cancelada", user, note=data.note or "Rechazada por el arrendador")
    await notify(v["tenant_id"], "visita", "Visita rechazada", f"Tu visita a {v['property_title']} fue rechazada.", "/panel/visitas")
    return {"ok": True}


@api.patch("/visits/{visit_id}/reschedule")
async def reschedule_visit(visit_id: str, data: RescheduleInput, user: dict = Depends(get_current_user)):
    v = await _get_visit_and_check(visit_id, user)
    if v["status"] in ("cancelada", "completada", "no_asistio"):
        raise HTTPException(status_code=400, detail="La visita no puede reprogramarse")
    await _reserve_slot(visit_id, {
        "status": "reprogramada", "scheduled_at": data.scheduled_at,
        "slot_key": slot_key(v["property_id"], data.scheduled_at),
        "proposed_by": "arrendador" if user["id"] == v["landlord_id"] else "arrendatario",
        "updated_at": now_utc().isoformat(),
    }, {"history": {"status": "reprogramada", "by": user["name"], "at": now_utc().isoformat(), "note": data.note or f"Nueva fecha propuesta"}})
    other = v["tenant_id"] if user["id"] == v["landlord_id"] else v["landlord_id"]
    await notify(other, "visita", "Nueva fecha propuesta", f"Se propuso una nueva fecha para {v['property_title']}.", "/panel/visitas")
    return {"ok": True}


@api.patch("/visits/{visit_id}/cancel")
async def cancel_visit(visit_id: str, data: CancelInput, user: dict = Depends(get_current_user)):
    v = await _get_visit_and_check(visit_id, user)
    if v["status"] in ("cancelada", "completada", "no_asistio"):
        raise HTTPException(status_code=400, detail="La visita ya está finalizada")
    await _apply_visit_status(v, "cancelada", user, note=data.note or "Cancelada")
    other = v["tenant_id"] if user["id"] == v["landlord_id"] else v["landlord_id"]
    await notify(other, "visita", "Visita cancelada", f"La visita a {v['property_title']} fue cancelada.", "/panel/visitas")
    return {"ok": True}


@api.patch("/visits/{visit_id}/complete")
async def complete_visit(visit_id: str, data: CompleteInput, user: dict = Depends(get_current_user)):
    v = await _get_visit_and_check(visit_id, user)
    if user["id"] != v["landlord_id"]:
        raise HTTPException(status_code=403, detail="Solo el arrendador puede marcar el resultado")
    if v["status"] != "confirmada":
        raise HTTPException(status_code=400, detail="Solo visitas confirmadas pueden completarse")
    status = "completada" if data.attended else "no_asistio"
    await _apply_visit_status(v, status, user)
    await notify(v["tenant_id"], "visita", "Visita finalizada", f"La visita a {v['property_title']} se marcó como {status.replace('_', ' ')}.", "/panel/visitas")
    return {"ok": True}


@api.get("/my/visits")
async def my_visits(user: dict = Depends(get_current_user)):
    q = {"$or": [{"tenant_id": user["id"]}, {"landlord_id": user["id"]}]}
    visits = await db.visits.find(q, {"_id": 0}).sort("scheduled_at", -1).to_list(300)
    props = {}
    result = []
    for v in visits:
        pid = v["property_id"]
        if pid not in props:
            props[pid] = await db.properties.find_one({"id": pid}, {"_id": 0})
        result.append(serialize_visit(v, user["id"], props[pid]))
    return result


@api.get("/properties/{property_id}/visits/busy")
async def property_busy_slots(property_id: str, user: dict = Depends(get_current_user)):
    visits = await db.visits.find({"property_id": property_id, "status": {"$in": ["solicitada", "confirmada", "reprogramada"]}}, {"_id": 0, "scheduled_at": 1}).to_list(300)
    return [v["scheduled_at"] for v in visits]


@api.get("/my/notifications")
async def my_notifications(user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    unread = sum(1 for n in notifs if not n.get("read"))
    reminders = []
    now = now_utc()
    visits = await db.visits.find({"$or": [{"tenant_id": user["id"]}, {"landlord_id": user["id"]}], "status": "confirmada"}, {"_id": 0}).to_list(100)
    for v in visits:
        try:
            dt = datetime.fromisoformat(v["scheduled_at"])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            hrs = (dt - now).total_seconds() / 3600
            if 0 <= hrs <= 48:
                reminders.append({"visit_id": v["id"], "property_title": v["property_title"], "scheduled_at": v["scheduled_at"], "hours": round(hrs, 1)})
        except Exception:
            pass
    return {"notifications": notifs, "unread": unread, "reminders": reminders}


@api.post("/notifications/read-all")
async def read_all_notifications(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    if user["role"] == "arrendador":
        properties = await db.properties.count_documents({"owner_id": user["id"]})
        available = await db.properties.count_documents({"owner_id": user["id"], "status": "disponible"})
        applications = await db.applications.count_documents({"owner_id": user["id"], "status": {"$in": ["pendiente", "en_revision"]}})
        contracts = await db.contracts.count_documents({"landlord_id": user["id"], "status": "activo"})
        paid = await db.payment_transactions.find({"landlord_id": user["id"], "payment_status": "paid"}, {"_id": 0, "amount": 1}).to_list(1000)
        income = sum(p["amount"] for p in paid)
        return {"role": "arrendador", "properties": properties, "available": available,
                "pending_applications": applications, "active_contracts": contracts, "income": income}
    else:
        applications = await db.applications.count_documents({"tenant_id": user["id"]})
        approved = await db.applications.count_documents({"tenant_id": user["id"], "status": "aprobada"})
        contracts = await db.contracts.count_documents({"tenant_id": user["id"]})
        paid = await db.payment_transactions.find({"tenant_id": user["id"], "payment_status": "paid"}, {"_id": 0, "amount": 1}).to_list(1000)
        spent = sum(p["amount"] for p in paid)
        return {"role": "arrendatario", "applications": applications, "approved": approved,
                "contracts": contracts, "spent": spent}


@api.get("/")
async def root():
    return {"message": "Réntalo en Línea API", "status": "ok"}


# ---------------------------------------------------------------------------
# Verificación: documentos, info fiscal/bancaria y consentimiento
# ---------------------------------------------------------------------------
DOC_REQUIREMENTS = {
    "arrendador": [
        {"key": "identificacion", "label": "Identificación oficial", "required": True},
        {"key": "comprobante_domicilio", "label": "Comprobante de domicilio", "required": True},
        {"key": "constancia_fiscal", "label": "Constancia de situación fiscal", "required": True},
        {"key": "acreditacion_propiedad", "label": "Documento que acredite la propiedad", "required": True},
        {"key": "facultad_legal", "label": "Facultad legal para rentar (si aplica)", "required": False},
        {"key": "foto_validacion", "label": "Fotografía / validación adicional", "required": False},
    ],
    "arrendatario": [
        {"key": "identificacion", "label": "Identificación oficial", "required": True},
        {"key": "comprobante_domicilio", "label": "Comprobante de domicilio", "required": True},
        {"key": "comprobante_ingresos", "label": "Comprobantes de ingresos", "required": True},
        {"key": "info_laboral", "label": "Información laboral (carta o constancia)", "required": True},
        {"key": "referencias_personales", "label": "Referencias personales", "required": True},
        {"key": "referencias_laborales", "label": "Referencias laborales", "required": True},
        {"key": "foto_validacion", "label": "Fotografía / validación adicional", "required": False},
    ],
}

CONSENT_VERSION = "1.0"
CONSENT_TEXT = ("Autorizo de forma expresa a Réntalo en Línea a consultar mi historial "
                "crediticio en sociedades de información crediticia, conforme a la Ley para "
                "Regular las Sociedades de Información Crediticia, con fines de análisis de riesgo "
                "para mi solicitud de arrendamiento.")


class Cohabitante(BaseModel):
    name: Optional[str] = None
    rfc: Optional[str] = None
    curp: Optional[str] = None
    ingreso_mensual: Optional[float] = None
    comprobantes: Optional[List[str]] = None
    ine_fotos: Optional[List[str]] = None
    phone: Optional[str] = None
    phone_code: Optional[str] = None
    parentesco: Optional[str] = None
    es_extranjero: Optional[bool] = None
    pasaporte: Optional[str] = None
    pasaporte_fotos: Optional[List[str]] = None
    migratorio_fotos: Optional[List[str]] = None


class FiscalInfo(BaseModel):
    rfc: Optional[str] = None
    fiscal_regime: Optional[str] = None
    bank_name: Optional[str] = None
    account_holder: Optional[str] = None
    account_number: Optional[str] = None
    clabe: Optional[str] = None
    estado_cuenta_fotos: Optional[List[str]] = None
    phone: Optional[str] = None
    phone_code: Optional[str] = None
    actividad_economica: Optional[str] = None
    curp: Optional[str] = None
    ingreso_mensual: Optional[float] = None
    comprobantes_ingresos: Optional[List[str]] = None
    es_extranjero: Optional[bool] = None
    pasaporte: Optional[str] = None
    pasaporte_fotos: Optional[List[str]] = None
    migratorio_fotos: Optional[List[str]] = None
    adultos_18: Optional[int] = None
    menores_12_17: Optional[int] = None
    ninos_0_11: Optional[int] = None
    mascotas: Optional[str] = None
    share_housing: Optional[bool] = None
    cohabitantes: Optional[List[Cohabitante]] = None


class ConsentInput(BaseModel):
    accepted: bool
    consent_text: Optional[str] = None
    consent_version: Optional[str] = None


class DocReview(BaseModel):
    decision: str  # aprobado | rechazado | correccion
    note: str = ""
    expiry_date: Optional[str] = None


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "desconocida"


@api.get("/verification/requirements")
async def verification_requirements(category: str = "arrendatario"):
    return DOC_REQUIREMENTS.get(category, [])


@api.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    category: str = Form(...),
    user: dict = Depends(get_current_user),
):
    if category not in DOC_REQUIREMENTS:
        raise HTTPException(status_code=400, detail="Categoría inválida")
    valid_keys = [d["key"] for d in DOC_REQUIREMENTS[category]]
    if doc_type not in valid_keys:
        raise HTTPException(status_code=400, detail="Tipo de documento inválido")
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    if ext not in MIME_TYPES:
        raise HTTPException(status_code=400, detail="Formato no permitido (usa PDF, JPG o PNG)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo excede 10 MB")
    path = f"{APP_NAME}/docs/{user['id']}/{uuid.uuid4()}.{ext}"
    content_type = MIME_TYPES.get(ext, file.content_type or "application/octet-stream")
    try:
        result = put_object(path, data, content_type)
    except Exception as e:
        logger.error(f"Storage upload error: {e}")
        raise HTTPException(status_code=500, detail="No se pudo subir el archivo")
    version = await db.documents.count_documents({"user_id": user["id"], "doc_type": doc_type}) + 1
    await db.documents.update_many({"user_id": user["id"], "doc_type": doc_type, "current": True}, {"$set": {"current": False}})
    doc = {
        "id": new_id("doc"),
        "user_id": user["id"],
        "user_name": user["name"],
        "category": category,
        "doc_type": doc_type,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "status": "pendiente",
        "review_note": "",
        "expiry_date": None,
        "version": version,
        "current": True,
        "is_deleted": False,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.documents.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


def doc_summary(docs: list, category: str) -> dict:
    reqs = DOC_REQUIREMENTS.get(category, [])
    by_type = {d["doc_type"]: d for d in docs}
    items = []
    approved = 0
    total_required = 0
    for r in reqs:
        d = by_type.get(r["key"])
        if r["required"]:
            total_required += 1
            if d and d["status"] == "aprobado":
                approved += 1
        items.append({**r, "document": d})
    return {"items": items, "approved_required": approved, "total_required": total_required,
            "verified": total_required > 0 and approved >= total_required}


@api.get("/my/documents")
async def my_documents(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    cat = category or user.get("role", "arrendatario")
    docs = await db.documents.find({"user_id": user["id"], "current": True, "is_deleted": False}, {"_id": 0}).to_list(200)
    for d in docs:
        if d.get("expiry_date"):
            try:
                exp = datetime.fromisoformat(d["expiry_date"]).date()
                d["days_to_expiry"] = (exp - now_utc().date()).days
            except Exception:
                d["days_to_expiry"] = None
    return doc_summary(docs, cat)


@api.get("/my/documents/history")
async def my_documents_history(user: dict = Depends(get_current_user)):
    docs = await db.documents.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.get("/my/alerts")
async def my_alerts(user: dict = Depends(get_current_user)):
    docs = await db.documents.find({"user_id": user["id"], "current": True, "is_deleted": False}, {"_id": 0}).to_list(200)
    alerts = []
    for d in docs:
        if d["status"] == "rechazado":
            alerts.append({"type": "rechazado", "doc_type": d["doc_type"], "message": f"Documento rechazado: {d.get('review_note') or 'revisa y vuelve a subirlo'}"})
        elif d["status"] == "correccion":
            alerts.append({"type": "correccion", "doc_type": d["doc_type"], "message": f"Corrección solicitada: {d.get('review_note') or ''}"})
        if d.get("expiry_date"):
            try:
                exp = datetime.fromisoformat(d["expiry_date"]).date()
                days = (exp - now_utc().date()).days
                if days < 0:
                    alerts.append({"type": "vencido", "doc_type": d["doc_type"], "message": "Documento vencido, actualízalo."})
                elif days <= 30:
                    alerts.append({"type": "por_vencer", "doc_type": d["doc_type"], "message": f"Documento vence en {days} día(s)."})
            except Exception:
                pass
    return alerts


@api.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"id": doc_id, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    is_owner = doc["user_id"] == user["id"]
    is_internal_allowed = user.get("account_type") == "internal" and has_perm(user, "consultar_documentos_sensibles")
    if not (is_owner or is_internal_allowed):
        raise HTTPException(status_code=403, detail="No autorizado")
    try:
        data, ct = get_object(doc["storage_path"])
    except Exception:
        raise HTTPException(status_code=404, detail="Archivo no disponible")
    return Response(content=data, media_type=doc.get("content_type", ct))


@api.patch("/users/me/fiscal")
async def update_fiscal(data: FiscalInfo, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": {"fiscal_info": updates}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return with_perms(updated)


@api.get("/my/fiscal")
async def get_fiscal(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "fiscal_info": 1})
    return u.get("fiscal_info") or {}


@api.post("/users/me/registro/submit")
async def submit_registro(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    updates = {"registro_submitted": True}
    if not fresh.get("registro_stage"):
        updates["registro_stage"] = "recibido"
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return with_perms(updated)


@api.delete("/users/me/registro")
async def delete_registro(user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"fiscal_info": None}, "$unset": {"registro_submitted": "", "registro_stage": "", "admin_note": ""}})
    await db.consents.delete_many({"user_id": user["id"]})
    await db.documents.delete_many({"user_id": user["id"], "category": "arrendatario"})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return with_perms(updated)


@api.post("/uploads/income-proof")
async def upload_income_proof(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    if ext not in ("jpg", "jpeg", "png", "webp", "gif", "pdf"):
        raise HTTPException(status_code=400, detail="Formato no permitido (JPG, PNG, WEBP, GIF o PDF)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo excede 10 MB")
    path = f"{APP_NAME}/private/{user['id']}/{uuid.uuid4()}.{ext}"
    ct = MIME_TYPES.get(ext, file.content_type or "application/octet-stream")
    try:
        put_object(path, data, ct)
    except Exception as e:
        logger.error(f"Storage upload error: {e}")
        raise HTTPException(status_code=500, detail="No se pudo subir el archivo")
    return {"path": path}


@api.get("/uploads/private/{file_path:path}")
async def get_private_media(file_path: str, user: dict = Depends(get_current_user)):
    if not file_path.startswith(f"{APP_NAME}/private/"):
        raise HTTPException(status_code=404, detail="No encontrado")
    parts = file_path.split("/")
    owner_id = parts[2] if len(parts) > 2 else ""
    is_internal = user.get("account_type") == "internal" and has_perm(user, "consultar_documentos_sensibles")
    if user["id"] != owner_id and not is_internal:
        raise HTTPException(status_code=403, detail="Sin permiso para ver este archivo")
    try:
        data, ct = get_object(file_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Archivo no disponible")
    return Response(content=data, media_type=ct)


@api.post("/consent/credit-check")
async def credit_consent(data: ConsentInput, request: Request, user: dict = Depends(get_current_user)):
    if not data.accepted:
        raise HTTPException(status_code=400, detail="Debes aceptar la autorización")
    ts = now_utc()
    record = {
        "id": new_id("consent"),
        "user_id": user["id"],
        "user_name": user["name"],
        "type": "credit_check",
        "accepted": True,
        "consent_text": data.consent_text or CONSENT_TEXT,
        "consent_version": data.consent_version or CONSENT_VERSION,
        "date": ts.date().isoformat(),
        "time": ts.strftime("%H:%M:%S UTC"),
        "timestamp": ts.isoformat(),
        "ip_address": client_ip(request),
        "user_agent": request.headers.get("user-agent", ""),
        "evidence": {"accepted": True, "checkbox": True},
    }
    await db.consents.insert_one(dict(record))
    record.pop("_id", None)
    return record


@api.get("/my/consent")
async def get_consent(user: dict = Depends(get_current_user)):
    c = await db.consents.find_one({"user_id": user["id"], "type": "credit_check"}, {"_id": 0}, sort=[("timestamp", -1)])
    return {"consent": c, "text": CONSENT_TEXT, "version": CONSENT_VERSION}


# ---- Internal document review ----
@api.get("/admin/verification/documents")
async def admin_list_documents(status: Optional[str] = None, user: dict = Depends(require_permission("consultar_documentos_sensibles"))):
    q = {"current": True, "is_deleted": False}
    if status:
        q["status"] = status
    docs = await db.documents.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.patch("/admin/verification/documents/{doc_id}/review")
async def admin_review_document(doc_id: str, data: DocReview, actor: dict = Depends(get_current_user)):
    if actor.get("account_type") != "internal" or not has_perm(actor, "consultar_documentos_sensibles"):
        raise HTTPException(status_code=403, detail="Acceso restringido")
    decision_perm = {"aprobado": "aprobar", "rechazado": "rechazar", "correccion": "editar"}.get(data.decision)
    if not decision_perm or not has_perm(actor, decision_perm):
        raise HTTPException(status_code=403, detail="Permiso insuficiente")
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    updates = {"status": data.decision, "review_note": data.note, "reviewer_id": actor["id"], "updated_at": now_utc().isoformat()}
    if data.expiry_date:
        updates["expiry_date"] = data.expiry_date
    await db.documents.update_one({"id": doc_id}, {"$set": updates})
    await audit(actor, f"review_document_{data.decision}", doc_id, data.note)
    return {"ok": True}


@api.get("/admin/consents")
async def admin_consents(user: dict = Depends(require_permission("consultar_documentos_sensibles"))):
    consents = await db.consents.find({}, {"_id": 0}).sort("timestamp", -1).to_list(500)
    return consents


# ---------------------------------------------------------------------------
# Internal admin (RBAC-gated)
# ---------------------------------------------------------------------------
class UserRoleUpdate(BaseModel):
    account_type: Optional[str] = None
    staff_role: Optional[str] = None
    role: Optional[str] = None


class ReviewDecision(BaseModel):
    decision: str  # aprobada | rechazada
    note: str = ""


class RiskOverride(BaseModel):
    risk_level: str
    reason: str = ""


@api.get("/admin/meta")
async def admin_meta(user: dict = Depends(require_internal)):
    return {"staff_roles": STAFF_ROLES, "permissions": ALL_PERMISSIONS, "staff_permissions": STAFF_PERMISSIONS}


@api.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_permission("consultar"))):
    return {
        "users": await db.users.count_documents({}),
        "internal_users": await db.users.count_documents({"account_type": "internal"}),
        "properties": await db.properties.count_documents({}),
        "properties_pending": await db.properties.count_documents({"review_status": "pendiente"}),
        "applications": await db.applications.count_documents({}),
        "contracts": await db.contracts.count_documents({}),
        "payments_paid": await db.payment_transactions.count_documents({"payment_status": "paid"}),
    }


@api.get("/admin/users")
async def admin_users(user: dict = Depends(require_permission("consultar"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    for u in users:
        u["public_id"] = public_id_for(u)
    return users


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


@api.get("/admin/members/{user_id}")
async def admin_member_detail(user_id: str, viewer: dict = Depends(require_permission("consultar"))):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    u["public_id"] = public_id_for(u)
    props = await db.properties.find({"owner_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for p in props:
        p["display_status"] = property_display_status(p)
        p["applications_count"] = await db.applications.count_documents({"property_id": p["id"]})
    can_docs = has_perm(viewer, "consultar_documentos_sensibles")
    category = u.get("role", "arrendatario")
    documents_summary = None
    if can_docs:
        docs = await db.documents.find({"user_id": user_id, "current": True, "is_deleted": False}, {"_id": 0}).to_list(200)
        documents_summary = doc_summary(docs, category)
    consent = await db.consents.find_one({"user_id": user_id, "type": "credit_check"}, {"_id": 0}, sort=[("timestamp", -1)])
    contracts = await db.contracts.find({"tenant_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {
        "user": u,
        "properties": props,
        "documents_summary": documents_summary,
        "can_view_documents": can_docs,
        "category": category,
        "fiscal_info": u.get("fiscal_info"),
        "consent": consent,
        "contracts": contracts,
    }


@api.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, data: UserRoleUpdate, actor: dict = Depends(require_permission("administrar_usuarios"))):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    account_type = data.account_type or target.get("account_type", "external")
    staff_role = data.staff_role
    if account_type == "internal":
        if staff_role and staff_role not in STAFF_ROLES:
            raise HTTPException(status_code=400, detail="Rol interno inválido")
        if not can_grant(actor, staff_role, "internal"):
            raise HTTPException(status_code=403, detail="No puedes asignar un rol igual o superior al tuyo")
    updates = {"account_type": account_type}
    if account_type == "internal":
        updates["staff_role"] = staff_role
    else:
        updates["staff_role"] = None
        if data.role in ("arrendador", "arrendatario"):
            updates["role"] = data.role
    await db.users.update_one({"id": user_id}, {"$set": updates})
    await audit(actor, "update_user_role", user_id, str(updates))
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated


@api.get("/admin/properties")
async def admin_properties(review_status: Optional[str] = None, user: dict = Depends(require_permission("consultar"))):
    q = {}
    if review_status:
        q["review_status"] = review_status
    props = await db.properties.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return props


@api.patch("/admin/properties/{property_id}/review")
async def admin_review_property(property_id: str, data: ReviewDecision, actor: dict = Depends(get_current_user)):
    if actor.get("account_type") != "internal":
        raise HTTPException(status_code=403, detail="Acceso restringido")
    perm = "aprobar" if data.decision == "aprobada" else "rechazar"
    if not has_perm(actor, perm):
        raise HTTPException(status_code=403, detail="Permiso insuficiente")
    if data.decision not in ("aprobada", "rechazada", "pendiente"):
        raise HTTPException(status_code=400, detail="Decisión inválida")
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    await db.properties.update_one({"id": property_id}, {"$set": {"review_status": data.decision, "review_note": data.note}})
    await audit(actor, f"review_property_{data.decision}", property_id, data.note)
    return {"ok": True}


REVIEW_STAGES = ["recibido", "en_revision", "doc_faltante", "aprobado", "autorizado", "publicado", "rechazado"]
REVIEW_STAGE_LABELS = {
    "recibido": "Recibido", "en_revision": "En revisión", "doc_faltante": "Documentación faltante",
    "aprobado": "Aprobado", "autorizado": "Autorizado", "publicado": "Publicado", "rechazado": "Rechazado",
}


class StageInput(BaseModel):
    stage: str


@api.patch("/admin/properties/{property_id}/stage")
async def admin_set_property_stage(property_id: str, data: StageInput, actor: dict = Depends(get_current_user)):
    if actor.get("account_type") != "internal" or not has_perm(actor, "editar"):
        raise HTTPException(status_code=403, detail="Permiso insuficiente")
    if data.stage not in REVIEW_STAGES:
        raise HTTPException(status_code=400, detail="Estado inválido")
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    updates = {"review_stage": data.stage}
    if data.stage == "rechazado":
        updates["review_status"] = "rechazada"
    elif data.stage in ("aprobado", "publicado"):
        updates["review_status"] = "aprobada"
        if data.stage == "publicado":
            updates["status"] = "disponible"
    else:
        updates["review_status"] = "pendiente"
    await db.properties.update_one({"id": property_id}, {"$set": updates})
    await audit(actor, f"property_stage_{data.stage}", property_id, prop.get("title", ""))
    await notify(prop["owner_id"], "validacion",
                 f"Estado de tu inmueble: {REVIEW_STAGE_LABELS[data.stage]}",
                 f"El estado de '{prop.get('title', 'tu inmueble')}' cambió a: {REVIEW_STAGE_LABELS[data.stage]}.",
                 "/panel/inmuebles")
    return {"ok": True, "review_stage": data.stage}


class MemberNoteInput(BaseModel):
    note: str = ""


@api.patch("/admin/members/{user_id}/note")
async def admin_set_member_note(user_id: str, data: MemberNoteInput, actor: dict = Depends(get_current_user)):
    if actor.get("account_type") != "internal" or not has_perm(actor, "editar"):
        raise HTTPException(status_code=403, detail="Permiso insuficiente")
    note = (data.note or "")[:50]
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await db.users.update_one({"id": user_id}, {"$set": {"admin_note": note}})
    await audit(actor, "member_note", user_id, note)
    if note:
        await notify(user_id, "validacion", "Observación del administrador",
                     f"El equipo de validación dejó una observación: {note}", "/panel/inmuebles")
    return {"ok": True, "admin_note": note}


class RegistroStageInput(BaseModel):
    stage: str


@api.patch("/admin/members/{user_id}/registro-stage")
async def admin_set_member_registro_stage(user_id: str, data: RegistroStageInput, actor: dict = Depends(get_current_user)):
    if actor.get("account_type") != "internal" or not has_perm(actor, "editar"):
        raise HTTPException(status_code=403, detail="Permiso insuficiente")
    if data.stage not in REVIEW_STAGES:
        raise HTTPException(status_code=400, detail="Estado inválido")
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await db.users.update_one({"id": user_id}, {"$set": {"registro_stage": data.stage}})
    await audit(actor, f"member_registro_stage_{data.stage}", user_id, "")
    await notify(user_id, "validacion",
                 f"Estado de tu registro: {REVIEW_STAGE_LABELS[data.stage]}",
                 f"El estado de tu registro cambió a: {REVIEW_STAGE_LABELS[data.stage]}.",
                 "/panel/verificacion")
    return {"ok": True, "registro_stage": data.stage}


@api.get("/admin/applications")
async def admin_applications(user: dict = Depends(require_permission("consultar"))):
    apps = await db.applications.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return apps


@api.get("/admin/properties/{property_id}/activity")
async def property_activity(property_id: str, user: dict = Depends(require_permission("consultar"))):
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Inmueble no encontrado")
    events = []
    APP_LABEL = {"pendiente": "Solicitud pendiente", "en_revision": "Solicitud en revisión",
                 "aprobada": "Solicitud aceptada", "rechazada": "Solicitud rechazada"}
    apps = await db.applications.find({"property_id": property_id}, {"_id": 0}).to_list(500)
    for a in apps:
        tenant = a.get("tenant_name", "Arrendatario")
        events.append({"kind": "solicitud", "title": "Solicitud de arrendamiento",
                       "detail": f"{tenant} solicitó arrendamiento", "actor": tenant,
                       "status": "pendiente", "at": a.get("created_at")})
        st = a.get("status")
        if st in ("aprobada", "rechazada", "en_revision"):
            events.append({"kind": "solicitud_estado", "title": APP_LABEL.get(st, st),
                           "detail": f"La solicitud de {tenant}: {APP_LABEL.get(st, st)}",
                           "actor": tenant, "status": st, "at": a.get("created_at")})
    VIS_LABEL = {"solicitada": "Cita solicitada", "confirmada": "Cita aceptada",
                 "reprogramada": "Nueva fecha propuesta", "cancelada": "Cita cancelada",
                 "completada": "Cita completada", "no_asistio": "No asistió a la cita"}
    visits = await db.visits.find({"property_id": property_id}, {"_id": 0}).to_list(500)
    for v in visits:
        tenant = v.get("tenant_name", "")
        for h in (v.get("history") or []):
            hs = h.get("status")
            detail = f"{tenant}" + (f" — {h.get('note')}" if h.get("note") else "")
            events.append({"kind": "visita", "title": VIS_LABEL.get(hs, hs),
                           "detail": detail, "actor": h.get("by"), "status": hs,
                           "at": h.get("at"), "scheduled_at": v.get("scheduled_at")})
    events.sort(key=lambda e: e.get("at") or "", reverse=True)
    return {"property_id": property_id, "events": events}


@api.patch("/admin/applications/{application_id}/risk")
async def admin_override_risk(application_id: str, data: RiskOverride, actor: dict = Depends(require_permission("modificar_decisiones_automaticas"))):
    if data.risk_level not in ("bajo", "medio", "alto"):
        raise HTTPException(status_code=400, detail="Nivel inválido")
    app_doc = await db.applications.find_one({"id": application_id}, {"_id": 0})
    if not app_doc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    await db.applications.update_one({"id": application_id}, {"$set": {
        "risk_level": data.risk_level, "risk_overridden": True, "risk_override_reason": data.reason,
    }})
    await audit(actor, "override_risk", application_id, f"{data.risk_level}: {data.reason}")
    return {"ok": True}


@api.get("/admin/contracts")
async def admin_contracts(user: dict = Depends(require_permission("consultar"))):
    contracts = await db.contracts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return contracts


class AdminContractUpdate(BaseModel):
    contract_text: Optional[str] = None
    status: Optional[str] = None


ADMIN_CONTRACT_STATUSES = ["en_revision_admin", "ajustado", "listo_para_firma", "enviado_arrendatario", "borrador"]


@api.patch("/admin/contracts/{contract_id}")
async def admin_update_contract(contract_id: str, data: AdminContractUpdate, user: dict = Depends(require_permission("administrar_contratos"))):
    c = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    updates = {}
    if data.contract_text is not None:
        updates["contract_text"] = data.contract_text
    if data.status is not None:
        if data.status not in ADMIN_CONTRACT_STATUSES:
            raise HTTPException(status_code=400, detail="Estado inválido")
        updates["status"] = data.status
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    updates["admin_adjusted_at"] = now_utc().isoformat()
    await db.contracts.update_one({"id": contract_id}, {"$set": updates})
    # Notificar al arrendador del avance de la revisión (no al arrendatario ni notario)
    await notify(c["landlord_id"], "contrato", "Contrato revisado por el administrador",
                 f"El administrador actualizó el contrato de '{c['property_title']}'.", "/panel/contratos")
    c.update(updates)
    return {"ok": True, "contract": c}


@api.get("/admin/contracts/{contract_id}/pdf")
async def admin_contract_pdf(contract_id: str, user: dict = Depends(require_permission("administrar_contratos"))):
    c = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    pdf = build_contract_pdf(c)
    filename = f"contrato_{c.get('property_public_id', c['id'])}.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@api.post("/admin/contracts/{contract_id}/send-to-tenant")
async def admin_send_contract_to_tenant(contract_id: str, user: dict = Depends(require_permission("administrar_contratos"))):
    c = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if not c.get("contract_text"):
        raise HTTPException(status_code=400, detail="El contrato no tiene texto para enviar")
    await db.contracts.update_one({"id": contract_id}, {"$set": {"status": "enviado_arrendatario", "sent_to_tenant_at": now_utc().isoformat()}})
    await notify(c["tenant_id"], "contrato", "Contrato disponible",
                 f"El administrador te envió el contrato de '{c['property_title']}'. Revísalo en tus Contratos.", "/panel/contratos")
    c["status"] = "enviado_arrendatario"
    return {"ok": True, "contract": c}


@api.get("/my/contracts/{contract_id}/pdf")
async def my_contract_pdf(contract_id: str, user: dict = Depends(get_current_user)):
    c = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not c or user["id"] not in (c.get("tenant_id"), c.get("landlord_id")):
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    pdf = build_contract_pdf(c)
    filename = f"contrato_{c.get('property_public_id', c['id'])}.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@api.get("/admin/payments")
async def admin_payments(user: dict = Depends(require_permission("administrar_pagos"))):
    payments = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return payments


@api.get("/admin/documents")
async def admin_documents(user: dict = Depends(require_permission("consultar_documentos_sensibles"))):
    # Sensitive: applicant income + occupation across all applications
    apps = await db.applications.find({}, {"_id": 0, "tenant_name": 1, "property_title": 1,
                                           "monthly_income": 1, "occupation": 1, "employment_type": 1,
                                           "income_ratio": 1, "created_at": 1}).sort("created_at", -1).to_list(500)
    return apps


@api.get("/admin/audit")
async def admin_audit(user: dict = Depends(require_permission("administrar_usuarios"))):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("at", -1).to_list(200)
    return logs


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
SEED_PROPERTIES = [
    {"title": "Departamento moderno en la Condesa", "property_type": "departamento", "city": "Ciudad de México", "state": "CDMX", "colonia": "Condesa",
     "price_month": 24000, "deposit": 24000, "maintenance_fee": 1800, "bedrooms": 2, "bathrooms": 2, "parking": 1, "area_m2": 85, "furnished": True, "pets_allowed": True,
     "amenities": ["Amueblado", "Roof garden", "Seguridad 24h", "Gimnasio"],
     "description": "Precioso departamento amueblado en el corazón de la Condesa, cerca de parques, cafés y transporte. Ideal para profesionistas.",
     "images": ["https://images.unsplash.com/photo-1708127665466-1f9a166a24c8?crop=entropy&cs=srgb&fm=jpg&q=85", "https://images.unsplash.com/photo-1708127665487-92d334475d3b?crop=entropy&cs=srgb&fm=jpg&q=85", "https://images.pexels.com/photos/21853674/pexels-photo-21853674.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"]},
    {"title": "Casa familiar en Monterrey", "property_type": "casa", "city": "Monterrey", "state": "Nuevo León", "colonia": "Cumbres",
     "price_month": 18500, "deposit": 18500, "maintenance_fee": 0, "bedrooms": 3, "bathrooms": 2, "parking": 2, "area_m2": 180, "furnished": False, "pets_allowed": True,
     "amenities": ["Jardín", "Cochera doble", "Cocina integral"],
     "description": "Casa amplia en fraccionamiento privado, perfecta para familias. Excelente ubicación con acceso a escuelas y centros comerciales.",
     "images": ["https://images.pexels.com/photos/17238410/pexels-photo-17238410.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "https://images.unsplash.com/photo-1579967742648-bcb8bacfee66?crop=entropy&cs=srgb&fm=jpg&q=85"]},
    {"title": "Oficina corporativa en Polanco", "property_type": "oficina", "city": "Ciudad de México", "state": "CDMX", "colonia": "Polanco",
     "price_month": 45000, "deposit": 90000, "maintenance_fee": 6000, "bedrooms": 0, "bathrooms": 2, "parking": 4, "area_m2": 220, "furnished": True, "pets_allowed": False,
     "amenities": ["Recepción", "Salas de juntas", "Aire acondicionado", "Fibra óptica"],
     "description": "Oficina de lujo lista para operar en zona premium de Polanco. Espacios abiertos, salas de juntas y estacionamiento.",
     "images": ["https://images.unsplash.com/photo-1700809888987-cf2b29ecbd2c?crop=entropy&cs=srgb&fm=jpg&q=85", "https://images.unsplash.com/photo-1549637642-90187f64f420?crop=entropy&cs=srgb&fm=jpg&q=85"]},
    {"title": "Local comercial en Guadalajara Centro", "property_type": "local", "city": "Guadalajara", "state": "Jalisco", "colonia": "Centro",
     "price_month": 15000, "deposit": 30000, "maintenance_fee": 0, "bedrooms": 0, "bathrooms": 1, "parking": 0, "area_m2": 90, "furnished": False, "pets_allowed": False,
     "amenities": ["Alta afluencia", "Cortina metálica", "Baño"],
     "description": "Local a pie de calle con gran flujo peatonal. Ideal para retail, restaurante o cafetería.",
     "images": ["https://images.unsplash.com/photo-1690130206583-3ad3f9515b82?crop=entropy&cs=srgb&fm=jpg&q=85"]},
    {"title": "Bodega industrial en Querétaro", "property_type": "bodega", "city": "Querétaro", "state": "Querétaro", "colonia": "Parque Industrial",
     "price_month": 60000, "deposit": 120000, "maintenance_fee": 0, "bedrooms": 0, "bathrooms": 2, "parking": 10, "area_m2": 1200, "furnished": False, "pets_allowed": False,
     "amenities": ["Andén de carga", "Altura 10m", "Vigilancia", "Oficinas"],
     "description": "Nave industrial con excelente conectividad logística, andenes de carga y oficinas administrativas.",
     "images": ["https://images.unsplash.com/photo-1771530789155-b1f03fbf82b5?crop=entropy&cs=srgb&fm=jpg&q=85", "https://images.unsplash.com/photo-1674252260339-6a9986775993?crop=entropy&cs=srgb&fm=jpg&q=85"]},
    {"title": "Estudio luminoso en Roma Norte", "property_type": "departamento", "city": "Ciudad de México", "state": "CDMX", "colonia": "Roma Norte",
     "price_month": 16000, "deposit": 16000, "maintenance_fee": 1200, "bedrooms": 1, "bathrooms": 1, "parking": 0, "area_m2": 55, "furnished": True, "pets_allowed": True,
     "amenities": ["Amueblado", "Pet friendly", "Balcón"],
     "description": "Estudio acogedor y luminoso en Roma Norte, rodeado de la mejor gastronomía y vida cultural de la ciudad.",
     "images": ["https://images.unsplash.com/photo-1708127665429-37cb0a7036f1?crop=entropy&cs=srgb&fm=jpg&q=85", "https://images.pexels.com/photos/21853670/pexels-photo-21853670.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"]},
    {"title": "Terreno urbano en Puebla", "property_type": "terreno", "city": "Puebla", "state": "Puebla", "colonia": "Angelópolis",
     "price_month": 22000, "deposit": 22000, "maintenance_fee": 0, "bedrooms": 0, "bathrooms": 0, "parking": 0, "area_m2": 500, "furnished": False, "pets_allowed": False,
     "amenities": ["Uso mixto", "Servicios completos", "Barda perimetral"],
     "description": "Terreno plano listo para desarrollar en zona de alta plusvalía. Todos los servicios disponibles.",
     "images": ["https://images.unsplash.com/photo-1531166473306-c4c0827f3a89?crop=entropy&cs=srgb&fm=jpg&q=85"]},
    {"title": "Nave industrial en Toluca", "property_type": "industrial", "city": "Toluca", "state": "Estado de México", "colonia": "Zona Industrial",
     "price_month": 85000, "deposit": 170000, "maintenance_fee": 0, "bedrooms": 0, "bathrooms": 3, "parking": 15, "area_m2": 2000, "furnished": False, "pets_allowed": False,
     "amenities": ["Grúa viajera", "Subestación eléctrica", "Andenes múltiples"],
     "description": "Complejo industrial con infraestructura pesada, ideal para manufactura y distribución.",
     "images": ["https://images.unsplash.com/photo-1674252281682-2eec258cfa30?crop=entropy&cs=srgb&fm=jpg&q=85"]},
]


async def seed():
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.properties.create_index("owner_id")
    await db.visits.create_index("slot_key", unique=True, partialFilterExpression={"slot_key": {"$type": "string"}})

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@rentaloenlinea.mx")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": new_id("user"), "email": admin_email, "name": "Administrador",
            "password_hash": hash_password(admin_password), "role": "arrendador",
            "account_type": "external", "member_no": await next_member_no(), "staff_role": None,
            "phone": None, "picture": None, "auth_provider": "password", "created_at": now_utc().isoformat(),
        })

    landlord_email = "arrendador@demo.mx"
    landlord = await db.users.find_one({"email": landlord_email})
    if not landlord:
        landlord = {
            "id": new_id("user"), "email": landlord_email, "name": "Carlos Mendoza",
            "password_hash": hash_password("Demo123!"), "role": "arrendador",
            "account_type": "external", "member_no": await next_member_no(), "staff_role": None,
            "phone": "5555550101", "picture": None, "auth_provider": "password", "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(dict(landlord))

    tenant_email = "arrendatario@demo.mx"
    if not await db.users.find_one({"email": tenant_email}):
        await db.users.insert_one({
            "id": new_id("user"), "email": tenant_email, "name": "Ana Torres",
            "password_hash": hash_password("Demo123!"), "role": "arrendatario",
            "account_type": "external", "member_no": await next_member_no(), "staff_role": None,
            "phone": "5555550202", "picture": None, "auth_provider": "password", "created_at": now_utc().isoformat(),
        })

    # Custom superadmin account (owner)
    owner_email = "cpfzamora@yahoo.com.mx"
    owner = await db.users.find_one({"email": owner_email})
    if not owner:
        await db.users.insert_one({
            "id": new_id("user"), "email": owner_email, "name": "Administrador Zamora",
            "password_hash": hash_password("digital2025"), "role": "arrendatario",
            "account_type": "internal", "staff_role": "superadmin",
            "phone": None, "picture": None, "auth_provider": "password", "created_at": now_utc().isoformat(),
        })
    elif owner.get("staff_role") != "superadmin":
        await db.users.update_one({"email": owner_email}, {"$set": {
            "account_type": "internal", "staff_role": "superadmin",
            "password_hash": hash_password("digital2025"), "auth_provider": "password",
        }})

    # Internal staff — one account per role
    staff_seed = {
        "superadmin": "Sofía Superadmin", "admin_general": "Andrés Admin", "operaciones": "Olivia Ops",
        "revision_propiedades": "Raúl Revisión", "soporte": "Sara Soporte", "finanzas": "Fernando Finanzas",
        "cobranza": "Camila Cobranza", "legal": "Laura Legal", "notaria": "Noé Notaría",
    }
    for role, name in staff_seed.items():
        email = f"{role}@rentalo.mx"
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "id": new_id("user"), "email": email, "name": name,
                "password_hash": hash_password("Interno123!"), "role": "arrendatario",
                "account_type": "internal", "staff_role": role,
                "phone": None, "picture": None, "auth_provider": "password", "created_at": now_utc().isoformat(),
            })

    # Migrate legacy docs
    await db.users.update_many({"account_type": {"$exists": False}}, {"$set": {"account_type": "external", "staff_role": None}})
    await db.properties.update_many({"review_status": {"$exists": False}}, {"$set": {"review_status": "aprobada"}})
    # Propiedades existentes aprobadas sin etapa -> publicadas (para no ocultarlas del buscador)
    await db.properties.update_many(
        {"review_stage": {"$exists": False}, "review_status": "aprobada"},
        {"$set": {"review_stage": "publicado"}},
    )
    # Backfill folio (public_id) para propiedades existentes sin ID
    pend_props = await db.properties.find({"public_id": {"$exists": False}}).sort("created_at", 1).to_list(None)
    for p in pend_props:
        await db.properties.update_one({"id": p["id"]}, {"$set": {"public_id": await next_folio("P")}})

    # Backfill member_no for existing external users (stable, ordered by creation)
    pending = await db.users.find(
        {"account_type": "external", "member_no": {"$exists": False}}
    ).sort("created_at", 1).to_list(None)
    for u in pending:
        await db.users.update_one({"id": u["id"]}, {"$set": {"member_no": await next_member_no()}})

    if await db.properties.count_documents({}) == 0:
        for sp in SEED_PROPERTIES:
            doc = dict(sp)
            doc.update({"id": new_id("prop"), "owner_id": landlord["id"], "status": "disponible", "review_status": "aprobada", "review_stage": "publicado", "created_at": now_utc().isoformat()})
            await db.properties.insert_one(doc)
    logger.info("Seed completo")


@app.on_event("startup")
async def on_startup():
    try:
        init_storage()
        logger.info("Almacenamiento inicializado")
    except Exception as e:
        logger.error(f"Fallo al inicializar almacenamiento: {e}")
    await seed()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
