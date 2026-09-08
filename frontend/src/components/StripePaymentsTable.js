import React from "react";
import { formatMXN, formatDate } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "lucide-react";

const conceptLabel = { renta: "Renta", deposito: "Depósito en garantía", mantenimiento: "Mantenimiento" };

export const StripePaymentsTable = ({ payments, total, counterpartLabel, counterpartKey, testid = "stripe-payments" }) => (
  <div className="mt-8" data-testid={testid}>
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h2 className="font-display font-semibold text-navy text-lg flex items-center gap-2"><CreditCard className="w-4 h-4 text-terracotta" /> Pagos recibidos vía Stripe</h2>
      <span className="text-sm text-stone-500">Total: <b className="text-navy" data-testid={`${testid}-total`}>{formatMXN(total || 0)}</b> · {payments.length} pago(s)</span>
    </div>
    <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left px-5 py-3">Fecha</th>
            <th className="text-left px-5 py-3">Concepto</th>
            <th className="text-left px-5 py-3">Periodo</th>
            <th className="text-left px-5 py-3">Inmueble</th>
            <th className="text-left px-5 py-3">{counterpartLabel}</th>
            <th className="text-left px-5 py-3">Referencia Stripe</th>
            <th className="text-right px-5 py-3">Monto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {payments.length === 0 ? (
            <tr><td colSpan={7} className="px-5 py-10 text-center text-stone-400" data-testid={`${testid}-empty`}>Sin pagos registrados en Stripe.</td></tr>
          ) : payments.map((p) => (
            <tr key={p.session_id} data-testid={`${testid}-row-${p.session_id}`}>
              <td className="px-5 py-4 text-stone-600">{formatDate(p.updated_at || p.created_at)}</td>
              <td className="px-5 py-4"><Badge className="rounded-full bg-navy/10 text-navy hover:bg-navy/10">{conceptLabel[p.concept] || p.concept}</Badge></td>
              <td className="px-5 py-4 text-stone-600">{p.period || "—"}</td>
              <td className="px-5 py-4 text-stone-600">{p.property_title}</td>
              <td className="px-5 py-4 text-stone-600">{p[counterpartKey] || "—"}</td>
              <td className="px-5 py-4 font-mono text-xs text-stone-500 truncate max-w-[200px]">{p.stripe_payment_intent_id || p.session_id}</td>
              <td className="px-5 py-4 text-right font-semibold text-green-700">{formatMXN(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
