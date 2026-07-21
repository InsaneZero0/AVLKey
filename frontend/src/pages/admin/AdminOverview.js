import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { STAFF_ROLE_LABELS, PERMISSION_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, ClipboardList, FileText, CreditCard, Loader2, UserCog } from "lucide-react";

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5" data-testid={`admin-stat-${label}`}>
      <div className="w-9 h-9 rounded-lg bg-navy/5 flex items-center justify-center mb-3"><Icon className="w-4 h-4 text-navy" /></div>
      <div className="font-display font-bold text-2xl text-navy">{value}</div>
      <div className="text-xs text-stone-500 mt-1">{label}</div>
    </div>
  );
}

export default function AdminOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/admin/stats").then(({ data }) => setStats(data)).catch(() => {}); }, []);

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Panel de administración</h1>
      <p className="text-stone-500 mt-1">Rol: <span className="font-medium text-navy">{STAFF_ROLE_LABELS[user?.staff_role]}</span></p>

      {!stats ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <Stat icon={Users} label="Usuarios" value={stats.users} />
          <Stat icon={UserCog} label="Personal interno" value={stats.internal_users} />
          <Stat icon={Building2} label="Propiedades" value={stats.properties} />
          <Stat icon={Building2} label="Por revisar" value={stats.properties_pending} />
          <Stat icon={ClipboardList} label="Solicitudes" value={stats.applications} />
          <Stat icon={FileText} label="Contratos" value={stats.contracts} />
          <Stat icon={CreditCard} label="Pagos cobrados" value={stats.payments_paid} />
        </div>
      )}

      <div className="mt-8 bg-white border border-stone-200 rounded-xl p-6">
        <h2 className="font-display font-semibold text-navy flex items-center gap-2 mb-4"><UserCog className="w-4 h-4" /> Mis permisos</h2>
        <div className="flex flex-wrap gap-2" data-testid="my-permissions">
          {(user?.permissions || []).map((p) => (
            <Badge key={p} className="rounded-full bg-terracotta/10 text-terracotta hover:bg-terracotta/10">{PERMISSION_LABELS[p] || p}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
