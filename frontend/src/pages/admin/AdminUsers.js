import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { STAFF_ROLE_LABELS, STAFF_ROLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, UserCog, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const STAFF_ROLE_VALUES = ["superadmin", "admin_general", "operaciones", "revision_propiedades", "soporte", "finanzas", "cobranza", "legal", "notaria"];

export default function AdminUsers() {
  const { user } = useAuth();
  const canManage = (user?.permissions || []).includes("administrar_usuarios");
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [accType, setAccType] = useState("external");
  const [staffRole, setStaffRole] = useState("operaciones");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/admin/users").then(({ data }) => setUsers(data)).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  const openEdit = (u) => {
    setEditing(u);
    setAccType(u.account_type || "external");
    setStaffRole(u.staff_role || "operaciones");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/users/${editing.id}`, {
        account_type: accType,
        staff_role: accType === "internal" ? staffRole : null,
      });
      toast.success("Usuario actualizado");
      setEditing(null);
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  if (!users) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const filtered = users.filter((u) => (u.name + u.email).toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Usuarios</h1>
      <p className="text-stone-500 mt-1">{users.length} usuarios registrados</p>

      <div className="mt-6 flex items-center gap-2 border border-stone-200 rounded-lg px-3 bg-white max-w-md">
        <Search className="w-4 h-4 text-stone-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo" className="border-0 focus-visible:ring-0 shadow-none px-0" data-testid="user-search" />
      </div>

      <div className="mt-6 bg-white border border-stone-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
            <tr><th className="text-left px-6 py-3">Usuario</th><th className="text-left px-6 py-3">Tipo</th><th className="text-left px-6 py-3">Rol</th>{canManage && <th className="text-right px-6 py-3">Acción</th>}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filtered.map((u) => (
              <tr key={u.id} data-testid={`admin-user-${u.id}`}>
                <td className="px-6 py-4"><div className="font-medium text-navy">{u.name}</div><div className="text-xs text-stone-500">{u.email}</div></td>
                <td className="px-6 py-4"><Badge className={`rounded-full ${u.account_type === "internal" ? "bg-navy/10 text-navy" : "bg-stone-100 text-stone-600"}`}>{u.account_type === "internal" ? "Interno" : "Externo"}</Badge></td>
                <td className="px-6 py-4 text-stone-700">{u.account_type === "internal" ? STAFF_ROLE_LABELS[u.staff_role] : (u.role === "arrendador" ? "Arrendador" : "Arrendatario")}</td>
                {canManage && <td className="px-6 py-4 text-right"><Button variant="outline" size="sm" className="rounded-full" onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`}><UserCog className="w-4 h-4 mr-1" /> Rol</Button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Asignar rol · {editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Tipo de cuenta</Label>
              <Select value={accType} onValueChange={setAccType}>
                <SelectTrigger data-testid="edit-account-type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="external">Externo (arrendador/arrendatario)</SelectItem><SelectItem value="internal">Interno (personal)</SelectItem></SelectContent>
              </Select>
            </div>
            {accType === "internal" && (
              <div>
                <Label>Rol interno</Label>
                <Select value={staffRole} onValueChange={setStaffRole}>
                  <SelectTrigger data-testid="edit-staff-role"><SelectValue /></SelectTrigger>
                  <SelectContent>{STAFF_ROLE_VALUES.map((r) => <SelectItem key={r} value={r}>{STAFF_ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-stone-400 mt-1">Solo puedes asignar roles iguales o inferiores al tuyo.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving} className="rounded-full bg-terracotta hover:bg-terracotta-hover w-full" data-testid="save-user-role">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
