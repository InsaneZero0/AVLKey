# Auto-split from server.py — módulo de rutas de Réntalo en Línea
from core import *  # noqa: F401,F403

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
