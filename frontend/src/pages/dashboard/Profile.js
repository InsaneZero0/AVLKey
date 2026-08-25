import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

// RFC persona física: 4 letras + 6 dígitos + 3 indistintos (13)
const rfcFisica = (raw) => {
  const s = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let out = "";
  for (const ch of s) {
    const i = out.length;
    if (i < 4) { if (/[A-Z]/.test(ch)) out += ch; }
    else if (i < 10) { if (/[0-9]/.test(ch)) out += ch; }
    else if (i < 13) { out += ch; }
    else break;
  }
  return out;
};
// RFC persona moral: 3 letras + 6 dígitos + 3 indistintos (12)
const rfcMoral = (raw) => {
  const s = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let out = "";
  for (const ch of s) {
    const i = out.length;
    if (i < 3) { if (/[A-Z]/.test(ch)) out += ch; }
    else if (i < 9) { if (/[0-9]/.test(ch)) out += ch; }
    else if (i < 12) { out += ch; }
    else break;
  }
  return out;
};
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, ClipboardCheck, MessageSquare, Briefcase, History, Save, Send } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Verification from "@/pages/dashboard/Verification";
import { STATUS_LABEL, PROPERTY_STATUS_COLOR } from "@/lib/constants";

const PHONE_CODES = [
  { name: "México", code: "+52" },
  { name: "Estados Unidos / Canadá", code: "+1" },
  { name: "España", code: "+34" },
  { name: "Colombia", code: "+57" },
  { name: "Argentina", code: "+54" },
  { name: "Perú", code: "+51" },
  { name: "Chile", code: "+56" },
  { name: "Guatemala", code: "+502" },
  { name: "Venezuela", code: "+58" },
  { name: "Ecuador", code: "+593" },
  { name: "Brasil", code: "+55" },
];

const ACTIVIDAD_OPTIONS = [
  "Empleado",
  "Empleado de gobierno",
  "Profesionista",
  "Comerciante",
  "Otro",
];

const emptyActividad = () => ({ actividad: "", descripcion: "", fecha_inicio: "", fecha_fin: "", empresa: "", jefe: "" });

