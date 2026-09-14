# Auto-split from server.py — módulo de rutas de Réntalo en Línea
from core import *  # noqa: F401,F403

@api.post("/payments/rent/checkout")
async def rent_checkout(data: RentCheckoutInput, user: dict = Depends(get_current_user)):
    contract = await db.contracts.find_one({"id": data.contract_id}, {"_id": 0})
    if not contract or contract["tenant_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    concept = data.concept
    if concept == "deposito":
        amount = float(contract.get("deposit", 0))
        label = "Depósito en garantía"
        already = contract.get("deposit_registered") or await db.payment_transactions.find_one({"contract_id": contract["id"], "payment_status": "paid", "concept": "deposito"})
        if already:
            raise HTTPException(status_code=400, detail="El depósito en garantía ya fue pagado")
    else:
        prop = await db.properties.find_one({"id": contract["property_id"]}, {"_id": 0}) or {}
        breakdown = monthly_total_to_pay(float(contract["monthly_rent"]), contract.get("iva_rate") or prop.get("iva_rate"))
        amount = breakdown["total"]
        label = "Renta mensual (renta + cuota Réntalo + mantenimiento" + (" + IVA)" if breakdown["iva"] else ")")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Monto inválido")
    origin = data.origin_url.rstrip("/")
    session_kwargs = {}
    if concept == "deposito":
        udoc = await db.users.find_one({"id": user["id"]})
        session_kwargs = {"customer": await get_or_create_customer(udoc),
                          "payment_intent_data": {"setup_future_usage": "off_session"},
                          "payment_method_options": {"card": {"setup_future_usage": "off_session"}}}
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            **session_kwargs,
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
                await _reconcile_checkout_payment(record)
        except Exception:
            pass
    return {"session_id": record["session_id"], "status": record["status"], "payment_status": record["payment_status"], "concept": record.get("concept"), "amount": record.get("amount")}


async def _save_card_from_payment_intent(tenant_id: str, payment_intent_id: str):
    """Guarda la tarjeta usada en el depósito como método de cobro automático de renta."""
    if not payment_intent_id:
        return
    try:
        pi = stripe.PaymentIntent.retrieve(payment_intent_id)
        if not pi.payment_method:
            return
        pm = stripe.PaymentMethod.retrieve(pi.payment_method)
        cust_id = pi.customer
        if cust_id:
            if not pm.customer:
                pm = stripe.PaymentMethod.attach(pm.id, customer=cust_id)
            stripe.Customer.modify(cust_id, invoice_settings={"default_payment_method": pm.id})
        updates = {"default_payment_method_id": pm.id, "card_brand": pm.card.brand, "card_last4": pm.card.last4, "autopay_enabled": True}
        if cust_id:
            updates["stripe_customer_id"] = cust_id
        await db.users.update_one({"id": tenant_id}, {"$set": updates})
    except Exception as e:
        logger.error(f"No se pudo guardar la tarjeta del depósito: {e}")


async def _reconcile_checkout_payment(record: dict):
    """Reflect a paid Stripe Checkout in rent_charges / contract so statements show it."""
    if not record or record.get("payment_status") != "paid" or record.get("reconciled"):
        return
    contract = await db.contracts.find_one({"id": record["contract_id"]}, {"_id": 0})
    if not contract:
        return
    now = now_utc().isoformat()
    if record.get("concept") == "deposito":
        await db.contracts.update_one({"id": contract["id"], "deposit_registered": {"$ne": True}}, {"$set": {
            "deposit_registered": True, "deposit_registered_at": now, "deposit_reference": f"Stripe {record.get('stripe_payment_intent_id') or record['session_id']}"}})
        await _save_card_from_payment_intent(contract["tenant_id"], record.get("stripe_payment_intent_id"))
        period = None
    else:
        charge = await db.rent_charges.find_one({"contract_id": contract["id"], "status": {"$ne": "pagado"}}, {"_id": 0}, sort=[("period", 1)])
        if not charge:
            prop = await db.properties.find_one({"id": contract["property_id"]}, {"_id": 0}) or {}
            period = now_utc().strftime("%Y-%m")
            is_first = (await db.rent_charges.count_documents({"contract_id": contract["id"]})) == 0
            charge = await _ensure_charge(contract, prop, period, is_first)
        period = charge["period"]
        await db.rent_charges.update_one({"id": charge["id"]}, {"$set": {
            "status": "pagado", "paid_at": now, "last_error": None, "payment_method": "stripe_checkout",
            "stripe_payment_intent_id": record.get("stripe_payment_intent_id") or record["session_id"]}})
    await db.payment_transactions.update_one({"session_id": record["session_id"]}, {"$set": {
        "reconciled": True, "period": period, "tenant_name": contract.get("tenant_name", ""), "landlord_name": contract.get("landlord_name", "")}})


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
        await _reconcile_checkout_payment(await db.payment_transactions.find_one({"session_id": obj["id"]}, {"_id": 0}))
    return {"status": "ok"}


@api.get("/my/payments")
async def my_payments(user: dict = Depends(get_current_user)):
    q = {"$or": [{"tenant_id": user["id"]}, {"landlord_id": user["id"]}]}
    payments = await db.payment_transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return payments


class OriginInput(BaseModel):
    origin_url: str


class DisperseInput(BaseModel):
    reference: str = ""


CRON_SECRET = os.environ.get("CRON_SECRET", "rentalo-cron-2026")


def compute_charge_amounts(contract: dict, prop: dict, is_first: bool) -> dict:
    rent = float(contract.get("monthly_rent") or 0)
    maintenance = round(rent * 0.04, 2)
    commission = round(rent * 0.04, 2)
    iva = round(rent * float(contract.get("iva_rate") or prop.get("iva_rate") or 0) / 100, 2)
    g_danos = round(rent * 0.05, 2) if prop.get("garantia_danos") else 0.0
    g_pago = round(rent * 0.05, 2) if prop.get("garantia_pago_puntual") else 0.0
    deposit = float(contract.get("deposit") or rent) if is_first else 0.0
    base_total = round(rent + commission + maintenance + iva + deposit, 2)
    net_landlord = round(rent - commission - g_danos - g_pago, 2)
    retained = round(deposit + g_danos + g_pago + maintenance, 2)
    return {
        "rent": rent, "maintenance": maintenance, "commission": commission, "iva": iva,
        "guarantee_danos": g_danos, "guarantee_pago": g_pago, "deposit": deposit,
        "base_total": base_total, "late_fee": 0.0, "tenant_total": base_total,
        "net_landlord": net_landlord, "retained": retained,
    }


async def get_or_create_customer(udoc: dict) -> str:
    if udoc.get("stripe_customer_id"):
        return udoc["stripe_customer_id"]
    cust = stripe.Customer.create(email=udoc["email"], name=udoc.get("name", ""), metadata={"user_id": udoc["id"]})
    await db.users.update_one({"id": udoc["id"]}, {"$set": {"stripe_customer_id": cust.id}})
    return cust.id


def _period_now() -> str:
    return now_utc().strftime("%Y-%m")


async def _ensure_charge(contract: dict, prop: dict, period: str, is_first: bool) -> dict:
    existing = await db.rent_charges.find_one({"contract_id": contract["id"], "period": period}, {"_id": 0})
    if existing:
        return existing
    a = compute_charge_amounts(contract, prop, is_first)
    doc = {
        "id": new_id("chg"),
        "contract_id": contract["id"],
        "property_id": contract.get("property_id"),
        "property_public_id": prop.get("public_id", ""),
        "property_title": contract.get("property_title", ""),
        "tenant_id": contract["tenant_id"],
        "tenant_name": contract.get("tenant_name", ""),
        "landlord_id": contract["landlord_id"],
        "landlord_name": contract.get("landlord_name", ""),
        "period": period,
        "due_date": f"{period}-05",
        "is_first": is_first,
        **a,
        "status": "pendiente",
        "stripe_payment_intent_id": None,
        "last_error": None,
        "paid_at": None,
        "dispersed": False,
        "dispersed_at": None,
        "dispersal_ref": None,
        "dispersal_method": None,
        "created_at": now_utc().isoformat(),
    }
    await db.rent_charges.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def _charge_now(charge: dict, tenant: dict) -> dict:
    if charge.get("status") == "pagado":
        return charge
    try:
        pi = stripe.PaymentIntent.create(
            amount=int(round(charge["tenant_total"] * 100)),
            currency="mxn",
            customer=tenant["stripe_customer_id"],
            payment_method=tenant["default_payment_method_id"],
            off_session=True, confirm=True,
            description=f"Renta {charge['period']} - {charge['property_title']}",
            metadata={"charge_id": charge["id"], "contract_id": charge["contract_id"]},
        )
        await db.rent_charges.update_one(
            {"id": charge["id"]},
            {"$set": {"status": "pagado", "stripe_payment_intent_id": pi.id, "paid_at": now_utc().isoformat(), "last_error": None}},
        )
        await db.payment_transactions.update_one(
            {"session_id": pi.id},
            {"$set": {
                "session_id": pi.id,
                "contract_id": charge["contract_id"],
                "tenant_id": charge["tenant_id"],
                "tenant_name": charge.get("tenant_name", ""),
                "landlord_id": charge["landlord_id"],
                "landlord_name": charge.get("landlord_name", ""),
                "property_title": charge.get("property_title", ""),
                "property_public_id": charge.get("property_public_id", ""),
                "concept": "renta",
                "period": charge["period"],
                "amount": charge["tenant_total"],
                "currency": "mxn",
                "status": "completed",
                "payment_status": "paid",
                "stripe_payment_intent_id": pi.id,
                "created_at": now_utc().isoformat(),
                "updated_at": now_utc().isoformat(),
            }},
            upsert=True,
        )
        await notify(charge["tenant_id"], "pago", "Pago de renta procesado",
                     f"Se cobró el periodo {charge['period']} por ${charge['tenant_total']:,.0f} MX.", "/panel/pagos")
        charge.update({"status": "pagado", "stripe_payment_intent_id": pi.id})
        try:
            await _send_receipt_email(tenant, charge)
        except Exception as e:
            logger.error(f"receipt email error: {e}")
    except stripe.error.CardError as e:
        err = str(getattr(e, "user_message", None) or e)
        await db.rent_charges.update_one({"id": charge["id"]}, {"$set": {"status": "fallido", "last_error": err}})
        charge["status"] = "fallido"
        charge["last_error"] = err
    except stripe.error.StripeError as e:
        err = str(getattr(e, "user_message", None) or e)
        await db.rent_charges.update_one({"id": charge["id"]}, {"$set": {"status": "fallido", "last_error": err}})
        charge["status"] = "fallido"
        charge["last_error"] = err
    return charge


async def _attempt_autocharge(charge: dict) -> dict:
    tenant = await db.users.find_one({"id": charge["tenant_id"]})
    if not tenant or not tenant.get("default_payment_method_id"):
        return charge
    return await _charge_now(charge, tenant)


async def _generate_period(period: str) -> list:
    contracts = await db.contracts.find({"status": "activo"}, {"_id": 0}).to_list(1000)
    results = []
    for c in contracts:
        if c.get("start_date") and period < c["start_date"][:7]:
            continue
        prop = await db.properties.find_one({"id": c["property_id"]}, {"_id": 0}) or {}
        is_first = (await db.rent_charges.count_documents({"contract_id": c["id"]})) == 0
        charge = await _ensure_charge(c, prop, period, is_first)
        charge = await _attempt_autocharge(charge)
        results.append(charge)
    return results


# --- Recargos por atraso y correos (recibo / recordatorio) ---
def _fmt_money(v) -> str:
    return f"${float(v or 0):,.0f} MX"


async def _apply_late_fee(charge: dict) -> dict:
    if charge.get("status") == "pagado" or float(charge.get("late_fee") or 0) > 0:
        return charge
    today = now_utc().date().isoformat()
    if charge.get("due_date") and today > charge["due_date"]:
        late = round(float(charge.get("rent") or 0) * 0.10, 2)
        base = float(charge.get("base_total") or charge.get("tenant_total") or 0)
        new_total = round(base + late, 2)
        await db.rent_charges.update_one({"id": charge["id"]}, {"$set": {"late_fee": late, "tenant_total": new_total}})
        charge["late_fee"] = late
        charge["tenant_total"] = new_total
    return charge


def _receipt_html(charge: dict, tenant_name: str) -> str:
    rows = [("Renta mensual", charge.get("rent"))]
    if float(charge.get("maintenance") or 0) > 0:
        rows.append(("Mantenimiento (4%)", charge.get("maintenance")))
    if float(charge.get("deposit") or 0) > 0:
        rows.append(("Depósito en garantía", charge.get("deposit")))
    if float(charge.get("late_fee") or 0) > 0:
        rows.append(("Recargo por pago tardío (10%)", charge.get("late_fee")))
    row_html = "".join(
        f'<tr><td style="padding:6px 0;color:#57534e">{escape(lbl)}</td>'
        f'<td style="padding:6px 0;text-align:right;color:#1c1917">{_fmt_money(val)}</td></tr>'
        for lbl, val in rows)
    return (
        f'<table role="presentation" width="100%" style="max-width:560px;margin:auto;'
        f'font-family:Arial,sans-serif"><tr><td style="padding:24px">'
        f'<h2 style="color:#0f2740;margin:0 0 4px">Recibo de pago de renta</h2>'
        f'<p style="color:#57534e;margin:0 0 16px">Hola {escape(tenant_name)}, recibimos tu pago correctamente.</p>'
        f'<p style="color:#1c1917;margin:0 0 12px"><strong>Inmueble:</strong> {escape(charge.get("property_title",""))}'
        f'<br><strong>Periodo:</strong> {escape(charge.get("period",""))}</p>'
        f'<table role="presentation" width="100%" style="border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4">'
        f'{row_html}</table>'
        f'<p style="text-align:right;font-size:18px;color:#0f2740;margin:12px 0"><strong>Total pagado: {_fmt_money(charge.get("tenant_total"))}</strong></p>'
        f'<p style="font-size:12px;color:#a8a29e;margin-top:20px">Enviado por {escape(EMAIL_FROM_NAME)}. '
        f'Nunca te pediremos tu contraseña ni datos de tarjeta por correo.</p>'
        f'</td></tr></table>')


def _reminder_html(charge: dict, tenant_name: str) -> str:
    late = float(charge.get("late_fee") or 0)
    extra = (f'<p style="color:#b91c1c;margin:0 0 12px">Se aplicó un recargo por pago tardío del 10% '
             f'({_fmt_money(late)}).</p>' if late > 0 else "")
    return (
        f'<table role="presentation" width="100%" style="max-width:560px;margin:auto;'
        f'font-family:Arial,sans-serif"><tr><td style="padding:24px">'
        f'<h2 style="color:#0f2740;margin:0 0 4px">Tu renta está vencida</h2>'
        f'<p style="color:#57534e;margin:0 0 12px">Hola {escape(tenant_name)}, tu renta del periodo '
        f'<strong>{escape(charge.get("period",""))}</strong> del inmueble '
        f'{escape(charge.get("property_title",""))} aún no ha sido pagada.</p>'
        f'{extra}'
        f'<p style="color:#1c1917;margin:0 0 12px">Total a pagar: <strong>{_fmt_money(charge.get("tenant_total"))}</strong>. '
        f'Ingresa a tu panel de Réntalo en Línea, sección Pagos, para liquidarlo.</p>'
        f'<p style="font-size:12px;color:#a8a29e;margin-top:20px">Enviado por {escape(EMAIL_FROM_NAME)}. '
        f'Nunca te pediremos tu contraseña ni datos de tarjeta por correo.</p>'
        f'</td></tr></table>')


async def _send_receipt_email(tenant: dict, charge: dict):
    if not tenant or not tenant.get("email"):
        return
    subject = f"Recibo de tu renta {charge.get('period','')} · {EMAIL_FROM_NAME}"
    await send_email_managed(tenant["email"], subject, _receipt_html(charge, tenant.get("name", "arrendatario")))


async def _send_reminder_email(tenant: dict, charge: dict):
    if not tenant or not tenant.get("email"):
        return
    subject = f"Renta vencida {charge.get('period','')} · {EMAIL_FROM_NAME}"
    await send_email_managed(tenant["email"], subject, _reminder_html(charge, tenant.get("name", "arrendatario")))


def _autopay_notice_html(tenant_name: str, contract: dict, breakdown: dict, card_brand: str, card_last4: str, charge_date: str) -> str:
    rows = [("Renta mensual", breakdown["rent"]), ("Cuota Réntalo en Línea (4%)", breakdown["platform_fee"]), ("Mantenimiento (4%)", breakdown["maintenance"])]
    if breakdown["iva"] > 0:
        rows.append(("IVA", breakdown["iva"]))
    row_html = "".join(
        f'<tr><td style="padding:6px 0;color:#57534e">{escape(lbl)}</td>'
        f'<td style="padding:6px 0;text-align:right;color:#1c1917">{_fmt_money(val)}</td></tr>' for lbl, val in rows)
    return (
        f'<table role="presentation" width="100%" style="max-width:560px;margin:auto;font-family:Arial,sans-serif"><tr><td style="padding:24px">'
        f'<h2 style="color:#1e293b;margin:0 0 8px">Aviso de cobro automático</h2>'
        f'<p style="color:#57534e">Hola {escape(tenant_name)}, el <b>{escape(charge_date)}</b> realizaremos el cobro automático de la renta de '
        f'<b>{escape(contract.get("property_title", ""))}</b> a tu tarjeta <b>{escape((card_brand or "tarjeta").upper())} terminación {escape(card_last4 or "----")}</b>.</p>'
        f'<table width="100%" style="border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4;margin:16px 0">{row_html}'
        f'<tr><td style="padding:10px 0;font-weight:bold;color:#1c1917">Total a cobrar</td>'
        f'<td style="padding:10px 0;text-align:right;font-weight:bold;color:#c2410c">{_fmt_money(breakdown["total"])}</td></tr></table>'
        f'<p style="color:#78716c;font-size:13px">Asegúrate de contar con fondos suficientes. Si deseas cambiar la tarjeta, hazlo desde tu panel en Pagos antes de esa fecha.</p>'
        f'<p style="color:#a8a29e;font-size:12px">{EMAIL_FROM_NAME}</p></td></tr></table>')


async def _send_autopay_notices():
    """3 días antes del cobro automático (día 1) avisa al arrendatario monto y tarjeta."""
    today = now_utc().date()
    y, m = (today.year + (1 if today.month == 12 else 0), 1 if today.month == 12 else today.month + 1)
    charge_day = date(y, m, 1)
    if (charge_day - today).days != 3:
        return
    period = charge_day.strftime("%Y-%m")
    contracts = await db.contracts.find({"status": "activo"}, {"_id": 0}).to_list(1000)
    for c in contracts:
        if c.get("start_date") and period < c["start_date"][:7]:
            continue
        if await db.autopay_notices.find_one({"contract_id": c["id"], "period": period}):
            continue
        tenant = await db.users.find_one({"id": c["tenant_id"]}, {"_id": 0})
        if not tenant or not tenant.get("default_payment_method_id"):
            continue
        prop = await db.properties.find_one({"id": c["property_id"]}, {"_id": 0}) or {}
        breakdown = monthly_total_to_pay(float(c.get("monthly_rent") or 0), c.get("iva_rate") or prop.get("iva_rate"))
        charge_date = charge_day.strftime("%d/%m/%Y")
        card = f"{(tenant.get('card_brand') or 'tarjeta').upper()} •••• {tenant.get('card_last4') or '----'}"
        await notify(c["tenant_id"], "pago", "Aviso de cobro automático",
                     f"El {charge_date} cobraremos ${breakdown['total']:,.0f} MX de la renta de {c.get('property_title', '')} a tu {card}.", "/panel/pagos")
        try:
            if tenant.get("email"):
                await send_email_managed(tenant["email"], f"Aviso de cobro automático {period} · {EMAIL_FROM_NAME}",
                                         _autopay_notice_html(tenant.get("name", "arrendatario"), c, breakdown, tenant.get("card_brand"), tenant.get("card_last4"), charge_date))
        except Exception as e:
            logger.error(f"autopay notice email error: {e}")
        await db.autopay_notices.insert_one({"contract_id": c["id"], "tenant_id": c["tenant_id"], "period": period,
                                             "amount": breakdown["total"], "sent_at": now_utc().isoformat()})


async def _payments_daily():
    today = now_utc().date().isoformat()
    await _send_autopay_notices()
    charges = await db.rent_charges.find({"status": {"$in": ["pendiente", "fallido"]}}, {"_id": 0}).to_list(3000)
    for c in charges:
        if c.get("due_date") and today > c["due_date"]:
            c = await _apply_late_fee(c)
            await notify(c["tenant_id"], "pago", "Renta vencida",
                         f"Tu renta del periodo {c['period']} está vencida. Se aplicó un recargo del 10%. "
                         f"Total a pagar: ${c['tenant_total']:,.0f} MX.", "/panel/pagos")
            tenant = await db.users.find_one({"id": c["tenant_id"]})
            try:
                await _send_reminder_email(tenant, c)
            except Exception as e:
                logger.error(f"reminder email error: {e}")


# --- Tarjeta guardada del arrendatario (Stripe Checkout setup) ---
@api.post("/payments/card/setup-session")
async def card_setup_session(data: OriginInput, user: dict = Depends(get_current_user)):
    udoc = await db.users.find_one({"id": user["id"]})
    cust_id = await get_or_create_customer(udoc)
    origin = data.origin_url.rstrip("/")
    session = stripe.checkout.Session.create(
        mode="setup", customer=cust_id, payment_method_types=["card"],
        success_url=f"{origin}/panel/pagos?card_session={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/panel/pagos?card=cancel",
    )
    return {"checkout_url": session.url}


@api.post("/payments/card/confirm")
async def card_confirm(data: SessionInput, user: dict = Depends(get_current_user)):
    session = stripe.checkout.Session.retrieve(data.session_id)
    si = stripe.SetupIntent.retrieve(session.setup_intent)
    pm = stripe.PaymentMethod.retrieve(si.payment_method)
    cust_id = session.customer
    stripe.Customer.modify(cust_id, invoice_settings={"default_payment_method": pm.id})
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "stripe_customer_id": cust_id, "default_payment_method_id": pm.id,
        "card_brand": pm.card.brand, "card_last4": pm.card.last4,
    }})
    return {"brand": pm.card.brand, "last4": pm.card.last4}


