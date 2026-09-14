# Auto-split from server.py — módulo de rutas de Réntalo en Línea
from core import *  # noqa: F401,F403

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
