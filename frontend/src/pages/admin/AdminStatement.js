import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { formatMXN } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Wallet, TrendingUp, ShieldCheck, Landmark, CheckCircle2 } from "lucide-react";
import { StripePaymentsTable } from "@/components/StripePaymentsTable";

const chColor = { pagado: "bg-green-100 text-green-700", pendiente: "bg-amber-100 text-amber-700", fallido: "bg-red-100 text-red-700" };
const chLabel = { pagado: "Pagado", pendiente: "Pendiente", fallido: "Fallido" };
const connectLabel = { active: "Conectada", pending: "Verificación pendiente", none: "Sin conectar" };

function Stat({ icon: Icon, label, value, tone = "navy", testid }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5" data-testid={testid}>
      <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wider"><Icon className="w-4 h-4" /> {label}</div>
      <div className={`mt-2 font-display font-bold text-2xl text-${tone}`}>{value}</div>
    </div>
  );
}

export default function AdminStatement() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dispersing, setDispersing] = useState(null);
  const [reference, setReference] = useState("");
  const [depositing, setDepositing] = useState(null);
  const [depositRef, setDepositRef] = useState("");

  const load = () => api.get(`/admin/finance/statement/${userId}`).then(({ data }) => setData(data)).catch(() => setData(null));
  useEffect(() => { load(); }, [userId]); // eslint-disable-line

  const disperse = async () => {
    if (!dispersing) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/finance/charges/${dispersing.id}/disperse`, { reference });
      toast.success(data.method === "stripe_transfer" ? "Transferencia enviada al arrendador." : "Dispersión registrada.");
      setDispersing(null); setReference(""); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    setBusy(false);
  };

  const registerDeposit = async () => {
    if (!depositing) return;
    setBusy(true);
    try {
      await api.post(`/admin/finance/contracts/${depositing.contract_id}/register-deposit`, { reference: depositRef });
      toast.success("Depósito en garantía registrado.");
      setDepositing(null); setDepositRef(""); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    setBusy(false);
  };

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;
  const { landlord, charges, totals, deposits, payments = [] } = data;

  return (
    <div data-testid="admin-statement">
      <Link to="/admin/arrendadores" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-terracotta mb-4" data-testid="statement-back"><ArrowLeft className="w-4 h-4" /> Arrendadores</Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Estado de cuenta</h1>
          <p className="text-stone-500 mt-1">
            <span className="font-medium text-navy">{landlord.name}</span>
            {landlord.public_id ? <span className="font-mono"> · {landlord.public_id}</span> : ""} · {landlord.email}
          </p>
        </div>
        <Badge className="rounded-full bg-navy/10 text-navy" data-testid="statement-connect">Cuenta Stripe: {connectLabel[landlord.connect_status] || landlord.connect_status}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <Stat icon={Wallet} label="Ingreso neto (renta)" value={formatMXN(totals.net_total)} testid="stmt-net" />
        <Stat icon={Landmark} label="Dispersado" value={formatMXN(totals.dispersed)} testid="stmt-dispersed" />
        <Stat icon={TrendingUp} label="Pendiente por dispersar" value={formatMXN(totals.pending_dispersal)} tone="terracotta" testid="stmt-pending" />
        <Stat icon={ShieldCheck} label="Retenido en custodia" value={formatMXN(totals.retained)} testid="stmt-retained" />
      </div>
      <p className="text-sm text-stone-500 mt-3" data-testid="stmt-counts">{totals.paid_count} de {totals.total_count} cobros pagados · Comisión plataforma: <b className="text-navy">{formatMXN(totals.commission)}</b></p>

      <StripePaymentsTable payments={payments} total={totals.stripe_paid} counterpartLabel="Arrendatario" counterpartKey="tenant_name" testid="stmt-stripe" />

      {/* Depósitos en garantía */}
      <div className="mt-8" data-testid="deposits-box">
        <h2 className="font-display font-semibold text-navy text-lg mb-2">Depósitos en garantía</h2>
        <div className="rounded-xl bg-navy/5 border border-navy/10 p-4 text-sm text-navy flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-terracotta" />
          <span>El depósito en garantía equivale a 1 mes de renta y se retiene en custodia por Réntalo en Línea hasta el término del contrato. Registra el depósito cuando el arrendatario lo entregue.</span>
        </div>
        <div className="mt-3 grid gap-3">
          {(!deposits || deposits.length === 0) ? (
            <div className="bg-white border border-dashed border-stone-300 rounded-xl py-8 text-center text-stone-400 text-sm" data-testid="deposits-empty">Sin depósitos por registrar.</div>
          ) : deposits.map((d) => (
            <div key={d.contract_id} className="bg-white border border-stone-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3" data-testid={`deposit-${d.contract_id}`}>
              <div>
                <div className="font-medium text-navy">{d.property_title}</div>
                <div className="text-sm text-stone-500">Arrendatario: {d.tenant_name || "—"} · Depósito: <b className="text-navy">{formatMXN(d.deposit_amount)}</b></div>
              </div>
              {d.registered ? (
                <Badge className="rounded-full bg-green-100 text-green-700" data-testid={`deposit-registered-${d.contract_id}`}>Registrado{d.reference ? ` · ${d.reference}` : ""}</Badge>
              ) : (
                <Button size="sm" onClick={() => { setDepositing(d); setDepositRef(""); }} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid={`deposit-register-${d.contract_id}`}>Registrar depósito</Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 bg-white border border-stone-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-3">Periodo</th>
              <th className="text-left px-5 py-3">Inmueble</th>
              <th className="text-left px-5 py-3">Arrendatario</th>
              <th className="text-right px-5 py-3">Neto</th>
              <th className="text-right px-5 py-3">Estado</th>
              <th className="text-right px-5 py-3">Dispersión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {charges.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-16 text-center text-stone-400" data-testid="stmt-empty">Este arrendador aún no tiene cobros.</td></tr>
            ) : charges.map((c) => (
              <tr key={c.id} data-testid={`stmt-charge-${c.id}`}>
                <td className="px-5 py-4 font-medium text-navy">{c.period}</td>
                <td className="px-5 py-4 text-stone-600">{c.property_title}</td>
                <td className="px-5 py-4 text-stone-600">{c.tenant_name || "—"}</td>
                <td className="px-5 py-4 text-right font-semibold text-navy">{formatMXN(c.net_landlord)}</td>
                <td className="px-5 py-4 text-right"><Badge className={`rounded-full ${chColor[c.status] || "bg-stone-100 text-stone-600"}`}>{chLabel[c.status] || c.status}</Badge></td>
                <td className="px-5 py-4 text-right">
                  {c.dispersed
                    ? <span className="text-green-600 text-xs font-medium flex items-center justify-end gap-1" data-testid={`stmt-dispersed-${c.id}`}><CheckCircle2 className="w-3.5 h-3.5" /> Dispersado</span>
                    : c.status === "pagado"
                      ? <Button size="sm" onClick={() => { setDispersing(c); setReference(""); }} className="rounded-full bg-navy hover:bg-navy/90 h-8" data-testid={`stmt-disperse-${c.id}`}>Dispersar</Button>
                      : <span className="text-stone-400 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!dispersing} onOpenChange={(o) => { if (!o) setDispersing(null); }}>
        <DialogContent data-testid="stmt-disperse-dialog">
          <DialogHeader><DialogTitle className="font-display">Registrar dispersión</DialogTitle></DialogHeader>
          {dispersing && (
            <div className="space-y-3 text-sm">
              <p className="text-stone-600">Periodo <b className="text-navy">{dispersing.period}</b> · {dispersing.property_title}</p>
              <p className="text-stone-600">Neto a dispersar: <b className="text-navy">{formatMXN(dispersing.net_landlord)}</b></p>
              <div>
                <Label>Referencia / comentario (opcional)</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. SPEI 12345" data-testid="stmt-disperse-reference" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setDispersing(null)} data-testid="stmt-disperse-cancel">Cancelar</Button>
            <Button className="rounded-full bg-terracotta hover:bg-terracotta-hover" onClick={disperse} disabled={busy} data-testid="stmt-disperse-confirm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!depositing} onOpenChange={(o) => { if (!o) setDepositing(null); }}>
        <DialogContent data-testid="deposit-dialog">
          <DialogHeader><DialogTitle className="font-display">Registrar depósito en garantía</DialogTitle></DialogHeader>
          {depositing && (
            <div className="space-y-3 text-sm">
              <p className="text-stone-600">Inmueble: <b className="text-navy">{depositing.property_title}</b></p>
              <p className="text-stone-600">Arrendatario: <b className="text-navy">{depositing.tenant_name || "—"}</b></p>
              <p className="text-stone-600">Monto del depósito: <b className="text-navy">{formatMXN(depositing.deposit_amount)}</b></p>
              <div>
                <Label>Referencia / comprobante (opcional)</Label>
                <Input value={depositRef} onChange={(e) => setDepositRef(e.target.value)} placeholder="Ej. SPEI 98765 o folio del depósito" data-testid="deposit-reference" />
              </div>
              <p className="text-xs text-stone-400">Al registrarlo se marca como recibido y queda retenido en custodia hasta el término del contrato.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setDepositing(null)} data-testid="deposit-cancel">Cancelar</Button>
            <Button className="rounded-full bg-terracotta hover:bg-terracotta-hover" onClick={registerDeposit} disabled={busy} data-testid="deposit-confirm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registrar depósito"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
