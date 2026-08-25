import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { formatMXN } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, Wallet, ShieldCheck, TrendingUp, Landmark } from "lucide-react";

const chColor = { pagado: "bg-green-100 text-green-700", pendiente: "bg-amber-100 text-amber-700", fallido: "bg-red-100 text-red-700" };
const chLabel = { pagado: "Pagado", pendiente: "Pendiente", fallido: "Fallido" };

function StatCard({ icon: Icon, label, value, tone = "navy", testid }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5" data-testid={testid}>
      <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wider"><Icon className="w-4 h-4" /> {label}</div>
      <div className={`mt-2 font-display font-bold text-2xl text-${tone}`}>{value}</div>
    </div>
  );
}

export default function AdminFinance() {
  const [summary, setSummary] = useState(null);
  const [charges, setCharges] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dispersing, setDispersing] = useState(null);
  const [reference, setReference] = useState("");

  const load = () => {
    api.get("/admin/finance/summary").then(({ data }) => setSummary(data)).catch(() => setSummary(null));
    api.get("/admin/finance/charges").then(({ data }) => setCharges(data)).catch(() => setCharges([]));
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/finance/generate");
      toast.success(`Cobros generados para ${data.period} (${data.generated} contratos activos).`);
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    setBusy(false);
  };

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

  if (!summary || !charges) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Finanzas</h1>
          <p className="text-stone-500 mt-1">Control de cobros, comisiones, retenciones y dispersiones.</p>
        </div>
        <Button onClick={generate} disabled={busy} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="generate-charges-btn">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />} Generar cobros del mes
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard icon={Wallet} label="Total cobrado" value={formatMXN(summary.total_collected)} testid="stat-collected" />
        <StatCard icon={TrendingUp} label="Comisión ganada (4%)" value={formatMXN(summary.commission_earned)} tone="terracotta" testid="stat-commission" />
        <StatCard icon={ShieldCheck} label="Retenido en custodia" value={formatMXN(summary.retained)} testid="stat-retained" />
        <StatCard icon={Landmark} label="Pendiente por dispersar" value={formatMXN(summary.pending_dispersal)} tone="terracotta" testid="stat-pending-dispersal" />
      </div>

      <div className="flex gap-4 mt-4 text-sm text-stone-500">
        <span data-testid="stat-pending-count">Cobros pendientes: <b className="text-navy">{summary.pending_count}</b></span>
        <span data-testid="stat-failed-count">Fallidos: <b className="text-red-600">{summary.failed_count}</b></span>
        <span data-testid="stat-dispersed-total">Dispersado: <b className="text-navy">{formatMXN(summary.dispersed_total)}</b></span>
      </div>

      <div className="mt-6 bg-white border border-stone-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-3">Periodo</th>
              <th className="text-left px-5 py-3">Inmueble</th>
              <th className="text-left px-5 py-3">Arrendatario</th>
              <th className="text-right px-5 py-3">Cobrado</th>
              <th className="text-right px-5 py-3">Comisión</th>
              <th className="text-right px-5 py-3">Retenido</th>
              <th className="text-right px-5 py-3">Neto arrendador</th>
              <th className="text-right px-5 py-3">Estado</th>
              <th className="text-right px-5 py-3">Dispersión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {charges.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-16 text-center text-stone-400" data-testid="empty-finance">Sin cobros. Genera los cobros del mes.</td></tr>
            ) : charges.map((c) => (
              <tr key={c.id} data-testid={`finance-charge-${c.id}`}>
                <td className="px-5 py-4 font-medium text-navy">{c.period}</td>
                <td className="px-5 py-4 text-stone-600">{c.property_title}</td>
                <td className="px-5 py-4 text-stone-600">{c.tenant_name || "—"}</td>
                <td className="px-5 py-4 text-right text-navy">{formatMXN(c.tenant_total)}</td>
                <td className="px-5 py-4 text-right text-terracotta">{formatMXN(c.commission)}</td>
                <td className="px-5 py-4 text-right text-stone-600">{formatMXN(c.retained)}</td>
                <td className="px-5 py-4 text-right font-semibold text-navy">{formatMXN(c.net_landlord)}</td>
                <td className="px-5 py-4 text-right"><Badge className={`rounded-full ${chColor[c.status] || "bg-stone-100 text-stone-600"}`}>{chLabel[c.status] || c.status}</Badge></td>
                <td className="px-5 py-4 text-right">
                  {c.dispersed
                    ? <span className="text-green-600 text-xs font-medium" data-testid={`finance-dispersed-${c.id}`}>Dispersado{c.dispersal_method === "stripe_transfer" ? " (Stripe)" : ""}</span>
                    : c.status === "pagado"
                      ? <Button size="sm" onClick={() => { setDispersing(c); setReference(""); }} className="rounded-full bg-navy hover:bg-navy/90 h-8" data-testid={`disperse-btn-${c.id}`}>Registrar dispersión</Button>
                      : <span className="text-stone-400 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!dispersing} onOpenChange={(o) => { if (!o) setDispersing(null); }}>
        <DialogContent data-testid="disperse-dialog">
          <DialogHeader><DialogTitle className="font-display">Registrar dispersión al arrendador</DialogTitle></DialogHeader>
          {dispersing && (
            <div className="space-y-3 text-sm">
              <p className="text-stone-600">Arrendador: <b className="text-navy">{dispersing.landlord_name || "—"}</b></p>
              <p className="text-stone-600">Periodo: <b className="text-navy">{dispersing.period}</b> · Inmueble: {dispersing.property_title}</p>
              <p className="text-stone-600">Neto a dispersar: <b className="text-navy">{formatMXN(dispersing.net_landlord)}</b></p>
              <div>
                <Label>Referencia / comentario (opcional)</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. SPEI 12345 o nota interna" data-testid="disperse-reference" />
              </div>
              <p className="text-xs text-stone-400">Si el arrendador tiene Stripe Connect activo, se transferirá automáticamente; de lo contrario se registra la dispersión manual.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setDispersing(null)} data-testid="disperse-cancel">Cancelar</Button>
            <Button className="rounded-full bg-terracotta hover:bg-terracotta-hover" onClick={disperse} disabled={busy} data-testid="disperse-confirm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar dispersión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
