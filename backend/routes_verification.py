# Auto-split from server.py — módulo de rutas de Réntalo en Línea
from core import *  # noqa: F401,F403

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
