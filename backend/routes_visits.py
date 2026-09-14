# Auto-split from server.py — módulo de rutas de Réntalo en Línea
from core import *  # noqa: F401,F403

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
    from reportlab.lib.enums import TA_JUSTIFY
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
    }, {"history": {"status": "reprogramada", "by": user["name"], "at": now_utc().isoformat(), "note": data.note or "Nueva fecha propuesta"}})
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
