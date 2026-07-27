import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Building2, User } from "lucide-react";

export default function AdminMembers({ role }) {
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");
  const isLandlord = role === "arrendador";

  useEffect(() => {
    api.get("/admin/users").then(({ data }) => setUsers(data)).catch(() => setUsers([]));
  }, []);

  const members = useMemo(
    () => (users || []).filter((u) => u.account_type === "external" && u.role === role),
    [users, role]
  );
  const filtered = members.filter((u) =>
    ((u.name || "") + (u.email || "") + (u.public_id || "")).toLowerCase().includes(q.toLowerCase())
  );

  if (!users) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const title = isLandlord ? "Arrendadores" : "Arrendatarios";

  return (
    <div data-testid={`admin-members-${role}`}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-terracotta/10 flex items-center justify-center">
          {isLandlord ? <Building2 className="w-5 h-5 text-terracotta" /> : <User className="w-5 h-5 text-terracotta" />}
        </div>
        <div>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">{title}</h1>
          <p className="text-stone-500 mt-1">{members.length} {isLandlord ? "arrendadores" : "arrendatarios"} registrados</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 border border-stone-200 rounded-lg px-3 bg-white max-w-md">
        <Search className="w-4 h-4 text-stone-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ID, nombre o correo" className="border-0 focus-visible:ring-0 shadow-none px-0" data-testid="member-search" />
      </div>

      <div className="mt-6 bg-white border border-stone-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-6 py-3">ID</th>
              <th className="text-left px-6 py-3">Nombre</th>
              <th className="text-left px-6 py-3">Correo</th>
              <th className="text-left px-6 py-3">Teléfono</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-stone-400">Sin resultados</td></tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} data-testid={`member-row-${u.id}`}>
                <td className="px-6 py-4"><Badge className="rounded-full bg-navy/10 text-navy hover:bg-navy/10 font-mono">{u.public_id || "—"}</Badge></td>
                <td className="px-6 py-4"><Link to={`/admin/miembro/${u.id}`} className="font-medium text-navy hover:text-terracotta hover:underline transition-colors" data-testid={`member-name-${u.id}`}>{u.name}</Link></td>
                <td className="px-6 py-4 text-stone-600">{u.email}</td>
                <td className="px-6 py-4 text-stone-600">{u.phone || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
