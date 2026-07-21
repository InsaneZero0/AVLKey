from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import logging
import uuid
import bcrypt
import requests
import stripe

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

app = FastAPI(title="Réntalo en Línea API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rentalo")

PROPERTY_TYPES = ["casa", "departamento", "oficina", "local", "terreno", "bodega", "industrial"]


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
    return clean_user(user)


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
        "phone": data.phone,
        "picture": None,
        "auth_provider": "password",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(dict(user))
    token = await create_session(user["id"])
    set_session_cookie(response, token)
    return clean_user(dict(user))


@api.post("/auth/login")
async def login(data: LoginInput, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    token = await create_session(user["id"])
    set_session_cookie(response, token)
    return clean_user(dict(user))


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
    return clean_user(dict(user))


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
    return clean_user(updated)


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------
async def enrich_property(prop: dict) -> dict:
    owner = await db.users.find_one({"id": prop["owner_id"]}, {"_id": 0, "name": 1, "picture": 1, "phone": 1})
    prop["owner"] = {"name": owner.get("name"), "picture": owner.get("picture")} if owner else None
    return prop


@api.post("/properties")
async def create_property(data: PropertyInput, user: dict = Depends(get_current_user)):
    if user["role"] != "arrendador":
        raise HTTPException(status_code=403, detail="Solo los arrendadores pueden publicar inmuebles")
    if data.property_type not in PROPERTY_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de inmueble inválido")
    prop = data.model_dump()
    prop.update({
        "id": new_id("prop"),
        "owner_id": user["id"],
        "status": "disponible",
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
    return props


# ---------------------------------------------------------------------------
# Applications (solicitudes)
# ---------------------------------------------------------------------------
@api.post("/applications")
async def create_application(data: ApplicationInput, user: dict = Depends(get_current_user)):
    if user["role"] != "arrendatario":
        raise HTTPException(status_code=403, detail="Solo los arrendatarios pueden solicitar")
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
            "phone": None, "picture": None, "auth_provider": "password", "created_at": now_utc().isoformat(),
        })

    landlord_email = "arrendador@demo.mx"
    landlord = await db.users.find_one({"email": landlord_email})
    if not landlord:
        landlord = {
            "id": new_id("user"), "email": landlord_email, "name": "Carlos Mendoza",
            "password_hash": hash_password("Demo123!"), "role": "arrendador",
            "phone": "5555550101", "picture": None, "auth_provider": "password", "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(dict(landlord))

    tenant_email = "arrendatario@demo.mx"
    if not await db.users.find_one({"email": tenant_email}):
        await db.users.insert_one({
            "id": new_id("user"), "email": tenant_email, "name": "Ana Torres",
            "password_hash": hash_password("Demo123!"), "role": "arrendatario",
            "phone": "5555550202", "picture": None, "auth_provider": "password", "created_at": now_utc().isoformat(),
        })

    if await db.properties.count_documents({}) == 0:
        for sp in SEED_PROPERTIES:
            doc = dict(sp)
            doc.update({"id": new_id("prop"), "owner_id": landlord["id"], "status": "disponible", "created_at": now_utc().isoformat()})
            await db.properties.insert_one(doc)
    logger.info("Seed completo")


@app.on_event("startup")
async def on_startup():
    await seed()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
