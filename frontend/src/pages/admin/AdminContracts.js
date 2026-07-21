import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { formatMXN, formatDate, STATUS_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function AdminContracts() {
  const [contracts, setContracts] = useState(null);
  useEffect(() => { api.get("/admin/contracts").then(({ data }) => setContracts(data)).catch(() => setContracts([])); }, []);
  if (!contracts) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Contratos</h1>
      <p className="text-stone-500 mt-1">{contracts.length} contrato(s) en la plataforma</p>
      <div className="mt-6 bg-white border border-stone-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
            <tr><th className="text-left px-6 py-3">Inmueble</th><th className="text-left px-6 py-3">Arrendatario</th><th className="text-left px-6 py-3">Arrendador</th><th className="text-right px-6 py-3">Renta</th><th className="text-left px-6 py-3">Inicio</th><th className="text-right px-6 py-3">Estado</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {contracts.map((c) => (
              <tr key={c.id} data-testid={`admin-contract-${c.id}`}>
                <td className="px-6 py-4 font-medium text-navy">{c.property_title}</td>
                <td className="px-6 py-4 text-stone-600">{c.tenant_name}</td>
                <td className="px-6 py-4 text-stone-600">{c.landlord_name}</td>
                <td className="px-6 py-4 text-right font-semibold text-navy">{formatMXN(c.monthly_rent)}</td>
                <td className="px-6 py-4 text-stone-500">{formatDate(c.start_date)}</td>
                <td className="px-6 py-4 text-right"><Badge className="rounded-full bg-stone-100 text-stone-600">{STATUS_LABEL[c.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
