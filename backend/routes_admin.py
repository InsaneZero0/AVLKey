# Auto-split from server.py — módulo de rutas de Réntalo en Línea
from core import *  # noqa: F401,F403

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
