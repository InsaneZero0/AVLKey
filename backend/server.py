from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File, Form, Header, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import logging
import uuid
import bcrypt
import requests
import stripe
import secrets

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


def public_id_for(user: dict) -> Optional[str]:
    if user.get("account_type") == "internal" or user.get("member_no") is None:
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


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None


class PropertyInput(BaseModel):
    title: str
    description: str = ""
    property_type: str
    address: str = ""
    city: str
    state: str = ""
    colonia: str = ""
    price_month: float
    deposit: float = 0
    maintenance_fee: float = 0
    bedrooms: int = 0
    bathrooms: int = 0
    parking: int = 0
    area_m2: float = 0
    furnished: bool = False
    pets_allowed: bool = False
    amenities: List[str] = []
    images: List[str] = []


class ApplicationInput(BaseModel):
    property_id: str
    monthly_income: float
    occupation: str = ""
    employment_type: str = "empleado_formal"
    num_occupants: int = 1
    has_guarantor: bool = False
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
    if data.role in ("arrendador", "arrendatario"):
        updates["role"] = data.role
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return with_perms(updated)


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------
async def enrich_property(prop: dict) -> dict:
    owner = await db.users.find_one({"id": prop["owner_id"]}, {"_id": 0, "name": 1, "picture": 1, "phone": 1})
    prop["owner"] = {"name": owner.get("name"), "picture": owner.get("picture")} if owner else None
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
    query["review_status"] = {"$ne": "rechazada"}
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
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
            {"colonia": {"$regex": q, "$options": "i"}},
        ]
    props = await db.properties.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return props


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
    score, level, ratio = compute_risk(data.monthly_income, prop["price_month"], data.employment_type, data.has_guarantor, data.num_occupants)
    app_doc = data.model_dump()
    app_doc.update({
        "id": new_id("app"),
        "tenant_id": user["id"],
        "tenant_name": user["name"],
        "owner_id": prop["owner_id"],
        "property_title": prop["title"],
        "property_price": prop["price_month"],
        "risk_score": score,
        "risk_level": level,
        "income_ratio": ratio,
        "status": "pendiente",
        "created_at": now_utc().isoformat(),
    })
    await db.applications.insert_one(dict(app_doc))
    app_doc.pop("_id", None)
    return app_doc


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
            commission = round(prop["price_month"] * 0.05, 2)
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
                "deposit": prop.get("deposit", 0),
                "commission": commission,
                "maintenance_fund": prop.get("maintenance_fee", 0),
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
    for c in contracts:
        c["paid_months"] = await db.payment_transactions.count_documents({"contract_id": c["id"], "payment_status": "paid", "concept": "renta"})
    return contracts


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
        except Exception:
            pass
    return {"session_id": record["session_id"], "status": record["status"], "payment_status": record["payment_status"], "concept": record.get("concept"), "amount": record.get("amount")}


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
    return {"status": "ok"}


@api.get("/my/payments")
async def my_payments(user: dict = Depends(get_current_user)):
    q = {"$or": [{"tenant_id": user["id"]}, {"landlord_id": user["id"]}]}
    payments = await db.payment_transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return payments


# ---------------------------------------------------------------------------
# Visitas (agendamiento) + notificaciones
# ---------------------------------------------------------------------------
VISIT_STATUSES = ["solicitada", "confirmada", "reprogramada", "cancelada", "completada", "no_asistio"]
REVEAL_ADDRESS_STATUSES = {"confirmada", "completada", "no_asistio"}


class VisitCreate(BaseModel):
    property_id: str
    scheduled_at: str
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
    parts = [prop.get("address"), prop.get("colonia"), prop.get("city"), prop.get("state")]
    return ", ".join([p for p in parts if p])


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
        "scheduled_at": data.scheduled_at,
        "proposed_at": None,
        "proposed_by": None,
        "status": "solicitada",
        "note": data.note,
        "history": [entry],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.visits.insert_one(dict(visit))
    await notify(prop["owner_id"], "visita", "Nueva solicitud de visita",
                 f"{user['name']} solicitó visitar {prop['title']}", "/panel/visitas")
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
    await db.visits.update_one({"id": v["id"]}, {"$set": updates, "$push": {"history": entry}})


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
    await db.visits.update_one({"id": visit_id}, {"$set": {
        "status": "reprogramada", "scheduled_at": data.scheduled_at,
        "proposed_by": "arrendador" if user["id"] == v["landlord_id"] else "arrendatario",
        "updated_at": now_utc().isoformat(),
    }, "$push": {"history": {"status": "reprogramada", "by": user["name"], "at": now_utc().isoformat(), "note": data.note or f"Nueva fecha propuesta"}}})
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
        {"key": "rfc", "label": "RFC", "required": True},
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


class FiscalInfo(BaseModel):
    rfc: Optional[str] = None
    fiscal_regime: Optional[str] = None
    bank_name: Optional[str] = None
    account_holder: Optional[str] = None
    clabe: Optional[str] = None


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
    return {
        "user": u,
        "properties": props,
        "documents_summary": documents_summary,
        "can_view_documents": can_docs,
        "category": category,
        "fiscal_info": u.get("fiscal_info"),
        "consent": consent,
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


REVIEW_STAGES = ["recibido", "en_revision", "doc_faltante", "aprobado", "publicado", "rechazado"]
REVIEW_STAGE_LABELS = {
    "recibido": "Recibido", "en_revision": "En revisión", "doc_faltante": "Documentación faltante",
    "aprobado": "Aprobado", "publicado": "Publicado", "rechazado": "Rechazado",
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


@api.get("/admin/applications")
async def admin_applications(user: dict = Depends(require_permission("consultar"))):
    apps = await db.applications.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return apps


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

    # Backfill member_no for existing external users (stable, ordered by creation)
    pending = await db.users.find(
        {"account_type": "external", "member_no": {"$exists": False}}
    ).sort("created_at", 1).to_list(None)
    for u in pending:
        await db.users.update_one({"id": u["id"]}, {"$set": {"member_no": await next_member_no()}})

    if await db.properties.count_documents({}) == 0:
        for sp in SEED_PROPERTIES:
            doc = dict(sp)
            doc.update({"id": new_id("prop"), "owner_id": landlord["id"], "status": "disponible", "review_status": "aprobada", "created_at": now_utc().isoformat()})
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
