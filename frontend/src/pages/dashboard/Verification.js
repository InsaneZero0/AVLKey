import React, { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import api, { apiError, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Upload, FileCheck2, Eye, AlertTriangle, ShieldCheck, CheckCircle2,
  CreditCard, Landmark, FileText, UserRound, Users, X, Camera, Plus,
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

// Subida de comprobantes de ingresos (fotos/PDF) a almacenamiento privado
function IncomeProofs({ paths, onChange, testid }) {
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
      <Label>Comprobantes de ingresos</Label>
      <input ref={inputRef} type="file" accept="image/*,.pdf" multiple hidden onChange={handle} data-testid={`${testid}-input`} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="mt-1 w-full flex items-center gap-3 border-2 border-dashed border-stone-300 rounded-xl px-4 py-3 hover:border-terracotta transition-colors" data-testid={testid}>
        <div className="w-9 h-9 rounded-lg bg-terracotta/10 flex items-center justify-center">
          {busy ? <Loader2 className="w-4 h-4 text-terracotta animate-spin" /> : <Camera className="w-4 h-4 text-terracotta" />}
        </div>
        <span className="text-sm text-stone-600">{busy ? "Subiendo..." : "Subir fotos de comprobantes de ingresos"}</span>
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

export default function Verification() {
  const { user } = useAuth();
  const category = user?.role === "arrendador" ? "arrendador" : "arrendatario";
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
  });

  const load = () => {
    api.get(`/my/documents?category=${category}`).then(({ data }) => setSummary(data)).catch(() => setSummary({ items: [] }));
    api.get("/my/alerts").then(({ data }) => setAlerts(data)).catch(() => {});
    if (category === "arrendatario") api.get("/my/consent").then(({ data }) => setConsent(data)).catch(() => {});
    api.get("/my/fiscal").then(({ data }) => setFiscal((p) => ({
      ...p, ...data,
      phone: data.phone || user?.phone || "",
      ingreso_mensual: data.ingreso_mensual != null ? String(data.ingreso_mensual) : "",
      comprobantes_ingresos: data.comprobantes_ingresos || [],
      adultos_18: data.adultos_18 != null ? String(data.adultos_18) : "",
      menores_12_17: data.menores_12_17 != null ? String(data.menores_12_17) : "",
      ninos_0_11: data.ninos_0_11 != null ? String(data.ninos_0_11) : "",
      mascotas: data.mascotas || "",
      cohabitantes: (data.cohabitantes || []).map((c) => ({
        name: c.name || "", rfc: c.rfc || "", curp: c.curp || "",
        ingreso_mensual: c.ingreso_mensual != null ? String(c.ingreso_mensual) : "",
        comprobantes: c.comprobantes || [],
      })),
    }))).catch(() => {});
  };
  useEffect(() => { load(); }, [category]); // eslint-disable-line

  // Ajusta el número de habitantes según adultos 18+ declarados (excluye al solicitante)
  useEffect(() => {
    const need = Math.max(0, (parseInt(fiscal.adultos_18 || "0", 10) || 0) - 1);
    setFiscal((p) => {
      if (p.cohabitantes.length === need) return p;
      const arr = p.cohabitantes.slice(0, need);
      while (arr.length < need) arr.push({ name: "", rfc: "", curp: "", ingreso_mensual: "", comprobantes: [] });
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

  const saveFiscal = async () => {
    const invalid = fiscal.cohabitantes.some((c) => !(c.name || "").trim() || !(c.rfc || "").trim() || !(c.curp || "").trim());
    if (invalid) { toast.error("Completa nombre, RFC y CURP de cada habitante"); return; }
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
        })),
      };
      await api.patch("/users/me/fiscal", payload);
      toast.success("Información enviada a revisión");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSavingFiscal(false); }
  };

  if (!summary) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const items = (summary.items || []).map((it) => ({ ...it, category }));
  const hasConsent = consent?.consent?.accepted;
  const ingresoDisplay = fiscal.ingreso_mensual ? Number(fiscal.ingreso_mensual).toLocaleString("en-US") : "";

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">{category === "arrendatario" ? "Registro" : "Verificación"}</h1>
      <p className="text-stone-500 mt-1">Carga y da seguimiento a tus documentos como {category}.</p>

      {category === "arrendatario" && (
        <div className="mt-4 rounded-xl bg-navy/5 border border-navy/10 p-4 text-sm text-navy" data-testid="registro-info-header">
          Al llenar y enviar la siguiente información, esta pasará a revisión, te estaremos notificando tu status en tu perfil.
        </div>
      )}

      {category === "arrendatario" && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6" data-testid="tenant-registro-form">
          <h2 className="font-display font-semibold text-navy flex items-center gap-2 mb-4"><UserRound className="w-4 h-4 text-terracotta" /> Datos del solicitante</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label>Nombre del solicitante</Label>
              <Input data-testid="reg-nombre" value={user?.name || ""} disabled className="bg-stone-100 text-stone-700" />
            </div>
            <div>
              <Label>RFC</Label>
              <Input data-testid="reg-rfc" value={fiscal.rfc || ""} onChange={(e) => setFiscal({ ...fiscal, rfc: e.target.value.toUpperCase() })} placeholder="XAXX010101000" />
            </div>
            <div>
              <Label>CURP</Label>
              <Input data-testid="reg-curp" maxLength={18} value={fiscal.curp || ""} onChange={(e) => setFiscal({ ...fiscal, curp: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18) })} placeholder="18 caracteres" />
              <p className="text-xs text-stone-400 mt-1">{(fiscal.curp || "").length}/18</p>
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input data-testid="reg-phone" type="tel" inputMode="tel" value={fiscal.phone} onChange={(e) => setFiscal({ ...fiscal, phone: e.target.value })} placeholder="5555550000" />
            </div>
            <div>
              <Label>Régimen fiscal</Label>
              <Select value={fiscal.fiscal_regime} onValueChange={(v) => setFiscal({ ...fiscal, fiscal_regime: v })}>
                <SelectTrigger data-testid="reg-regime"><SelectValue placeholder="Selecciona tu régimen fiscal" /></SelectTrigger>
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
            <div className="col-span-2 sm:col-span-3">
              <IncomeProofs paths={fiscal.comprobantes_ingresos} onChange={(v) => setFiscal({ ...fiscal, comprobantes_ingresos: v })} testid="reg-comprobantes" />
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
                      <div><Label>RFC <span className="text-red-500">*</span></Label><Input data-testid={`co-rfc-${idx}`} value={c.rfc} onChange={(e) => setCohab(idx, "rfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" /></div>
                      <div><Label>CURP <span className="text-red-500">*</span></Label><Input data-testid={`co-curp-${idx}`} maxLength={18} value={c.curp} onChange={(e) => setCohab(idx, "curp", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18))} placeholder="18 caracteres" /></div>
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={saveFiscal} disabled={savingFiscal} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="save-registro-btn">
              {savingFiscal ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar información"}
            </Button>
          </div>
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

      <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6">
        <h2 className="font-display font-semibold text-navy mb-2">Documentos</h2>
        {items.map((it) => <DocRow key={it.key} item={it} onUploaded={load} />)}
      </div>

      {category === "arrendador" && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="font-display font-semibold text-navy flex items-center gap-2 mb-1"><Landmark className="w-4 h-4 text-terracotta" /> Información fiscal y bancaria</h2>
          <p className="text-sm text-stone-500 mb-4">La cuenta bancaria se usará para recibir los pagos de renta.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>RFC</Label><Input data-testid="fiscal-rfc" value={fiscal.rfc || ""} onChange={(e) => setFiscal({ ...fiscal, rfc: e.target.value })} /></div>
            <div><Label>Régimen fiscal</Label><Input data-testid="fiscal-regime" value={fiscal.fiscal_regime || ""} onChange={(e) => setFiscal({ ...fiscal, fiscal_regime: e.target.value })} /></div>
            <div><Label>Banco</Label><Input data-testid="fiscal-bank" value={fiscal.bank_name || ""} onChange={(e) => setFiscal({ ...fiscal, bank_name: e.target.value })} /></div>
            <div><Label>Titular de la cuenta</Label><Input data-testid="fiscal-holder" value={fiscal.account_holder || ""} onChange={(e) => setFiscal({ ...fiscal, account_holder: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>CLABE interbancaria</Label><Input data-testid="fiscal-clabe" value={fiscal.clabe || ""} onChange={(e) => setFiscal({ ...fiscal, clabe: e.target.value })} placeholder="18 dígitos" /></div>
          </div>
          <Button onClick={saveFiscal} className="mt-4 rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="save-fiscal-btn">Guardar</Button>
        </div>
      )}

      {category === "arrendatario" && (
        <>
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
                <Button onClick={submitConsent} disabled={savingConsent} className="mt-4 rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="submit-consent-btn">
                  {savingConsent ? <Loader2 className="w-4 h-4 animate-spin" /> : "Autorizar consulta"}
                </Button>
              </>
            )}
          </div>
          <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-6 flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-terracotta mt-0.5" />
            <div>
              <h2 className="font-display font-semibold text-navy">Tarjeta de pago</h2>
              <p className="text-sm text-stone-500 mt-1">Registrarás una tarjeta válida de forma segura con Stripe al realizar tu primer pago desde la sección de Contratos. No almacenamos los datos de tu tarjeta.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
