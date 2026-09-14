# Réntalo en Línea — entrypoint FastAPI. Rutas divididas en módulos routes_*.py
from core import *  # noqa: F401,F403
from routes_auth import *  # noqa: F401,F403
from routes_properties import *  # noqa: F401,F403
from routes_visits import *  # noqa: F401,F403
from routes_applications import *  # noqa: F401,F403
from routes_contracts import *  # noqa: F401,F403
from routes_payments import *  # noqa: F401,F403
from routes_verification import *  # noqa: F401,F403
from routes_admin import *  # noqa: F401,F403


app.include_router(api)


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
