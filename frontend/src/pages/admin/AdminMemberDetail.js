import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { API, apiError } from "@/lib/api";
import {
  TYPE_LABEL, STATUS_LABEL, PROPERTY_STATUS_COLOR, REVIEW_STAGE_OPTIONS,
  formatMXN, formatDate,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Loader2, ArrowLeft, Mail, Phone, Building2, User, FileText, Eye, Download,
  MapPin, BadgeCheck, ShieldAlert, CreditCard, ClipboardCheck, MessageSquare,
} from "lucide-react";

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 py-2">
    <Icon className="w-4 h-4 text-stone-400" />
    <span className="text-sm text-stone-500 w-40">{label}</span>
    <span className="text-sm font-medium text-navy">{value || "—"}</span>
  </div>
);

const docStatusMap = {
  pendiente: { label: "En revisión", cls: "bg-amber-100 text-amber-700" },
  aprobado: { label: "Aprobado", cls: "bg-green-100 text-green-700" },
  rechazado: { label: "Rechazado", cls: "bg-red-100 text-red-700" },
  correccion: { label: "Corrección solicitada", cls: "bg-blue-100 text-blue-700" },
};

const STAGE_FROM_DISPLAY = {
  recibida: "recibido", recibido: "recibido", en_revision: "en_revision",
  doc_faltante: "doc_faltante", aprobado: "aprobado", publicada: "publicado",
  publicado: "publicado", rentada: "publicado", pausada: "aprobado",
  rechazada: "rechazado", rechazado: "rechazado",
};