@api.get("/payments/card")
async def get_card(user: dict = Depends(get_current_user)):
    udoc = await db.users.find_one({"id": user["id"]})
    if not udoc.get("default_payment_method_id"):
        return {"has_card": False}
    return {"has_card": True, "brand": udoc.get("card_brand"), "last4": udoc.get("card_last4")}


# --- Onboarding Connect del arrendador ---
@api.post("/payments/connect/onboard")
async def connect_onboard(data: OriginInput, user: dict = Depends(get_current_user)):
    if user.get("role") != "arrendador":
        raise HTTPException(status_code=403, detail="Solo arrendadores")
    udoc = await db.users.find_one({"id": user["id"]})
    acct_id = udoc.get("stripe_connect_account_id")
    try:
        if not acct_id:
            acct = stripe.Account.create(
                type="express", country="MX", email=udoc["email"],
                capabilities={"transfers": {"requested": True}},
                business_type="individual", metadata={"user_id": user["id"]},
            )
            acct_id = acct.id
            await db.users.update_one({"id": user["id"]}, {"$set": {"stripe_connect_account_id": acct_id, "connect_status": "pending"}})
        origin = data.origin_url.rstrip("/")
        link = stripe.AccountLink.create(
            account=acct_id,
            refresh_url=f"{origin}/panel/pagos?connect=refresh",
            return_url=f"{origin}/panel/pagos?connect=done",
            type="account_onboarding",
        )
        return {"enabled": True, "url": link.url}
    except stripe.error.StripeError as e:
        msg = str(getattr(e, "user_message", None) or e)
        return {"enabled": False, "message": "Stripe Connect aún no está habilitado en la plataforma; el administrador debe activarlo en el panel de Stripe.", "detail": msg[:160]}


