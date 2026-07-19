import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatMXN } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Building2, Inbox, FileText, Banknote, ClipboardList, CheckCircle2, PlusCircle, Search, Loader2,
} from "lucide-react";

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6" data-testid={`stat-${label}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="font-display font-bold text-3xl text-navy">{value}</div>
      <div className="text-sm text-stone-500 mt-1">{label}</div>
    </div>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  if (!stats) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const isLandlord = stats.role === "arrendador";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Hola, {user?.name?.split(" ")[0]} 👋</h1>
          <p className="text-stone-500 mt-1">{isLandlord ? "Administra tus propiedades y solicitudes." : "Sigue tus solicitudes y contratos."}</p>
        </div>
        {isLandlord ? (
          <Button onClick={() => navigate("/panel/publicar")} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="overview-publish-btn">
            <PlusCircle className="w-4 h-4 mr-2" /> Publicar inmueble
          </Button>
        ) : (
          <Button onClick={() => navigate("/explorar")} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="overview-explore-btn">
            <Search className="w-4 h-4 mr-2" /> Explorar inmuebles
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {isLandlord ? (
          <>
            <StatCard icon={Building2} label="Inmuebles" value={stats.properties} accent="bg-terracotta/10 text-terracotta" />
            <StatCard icon={CheckCircle2} label="Disponibles" value={stats.available} accent="bg-green-100 text-green-600" />
            <StatCard icon={Inbox} label="Solicitudes por revisar" value={stats.pending_applications} accent="bg-amber-100 text-amber-600" />
            <StatCard icon={Banknote} label="Ingresos cobrados" value={formatMXN(stats.income)} accent="bg-navy/10 text-navy" />
          </>
        ) : (
          <>
            <StatCard icon={ClipboardList} label="Solicitudes" value={stats.applications} accent="bg-terracotta/10 text-terracotta" />
            <StatCard icon={CheckCircle2} label="Aprobadas" value={stats.approved} accent="bg-green-100 text-green-600" />
            <StatCard icon={FileText} label="Contratos" value={stats.contracts} accent="bg-navy/10 text-navy" />
            <StatCard icon={Banknote} label="Pagado" value={formatMXN(stats.spent)} accent="bg-amber-100 text-amber-600" />
          </>
        )}
      </div>

      <div className="mt-8 bg-white border border-stone-200 rounded-2xl p-8">
        <h2 className="font-display font-semibold text-xl text-navy">Próximos pasos</h2>
        <ul className="mt-4 space-y-3 text-stone-600 text-sm">
          {isLandlord ? (
            <>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-terracotta" /> Publica tus inmuebles con fotos y precio de renta.</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-terracotta" /> Revisa las solicitudes y el perfil de riesgo de cada candidato.</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-terracotta" /> Aprueba una solicitud para generar el contrato automáticamente.</li>
            </>
          ) : (
            <>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-terracotta" /> Explora inmuebles y envía tu solicitud de arrendamiento.</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-terracotta" /> Cuando te aprueben, revisa y firma tu contrato.</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-terracotta" /> Realiza tus pagos mensuales de forma segura con tarjeta.</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
