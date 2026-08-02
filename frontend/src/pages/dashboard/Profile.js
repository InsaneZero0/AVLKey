import React, { useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ClipboardCheck, MessageSquare, Briefcase } from "lucide-react";
import { STATUS_LABEL, PROPERTY_STATUS_COLOR } from "@/lib/constants";

const ACTIVIDAD_OPTIONS = [
  "Empleado",
  "Empleado de gobierno",
  "Profesionista",
  "Comerciante",
  "Otro",
];

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user?.name || "", phone: user?.phone || "" });
  const [loading, setLoading] = useState(false);

  const isTenant = user?.role === "arrendatario";
  const [actividad, setActividad] = useState({
    actividad: user?.actividad_economica_detalle?.actividad || "",
    descripcion: user?.actividad_economica_detalle?.descripcion || "",
    fecha_inicio: user?.actividad_economica_detalle?.fecha_inicio || "",
    fecha_fin: user?.actividad_economica_detalle?.fecha_fin || "",
    empresa: user?.actividad_economica_detalle?.empresa || "",
    jefe: user?.actividad_economica_detalle?.jefe || "",
  });
  const [actLoading, setActLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const { data } = await api.patch("/users/me", form);
      setUser(data);
      toast.success("Perfil actualizado");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const saveActividad = async () => {
    setActLoading(true);
    try {
      const { data } = await api.patch("/users/me", { actividad_economica_detalle: actividad });
      setUser(data);
      toast.success("Actividad económica guardada");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setActLoading(false); }
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

      {isTenant && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6 space-y-5" data-testid="actividad-economica-section">
          <div className="flex items-center gap-3">
            <Briefcase className="w-5 h-5 text-terracotta" />
            <h2 className="font-display font-semibold text-navy">Actividad económica</h2>
          </div>

          <div>
            <Label>Actividad actual</Label>
            <Select value={actividad.actividad} onValueChange={(v) => setActividad({ ...actividad, actividad: v })}>
              <SelectTrigger data-testid="actividad-select" className="mt-1">
                <SelectValue placeholder="Selecciona una opción" />
              </SelectTrigger>
              <SelectContent>
                {ACTIVIDAD_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o} data-testid={`actividad-option-${o}`}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Descripción <span className="text-stone-400 text-xs">({actividad.descripcion.length}/20)</span></Label>
            <Input
              data-testid="actividad-descripcion"
              maxLength={20}
              value={actividad.descripcion}
              onChange={(e) => setActividad({ ...actividad, descripcion: e.target.value.slice(0, 20) })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Fecha de inicio</Label>
              <Input type="date" data-testid="actividad-fecha-inicio" value={actividad.fecha_inicio} onChange={(e) => setActividad({ ...actividad, fecha_inicio: e.target.value })} />
            </div>
            <div>
              <Label>Fecha de fin</Label>
              <Input type="date" data-testid="actividad-fecha-fin" value={actividad.fecha_fin} onChange={(e) => setActividad({ ...actividad, fecha_fin: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Nombre de la empresa / Razón social <span className="text-stone-400 text-xs">({actividad.empresa.length}/25)</span></Label>
            <Input
              data-testid="actividad-empresa"
              maxLength={25}
              value={actividad.empresa}
              onChange={(e) => setActividad({ ...actividad, empresa: e.target.value.slice(0, 25) })}
            />
          </div>

          <div>
            <Label>Nombre del jefe inmediato <span className="text-stone-400 text-xs">({actividad.jefe.length}/25)</span></Label>
            <Input
              data-testid="actividad-jefe"
              maxLength={25}
              value={actividad.jefe}
              onChange={(e) => setActividad({ ...actividad, jefe: e.target.value.slice(0, 25) })}
            />
          </div>

          <Button onClick={saveActividad} disabled={actLoading} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="save-actividad-btn">
            {actLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar actividad económica"}
          </Button>
        </div>
      )}

      {(user?.registro_stage || user?.admin_note) && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6" data-testid="profile-registro-status">
          <div className="flex items-center gap-3 mb-3">
            <ClipboardCheck className="w-5 h-5 text-terracotta" />
            <h2 className="font-display font-semibold text-navy">Estatus de tu registro</h2>
          </div>
          {user?.registro_stage && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-500">Validación:</span>
              <Badge className={`rounded-full ${PROPERTY_STATUS_COLOR[user.registro_stage] || "bg-stone-100 text-stone-600"}`} data-testid="profile-registro-badge">
                {STATUS_LABEL[user.registro_stage] || user.registro_stage}
              </Badge>
            </div>
          )}
          {user?.admin_note && (
            <div className="mt-3 flex items-start gap-2 text-sm bg-stone-50 border border-stone-200 rounded-lg p-3 text-stone-700" data-testid="profile-admin-note">
              <MessageSquare className="w-4 h-4 mt-0.5 text-terracotta shrink-0" />
              <span><span className="font-medium">Observaciones:</span> {user.admin_note}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
