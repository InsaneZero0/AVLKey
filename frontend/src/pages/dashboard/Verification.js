import React, { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import api, { apiError, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate, STATUS_LABEL, PROPERTY_STATUS_COLOR } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2, Upload, FileCheck2, Eye, AlertTriangle, ShieldCheck, CheckCircle2,
  CreditCard, Landmark, FileText, UserRound, Users, X, Camera, Plus, Save, Send, Trash2,
} from "lucide-react";

const REGIMENES = [
  "605 - Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606 - Arrendamiento",
  "607 - Enajenación o Adquisición de Bienes",
  "608 - Demás ingresos",
  "610 - Residentes en el Extranjero sin Establecimiento Permanente",
  "611 - Ingresos por Dividendos (socios y accionistas)",
  "612 - Personas Físicas con Actividades Empresariales y Profesionales",
  "614 - Ingresos por intereses",
  "615 - Régimen de los ingresos por obtención de premios",
  "616 - Sin obligaciones fiscales",
  "621 - Incorporación Fiscal",
  "625 - Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626 - Régimen Simplificado de Confianza (RESICO)",
];

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

const PARENTESCOS = [
  "Cónyuge", "Pareja", "Hijo(a)", "Padre", "Madre", "Hermano(a)",
  "Abuelo(a)", "Nieto(a)", "Tío(a)", "Sobrino(a)", "Primo(a)", "Amigo(a)", "Otro",
];

const statusMap = {
  pendiente: { label: "En revisión", cls: "bg-amber-100 text-amber-700" },
  aprobado: { label: "Aprobado", cls: "bg-green-100 text-green-700" },
  rechazado: { label: "Rechazado", cls: "bg-red-100 text-red-700" },
  correccion: { label: "Corrección solicitada", cls: "bg-blue-100 text-blue-700" },
};

function DocRow({ item, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const doc = item.document;

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", item.key);
    fd.append("category", item.category);
    setUploading(true);
    try {
      await api.post("/documents/upload", fd);
      toast.success(`${item.label} cargado`);
      onUploaded();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const st = doc ? statusMap[doc.status] : null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-stone-100 last:border-0" data-testid={`doc-row-${item.key}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-stone-500" /></div>
        <div>
          <div className="font-medium text-navy flex items-center gap-2">
            {item.label}
            {item.required ? <span className="text-red-500 text-xs">*</span> : <span className="text-xs text-stone-400">(opcional)</span>}
          </div>
          {doc ? (
            <div className="text-xs text-stone-500 mt-0.5">
              v{doc.version} · {doc.original_filename}
              {doc.expiry_date && <> · vence {formatDate(doc.expiry_date)}</>}
              {doc.review_note && <div className="text-stone-600 italic mt-0.5">"{doc.review_note}"</div>}
            </div>
          ) : <div className="text-xs text-stone-400 mt-0.5">Sin cargar</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {st && <Badge className={`rounded-full ${st.cls}`}>{st.label}</Badge>}
        {doc && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.open(`${API}/documents/${doc.id}/download`, "_blank")}>
            <Eye className="w-4 h-4" />
          </Button>
        )}
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={upload} data-testid={`file-input-${item.key}`} />
        <Button size="sm" className="rounded-full bg-terracotta hover:bg-terracotta-hover" disabled={uploading} onClick={() => inputRef.current?.click()} data-testid={`upload-${item.key}`}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4 mr-1" /> {doc ? "Reemplazar" : "Cargar"}</>}
        </Button>
      </div>
    </div>
  );
}