@api.get("/payments/connect/status")
async def connect_status(user: dict = Depends(get_current_user)):
    udoc = await db.users.find_one({"id": user["id"]})
    acct_id = udoc.get("stripe_connect_account_id")
    if not acct_id:
        return {"connected": False, "status": "none"}
    try:
        acct = stripe.Account.retrieve(acct_id)
        status = "active" if (acct.charges_enabled and acct.payouts_enabled) else "pending"
        await db.users.update_one({"id": user["id"]}, {"$set": {"connect_status": status}})
        return {"connected": True, "status": status, "charges_enabled": acct.charges_enabled, "payouts_enabled": acct.payouts_enabled}
    except stripe.error.StripeError:
        return {"connected": True, "status": udoc.get("connect_status", "pending")}


# --- Cobros de renta ---
@api.post("/payments/contracts/{cid}/start-billing")
async def start_billing(cid: str, user: dict = Depends(get_current_user)):
    c = await db.contracts.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if not user.get("staff_role") and user["id"] not in (c["landlord_id"], c["tenant_id"]):
        raise HTTPException(status_code=403, detail="No autorizado")
    prop = await db.properties.find_one({"id": c["property_id"]}, {"_id": 0}) or {}
    period = _period_now()
    is_first = (await db.rent_charges.count_documents({"contract_id": cid})) == 0
    charge = await _ensure_charge(c, prop, period, is_first)
    await db.contracts.update_one({"id": cid}, {"$set": {"billing_active": True}})
    charge = await _attempt_autocharge(charge)
    return charge


