import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatMXN, formatDate, STATUS_LABEL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Loader2, Search, ArrowRight } from "lucide-react";

const statusColor = { pendiente: "bg-amber-100 text-amber-700", en_revision: "bg-blue-100 text-blue-700", aprobada: "bg-green-100 text-green-700", rechazada: "bg-red-100 text-red-700" };

export default function MyApplications() {
  const navigate = useNavigate();
  const [apps, setApps] = useState(null);

  useEffect(() => { api.get("/my/applications").then(({ data }) => setApps(data)).catch(() => setApps([])); }, []);

  if (!apps) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Mis solicitudes</h1>
          <p className="text-stone-500 mt-1">Da seguimiento a tus solicitudes de arrendamiento.</p>
        </div>
        <Button onClick={() => navigate("/explorar")} className="rounded-full bg-terracotta hover:bg-terracotta-hover"><Search className="w-4 h-4 mr-2" /> Explorar</Button>
      </div>

      {apps.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl py-20 flex flex-col items-center text-stone-500" data-testid="empty-my-applications">
          <ClipboardList className="w-12 h-12 mb-4" />
          <p className="font-medium">Aún no has enviado solicitudes</p>
          <Button onClick={() => navigate("/explorar")} className="mt-4 rounded-full bg-terracotta hover:bg-terracotta-hover">Buscar inmuebles</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map((a) => (
            <div key={a.id} className="bg-white border border-stone-200 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4" data-testid={`my-application-${a.id}`}>
              <div>
                <div className="flex items-center gap-2">
                  <Badge className={`rounded-full ${statusColor[a.status]}`}>{STATUS_LABEL[a.status]}</Badge>
                  <span className="text-xs text-stone-400">{formatDate(a.created_at)}</span>
                </div>
                <h3 className="font-display font-semibold text-lg text-navy mt-2">{a.property_title}</h3>
                <p className="text-sm text-stone-500">Renta: {formatMXN(a.property_price)}/mes · Ingreso declarado: {formatMXN(a.monthly_income)}</p>
              </div>
              {a.status === "aprobada" && (
                <Button variant="outline" className="rounded-full" onClick={() => navigate("/panel/contratos")} data-testid={`view-contract-${a.id}`}>
                  Ver contrato <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
