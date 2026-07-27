import React, { useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, User } from "lucide-react";

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user?.name || "", phone: user?.phone || "" });
  const [loading, setLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const { data } = await api.patch("/users/me", form);
      setUser(data);
      toast.success("Perfil actualizado");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const switchRole = async () => {
    const newRole = user.role === "arrendador" ? "arrendatario" : "arrendador";
    setRoleLoading(true);
    try {
      const { data } = await api.patch("/users/me", { role: newRole });
      setUser(data);
      toast.success(`Ahora eres ${newRole}`);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setRoleLoading(false); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Mi perfil</h1>
      <p className="text-stone-500 mt-1">Administra tu información personal.</p>

      <div className="mt-8 bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="rounded-full bg-terracotta/10 text-terracotta hover:bg-terracotta/10">{user?.role === "arrendador" ? "Arrendador" : "Arrendatario"}</Badge>
          {user?.public_id && (
            <Badge data-testid="profile-public-id" className="rounded-full bg-navy/10 text-navy hover:bg-navy/10 font-mono">ID: {user.public_id}</Badge>
          )}
          <span className="text-sm text-stone-500">{user?.email}</span>
        </div>
        <div>
          <Label>Nombre completo</Label>
          <Input data-testid="profile-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Teléfono</Label>
          <Input data-testid="profile-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <Button onClick={save} disabled={loading} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="save-profile-btn">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar cambios"}
        </Button>
      </div>

      <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-2">
          {user?.role === "arrendador" ? <User className="w-5 h-5 text-navy" /> : <Building2 className="w-5 h-5 text-navy" />}
          <h2 className="font-display font-semibold text-navy">Cambiar de rol</h2>
        </div>
        <p className="text-sm text-stone-500 mb-4">
          {user?.role === "arrendador"
            ? "Cambia a arrendatario para buscar y solicitar inmuebles."
            : "Cambia a arrendador para publicar y administrar tus inmuebles."}
        </p>
        <Button variant="outline" onClick={switchRole} disabled={roleLoading} className="rounded-full" data-testid="switch-role-btn">
          {roleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Convertirme en ${user?.role === "arrendador" ? "arrendatario" : "arrendador"}`}
        </Button>
      </div>
    </div>
  );
}