function DocRow({ item }) {
  const doc = item.document;
  const st = doc ? docStatusMap[doc.status] : null;

  const download = async () => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.original_filename || "documento";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo descargar el documento");
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-stone-100 last:border-0" data-testid={`admin-doc-row-${item.key}`}>
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
          <>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.open(`${API}/documents/${doc.id}/download`, "_blank")} data-testid={`admin-view-doc-${item.key}`}>
              <Eye className="w-4 h-4 mr-1" /> Ver
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={download} data-testid={`admin-download-doc-${item.key}`}>
              <Download className="w-4 h-4 mr-1" /> Descargar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminMemberDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    api.get(`/admin/members/${userId}`)
      .then(({ data }) => { setData(data); setNote(data.user?.admin_note || ""); })
      .catch(() => setNotFound(true));
  }, [userId]);

  const setStage = async (propId, stage) => {
    setSavingId(propId);
    try {
      await api.patch(`/admin/properties/${propId}/stage`, { stage });
      setData((prev) => ({
        ...prev,
        properties: prev.properties.map((p) => (p.id === propId ? { ...p, review_stage: stage, display_status: stage } : p)),
      }));
      toast.success(stage === "publicado"
        ? "Inmueble publicado. Ya es visible en el buscador."
        : "Estado de validación actualizado. Se notificó al arrendador.");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSavingId(null);
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    try {
      await api.patch(`/admin/members/${userId}/note`, { note });
      toast.success("Observación guardada. Se notificó al arrendador.");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSavingNote(false);
    }
  };

  if (notFound) return <div className="text-center py-20 text-stone-500">Usuario no encontrado.</div>;
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const { user, properties, documents_summary, can_view_documents, fiscal_info, consent } = data;
  const isLandlord = user.role === "arrendador";
  const docItems = documents_summary?.items || [];

  return (
    <div className="space-y-8" data-testid="admin-member-detail">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-stone-500 hover:text-navy" data-testid="member-back">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-terracotta/10 flex items-center justify-center">
          {isLandlord ? <Building2 className="w-6 h-6 text-terracotta" /> : <User className="w-6 h-6 text-terracotta" />}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-bold text-3xl text-navy tracking-tight">{user.name}</h1>
            <Badge className="rounded-full bg-navy/10 text-navy hover:bg-navy/10 font-mono">{user.public_id || "—"}</Badge>
          </div>
          <p className="text-stone-500 mt-1">{isLandlord ? "Arrendador" : "Arrendatario"}</p>
        </div>
      </div>

      {/* Info + fiscal */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="font-display font-semibold text-navy mb-3">Información personal</h2>
          <Row icon={Mail} label="Correo" value={user.email} />
          <Row icon={Phone} label="Teléfono" value={user.phone} />
          <Row icon={User} label="Registrado" value={formatDate(user.created_at)} />
          <Row icon={BadgeCheck} label="Autenticación" value={user.auth_provider === "google" ? "Google" : "Correo/contraseña"} />
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="font-display font-semibold text-navy mb-3">Información fiscal y bancaria</h2>
          <Row icon={FileText} label="RFC" value={fiscal_info?.rfc} />
          <Row icon={FileText} label="Régimen fiscal" value={fiscal_info?.fiscal_regime} />
          <Row icon={CreditCard} label="Banco" value={fiscal_info?.bank_name} />
          <Row icon={CreditCard} label="Titular" value={fiscal_info?.account_holder} />
          <Row icon={CreditCard} label="CLABE" value={fiscal_info?.clabe} />
        </div>
      </div>

      {/* Consent (tenant) */}
      {!isLandlord && (
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2"><ShieldAlert className="w-5 h-5 text-navy" /><h2 className="font-display font-semibold text-navy">Consentimiento de historial crediticio</h2></div>
          {consent ? (
            <div className="text-sm text-stone-600 space-y-1">
              <div><span className="text-stone-400">Fecha:</span> {formatDate(consent.timestamp)} · <span className="text-stone-400">IP:</span> {consent.ip || "—"} · <span className="text-stone-400">Versión:</span> {consent.consent_version || "—"}</div>
              <p className="text-stone-500 italic">"{consent.consent_text}"</p>
            </div>
          ) : <p className="text-sm text-stone-400">Sin consentimiento registrado.</p>}
        </div>
      )}

      {/* Documents — mismo formato que Verificación (solo ver/descargar) */}
      <div>
        <h2 className="font-display font-semibold text-navy mb-3 flex items-center gap-2"><FileText className="w-5 h-5" /> Documentos enviados</h2>
        {!can_view_documents ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-6 text-sm text-stone-400">No tienes permiso para ver documentos sensibles.</div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl p-6">
            {documents_summary?.total_required > 0 && (
              <div className={`mb-4 rounded-xl p-3 text-sm font-medium ${documents_summary.verified ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`} data-testid="admin-verification-status">
                {documents_summary.verified ? "Verificación completa" : `Verificación en progreso: ${documents_summary.approved_required}/${documents_summary.total_required} documentos obligatorios aprobados`}
              </div>
            )}
            {docItems.map((it) => <DocRow key={it.key} item={it} />)}

            {/* Observación del administrador (máx. 50 caracteres) */}
            <div className="mt-5 pt-5 border-t border-stone-100">
              <label className="font-medium text-navy flex items-center gap-2 mb-1"><MessageSquare className="w-4 h-4 text-terracotta" /> Observaciones</label>
              <p className="text-xs text-stone-500 mb-2">Este comentario se mostrará al arrendador dentro del apartado de su propiedad.</p>
              <Textarea
                data-testid="member-note-textarea"
                value={note}
                maxLength={50}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Falta comprobante de domicilio vigente"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-stone-400">{note.length}/50</span>
                <Button size="sm" className="rounded-full bg-terracotta hover:bg-terracotta-hover" disabled={savingNote} onClick={saveNote} data-testid="save-member-note-btn">
                  {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar observación"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Properties (landlord) — revisión y validación bajo cada propiedad */}
      {isLandlord && (
        <div>
          <h2 className="font-display font-semibold text-navy mb-1 flex items-center gap-2"><Building2 className="w-5 h-5" /> Propiedades registradas ({properties.length})</h2>
          <p className="text-sm text-stone-500 mb-4">La propiedad solo se publica en el buscador cuando el estado <strong>Publicado</strong> está seleccionado.</p>
          {properties.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 text-sm text-stone-400" data-testid="member-no-props">Sin propiedades registradas.</div>
          ) : (
            <div className="space-y-4">
              {properties.map((p) => {
                const current = p.review_stage || STAGE_FROM_DISPLAY[p.display_status] || "recibido";
                return (
                  <div key={p.id} className="bg-white border border-stone-200 rounded-2xl p-4" data-testid={`member-prop-${p.id}`}>
                    <div className="flex gap-4 items-center">
                      <img src={p.images?.[0]} alt={p.title} className="w-24 h-20 object-cover rounded-xl bg-stone-100" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="rounded-full bg-terracotta/10 text-terracotta hover:bg-terracotta/10">{TYPE_LABEL[p.property_type]}</Badge>
                          <Badge className={`rounded-full ${PROPERTY_STATUS_COLOR[p.display_status] || "bg-stone-100 text-stone-600"}`} data-testid={`member-prop-status-${p.id}`}>{STATUS_LABEL[p.display_status]}</Badge>
                        </div>
                        <h3 className="font-display font-semibold text-navy mt-1.5 truncate">{p.title}</h3>
                        {p.public_id && <div className="text-xs font-mono font-bold text-red-600" data-testid={`admin-prop-folio-${p.id}`}>ID: {p.public_id}</div>}
                        <div className="flex items-center gap-1.5 text-stone-500 text-sm"><MapPin className="w-3.5 h-3.5" />{p.city} · {p.applications_count} solicitud(es)</div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="font-display font-bold text-lg text-terracotta">{formatMXN(p.price_month)}<span className="text-xs text-stone-400 font-normal">/mes</span></div>
                        <Button variant="outline" size="sm" className="rounded-full mt-1" onClick={() => navigate(`/inmueble/${p.id}`)}>Ver</Button>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-stone-100" data-testid={`validation-card-${p.id}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-navy flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-terracotta" /> Revisión y validación</span>
                        {savingId === p.id && <Loader2 className="w-4 h-4 animate-spin text-terracotta" />}
                      </div>
                      <RadioGroup
                        value={current}
                        onValueChange={(v) => setStage(p.id, v)}
                        className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                        data-testid={`stage-radiogroup-${p.id}`}
                      >
                        {REVIEW_STAGE_OPTIONS.map((opt) => (
                          <label
                            key={opt.value}
                            htmlFor={`${p.id}-${opt.value}`}
                            className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${current === opt.value ? "border-terracotta bg-terracotta/5 ring-1 ring-terracotta" : "border-stone-200 hover:border-stone-300"}`}
                          >
                            <RadioGroupItem value={opt.value} id={`${p.id}-${opt.value}`} data-testid={`stage-${p.id}-${opt.value}`} />
                            <span className="text-sm font-medium text-navy">{opt.label}</span>
                          </label>
                        ))}
                      </RadioGroup>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
