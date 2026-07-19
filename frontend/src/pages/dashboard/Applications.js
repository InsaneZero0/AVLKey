import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatMXN, formatDate, STATUS_LABEL, RISK_LABEL, EMPLOYMENT_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Inbox, Loader2, Check, X, ShieldCheck, User, Briefcase, Users } from "lucide-react";

const riskColor = { bajo: "text-green-600 bg-green-100", medio: "text-amber-600 bg-amber-100", alto: "text-red-600 bg-red-100" };
const statusColor = { pendiente: "bg-amber-100 text-amber-700", en_revision: "bg-blue-100 text-blue-700", aprobada: "bg-green-100 text-green-700", rechazada: "bg-red-100 text-red-700" };
const empLabel = Object.fromEntries(EMPLOYMENT_TYPES.map((e) => [e.value, e.label]));

export default function Applications() {
  const [apps, setApps] = useState(null);

  const load = () => api.get("/landlord/applications").then(({ data }) => setApps(data)).catch(() => setApps([]));
  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    try {
      const { data } = await api.patch(`/applications/${id}/status`, { status });
      if (status === "aprobada") toast.success("Solicitud aprobada. Se generó un contrato en borrador.");
      else if (status === "rechazada") toast.success("Solicitud rechazada.");
      else toast.success("Estado actualizado.");
      load();
    } catch { toast.error("No se pudo actualizar"); }
  };

  if (!apps) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Solicitudes recibidas</h1>
      <p className="text-stone-500 mt-1">Revisa el perfil de riesgo y decide sobre cada candidato.</p>

      {apps.length === 0 ? (
        <div className="mt-8 bg-white border border-dashed border-stone-300 rounded-2xl py-20 flex flex-col items-center text-stone-500" data-testid="empty-applications">
          <Inbox className="w-12 h-12 mb-4" />
          <p className="font-medium">Aún no tienes solicitudes</p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {apps.map((a) => (
            <div key={a.id} className="bg-white border border-stone-200 rounded-2xl p-6" data-testid={`application-${a.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className={`rounded-full ${statusColor[a.status]}`}>{STATUS_LABEL[a.status]}</Badge>
                    <span className="text-xs text-stone-400">{formatDate(a.created_at)}</span>
                  </div>
                  <h3 className="font-display font-semibold text-lg text-navy mt-2 flex items-center gap-2"><User className="w-4 h-4 text-stone-400" />{a.tenant_name}</h3>
                  <p className="text-sm text-stone-500">Para: <span className="font-medium text-navy">{a.property_title}</span></p>
                </div>
                <div className={`text-right px-4 py-2 rounded-xl ${riskColor[a.risk_level]}`}>
                  <div className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="w-4 h-4" />{RISK_LABEL[a.risk_level]}</div>
                  <div className="text-xs mt-0.5">Score {a.risk_score}/100</div>
                </div>
              </div>

              <div className="mt-4">
                <Progress value={a.risk_score} className="h-2" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 text-sm">
                <div><div className="text-stone-400 text-xs">Ingreso mensual</div><div className="font-medium text-navy">{formatMXN(a.monthly_income)}</div></div>
                <div><div className="text-stone-400 text-xs">Relación ingreso/renta</div><div className="font-medium text-navy">{a.income_ratio}x</div></div>
                <div><div className="text-stone-400 text-xs flex items-center gap-1"><Briefcase className="w-3 h-3" />Situación</div><div className="font-medium text-navy">{empLabel[a.employment_type] || a.employment_type}</div></div>
                <div><div className="text-stone-400 text-xs flex items-center gap-1"><Users className="w-3 h-3" />Ocupantes</div><div className="font-medium text-navy">{a.num_occupants} · {a.has_guarantor ? "Con aval" : "Sin aval"}</div></div>
              </div>

              {a.message && <p className="mt-4 text-sm text-stone-600 bg-stone-50 rounded-xl p-3 italic">"{a.message}"</p>}

              {(a.status === "pendiente" || a.status === "en_revision") && (
                <div className="flex flex-wrap gap-2 mt-5">
                  {a.status === "pendiente" && (
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => updateStatus(a.id, "en_revision")} data-testid={`review-${a.id}`}>Marcar en revisión</Button>
                  )}
                  <Button size="sm" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => updateStatus(a.id, "aprobada")} data-testid={`approve-${a.id}`}><Check className="w-4 h-4 mr-1" /> Aprobar</Button>
                  <Button variant="outline" size="sm" className="rounded-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => updateStatus(a.id, "rechazada")} data-testid={`reject-${a.id}`}><X className="w-4 h-4 mr-1" /> Rechazar</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