function ActividadFields({ value, onChange, prefix, lockActividad = false }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-5">
      <div>
        <Label>Actividad</Label>
        <Select value={value.actividad} onValueChange={(v) => set("actividad", v)} disabled={lockActividad}>
          <SelectTrigger data-testid={`${prefix}-select`} className="mt-1 disabled:opacity-70 disabled:cursor-not-allowed">
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
  const [form, setForm] = useState({ name: user?.name || "", phone: user?.phone || "", phone_code: user?.phone_code || "+52", rfc: user?.rfc || "", curp: user?.curp || "" });
  const [tipoPersona, setTipoPersona] = useState(user?.tipo_persona || "fisica");
  const [empresa, setEmpresa] = useState({
    razon_social: "", rfc: "", representante_legal: "", rfc_representante: "",
    actividad: "", regimen_fiscal: "", contacto_nombre: "", contacto_telefono: "",
    ...(user?.empresa_datos || {}),
  });
  const [loading, setLoading] = useState(false);

  const isTenant = user?.role === "arrendatario";
  const isLandlord = user?.role === "arrendador";
  const isExternal = isLandlord || isTenant;
  const [submitted, setSubmitted] = useState(!!user?.actividad_economica_submitted);
  const lock = isTenant ? submitted : !!user?.registro_submitted;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [actividad, setActividad] = useState({ ...emptyActividad(), ...(user?.actividad_economica_detalle || {}) });
  const prev = user?.empleos_anteriores || [];
  const [empleos, setEmpleos] = useState([
    { ...emptyActividad(), ...(prev[0] || {}) },
    { ...emptyActividad(), ...(prev[1] || {}) },
  ]);

  useEffect(() => { setSubmitted(!!user?.actividad_economica_submitted); }, [user]);

  const setEmpleo = (i, v) => setEmpleos(empleos.map((e, idx) => (idx === i ? v : e)));

  // Guarda los datos personales del perfil (nombre, teléfono, RFC, CURP). Usado por el arrendador
  // desde los botones de Verificación (al final), para guardar/enviar todo en uno.
  const savePersonal = async () => {
    const { data } = await api.patch("/users/me", {
      name: form.name, phone: form.phone, phone_code: form.phone_code, rfc: form.rfc, curp: form.curp,
    });
    setUser(data);
  };

  // Guarda perfil (borrador) o envía (bloquea). Aplica a arrendador y arrendatario.
  const saveAll = async (doSubmit = false) => {
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        phone_code: form.phone_code,
        rfc: form.rfc,
        curp: form.curp,
        tipo_persona: tipoPersona,
        empresa_datos: empresa,
      };
      if (isTenant) {
        payload.actividad_economica_detalle = actividad;
        payload.empleos_anteriores = empleos;
      }
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
      {isLandlord && user?.registro_stage === "autorizado" && (
        <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1" data-testid="profile-autorizado-legend">Ya puedes publicar tus propiedades</p>
      )}

      <div className="mt-8 bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="rounded-full bg-terracotta/10 text-terracotta hover:bg-terracotta/10">{user?.role === "arrendador" ? "Arrendador" : "Arrendatario"}</Badge>
          {user?.public_id && (
            <Badge data-testid="profile-public-id" className="rounded-full bg-navy/10 text-navy hover:bg-navy/10 font-mono">ID: {user.public_id}</Badge>
          )}
          <span className="text-sm text-stone-500">{user?.email}</span>
        </div>
        <fieldset disabled={lock} className="space-y-5 disabled:opacity-70">
          {isExternal && (
            <div data-testid="tipo-persona-alert" className="bg-terracotta/5 border border-terracotta/20 rounded-xl p-4">
              <div className="text-sm font-medium text-navy mb-2">¿Cómo te registras? <span className="text-xs font-normal text-stone-400">(selecciona una opción)</span></div>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 cursor-pointer flex-1 transition-colors ${tipoPersona === "fisica" ? "border-terracotta bg-white" : "border-stone-200"}`}>
                  <Checkbox checked={tipoPersona === "fisica"} onCheckedChange={() => setTipoPersona("fisica")} data-testid="tipo-persona-fisica" />
                  <span className="text-sm text-navy">Persona física</span>
                </label>
                <label className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 cursor-pointer flex-1 transition-colors ${tipoPersona === "moral" ? "border-terracotta bg-white" : "border-stone-200"}`}>
                  <Checkbox checked={tipoPersona === "moral"} onCheckedChange={() => setTipoPersona("moral")} data-testid="tipo-persona-moral" />
                  <span className="text-sm text-navy">Persona moral</span>
                </label>
              </div>
            </div>
          )}

          {isExternal && tipoPersona === "moral" ? (
            <>
              <div><Label>Razón social</Label><Input data-testid="empresa-razon-social" value={empresa.razon_social} onChange={(e) => setEmpresa({ ...empresa, razon_social: e.target.value })} /></div>
              <div><Label>RFC</Label><Input data-testid="empresa-rfc" maxLength={12} value={empresa.rfc} onChange={(e) => setEmpresa({ ...empresa, rfc: rfcMoral(e.target.value) })} placeholder="AAA010101AAA" /></div>
              <div><Label>Representante legal</Label><Input data-testid="empresa-representante" value={empresa.representante_legal} onChange={(e) => setEmpresa({ ...empresa, representante_legal: e.target.value })} /></div>
              <div><Label>RFC del representante legal</Label><Input data-testid="empresa-rfc-representante" maxLength={13} value={empresa.rfc_representante} onChange={(e) => setEmpresa({ ...empresa, rfc_representante: rfcFisica(e.target.value) })} placeholder="XAXX010101000" /></div>
              <div><Label>Actividad de la empresa</Label><Input data-testid="empresa-actividad" value={empresa.actividad} onChange={(e) => setEmpresa({ ...empresa, actividad: e.target.value })} /></div>
              <div><Label>Régimen fiscal</Label><Input data-testid="empresa-regimen" value={empresa.regimen_fiscal} onChange={(e) => setEmpresa({ ...empresa, regimen_fiscal: e.target.value })} /></div>
              <div><Label>Nombre de contacto</Label><Input data-testid="empresa-contacto-nombre" value={empresa.contacto_nombre} onChange={(e) => setEmpresa({ ...empresa, contacto_nombre: e.target.value })} /></div>
              <div><Label>Teléfono de contacto</Label><Input data-testid="empresa-contacto-telefono" type="tel" inputMode="numeric" maxLength={10} value={empresa.contacto_telefono} onChange={(e) => setEmpresa({ ...empresa, contacto_telefono: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="5555550000" /></div>
            </>
          ) : (
          <>
          <div>
            <Label>Nombre completo</Label>
            <Input data-testid="profile-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <div className="flex items-center gap-2">
              <Select value={form.phone_code} onValueChange={(v) => setForm({ ...form, phone_code: v })}>
                <SelectTrigger data-testid="profile-phone-code" className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">{PHONE_CODES.map((c) => <SelectItem key={c.name} value={c.code}>{c.code} · {c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input data-testid="profile-phone" type="tel" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="5555550000" className="flex-1" />
            </div>
          </div>
          <div>
            <Label>RFC <span className="text-stone-400 text-xs">({form.rfc.length}/13)</span></Label>
            <Input data-testid="profile-rfc" maxLength={13} value={form.rfc} onChange={(e) => setForm({ ...form, rfc: rfcFisica(e.target.value) })} placeholder="XAXX010101000" />
          </div>
          <div>
            <Label>CURP <span className="text-stone-400 text-xs">({form.curp.length}/18)</span></Label>
            <Input data-testid="profile-curp" maxLength={18} value={form.curp} onChange={(e) => setForm({ ...form, curp: e.target.value.toUpperCase().slice(0, 18) })} placeholder="XAXX010101HDFXXX00" />
          </div>
          </>
          )}
        </fieldset>
      </div>

      {isTenant && (
        <>
          <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6 space-y-5" data-testid="actividad-economica-section">
            <div className="flex items-center gap-3">
              <Briefcase className="w-5 h-5 text-terracotta" />
              <h2 className="font-display font-semibold text-navy">Actividad económica actual</h2>
            </div>
            <fieldset disabled={submitted || tipoPersona === "moral"} className="disabled:opacity-70">
              <ActividadFields value={actividad} onChange={setActividad} prefix="actividad" lockActividad={tipoPersona === "moral"} />
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
            <fieldset disabled={submitted || tipoPersona === "moral"} className="space-y-6 disabled:opacity-70">
              {empleos.map((emp, i) => (
                <div key={i} className="border-t border-stone-100 pt-5 first:border-t-0 first:pt-0" data-testid={`empleo-anterior-${i + 1}`}>
                  <h3 className="font-medium text-navy mb-4">Empleo anterior {i + 1}</h3>
                  <ActividadFields value={emp} onChange={(v) => setEmpleo(i, v)} prefix={`empleo-${i + 1}`} />
                </div>
              ))}
            </fieldset>
          </div>
        </>
      )}

      {isTenant && (submitted ? (
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
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (<><Send className="w-4 h-4 mr-1" /> Enviar cambios</>)}
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
      ))}

      {user?.role === "arrendador" && (
        <div className="mt-6" data-testid="profile-verification-embed">
          <Verification onPersistPersonal={savePersonal} />
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
