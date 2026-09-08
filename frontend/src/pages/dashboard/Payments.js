import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatMXN, formatDate } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, Landmark, ShieldCheck, CheckCircle2, Clock } from "lucide-react";

const chColor = { pagado: "bg-green-100 text-green-700", pendiente: "bg-amber-100 text-amber-700", fallido: "bg-red-100 text-red-700" };
const chLabel = { pagado: "Pagado", pendiente: "Pendiente", fallido: "Fallido" };
const payColor = { paid: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700", failed: "bg-red-100 text-red-700" };
const payLabel = { paid: "Pagado", pending: "Pendiente", failed: "Fallido", expired: "Expirado", completed: "Pagado" };
const conceptLabel = { renta: "Renta mensual", deposito: "Depósito en garantía" };

function Spinner() {
  return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;
}

export default function Payments() {
  const { user } = useAuth();
  const isLandlord = user?.role === "arrendador";
  const [params, setParams] = useSearchParams();
  const [charges, setCharges] = useState(null);
  const [history, setHistory] = useState([]);
  const [card, setCard] = useState(null);
  const [connect, setConnect] = useState(null);
  const [busy, setBusy] = useState(false);
  const [contracts, setContracts] = useState([]);
  const [payingRent, setPayingRent] = useState(null);

  const payRent = async (contractId) => {
    setPayingRent(contractId);
    try {
      const { data } = await api.post("/payments/rent/checkout", { contract_id: contractId, origin_url: window.location.origin, concept: "renta" });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); setPayingRent(null); }
  };

  const load = useCallback(() => {
    api.get("/my/rent-charges").then(({ data }) => setCharges(data)).catch(() => setCharges([]));
    if (!isLandlord) api.get("/my/contracts").then(({ data }) => setContracts((data || []).filter((c) => c.status !== "finalizado"))).catch(() => setContracts([]));
    api.get("/my/payments").then(({ data }) => setHistory(data)).catch(() => setHistory([]));
    if (isLandlord) api.get("/payments/connect/status").then(({ data }) => setConnect(data)).catch(() => setConnect({ connected: false }));
    else api.get("/payments/card").then(({ data }) => setCard(data)).catch(() => setCard({ has_card: false }));
  }, [isLandlord]);

  useEffect(() => {
    const cs = params.get("card_session");
    if (cs) {
      api.post("/payments/card/confirm", { session_id: cs })
        .then(({ data }) => toast.success(`Tarjeta guardada terminación ${data.last4}`))
        .catch((e) => toast.error(apiError(e.response?.data?.detail)))
        .finally(() => { params.delete("card_session"); setParams(params, { replace: true }); load(); });
    } else if (params.get("connect")) {
      params.delete("connect"); setParams(params, { replace: true }); load();
    } else {
      load();
    }
  }, []); // eslint-disable-line

  const saveCard = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/payments/card/setup-session", { origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); setBusy(false); }
  };

  const onboard = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/payments/connect/onboard", { origin_url: window.location.origin });
      if (data.enabled) { window.location.href = data.url; return; }
      toast.error(data.message || "Stripe Connect no está disponible todavía.");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    setBusy(false);
  };

  const pay = async (id) => {
    setBusy(true);
    try {
      await api.post(`/payments/charges/${id}/pay`);
      toast.success("Pago realizado correctamente.");
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    setBusy(false);
  };

  if (!charges) return <Spinner />;

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Pagos</h1>
      <p className="text-stone-500 mt-1">{isLandlord ? "Cobros de tus inmuebles y dispersiones a tu cuenta." : "Paga tu renta y consulta tu historial."}</p>

      {/* Tarjeta (arrendatario) */}
      {!isLandlord && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4" data-testid="tenant-card-box">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-navy/5 flex items-center justify-center"><CreditCard className="w-5 h-5 text-navy" /></div>
            <div>
              <div className="font-medium text-navy">Método de pago</div>
              {card?.has_card
                ? <div className="text-sm text-stone-500 capitalize" data-testid="tenant-card-info">{card.brand} · terminación {card.last4}</div>
                : <div className="text-sm text-stone-500">Aún no has guardado una tarjeta.</div>}
            </div>
          </div>
          <Button onClick={saveCard} disabled={busy} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="save-card-btn">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (card?.has_card ? "Actualizar tarjeta" : "Guardar tarjeta")}
          </Button>
        </div>
      )}

      {/* Pagar renta por contrato (arrendatario) */}
      {!isLandlord && contracts.length > 0 && (
        <div className="mt-6" data-testid="tenant-pay-rent-box">
          <h2 className="font-display font-semibold text-navy text-lg mb-3">Pagar renta</h2>
          <div className="grid gap-3">
            {contracts.map((c) => (
              <div key={c.id} className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4" data-testid={`pay-rent-card-${c.id}`}>
                <div>
                  <div className="font-medium text-navy">{c.property_title}</div>
                  <div className="text-sm text-stone-500">Arrendador: {c.landlord_name} · Renta <b className="text-navy">{formatMXN(c.monthly_rent)}</b>/mes · {c.paid_months} pago(s) realizado(s)</div>
                </div>
                <Button onClick={() => payRent(c.id)} disabled={payingRent === c.id} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid={`pay-rent-${c.id}`}>
                  {payingRent === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CreditCard className="w-4 h-4 mr-1" /> Pagar renta</>}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connect (arrendador) */}
      {isLandlord && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4" data-testid="landlord-connect-box">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-navy/5 flex items-center justify-center"><Landmark className="w-5 h-5 text-navy" /></div>
            <div>
              <div className="font-medium text-navy">Cuenta para recibir depósitos</div>
              {connect?.status === "active"
                ? <div className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Cuenta conectada y verificada</div>
                : connect?.connected
                  ? <div className="text-sm text-amber-600 flex items-center gap-1"><Clock className="w-4 h-4" /> Verificación pendiente</div>
                  : <div className="text-sm text-stone-500">Conecta tu cuenta de Stripe para recibir tus rentas.</div>}
            </div>
          </div>
          <Button onClick={onboard} disabled={busy} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="connect-onboard-btn">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (connect?.connected ? "Actualizar cuenta" : "Conectar con Stripe")}
          </Button>
        </div>
      )}

      {/* Retención informativa (arrendador) */}
      {isLandlord && (
        <div className="mt-4 rounded-xl bg-navy/5 border border-navy/10 p-4 text-sm text-navy flex items-start gap-2" data-testid="retained-note">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-terracotta" />
          <span>Réntalo retiene el depósito en garantía y las garantías hasta el término del contrato. Tu pago neto (renta − 4% de comisión − garantías) se dispersa a tu cuenta.</span>
        </div>
      )}

      {/* Cobros */}
      <h2 className="font-display font-semibold text-navy text-lg mt-8 mb-3">{isLandlord ? "Cobros de renta" : "Mis cobros de renta"}</h2>
      {charges.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl py-16 flex flex-col items-center text-stone-500" data-testid="empty-charges">
          <CreditCard className="w-12 h-12 mb-4" />
          <p className="font-medium">Aún no hay cobros de renta</p>
          <p className="text-sm mt-1">Aparecerán cuando tu contrato esté activo.</p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Periodo</th>
                <th className="text-left px-5 py-3">Inmueble</th>
                <th className="text-left px-5 py-3">{isLandlord ? "Arrendatario" : "Concepto"}</th>
                <th className="text-right px-5 py-3">{isLandlord ? "Neto a recibir" : "A pagar"}</th>
                <th className="text-right px-5 py-3">Estado</th>
                {isLandlord ? <th className="text-right px-5 py-3">Dispersión</th> : <th className="text-right px-5 py-3">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {charges.map((c) => (
                <tr key={c.id} data-testid={`charge-${c.id}`}>
                  <td className="px-5 py-4 font-medium text-navy">{c.period}</td>
                  <td className="px-5 py-4 text-stone-600">{c.property_title}{c.property_public_id ? ` · ${c.property_public_id}` : ""}</td>
                  <td className="px-5 py-4 text-stone-600">{isLandlord ? (c.tenant_name || "—") : (c.is_first ? "Renta + depósito" : "Renta mensual")}</td>
                  <td className="px-5 py-4 text-right font-semibold text-navy">
                    {formatMXN(isLandlord ? c.net_landlord : c.tenant_total)}
                    {!isLandlord && c.late_fee > 0 && <div className="text-xs font-normal text-red-600" data-testid={`charge-late-${c.id}`}>Incluye recargo {formatMXN(c.late_fee)}</div>}
                  </td>
                  <td className="px-5 py-4 text-right"><Badge className={`rounded-full ${chColor[c.status] || "bg-stone-100 text-stone-600"}`} data-testid={`charge-status-${c.id}`}>{chLabel[c.status] || c.status}</Badge></td>
                  {isLandlord ? (
                    <td className="px-5 py-4 text-right">
                      {c.dispersed
                        ? <span className="text-green-600 text-xs font-medium flex items-center justify-end gap-1" data-testid={`charge-dispersed-${c.id}`}><CheckCircle2 className="w-3.5 h-3.5" /> Dispersado</span>
                        : c.status === "pagado" ? <span className="text-amber-600 text-xs">En custodia</span> : <span className="text-stone-400 text-xs">—</span>}
                    </td>
                  ) : (
                    <td className="px-5 py-4 text-right">
                      {c.status === "pagado"
                        ? <span className="text-green-600 text-xs font-medium">Liquidado</span>
                        : <Button size="sm" onClick={() => pay(c.id)} disabled={busy} className="rounded-full bg-terracotta hover:bg-terracotta-hover h-8" data-testid={`pay-charge-${c.id}`}>Pagar</Button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Historial de pagos registrados en Stripe */}
      <h2 className="font-display font-semibold text-navy text-lg mt-8 mb-3">Historial de pagos (Stripe)</h2>
      {history.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl py-12 flex flex-col items-center text-stone-500" data-testid="empty-history">
          <CreditCard className="w-10 h-10 mb-3" />
          <p className="font-medium text-sm">Aún no hay pagos registrados</p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Concepto</th>
                <th className="text-left px-5 py-3">Inmueble</th>
                {isLandlord && <th className="text-left px-5 py-3">Arrendatario</th>}
                <th className="text-left px-5 py-3">Fecha</th>
                <th className="text-right px-5 py-3">Monto</th>
                <th className="text-right px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {history.map((p) => (
                <tr key={p.session_id} data-testid={`history-${p.session_id}`}>
                  <td className="px-5 py-4 font-medium text-navy">{conceptLabel[p.concept] || p.concept}{p.period ? ` · ${p.period}` : ""}</td>
                  <td className="px-5 py-4 text-stone-600">{p.property_title || "—"}</td>
                  {isLandlord && <td className="px-5 py-4 text-stone-600">{p.tenant_name || "—"}</td>}
                  <td className="px-5 py-4 text-stone-500">{formatDate(p.created_at)}</td>
                  <td className="px-5 py-4 text-right font-semibold text-navy">{formatMXN(p.amount)}</td>
                  <td className="px-5 py-4 text-right"><Badge className={`rounded-full ${payColor[p.payment_status] || "bg-stone-100 text-stone-600"}`}>{payLabel[p.payment_status] || p.payment_status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
