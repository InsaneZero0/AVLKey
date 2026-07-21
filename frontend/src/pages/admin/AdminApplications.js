import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatMXN, formatDate, STATUS_LABEL, RISK_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldCheck, Wand2 } from "lucide-react";

const riskColor = { bajo: "bg-green-100 text-green-700", medio: "bg-amber-100 text-amber-700", alto: "bg-red-100 text-red-700" };

export default function AdminApplications() {
  const { user } = useAuth();
  const canOverride = (user?.permissions || []).includes("modificar_decisiones_automaticas");
  const [apps, setApps] = useState(null);
  const [overrides, setOverrides] = useState({});

  const load = () => api.get("/admin/applications").then(({ data }) => setApps(data)).catch(() => setApps([]));
  useEffect(() => { load(); }, []);

  const applyOverride = async (id) => {
    const level = overrides[id];
    if (!level) return;
    try {
      await api.patch(`/admin/applications/${id}/risk`, { risk_level: level, reason: "Ajuste manual" });
      toast.success("Decisión de riesgo actualizada");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Sin permiso"); }
  };

  if (!apps) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Solicitudes</h1>
      <p className="text-stone-500 mt-1">Todas las solicitudes de arrendamiento con su perfil de riesgo.</p>

      <div className="mt-6 space-y-4">
        {apps.map((a) => (
          <div key={a.id} className="bg-white border border-stone-200 rounded-xl p-5" data-testid={`admin-app-${a.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="rounded-full bg-stone-100 text-stone-600">{STATUS_LABEL[a.status]}</Badge>
                  <span className="text-xs text-stone-400">{formatDate(a.created_at)}</span>
                </div>
                <h3 className="font-display font-semibold text-navy mt-2">{a.tenant_name} → {a.property_title}</h3>
                <p className="text-sm text-stone-500">Ingreso {formatMXN(a.monthly_income)} · Relación {a.income_ratio}x</p>
              </div>
              <div className={`px-3 py-1.5 rounded-lg ${riskColor[a.risk_level]}`}>
                <div className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="w-4 h-4" />{RISK_LABEL[a.risk_level]}{a.risk_overridden && " *"}</div>
                <div className="text-xs">Score {a.risk_score}/100</div>
              </div>
            </div>
            {canOverride && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-stone-100">
                <Wand2 className="w-4 h-4 text-terracotta" />
                <span className="text-sm text-stone-600">Modificar decisión automática:</span>
                <Select value={overrides[a.id] || ""} onValueChange={(v) => setOverrides({ ...overrides, [a.id]: v })}>
                  <SelectTrigger className="w-40" data-testid={`risk-select-${a.id}`}><SelectValue placeholder="Nivel" /></SelectTrigger>
                  <SelectContent><SelectItem value="bajo">Riesgo bajo</SelectItem><SelectItem value="medio">Riesgo medio</SelectItem><SelectItem value="alto">Riesgo alto</SelectItem></SelectContent>
                </Select>
                <Button size="sm" className="rounded-full bg-terracotta hover:bg-terracotta-hover" onClick={() => applyOverride(a.id)} data-testid={`apply-risk-${a.id}`}>Aplicar</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
