# Auto-split from server.py — módulo de rutas de Réntalo en Línea
from core import *  # noqa: F401,F403

@api.get("/my/contracts")
async def my_contracts(user: dict = Depends(get_current_user)):
    q = {"$or": [{"tenant_id": user["id"]}, {"landlord_id": user["id"]}]}
    contracts = await db.contracts.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # El arrendatario no ve contratos que aún están en revisión del administrador
    contracts = [c for c in contracts if not (c.get("status") == "en_revision_admin" and c.get("tenant_id") == user["id"] and c.get("landlord_id") != user["id"])]
    for c in contracts:
        c["paid_months"] = await db.payment_transactions.count_documents({"contract_id": c["id"], "payment_status": "paid", "concept": "renta"})
        c["deposit_paid"] = bool(c.get("deposit_registered")) or (await db.payment_transactions.count_documents({"contract_id": c["id"], "payment_status": "paid", "concept": "deposito"})) > 0
        c["monthly_total_to_pay"] = monthly_total_to_pay(float(c.get("monthly_rent") or 0), c.get("iva_rate"))["total"]
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
