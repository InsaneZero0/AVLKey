import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { formatMXN, formatDate } from "@/lib/constants";
import { Loader2, FileLock2 } from "lucide-react";

export default function AdminDocuments() {
  const [docs, setDocs] = useState(null);
  useEffect(() => { api.get("/admin/documents").then(({ data }) => setDocs(data)).catch(() => setDocs([])); }, []);
  if (!docs) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <div className="flex items-center gap-2">
        <FileLock2 className="w-6 h-6 text-terracotta" />
        <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Documentos sensibles</h1>
      </div>
      <p className="text-stone-500 mt-1">Información confidencial de los solicitantes (acceso restringido).</p>
      <div className="mt-6 bg-white border border-stone-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
            <tr><th className="text-left px-6 py-3">Solicitante</th><th className="text-left px-6 py-3">Inmueble</th><th className="text-left px-6 py-3">Ocupación</th><th className="text-right px-6 py-3">Ingreso</th><th className="text-right px-6 py-3">Relación</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {docs.map((d, i) => (
              <tr key={i} data-testid={`admin-doc-${i}`}>
                <td className="px-6 py-4 font-medium text-navy">{d.tenant_name}</td>
                <td className="px-6 py-4 text-stone-600">{d.property_title}</td>
                <td className="px-6 py-4 text-stone-600">{d.occupation || "—"} ({d.employment_type})</td>
                <td className="px-6 py-4 text-right font-semibold text-navy">{formatMXN(d.monthly_income)}</td>
                <td className="px-6 py-4 text-right text-stone-600">{d.income_ratio}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
