import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, ClipboardCheck, MessageSquare, Briefcase, History, Save, Send } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_LABEL, PROPERTY_STATUS_COLOR } from "@/lib/constants";

const ACTIVIDAD_OPTIONS = [
  "Empleado",
  "Empleado de gobierno",
  "Profesionista",
  "Comerciante",
  "Otro",
];

const emptyActividad = () => ({ actividad: "", descripcion: "", fecha_inicio: "", fecha_fin: "", empresa: "", jefe: "" });

function ActividadFields({ value, onChange, prefix }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-5">
      <div>
        <Label>Actividad</Label>
        <Select value={value.actividad} onValueChange={(v) => set("actividad", v)}>
          <SelectTrigger data-testid={`${prefix}-select`} className="mt-1">
            <SelectValue placeholder="Selecciona una opción" />
          </SelectTrigger>
          <SelectContent>
            {ACTIVIDAD_OPTIONS.map((o) => (
              <SelectItem key={o} value={o} data-testid={`${prefix}-option-${o}`}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Descripción <span className="text-stone-400 text-xs">({value.descripcion.length}/20)</span></Label>
        <Input data-testid={`${prefix}-descripcion`} maxLength={20} value={value.descripcion} onChange={(e) => set("descripcion", e.target.value.slice(0, 20))} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Fecha de inicio</Label>
          <Input type="date" data-testid={`${prefix}-fecha-inicio`} value={value.fecha_inicio} onChange={(e) => set("fecha_inicio", e.target.value)} />
        </div>
        <div>
          <Label>Fecha de fin</Label>
          <Input type="date" data-testid={`${prefix}-fecha-fin`} value={value.fecha_fin} onChange={(e) => set("fecha_fin", e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Nombre de la empresa / Razón social <span className="text-stone-400 text-xs">({value.empresa.length}/25)</span></Label>
        <Input data-testid={`${prefix}-empresa`} maxLength={25} value={value.empresa} onChange={(e) => set("empresa", e.target.value.slice(0, 25))} />
      </div>

      <div>
        <Label>Nombre del jefe inmediato <span className="text-stone-400 text-xs">({value.jefe.length}/25)</span></Label>
        <Input data-testid={`${prefix}-jefe`} maxLength={25} value={value.jefe} onChange={(e) => set("jefe", e.target.value.slice(0, 25))} />
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user?.name || "", phone: user?.phone || "" });
  const [loading, setLoading] = useState(false);

  const isTenant = user?.role === "arrendatario";
  const [submitted, setSubmitted] = useState(!!user?.actividad_economica_submitted);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [actividad, setActividad] = useState({ ...emptyActividad(), ...(user?.actividad_economica_detalle || {}) });
  const prev = user?.empleos_anteriores || [];
  const [empleos, setEmpleos] = useState([
    { ...emptyActividad(), ...(prev[0] || {}) },
    { ...emptyActividad(), ...(prev[1] || {}) },
  ]);

  useEffect(() => { setSubmitted(!!user?.actividad_economica_submitted); }, [user]);

  const setEmpleo = (i, v) => setEmpleos(empleos.map((e, idx) => (idx === i ? v : e)));

  // Arrendador: solo guarda nombre/teléfono
  const save = async () => {
    setLoading(true);
    try {
      const { data } = await api.patch("/users/me", form);
      setUser(data);
      toast.success("Perfil actualizado");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  // Arrendatario: guarda todo (borrador) o envía (bloquea)
  const saveAll = async (doSubmit = false) => {
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        actividad_economica_detalle: actividad,
        empleos_anteriores: empleos,
      };
      if (doSubmit) payload.actividad_economica_submitted = true;
      const { data } = await api.patch("/users/me", payload);
      setUser(data);
      setConfirmOpen(false);
      toast.success(doSubmit ? "Información enviada" : "Cambios guardados");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
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
        <fieldset disabled={isTenant && submitted} className="space-y-5 disabled:opacity-70">
          <div>
            <Label>Nombre completo</Label>
            <Input data-testid="profile-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input data-testid="profile-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </fieldset>
        {!isTenant && (
          <Button onClick={save} disabled={loading} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="save-profile-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar cambios"}
          </Button>
        )}
      </div>

      {isTenant && (
        <>
          <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6 space-y-5" data-testid="actividad-economica-section">
            <div className="flex items-center gap-3">
              <Briefcase className="w-5 h-5 text-terracotta" />
              <h2 className="font-display font-semibold text-navy">Actividad económica actual</h2>
            </div>
            <fieldset disabled={submitted} className="disabled:opacity-70">
              <ActividadFields value={actividad} onChange={setActividad} prefix="actividad" />
            </fieldset>
          </div>

          <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6 space-y-6" data-testid="empleos-anteriores-section">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-terracotta" />
              <div>
                <h2 className="font-display font-semibold text-navy">Empleos anteriores</h2>
                <p className="text-sm text-stone-500">Registra tus empleos anteriores en caso de que los hayas tenido.</p>
              </div>
            </div>
            <fieldset disabled={submitted} className="space-y-6 disabled:opacity-70">
              {empleos.map((emp, i) => (
                <div key={i} className="border-t border-stone-100 pt-5 first:border-t-0 first:pt-0" data-testid={`empleo-anterior-${i + 1}`}>
                  <h3 className="font-medium text-navy mb-4">Empleo anterior {i + 1}</h3>
                  <ActividadFields value={emp} onChange={(v) => setEmpleo(i, v)} prefix={`empleo-${i + 1}`} />
                </div>
              ))}
            </fieldset>
          </div>

          {submitted ? (
            <div className="mt-6 flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800" data-testid="perfil-enviado-note">
              <Send className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Tu información fue enviada para validación y ya no puede modificarse.</span>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => saveAll(false)} disabled={loading} className="rounded-full px-8" data-testid="save-draft-btn">
                      <Save className="w-4 h-4 mr-1" /> Guardar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent data-testid="save-draft-tooltip">Al guardar podrás modificar posteriormente.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button disabled={loading} className="rounded-full bg-terracotta hover:bg-terracotta-hover px-8" data-testid="submit-info-btn">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (<><Send className="w-4 h-4 mr-1" /> Enviar información</>)}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent data-testid="submit-confirm-dialog">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revisa la información</AlertDialogTitle>
                    <AlertDialogDescription>
                      Después de enviar <strong>no podrás modificar</strong>. ¿Estás seguro de enviar?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="submit-cancel-btn">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => saveAll(true)} className="bg-terracotta hover:bg-terracotta-hover" data-testid="submit-accept-btn">Aceptar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </>
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
