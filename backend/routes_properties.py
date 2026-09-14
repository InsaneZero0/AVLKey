# Auto-split from server.py — módulo de rutas de Réntalo en Línea
from core import *  # noqa: F401,F403

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
    rented_ids = await db.contracts.distinct("property_id", {"status": {"$nin": ["finalizado", "cancelado", "rechazado"]}})
    if rented_ids:
        query["id"] = {"$nin": rented_ids}
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