@api.post("/payments/charges/{chg_id}/pay")
async def pay_charge(chg_id: str, user: dict = Depends(get_current_user)):
    charge = await db.rent_charges.find_one({"id": chg_id}, {"_id": 0})
    if not charge or charge["tenant_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    if charge.get("status") == "pagado":
        return charge
    tenant = await db.users.find_one({"id": user["id"]})
    if not tenant.get("default_payment_method_id"):
        raise HTTPException(status_code=400, detail="Primero guarda una tarjeta para poder pagar")
    charge = await _apply_late_fee(charge)
    charge = await _charge_now(charge, tenant)
    if charge.get("status") != "pagado":
        raise HTTPException(status_code=400, detail=charge.get("last_error") or "No se pudo procesar el pago con tu tarjeta")
    return charge


@api.get("/my/rent-charges")
async def my_rent_charges(user: dict = Depends(get_current_user)):
    q = {"$or": [{"tenant_id": user["id"]}, {"landlord_id": user["id"]}]}
    return await db.rent_charges.find(q, {"_id": 0}).sort("period", -1).to_list(300)


# --- Panel admin de finanzas ---
@api.get("/admin/finance/summary")
async def finance_summary(user: dict = Depends(require_permission("administrar_pagos"))):
    charges = await db.rent_charges.find({}, {"_id": 0}).to_list(5000)
    paid = [c for c in charges if c["status"] == "pagado"]
    return {
        "total_charges": len(charges),
        "total_collected": round(sum(c["tenant_total"] for c in paid), 2),
        "commission_earned": round(sum(c["commission"] for c in paid), 2),
        "retained": round(sum(c["retained"] for c in paid), 2),
        "pending_dispersal": round(sum(c["net_landlord"] for c in paid if not c.get("dispersed")), 2),
        "dispersed_total": round(sum(c["net_landlord"] for c in paid if c.get("dispersed")), 2),
        "pending_count": len([c for c in charges if c["status"] == "pendiente"]),
        "failed_count": len([c for c in charges if c["status"] == "fallido"]),
    }


@api.get("/admin/finance/charges")
async def finance_charges(user: dict = Depends(require_permission("administrar_pagos"))):
    return await db.rent_charges.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.get("/admin/finance/statement/{user_id}")
async def finance_statement(user_id: str, user: dict = Depends(require_permission("consultar"))):
    ll = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not ll:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    charges = await db.rent_charges.find({"landlord_id": user_id}, {"_id": 0}).sort("period", -1).to_list(1000)
    paid = [c for c in charges if c["status"] == "pagado"]
    totals = {
        "gross_collected": round(sum(c["tenant_total"] for c in paid), 2),
        "commission": round(sum(c["commission"] for c in paid), 2),
        "net_total": round(sum(c["net_landlord"] for c in paid), 2),
        "dispersed": round(sum(c["net_landlord"] for c in paid if c.get("dispersed")), 2),
        "pending_dispersal": round(sum(c["net_landlord"] for c in paid if not c.get("dispersed")), 2),
        "retained": round(sum(c["retained"] for c in paid), 2),
        "paid_count": len(paid), "total_count": len(charges),
    }
    landlord = {
        "id": ll["id"], "name": ll.get("name"), "email": ll.get("email"),
        "public_id": public_id_for(with_perms(dict(ll))), "phone": ll.get("phone"),
        "connect_status": ll.get("connect_status", "none"),
    }
    contracts = await db.contracts.find({"landlord_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    paid_deposit_contracts = {c["contract_id"] for c in charges if c.get("is_first") and c.get("status") == "pagado"}
    deposits = [{
        "contract_id": c["id"],
        "property_title": c.get("property_title", ""),
        "tenant_name": c.get("tenant_name", ""),
        "deposit_amount": float(c.get("deposit") or 0),
        "registered": bool(c.get("deposit_registered")),
        "registered_at": c.get("deposit_registered_at"),
        "reference": c.get("deposit_reference"),
    } for c in contracts if float(c.get("deposit") or 0) > 0 and c["id"] in paid_deposit_contracts]
    payments = await db.payment_transactions.find({"landlord_id": user_id, "payment_status": "paid"}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    totals["stripe_paid"] = round(sum(float(p.get("amount") or 0) for p in payments), 2)
    return {"landlord": landlord, "charges": charges, "totals": totals, "deposits": deposits, "payments": payments}


@api.get("/admin/finance/tenant-statement/{user_id}")
async def tenant_statement(user_id: str, user: dict = Depends(require_permission("consultar"))):
    t = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    charges = await db.rent_charges.find({"tenant_id": user_id}, {"_id": 0}).sort("period", -1).to_list(1000)
    paid = [c for c in charges if c["status"] == "pagado"]
    pending = [c for c in charges if c["status"] != "pagado"]
    totals = {
        "paid_total": round(sum(c["tenant_total"] for c in paid), 2),
        "pending_total": round(sum(c["tenant_total"] for c in pending), 2),
        "late_fees": round(sum(float(c.get("late_fee") or 0) for c in charges), 2),
        "deposits": round(sum(float(c.get("deposit") or 0) for c in paid), 2),
        "paid_count": len(paid), "total_count": len(charges),
    }
    contracts = await db.contracts.find({"tenant_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    tenant = {"id": t["id"], "name": t.get("name"), "email": t.get("email"), "phone": t.get("phone"),
              "public_id": public_id_for(with_perms(dict(t)))}
    payments = await db.payment_transactions.find({"tenant_id": user_id, "payment_status": "paid"}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    totals["stripe_paid"] = round(sum(float(p.get("amount") or 0) for p in payments), 2)
    return {"tenant": tenant, "charges": charges, "totals": totals, "payments": payments, "contracts": [{
        "id": c["id"], "property_title": c.get("property_title", ""), "landlord_name": c.get("landlord_name", ""),
        "monthly_rent": c.get("monthly_rent", 0), "status": c.get("status"), "start_date": c.get("start_date"), "end_date": c.get("end_date"),
        "deposit": float(c.get("deposit") or 0), "deposit_registered": bool(c.get("deposit_registered")),
    } for c in contracts]}


@api.post("/admin/finance/contracts/{cid}/register-deposit")
async def register_deposit(cid: str, data: DisperseInput, user: dict = Depends(require_permission("administrar_pagos"))):
    c = await db.contracts.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if c.get("deposit_registered"):
        raise HTTPException(status_code=400, detail="El depósito ya está registrado")
    await db.contracts.update_one({"id": cid}, {"$set": {
        "deposit_registered": True,
        "deposit_registered_at": now_utc().isoformat(),
        "deposit_reference": data.reference or "",
    }})
    await notify(c["landlord_id"], "pago", "Depósito en garantía registrado",
                 f"Se registró el depósito en garantía de {_money(c.get('deposit'))} del inmueble "
                 f"{c.get('property_title','')} (retenido en custodia).", "/panel/pagos")
    return {"ok": True}


@api.post("/admin/finance/generate")
async def finance_generate(user: dict = Depends(require_permission("administrar_pagos"))):
    period = _period_now()
    results = await _generate_period(period)
    return {"period": period, "generated": len(results)}


@api.post("/admin/finance/charges/{chg_id}/disperse")
async def finance_disperse(chg_id: str, data: DisperseInput, user: dict = Depends(require_permission("administrar_pagos"))):
    charge = await db.rent_charges.find_one({"id": chg_id}, {"_id": 0})
    if not charge:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    if charge["status"] != "pagado":
        raise HTTPException(status_code=400, detail="Solo puedes dispersar cobros pagados")
    if charge.get("dispersed"):
        raise HTTPException(status_code=400, detail="Este cobro ya fue dispersado")
    method = "manual"
    ref = data.reference or ""
    landlord = await db.users.find_one({"id": charge["landlord_id"]})
    acct_id = (landlord or {}).get("stripe_connect_account_id")
    connect_status = (landlord or {}).get("connect_status")
    if acct_id and connect_status == "active":
        try:
            tr = stripe.Transfer.create(
                amount=int(round(charge["net_landlord"] * 100)), currency="mxn",
                destination=acct_id, metadata={"charge_id": chg_id},
            )
            method = "stripe_transfer"
            ref = tr.id
        except stripe.error.StripeError as e:
            method = "manual"
            ref = ref or f"transfer_error:{str(e)[:60]}"
    await db.rent_charges.update_one({"id": chg_id}, {"$set": {
        "dispersed": True, "dispersed_at": now_utc().isoformat(),
        "dispersal_ref": ref, "dispersal_method": method,
    }})
    await notify(charge["landlord_id"], "pago", "Dispersión registrada",
                 f"Se registró tu pago neto de ${charge['net_landlord']:,.0f} MX del periodo {charge['period']}.", "/panel/pagos")
    return {"ok": True, "method": method, "reference": ref}


@api.post("/cron/rent-billing")
async def cron_rent_billing(request: Request, background_tasks: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not secrets.compare_digest(token, os.environ.get("WEBHOOK_CRON_SECRET", "")):
        raise HTTPException(status_code=401, detail="No autorizado")
    period = _period_now()
    background_tasks.add_task(_generate_period, period)
    return {"ok": True, "period": period}


@api.post("/cron/payments-daily")
async def cron_payments_daily(request: Request, background_tasks: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not secrets.compare_digest(token, os.environ.get("WEBHOOK_CRON_SECRET", "")):
        raise HTTPException(status_code=401, detail="No autorizado")
    background_tasks.add_task(_payments_daily)
    return {"ok": True}
