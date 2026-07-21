import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { formatMXN, formatDate } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

const payColor = { paid: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700", failed: "bg-red-100 text-red-700" };
const payLabel = { paid: "Pagado", pending: "Pendiente", failed: "Fallido", expired: "Expirado" };
const conceptLabel = { renta: "Renta mensual", deposito: "Depósito" };

export default function AdminPayments() {
  const [payments, setPayments] = useState(null);
  useEffect(() => { api.get("/admin/payments").then(({ data }) => setPayments(data)).catch(() => setPayments([])); }, []);
  if (!payments) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const total = payments.filter((p) => p.payment_status === "paid").reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Pagos</h1>
      <p className="text-stone-500 mt-1">Total cobrado: <span className="font-semibold text-navy">{formatMXN(total)}</span></p>
      <div className="mt-6 bg-white border border-stone-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
            <tr><th className="text-left px-6 py-3">Concepto</th><th className="text-left px-6 py-3">Inmueble</th><th className="text-left px-6 py-3">Fecha</th><th className="text-right px-6 py-3">Monto</th><th className="text-right px-6 py-3">Estado</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {payments.map((p) => (
              <tr key={p.session_id} data-testid={`admin-payment-${p.session_id}`}>
                <td className="px-6 py-4 font-medium text-navy">{conceptLabel[p.concept] || p.concept}</td>
                <td className="px-6 py-4 text-stone-600">{p.property_title || "—"}</td>
                <td className="px-6 py-4 text-stone-500">{formatDate(p.created_at)}</td>
                <td className="px-6 py-4 text-right font-semibold text-navy">{formatMXN(p.amount)}</td>
                <td className="px-6 py-4 text-right"><Badge className={`rounded-full ${payColor[p.payment_status] || "bg-stone-100 text-stone-600"}`}>{payLabel[p.payment_status] || p.payment_status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
