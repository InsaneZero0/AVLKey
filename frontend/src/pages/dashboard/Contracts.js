import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatMXN, formatDate, STATUS_LABEL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, CreditCard, ShieldCheck, CheckCircle2, Calendar, Eye, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusColor = { borrador: "bg-amber-100 text-amber-700", en_revision_admin: "bg-amber-100 text-amber-700", enviado_arrendatario: "bg-blue-100 text-blue-700", activo: "bg-green-100 text-green-700", finalizado: "bg-stone-100 text-stone-600" };

export default function Contracts() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState(null);
  const [paying, setPaying] = useState(null);
  const [viewing, setViewing] = useState(null);
  const isLandlord = user?.role === "arrendador";

  const load = () => api.get("/my/contracts").then(({ data }) => setContracts(data)).catch(() => setContracts([]));
  useEffect(() => { load(); }, []);

  const downloadPdf = async (c) => {
    try {
      const res = await api.get(`/my/contracts/${c.id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contrato_${c.property_public_id || c.id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("No se pudo generar el PDF"); }
  };

  const pay = async (contractId, concept) => {
    setPaying(`${contractId}-${concept}`);
    try {
      const { data } = await api.post("/payments/rent/checkout", {
        contract_id: contractId,
        origin_url: window.location.origin,
        concept,
      });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
      setPaying(null);
    }
  };

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/contracts/${id}/status`, { status });
      toast.success(status === "activo" ? "Contrato activado" : "Contrato finalizado");
      load();
    } catch { toast.error("No se pudo actualizar"); }
  };

  if (!contracts) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Contratos</h1>
      <p className="text-stone-500 mt-1">Administra tus contratos de arrendamiento y pagos.</p>

      {contracts.length === 0 ? (
        <div className="mt-8 bg-white border border-dashed border-stone-300 rounded-2xl py-20 flex flex-col items-center text-stone-500" data-testid="empty-contracts">
          <FileText className="w-12 h-12 mb-4" />
          <p className="font-medium">Aún no tienes contratos</p>
          <p className="text-sm">Se generan automáticamente al aprobar una solicitud.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          {contracts.map((c) => (
            <div key={c.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden" data-testid={`contract-${c.id}`}>
              <div className="p-6 border-b border-stone-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge className={`rounded-full ${statusColor[c.status]}`}>{STATUS_LABEL[c.status]}</Badge>
                    <h3 className="font-display font-semibold text-lg text-navy mt-2">{c.property_title}</h3>
                    <p className="text-sm text-stone-500">{isLandlord ? `Arrendatario: ${c.tenant_name}` : `Arrendador: ${c.landlord_name}`}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold text-2xl text-terracotta">{formatMXN(c.monthly_rent)}</div>
                    <div className="text-xs text-stone-400">/mes · {c.paid_months} pago(s) realizado(s)</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 text-sm">
                  <div><div className="text-stone-400 text-xs">Depósito</div><div className="font-medium text-navy">{formatMXN(c.deposit)}</div></div>
                  <div><div className="text-stone-400 text-xs">Comisión (4%)</div><div className="font-medium text-navy">{formatMXN(c.commission)}</div></div>
                  {c.iva_rate > 0 && <div data-testid={`contract-iva-${c.id}`}><div className="text-stone-400 text-xs">IVA ({c.iva_rate}%)</div><div className="font-medium text-navy">{formatMXN(c.iva_amount)}</div></div>}
                  <div><div className="text-stone-400 text-xs flex items-center gap-1"><Calendar className="w-3 h-3" />Inicio</div><div className="font-medium text-navy">{formatDate(c.start_date)}</div></div>
                  <div><div className="text-stone-400 text-xs">Vigencia</div><div className="font-medium text-navy">{c.term_months} meses</div></div>
                </div>
              </div>

              <div className="p-5 bg-stone-50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-xs text-stone-500"><ShieldCheck className="w-4 h-4 text-green-600" /> Contrato administrado por Réntalo en Línea</div>
                <div className="flex flex-wrap gap-2">
                  {c.contract_text && (
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => setViewing(c)} data-testid={`view-contract-${c.id}`}>
                      <Eye className="w-4 h-4 mr-1" /> Ver contrato
                    </Button>
                  )}
                  {isLandlord ? (
                    <>
                      {c.status === "borrador" && <Button size="sm" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => setStatus(c.id, "activo")} data-testid={`activate-${c.id}`}><CheckCircle2 className="w-4 h-4 mr-1" /> Activar contrato</Button>}
                      {c.status === "activo" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setStatus(c.id, "finalizado")} data-testid={`finalize-${c.id}`}>Finalizar</Button>}
                    </>
                  ) : (
                    c.status !== "finalizado" && (
                      <>
                        <Button size="sm" variant="outline" className="rounded-full" disabled={paying === `${c.id}-deposito`} onClick={() => pay(c.id, "deposito")} data-testid={`pay-deposit-${c.id}`}>
                          {paying === `${c.id}-deposito` ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Pagar depósito</>}
                        </Button>
                        <Button size="sm" className="rounded-full bg-terracotta hover:bg-terracotta-hover" disabled={paying === `${c.id}-renta`} onClick={() => pay(c.id, "renta")} data-testid={`pay-rent-${c.id}`}>
                          {paying === `${c.id}-renta` ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CreditCard className="w-4 h-4 mr-1" /> Pagar renta</>}
                        </Button>
                      </>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl" data-testid="contract-view-dialog">
          <DialogHeader><DialogTitle className="font-display">Contrato de arrendamiento</DialogTitle></DialogHeader>
          <div className="text-xs text-stone-500 -mt-1">{viewing?.property_title} · Solo lectura</div>
          <pre className="mt-2 max-h-[55vh] overflow-y-auto whitespace-pre-wrap font-mono text-xs bg-stone-50 border border-stone-200 rounded-lg p-4 text-stone-700 select-text" data-testid="contract-view-text">{viewing?.contract_text}</pre>
          <div className="flex justify-end">
            <Button variant="outline" className="rounded-full" onClick={() => downloadPdf(viewing)} data-testid="contract-view-pdf">
              <Download className="w-4 h-4 mr-1" /> Descargar PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
