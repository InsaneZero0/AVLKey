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
import {
  Loader2, Upload, FileCheck2, Eye, AlertTriangle, ShieldCheck, CheckCircle2,
  CreditCard, Landmark, FileText,
} from "lucide-react";

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
      await api.post("/documents/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
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
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.open(`${API}/documents/${doc.id}/download`, "_blank")} data-testid={`view-doc-${item.key}`}>
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

export default function Verification() {
  const { user } = useAuth();
  const category = user?.role === "arrendador" ? "arrendador" : "arrendatario";
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [consent, setConsent] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [fiscal, setFiscal] = useState({ rfc: "", fiscal_regime: "", bank_name: "", account_holder: "", clabe: "" });

  const load = () => {
    api.get(`/my/documents?category=${category}`).then(({ data }) => setSummary(data)).catch(() => setSummary({ items: [] }));
    api.get("/my/alerts").then(({ data }) => setAlerts(data)).catch(() => {});
    if (category === "arrendatario") api.get("/my/consent").then(({ data }) => setConsent(data)).catch(() => {});
    if (category === "arrendador") api.get("/my/fiscal").then(({ data }) => setFiscal((p) => ({ ...p, ...data }))).catch(() => {});
  };
  useEffect(() => { load(); }, [category]); // eslint-disable-line

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

  const saveFiscal = async () => {
    try {
      await api.patch("/users/me/fiscal", fiscal);
      toast.success("Información fiscal y bancaria guardada");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  if (!summary) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const items = (summary.items || []).map((it) => ({ ...it, category }));
  const hasConsent = consent?.consent?.accepted;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Verificación</h1>
      <p className="text-stone-500 mt-1">Carga y da seguimiento a tus documentos como {category}.</p>

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
