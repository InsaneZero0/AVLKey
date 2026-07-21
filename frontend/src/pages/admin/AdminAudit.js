import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { formatDate } from "@/lib/constants";
import { Loader2, ScrollText } from "lucide-react";

export default function AdminAudit() {
  const [logs, setLogs] = useState(null);
  useEffect(() => { api.get("/admin/audit").then(({ data }) => setLogs(data)).catch(() => setLogs([])); }, []);
  if (!logs) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <div className="flex items-center gap-2">
        <ScrollText className="w-6 h-6 text-terracotta" />
        <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Auditoría</h1>
      </div>
      <p className="text-stone-500 mt-1">Registro de decisiones y cambios sensibles.</p>
      {logs.length === 0 ? (
        <div className="mt-6 bg-white border border-dashed border-stone-300 rounded-xl py-16 text-center text-stone-500">Sin registros todavía</div>
      ) : (
        <div className="mt-6 bg-white border border-stone-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
              <tr><th className="text-left px-6 py-3">Fecha</th><th className="text-left px-6 py-3">Usuario</th><th className="text-left px-6 py-3">Acción</th><th className="text-left px-6 py-3">Detalle</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {logs.map((l, i) => (
                <tr key={i} data-testid={`audit-${i}`}>
                  <td className="px-6 py-4 text-stone-500">{formatDate(l.at)}</td>
                  <td className="px-6 py-4 text-navy">{l.actor_email} <span className="text-xs text-stone-400">({l.actor_role})</span></td>
                  <td className="px-6 py-4 font-medium text-navy">{l.action}</td>
                  <td className="px-6 py-4 text-stone-600">{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