// Subida de archivos (fotos/PDF) a almacenamiento privado
function IncomeProofs({ paths, onChange, testid, label = "Comprobantes de ingresos", buttonText = "Subir fotos de comprobantes de ingresos" }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post("/uploads/income-proof", fd);
        added.push(data.path);
      }
      onChange([...(paths || []), ...added]);
      toast.success("Comprobante(s) agregado(s)");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <Label>{label}</Label>
      <input ref={inputRef} type="file" accept="image/*,.pdf" multiple hidden onChange={handle} data-testid={`${testid}-input`} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="mt-1 w-full flex items-center gap-3 border-2 border-dashed border-stone-300 rounded-xl px-4 py-3 hover:border-terracotta transition-colors" data-testid={testid}>
        <div className="w-9 h-9 rounded-lg bg-terracotta/10 flex items-center justify-center">
          {busy ? <Loader2 className="w-4 h-4 text-terracotta animate-spin" /> : <Camera className="w-4 h-4 text-terracotta" />}
        </div>
        <span className="text-sm text-stone-600">{busy ? "Subiendo..." : buttonText}</span>
      </button>
      {(paths || []).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {paths.map((p) => (
            <div key={p} className="relative w-20 h-20 rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
              <img src={`${API}/uploads/private/${p}`} alt="comprobante" className="w-full h-full object-cover" />
              <button type="button" onClick={() => onChange(paths.filter((x) => x !== p))} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5"><X className="w-3 h-3 text-white" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RegistroResumen({ user, fiscal, consent, items, onDelete }) {
  const money = (n) => `$${Number(n || 0).toLocaleString("en-US")} MX`;
  const Field = ({ label, value }) => (
    <div><div className="text-xs text-stone-400">{label}</div><div className="text-sm text-navy font-medium break-words">{value || "—"}</div></div>
  );
  const total = Number(fiscal.ingreso_mensual || 0) + (fiscal.cohabitantes || []).reduce((s, c) => s + Number(c.ingreso_mensual || 0), 0);
  return (
    <div className="mt-6 space-y-6" data-testid="registro-resumen">
      <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-green-800 flex items-start gap-2">
        <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
        <span>Tu solicitud de registro fue enviada a validación. Ya no puedes modificar los datos; te notificaremos el resultado de tu validación en tu perfil.</span>
      </div>
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <h2 className="font-display font-semibold text-navy mb-4 flex items-center gap-2"><UserRound className="w-5 h-5 text-terracotta" /> Datos del solicitante</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Nombre" value={user?.name} />
          {fiscal.es_extranjero ? <Field label="Pasaporte" value={fiscal.pasaporte} /> : <><Field label="RFC" value={fiscal.rfc} /><Field label="CURP" value={fiscal.curp} /></>}
          <Field label="Teléfono" value={fiscal.phone ? `${fiscal.phone_code || ""} ${fiscal.phone}` : ""} />
          <Field label="Régimen fiscal" value={fiscal.fiscal_regime} />
          <Field label="Actividad económica" value={fiscal.actividad_economica} />
          <Field label="Ingreso mensual" value={money(fiscal.ingreso_mensual)} />
          <Field label="Adultos (18+)" value={String(fiscal.adultos_18 || 0)} />
          <Field label="Menores (12-17)" value={String(fiscal.menores_12_17 || 0)} />
          <Field label="Niños (0-11)" value={String(fiscal.ninos_0_11 || 0)} />
          <Field label="Mascotas" value={fiscal.mascotas} />
        </div>
      </div>
      {(fiscal.cohabitantes || []).length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="font-display font-semibold text-navy mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-terracotta" /> Habitantes</h2>
          <div className="space-y-3">
            {fiscal.cohabitantes.map((c, i) => (
              <div key={i} className="border border-stone-200 rounded-xl p-3">
                <div className="text-sm font-medium text-navy mb-2">Habitante {i + 1}: {c.name || "—"}</div>
                <div className="grid sm:grid-cols-3 gap-3">
                  {c.es_extranjero ? <Field label="Pasaporte" value={c.pasaporte} /> : <><Field label="RFC" value={c.rfc} /><Field label="CURP" value={c.curp} /></>}
                  <Field label="Teléfono" value={c.phone ? `${c.phone_code || ""} ${c.phone}` : ""} />
                  <Field label="Parentesco" value={c.parentesco} />
                  <Field label="Ingreso" value={money(c.ingreso_mensual)} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
            <span className="text-sm font-medium text-navy">Ingreso mensual total</span>
            <span className="font-display font-bold text-terracotta">{money(total)}</span>
          </div>
        </div>
      )}
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <h2 className="font-display font-semibold text-navy mb-3 flex items-center gap-2"><FileText className="w-5 h-5 text-terracotta" /> Documentos</h2>
        <div className="space-y-2">
          {items.map((it) => {
            const st = it.document ? statusMap[it.document.status] : null;
            return (
              <div key={it.key} className="flex items-center justify-between text-sm border-b border-stone-100 pb-2 last:border-0">
                <span className="text-navy">{it.label}{it.required && <span className="text-red-500"> *</span>}</span>
                <Badge className={`rounded-full ${st ? st.cls : "bg-stone-100 text-stone-500"}`}>{st ? st.label : "Pendiente"}</Badge>
              </div>
            );
          })}
        </div>
      </div>
      {consent?.consent?.accepted && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> Autorización de consulta de historial crediticio registrada.
        </div>
      )}
      <div className="flex justify-end pt-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="rounded-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" data-testid="delete-registro-btn">
              <Trash2 className="w-4 h-4 mr-1" /> Eliminar registro
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent data-testid="delete-registro-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar registro</AlertDialogTitle>
              <AlertDialogDescription>
                Toda tu información será borrada de tu perfil y podrás realizar un registro nuevo. ¿Deseas continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="delete-registro-cancel">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700" data-testid="delete-registro-accept">Aceptar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default function Verification({ onPersistPersonal } = {}) {
  const { user, refresh } = useAuth();
  const category = user?.role === "arrendador" ? "arrendador" : "arrendatario";
  const [submitted, setSubmitted] = useState(!!user?.registro_submitted);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [consent, setConsent] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [savingFiscal, setSavingFiscal] = useState(false);
  const [fiscal, setFiscal] = useState({
    rfc: "", fiscal_regime: "", bank_name: "", account_holder: "", clabe: "",
    phone: "", actividad_economica: "", curp: "", ingreso_mensual: "",
    comprobantes_ingresos: [], cohabitantes: [],
    adultos_18: "", menores_12_17: "", ninos_0_11: "", mascotas: "",
    es_extranjero: false, pasaporte: "", pasaporte_fotos: [], migratorio_fotos: [], phone_code: "+52",
  });

  const reloadDocs = () => {
    api.get(`/my/documents?category=${category}`).then(({ data }) => setSummary(data)).catch(() => setSummary({ items: [] }));
    api.get("/my/alerts").then(({ data }) => setAlerts(data)).catch(() => {});
  };

  const load = () => {
    reloadDocs();
    if (category === "arrendatario") api.get("/my/consent").then(({ data }) => setConsent(data)).catch(() => {});
    api.get("/my/fiscal").then(({ data }) => setFiscal((p) => ({
      ...p, ...data,
      phone: data.phone || user?.phone || "",
      phone_code: data.phone_code || "+52",
      ingreso_mensual: data.ingreso_mensual != null ? String(data.ingreso_mensual) : "",
      comprobantes_ingresos: data.comprobantes_ingresos || [],
      adultos_18: data.adultos_18 != null ? String(data.adultos_18) : "",
      menores_12_17: data.menores_12_17 != null ? String(data.menores_12_17) : "",
      ninos_0_11: data.ninos_0_11 != null ? String(data.ninos_0_11) : "",
      mascotas: data.mascotas || "",
      es_extranjero: !!data.es_extranjero,
      pasaporte: data.pasaporte || "",
      pasaporte_fotos: data.pasaporte_fotos || [],
      migratorio_fotos: data.migratorio_fotos || [],
      cohabitantes: (data.cohabitantes || []).map((c) => ({
        name: c.name || "", rfc: c.rfc || "", curp: c.curp || "",
        ingreso_mensual: c.ingreso_mensual != null ? String(c.ingreso_mensual) : "",
        comprobantes: c.comprobantes || [],
        ine_fotos: c.ine_fotos || [],
        phone: c.phone || "", phone_code: c.phone_code || "+52", parentesco: c.parentesco || "",
        es_extranjero: !!c.es_extranjero, pasaporte: c.pasaporte || "",
        pasaporte_fotos: c.pasaporte_fotos || [], migratorio_fotos: c.migratorio_fotos || [],
      })),
    }))).catch(() => {});
  };
  useEffect(() => { load(); }, [category]); // eslint-disable-line
  useEffect(() => { setSubmitted(!!user?.registro_submitted); }, [user]);

  // Ajusta el número de habitantes según adultos 18+ declarados (excluye al solicitante)
  useEffect(() => {
    const need = Math.max(0, (parseInt(fiscal.adultos_18 || "0", 10) || 0) - 1);
    setFiscal((p) => {
      if (p.cohabitantes.length === need) return p;
      const arr = p.cohabitantes.slice(0, need);
      while (arr.length < need) arr.push({ name: "", rfc: "", curp: "", ingreso_mensual: "", comprobantes: [], ine_fotos: [], es_extranjero: false, pasaporte: "", pasaporte_fotos: [], migratorio_fotos: [] });
      return { ...p, cohabitantes: arr };
    });
  }, [fiscal.adultos_18]); // eslint-disable-line

  const submitConsent = async () => {
    if (!accepted) { toast.error("Debes aceptar la autorización"); return; }
    setSavingConsent(true);
    try {
      await api.post("/consent/credit-check", { accepted: true, consent_text: consent?.text, consent_version: consent?.version });
      toast.success("Autorización registrada");
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSavingConsent(false); }
  };

  const setCohab = (idx, k, v) => setFiscal((p) => ({ ...p, cohabitantes: p.cohabitantes.map((c, i) => (i === idx ? { ...c, [k]: v } : c)) }));
  const toggleCohabExtranjero = (idx, v) => setFiscal((p) => ({ ...p, cohabitantes: p.cohabitantes.map((c, i) => (i === idx ? { ...c, es_extranjero: v, ...(v ? { rfc: "", curp: "" } : { pasaporte: "", pasaporte_fotos: [], migratorio_fotos: [] }) } : c)) }));
  const toggleExtranjero = (v) => setFiscal((p) => ({ ...p, es_extranjero: v, ...(v ? { rfc: "", curp: "", fiscal_regime: "" } : { pasaporte: "", pasaporte_fotos: [], migratorio_fotos: [] }) }));

  const deleteRegistro = async () => {
    try {
      await api.delete("/users/me/registro");
      setFiscal({
        phone: "", actividad_economica: "", curp: "", rfc: "", fiscal_regime: "", ingreso_mensual: "",
        comprobantes_ingresos: [], cohabitantes: [],
        adultos_18: "", menores_12_17: "", ninos_0_11: "", mascotas: "",
        es_extranjero: false, pasaporte: "", pasaporte_fotos: [], migratorio_fotos: [], phone_code: "+52",
      });
      setConsent((c) => (c ? { ...c, consent: null } : c));
      setAccepted(false);
      setSubmitted(false);
      reloadDocs();
      await refresh();
      toast.success("Registro eliminado. Puedes realizar un registro nuevo.");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const saveFiscal = async (submit = false) => {
    if (submit) {
      const invalid = fiscal.cohabitantes.some((c) => !(c.name || "").trim() || !(c.phone || "").trim() || (c.es_extranjero ? !(c.pasaporte || "").trim() : (!(c.rfc || "").trim() || !(c.curp || "").trim())));
      if (invalid) { toast.error("Cada habitante requiere nombre, teléfono y RFC/CURP (o pasaporte si es extranjero)"); return; }
      if (category === "arrendatario") {
        if (fiscal.es_extranjero) {
          if (!(fiscal.pasaporte || "").trim()) { toast.error("El pasaporte del solicitante es obligatorio"); return; }
        } else if (!(fiscal.rfc || "").trim() || !(fiscal.curp || "").trim()) {
          toast.error("El RFC y CURP del solicitante son obligatorios"); return;
        }
        if (!(fiscal.phone || "").trim()) { toast.error("El número de teléfono es obligatorio"); return; }
      }
    }
    setSavingFiscal(true);
    try {
      const payload = {
        ...fiscal,
        ingreso_mensual: parseInt(fiscal.ingreso_mensual || "0", 10) || 0,
        adultos_18: parseInt(fiscal.adultos_18 || "0", 10) || 0,
        menores_12_17: parseInt(fiscal.menores_12_17 || "0", 10) || 0,
        ninos_0_11: parseInt(fiscal.ninos_0_11 || "0", 10) || 0,
        cohabitantes: fiscal.cohabitantes.map((c) => ({
          name: c.name || "", rfc: c.rfc || "", curp: c.curp || "",
          ingreso_mensual: parseInt(c.ingreso_mensual || "0", 10) || 0,
          comprobantes: c.comprobantes || [],
          ine_fotos: c.ine_fotos || [],
          phone: c.phone || "", phone_code: c.phone_code || "+52", parentesco: c.parentesco || "",
          es_extranjero: !!c.es_extranjero, pasaporte: c.pasaporte || "",
          pasaporte_fotos: c.pasaporte_fotos || [], migratorio_fotos: c.migratorio_fotos || [],
        })),
      };
      await api.patch("/users/me/fiscal", payload);
      if (onPersistPersonal) { try { await onPersistPersonal(); } catch (e) { /* noop */ } }
      if (category === "arrendatario" && accepted && !consent?.consent?.accepted) {
        await api.post("/consent/credit-check", { accepted: true, consent_text: consent?.text, consent_version: consent?.version });
        api.get("/my/consent").then(({ data }) => setConsent(data)).catch(() => {});
      }
      if (submit) {
        await api.post("/users/me/registro/submit");
        setConfirmOpen(false);
        await refresh();
        setSubmitted(true);
        toast.success("Información enviada a validación");
      } else {
        toast.success("Información guardada. Puedes seguir editándola.");
      }
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSavingFiscal(false); }
  };

  if (!summary) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const items = (summary.items || []).map((it) => ({ ...it, category }));
  const hasConsent = consent?.consent?.accepted;
  const ingresoDisplay = fiscal.ingreso_mensual ? Number(fiscal.ingreso_mensual).toLocaleString("en-US") : "";
  const capacidadPago = Math.round((Number(fiscal.ingreso_mensual || 0) + (fiscal.cohabitantes || []).reduce((s, c) => s + Number(c.ingreso_mensual || 0), 0)) * 0.3);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">{category === "arrendatario" ? "Registro" : "Verificación"}</h1>
      <p className="text-stone-500 mt-1">Carga y da seguimiento a tus documentos como {category}.</p>

      {category === "arrendatario" && (
        <div className="mt-4 rounded-xl bg-navy/5 border border-navy/10 p-4 text-sm text-navy" data-testid="registro-info-header">
          Al llenar y enviar la siguiente información, esta pasará a revisión, te estaremos notificando tu status en tu perfil.
        </div>
      )}

      {category === "arrendatario" && user?.registro_stage && (
        <div className="mt-3 flex items-center gap-3 flex-wrap rounded-xl bg-white border border-stone-200 p-4" data-testid="registro-status-banner">
          <span className="text-sm font-medium text-navy">Estatus de tu registro:</span>
          <Badge className={`rounded-full ${PROPERTY_STATUS_COLOR[user.registro_stage] || "bg-stone-100 text-stone-600"}`} data-testid="registro-status-badge">
            {STATUS_LABEL[user.registro_stage] || user.registro_stage}
          </Badge>
          <span className="text-sm font-medium text-navy sm:ml-auto">Capacidad de pago:</span>
          <span className="font-display font-bold text-terracotta" data-testid="registro-capacidad-pago">${capacidadPago.toLocaleString("en-US")} MX</span>
        </div>
      )}

      {category === "arrendatario" && submitted && (
        <RegistroResumen user={user} fiscal={fiscal} consent={consent} items={items} onDelete={deleteRegistro} />
      )}

      {category === "arrendatario" && !submitted && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6" data-testid="tenant-registro-form">
          <h2 className="font-display font-semibold text-navy flex items-center gap-2 mb-4"><UserRound className="w-4 h-4 text-terracotta" /> Datos del solicitante</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label>Nombre del solicitante</Label>
              <Input data-testid="reg-nombre" value={user?.name || ""} disabled className="bg-stone-100 text-stone-700" />
            </div>
            <div>
              <Label>RFC {!fiscal.es_extranjero && <span className="text-red-500">*</span>}</Label>
              <Input data-testid="reg-rfc" disabled={fiscal.es_extranjero} maxLength={13} value={fiscal.rfc || ""} onChange={(e) => setFiscal({ ...fiscal, rfc: e.target.value.toUpperCase().slice(0, 13) })} placeholder="XAXX010101000" className={fiscal.es_extranjero ? "bg-stone-100 text-stone-400" : ""} />
            </div>
            <div>
              <Label>CURP {!fiscal.es_extranjero && <span className="text-red-500">*</span>}</Label>
              <Input data-testid="reg-curp" disabled={fiscal.es_extranjero} maxLength={18} value={fiscal.curp || ""} onChange={(e) => setFiscal({ ...fiscal, curp: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18) })} placeholder="18 caracteres" className={fiscal.es_extranjero ? "bg-stone-100 text-stone-400" : ""} />
              {!fiscal.es_extranjero && <p className="text-xs text-stone-400 mt-1">{(fiscal.curp || "").length}/18</p>}
            </div>
            <div>
              <Label>Teléfono <span className="text-red-500">*</span></Label>
              <div className="flex items-center gap-2">
                <Select value={fiscal.phone_code} onValueChange={(v) => setFiscal({ ...fiscal, phone_code: v })}>
                  <SelectTrigger data-testid="reg-phone-code" className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">{PHONE_CODES.map((c) => <SelectItem key={c.name} value={c.code}>{c.code} · {c.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input data-testid="reg-phone" type="tel" inputMode="numeric" maxLength={10} value={fiscal.phone} onChange={(e) => setFiscal({ ...fiscal, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="5555550000" className="flex-1" />
              </div>
            </div>
            <div>
              <Label>Régimen fiscal</Label>
              <Select value={fiscal.fiscal_regime} onValueChange={(v) => setFiscal({ ...fiscal, fiscal_regime: v })} disabled={fiscal.es_extranjero}>
                <SelectTrigger data-testid="reg-regime" className={fiscal.es_extranjero ? "bg-stone-100 text-stone-400" : ""}><SelectValue placeholder="Selecciona tu régimen fiscal" /></SelectTrigger>
                <SelectContent>{REGIMENES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Actividad económica</Label>
              <Input data-testid="reg-actividad" value={fiscal.actividad_economica} onChange={(e) => setFiscal({ ...fiscal, actividad_economica: e.target.value })} placeholder="Ej. Empleado, comerciante" />
            </div>
            <div>
              <Label>Ingreso mensual neto</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-medium pointer-events-none">$</span>
                  <Input data-testid="reg-ingreso" type="text" inputMode="numeric" value={ingresoDisplay} onChange={(e) => setFiscal({ ...fiscal, ingreso_mensual: e.target.value.replace(/\D/g, "") })} placeholder="20,000" className="pl-7" />
                </div>
                <span className="text-sm font-medium text-stone-500">MX</span>
              </div>
            </div>
            <div className="col-span-2 sm:col-span-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
              <div className="flex items-start gap-2">
                <Checkbox id="reg-extranjero" checked={fiscal.es_extranjero} onCheckedChange={(v) => toggleExtranjero(!!v)} data-testid="reg-extranjero-check" />
                <Label htmlFor="reg-extranjero" className="cursor-pointer text-sm leading-relaxed">En caso de extranjero (sin RFC/CURP). Al activarlo se anulan RFC, CURP y régimen fiscal.</Label>
              </div>
              {fiscal.es_extranjero && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="reg-extranjero-fields">
                  <div>
                    <Label># de pasaporte</Label>
                    <Input data-testid="reg-pasaporte" value={fiscal.pasaporte} onChange={(e) => setFiscal({ ...fiscal, pasaporte: e.target.value.toUpperCase() })} placeholder="Ej. G12345678" />
                  </div>
                  <div><IncomeProofs paths={fiscal.pasaporte_fotos} onChange={(v) => setFiscal({ ...fiscal, pasaporte_fotos: v })} testid="reg-pasaporte-fotos" label="Foto del pasaporte" buttonText="Subir foto del pasaporte" /></div>
                  <div><IncomeProofs paths={fiscal.migratorio_fotos} onChange={(v) => setFiscal({ ...fiscal, migratorio_fotos: v })} testid="reg-migratorio-fotos" label="Documento migratorio (permanencia en México)" buttonText="Subir documento migratorio" /></div>
                </div>
              )}
            </div>
            <div>
              <Label>Adultos (18+ años)</Label>
              <Select value={fiscal.adultos_18} onValueChange={(v) => setFiscal({ ...fiscal, adultos_18: v })}>
                <SelectTrigger data-testid="reg-adultos-18"><SelectValue placeholder="0" /></SelectTrigger>
                <SelectContent>{Array.from({ length: 11 }, (_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Menores (12 a 17 años)</Label>
              <Select value={fiscal.menores_12_17} onValueChange={(v) => setFiscal({ ...fiscal, menores_12_17: v })}>
                <SelectTrigger data-testid="reg-menores-12-17"><SelectValue placeholder="0" /></SelectTrigger>
                <SelectContent>{Array.from({ length: 11 }, (_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Niños (0 a 11 años)</Label>
              <Select value={fiscal.ninos_0_11} onValueChange={(v) => setFiscal({ ...fiscal, ninos_0_11: v })}>
                <SelectTrigger data-testid="reg-ninos-0-11"><SelectValue placeholder="0" /></SelectTrigger>
                <SelectContent>{Array.from({ length: 11 }, (_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Label>Mascotas (descríbelas si tienes)</Label>
              <Input data-testid="reg-mascotas" value={fiscal.mascotas} onChange={(e) => setFiscal({ ...fiscal, mascotas: e.target.value })} placeholder="Ej. 1 perro pequeño, 2 gatos" />
            </div>
          </div>

          {/* Personas que habitarán la propiedad */}
          {fiscal.cohabitantes.length > 0 && (
            <div className="mt-5 pt-5 border-t border-stone-100 space-y-4" data-testid="cohabitantes-list">
              <h3 className="font-display font-semibold text-navy flex items-center gap-2"><Users className="w-4 h-4 text-terracotta" /> Personas que habitarán la propiedad</h3>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2" data-testid="habitantes-nota">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span><strong>Importante:</strong> Los habitantes son los que se manifiestan en los contratos. Si tienen ingresos, te darán mayor rango de renta. Si no los tienen, manifiesta 0 en ingresos.</span>
              </div>
              {fiscal.cohabitantes.map((c, idx) => {
                const coDisp = c.ingreso_mensual ? Number(c.ingreso_mensual).toLocaleString("en-US") : "";
                return (
                  <div key={idx} className="border border-stone-200 rounded-xl p-4" data-testid={`cohabitante-form-${idx}`}>
                    <div className="mb-3">
                      <span className="text-sm font-medium text-stone-600">Habitante {idx + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="col-span-2 sm:col-span-1"><Label>Nombre completo <span className="text-red-500">*</span></Label><Input data-testid={`co-nombre-${idx}`} value={c.name} onChange={(e) => setCohab(idx, "name", e.target.value)} placeholder="Nombre" /></div>
                      <div><Label>RFC {!c.es_extranjero && <span className="text-red-500">*</span>}</Label><Input data-testid={`co-rfc-${idx}`} disabled={c.es_extranjero} maxLength={13} value={c.rfc} onChange={(e) => setCohab(idx, "rfc", e.target.value.toUpperCase().slice(0, 13))} placeholder="XAXX010101000" className={c.es_extranjero ? "bg-stone-100 text-stone-400" : ""} /></div>
                      <div><Label>CURP {!c.es_extranjero && <span className="text-red-500">*</span>}</Label><Input data-testid={`co-curp-${idx}`} disabled={c.es_extranjero} maxLength={18} value={c.curp} onChange={(e) => setCohab(idx, "curp", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18))} placeholder="18 caracteres" className={c.es_extranjero ? "bg-stone-100 text-stone-400" : ""} /></div>
                      <div>
                        <Label>Teléfono <span className="text-red-500">*</span></Label>
                        <div className="flex items-center gap-2">
                          <Select value={c.phone_code || "+52"} onValueChange={(v) => setCohab(idx, "phone_code", v)}>
                            <SelectTrigger data-testid={`co-phone-code-${idx}`} className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-64">{PHONE_CODES.map((p) => <SelectItem key={p.name} value={p.code}>{p.code} · {p.name}</SelectItem>)}</SelectContent>
                          </Select>
                          <Input data-testid={`co-phone-${idx}`} type="tel" inputMode="numeric" maxLength={10} value={c.phone || ""} onChange={(e) => setCohab(idx, "phone", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="5555550000" className="flex-1" />
                        </div>
                      </div>
                      <div>
                        <Label>Parentesco con el contratante principal</Label>
                        <Select value={c.parentesco || ""} onValueChange={(v) => setCohab(idx, "parentesco", v)}>
                          <SelectTrigger data-testid={`co-parentesco-${idx}`}><SelectValue placeholder="Selecciona" /></SelectTrigger>
                          <SelectContent>{PARENTESCOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Ingreso mensual neto</Label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-medium pointer-events-none">$</span>
                            <Input data-testid={`co-ingreso-${idx}`} type="text" inputMode="numeric" value={coDisp} onChange={(e) => setCohab(idx, "ingreso_mensual", e.target.value.replace(/\D/g, ""))} placeholder="20,000" className="pl-7" />
                          </div>
                          <span className="text-sm font-medium text-stone-500">MX</span>
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-3"><IncomeProofs paths={c.comprobantes} onChange={(v) => setCohab(idx, "comprobantes", v)} testid={`co-comprobantes-${idx}`} /></div>
                      <div className="col-span-2 sm:col-span-3"><IncomeProofs paths={c.ine_fotos} onChange={(v) => setCohab(idx, "ine_fotos", v)} testid={`co-ine-${idx}`} label="Fotografía de INE (frente y reverso)" buttonText="Subir fotografía de INE" /></div>
                      <div className="col-span-2 sm:col-span-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                        <div className="flex items-start gap-2">
                          <Checkbox id={`co-extranjero-${idx}`} checked={c.es_extranjero} onCheckedChange={(v) => toggleCohabExtranjero(idx, !!v)} data-testid={`co-extranjero-check-${idx}`} />
                          <Label htmlFor={`co-extranjero-${idx}`} className="cursor-pointer text-sm leading-relaxed">En caso de extranjero (sin RFC/CURP). Al activarlo se anulan RFC y CURP.</Label>
                        </div>
                        {c.es_extranjero && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid={`co-extranjero-fields-${idx}`}>
                            <div><Label># de pasaporte</Label><Input data-testid={`co-pasaporte-${idx}`} value={c.pasaporte} onChange={(e) => setCohab(idx, "pasaporte", e.target.value.toUpperCase())} placeholder="Ej. G12345678" /></div>
                            <div><IncomeProofs paths={c.pasaporte_fotos} onChange={(v) => setCohab(idx, "pasaporte_fotos", v)} testid={`co-pasaporte-fotos-${idx}`} label="Foto del pasaporte" buttonText="Subir foto del pasaporte" /></div>
                            <div><IncomeProofs paths={c.migratorio_fotos} onChange={(v) => setCohab(idx, "migratorio_fotos", v)} testid={`co-migratorio-fotos-${idx}`} label="Documento migratorio" buttonText="Subir documento migratorio" /></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {summary.total_required > 0 && (
        <div className={`mt-6 rounded-xl p-4 flex items-center gap-3 ${summary.verified ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`} data-testid="verification-status">
          {summary.verified ? <ShieldCheck className="w-5 h-5" /> : <FileCheck2 className="w-5 h-5" />}
          <span className="text-sm font-medium">{summary.verified ? "¡Verificación completa!" : `Verificación en progreso: ${summary.approved_required}/${summary.total_required} documentos obligatorios aprobados`}</span>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2" data-testid={`alert-${i}`}>
              <AlertTriangle className="w-4 h-4" /> {a.message}
            </div>
          ))}
        </div>
      )}

      {category === "arrendatario" && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="font-display font-semibold text-navy flex items-center gap-2 mb-1"><ShieldCheck className="w-4 h-4 text-terracotta" /> Autorización de consulta de historial crediticio</h2>
          {hasConsent ? (
            <div className="mt-3 flex items-start gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3" data-testid="consent-granted">
              <CheckCircle2 className="w-4 h-4 mt-0.5" />
              <div>Autorización registrada el {formatDate(consent.consent.timestamp)} a las {consent.consent.time} · IP {consent.consent.ip_address} · versión {consent.consent.consent_version}</div>
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-600 mt-2 leading-relaxed bg-stone-50 rounded-lg p-3">{consent?.text}</p>
              <div className="flex items-start gap-2 mt-4">
                <Checkbox id="consent" checked={accepted} onCheckedChange={(v) => setAccepted(!!v)} data-testid="consent-checkbox" />
                <Label htmlFor="consent" className="cursor-pointer text-sm leading-relaxed">Acepto y autorizo expresamente la consulta de mi historial crediticio (versión {consent?.version}).</Label>
              </div>
            </>
          )}
        </div>
      )}

      {!submitted && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="font-display font-semibold text-navy mb-2">Documentos del contratante principal</h2>
          {items.map((it) => <DocRow key={it.key} item={it} onUploaded={reloadDocs} />)}
        </div>
      )}

      {category === "arrendatario" && !submitted && (
        <div className="mt-6 flex flex-wrap justify-end gap-3" data-testid="registro-actions">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={() => saveFiscal(false)} disabled={savingFiscal} className="rounded-full px-8" data-testid="save-draft-btn">
                  <Save className="w-4 h-4 mr-1" /> Guardar
                </Button>
              </TooltipTrigger>
              <TooltipContent data-testid="save-draft-tooltip">Guarda y puedes agregar o modificar.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button disabled={savingFiscal} className="rounded-full bg-terracotta hover:bg-terracotta-hover px-8" data-testid="submit-registro-btn">
                {savingFiscal ? <Loader2 className="w-4 h-4 animate-spin" /> : (<><Send className="w-4 h-4 mr-1" /> Enviar información</>)}
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
                <AlertDialogAction onClick={() => saveFiscal(true)} className="bg-terracotta hover:bg-terracotta-hover" data-testid="submit-accept-btn">Aceptar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {category === "arrendador" && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="font-display font-semibold text-navy flex items-center gap-2 mb-1"><Landmark className="w-4 h-4 text-terracotta" /> Información bancaria</h2>
          <p className="text-sm text-stone-500 mb-4">La cuenta bancaria se usará para recibir los pagos de renta.</p>
          {submitted && (
            <div className="mb-4 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-start gap-2" data-testid="arrendador-enviado">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> Tu información fue enviada al administrador para validación. Ya no puedes modificarla.
            </div>
          )}
          <fieldset disabled={submitted} className="grid grid-cols-1 sm:grid-cols-2 gap-4 disabled:opacity-70">
            <div><Label>Banco</Label><Input data-testid="fiscal-bank" value={fiscal.bank_name || ""} onChange={(e) => setFiscal({ ...fiscal, bank_name: e.target.value })} /></div>
            <div><Label>Titular de la cuenta</Label><Input data-testid="fiscal-holder" value={fiscal.account_holder || ""} onChange={(e) => setFiscal({ ...fiscal, account_holder: e.target.value })} /></div>
            <div><Label>Número de cuenta bancaria</Label><Input data-testid="fiscal-account-number" inputMode="numeric" value={fiscal.account_number || ""} onChange={(e) => setFiscal({ ...fiscal, account_number: e.target.value.replace(/\D/g, "") })} placeholder="Número de cuenta" /></div>
            <div className="sm:col-span-2"><Label>CLABE interbancaria</Label><Input data-testid="fiscal-clabe" value={fiscal.clabe || ""} onChange={(e) => setFiscal({ ...fiscal, clabe: e.target.value })} placeholder="18 dígitos" /></div>
          </fieldset>
          {!submitted && (
            <div className="mt-5 flex flex-wrap justify-end gap-3" data-testid="arrendador-actions">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => saveFiscal(false)} disabled={savingFiscal} className="rounded-full px-8" data-testid="save-fiscal-btn">
                      <Save className="w-4 h-4 mr-1" /> Guardar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Guarda y puedes modificar antes de enviar.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button disabled={savingFiscal} className="rounded-full bg-terracotta hover:bg-terracotta-hover px-8" data-testid="submit-arrendador-btn">
                    {savingFiscal ? <Loader2 className="w-4 h-4 animate-spin" /> : (<><Send className="w-4 h-4 mr-1" /> Enviar información</>)}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent data-testid="submit-arrendador-dialog">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Información importante para tu validación</AlertDialogTitle>
                    <AlertDialogDescription>
                      Al enviar, tu información pasará al administrador para validación y <strong>ya no podrás modificar los datos</strong>. ¿Estás seguro de enviar?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="submit-arrendador-cancel">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => saveFiscal(true)} className="bg-terracotta hover:bg-terracotta-hover" data-testid="submit-arrendador-accept">Aceptar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
