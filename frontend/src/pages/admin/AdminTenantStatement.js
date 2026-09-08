import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { formatMXN, formatDate, STATUS_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Wallet, AlertTriangle, ShieldCheck, Clock } from "lucide-react";
import { StripePaymentsTable } from "@/components/StripePaymentsTable";

const chColor = { pagado: "bg-green-100 text-green-700", pendiente: "bg-amber-100 text-amber-700", fallido: "bg-red-100 text-red-700" };
const chLabel = { pagado: "Pagado", pendiente: "Pendiente", fallido: "Fallido" };

function Stat({ icon: Icon, label, value, tone = "navy", testid }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5" data-testid={testid}>
      <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wider"><Icon className="w-4 h-4" /> {label}</div>
      <div className={`mt-2 font-display font-bold text-2xl text-${tone}`}>{value}</div>
    </div>
  );
}

export default function AdminTenantStatement() {
  const { userId } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/admin/finance/tenant-statement/${userId}`).then(({ data }) => setData(data)).catch(() => setData(null));
  }, [userId]);

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;
  const { tenant, charges, totals, contracts, payments = [] } = data;

  return (
    <div data-testid="admin-tenant-statement">
      <Link to="/admin/arrendatarios" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-terracotta mb-4" data-testid="tenant-statement-back"><ArrowLeft className="w-4 h-4" /> Arrendatarios</Link>

      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Estado de cuenta</h1>
      <p className="text-stone-500 mt-1">
        <span className="font-medium text-navy">{tenant.name}</span>
        {tenant.public_id ? <span className="font-mono"> · {tenant.public_id}</span> : ""} · {tenant.email}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <Stat icon={Wallet} label="Total pagado" value={formatMXN(totals.paid_total)} testid="tstmt-paid" />
        <Stat icon={Clock} label="Pendiente de pago" value={formatMXN(totals.pending_total)} tone="terracotta" testid="tstmt-pending" />
        <Stat icon={AlertTriangle} label="Recargos por atraso" value={formatMXN(totals.late_fees)} testid="tstmt-late" />
        <Stat icon={ShieldCheck} label="Depósitos en garantía" value={formatMXN(totals.deposits)} testid="tstmt-deposits" />
      </div>
      <p className="text-sm text-stone-500 mt-3" data-testid="tstmt-counts">{totals.paid_count} de {totals.total_count} cobros pagados</p>

      <StripePaymentsTable payments={payments} total={totals.stripe_paid} counterpartLabel="Arrendador" counterpartKey="landlord_name" testid="tstmt-stripe" />

      <div className="mt-8">
        <h2 className="font-display font-semibold text-navy text-lg mb-3">Contratos</h2>
        {contracts.length === 0 ? (
          <div className="bg-white border border-dashed border-stone-300 rounded-xl py-8 text-center text-stone-400 text-sm" data-testid="tstmt-contracts-empty">Este arrendatario aún no tiene contratos.</div>
        ) : (
          <div className="grid gap-3">
            {contracts.map((c) => (
              <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3" data-testid={`tstmt-contract-${c.id}`}>
                <div>
                  <div className="font-medium text-navy">{c.property_title}</div>
                  <div className="text-sm text-stone-500">Arrendador: {c.landlord_name || "—"} · Renta {formatMXN(c.monthly_rent)}/mes · {formatDate(c.start_date)} → {formatDate(c.end_date)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="rounded-full bg-stone-100 text-stone-600">{STATUS_LABEL[c.status] || c.status}</Badge>
                  <Badge className={`rounded-full ${c.deposit_registered ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    Depósito {formatMXN(c.deposit)} · {c.deposit_registered ? "Registrado" : "Pendiente"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 bg-white border border-stone-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-3">Periodo</th>
              <th className="text-left px-5 py-3">Inmueble</th>
              <th className="text-right px-5 py-3">Renta</th>
              <th className="text-right px-5 py-3">Recargo</th>
              <th className="text-right px-5 py-3">Total</th>
              <th className="text-right px-5 py-3">Estado</th>
              <th className="text-right px-5 py-3">Pagado el</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {charges.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-16 text-center text-stone-400" data-testid="tstmt-empty">Este arrendatario aún no tiene cobros.</td></tr>
            ) : charges.map((c) => (
              <tr key={c.id} data-testid={`tstmt-charge-${c.id}`}>
                <td className="px-5 py-4 font-medium text-navy">{c.period}</td>
                <td className="px-5 py-4 text-stone-600">{c.property_title}</td>
                <td className="px-5 py-4 text-right text-stone-600">{formatMXN(c.rent)}</td>
                <td className="px-5 py-4 text-right text-stone-600">{c.late_fee > 0 ? <span className="text-red-600">{formatMXN(c.late_fee)}</span> : "—"}</td>
                <td className="px-5 py-4 text-right font-semibold text-navy">{formatMXN(c.tenant_total)}</td>
                <td className="px-5 py-4 text-right"><Badge className={`rounded-full ${chColor[c.status] || "bg-stone-100 text-stone-600"}`}>{chLabel[c.status] || c.status}</Badge></td>
                <td className="px-5 py-4 text-right text-stone-500">{c.paid_at ? formatDate(c.paid_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
