import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { API, apiError } from "@/lib/api";
import {
  TYPE_LABEL, STATUS_LABEL, PROPERTY_STATUS_COLOR, REVIEW_STAGE_OPTIONS, REGISTRO_STAGE_OPTIONS,
  formatMXN, formatDate,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Loader2, ArrowLeft, Mail, Phone, Building2, User, FileText, Eye, Download,
  MapPin, BadgeCheck, ShieldAlert, CreditCard, ClipboardCheck, MessageSquare,
  Users, Globe, PawPrint, Bed, Bath, Car, Maximize, Sofa, Briefcase,
  Activity, ChevronDown, ChevronUp, Inbox, CalendarClock, Check, X, Clock,
} from "lucide-react";

const ACT_STYLE = {
  solicitud: { icon: Inbox, color: "text-blue-600 bg-blue-50" },
  solicitud_estado: { icon: Check, color: "text-green-600 bg-green-50" },
  visita: { icon: CalendarClock, color: "text-terracotta bg-terracotta/10" },
};
const ACT_STATUS_COLOR = {
  aprobada: "text-green-600 bg-green-50", confirmada: "text-green-600 bg-green-50",
  rechazada: "text-red-600 bg-red-50", cancelada: "text-red-600 bg-red-50", no_asistio: "text-red-600 bg-red-50",
  en_revision: "text-blue-600 bg-blue-50", reprogramada: "text-amber-600 bg-amber-50",
};

function PropertyActivity({ propertyId }) {
  const [events, setEvents] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && events === null) {
      api.get(`/admin/properties/${propertyId}/activity`)
        .then(({ data }) => setEvents(data.events || []))
        .catch(() => setEvents([]));
    }
  }, [open, events, propertyId]);
  return (
    <div className="mt-4 pt-4 border-t border-stone-100" data-testid={`prop-activity-${propertyId}`}>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-sm font-medium text-navy" data-testid={`prop-activity-toggle-${propertyId}`}>
        <span className="flex items-center gap-2"><Activity className="w-4 h-4 text-terracotta" /> Reporte de actividad</span>
        {open ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
      </button>
      {open && (
        events === null ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-terracotta" /></div>
        ) : events.length === 0 ? (
          <p className="text-sm text-stone-400 mt-3">Sin actividad todavía.</p>
        ) : (
          <ol className="mt-4 space-y-4" data-testid={`prop-activity-list-${propertyId}`}>
            {events.map((e, i) => {
              const style = ACT_STYLE[e.kind] || ACT_STYLE.solicitud;
              const Icon = style.icon;
              const badge = ACT_STATUS_COLOR[e.status];
              return (
                <li key={i} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${badge || style.color}`}><Icon className="w-4 h-4" /></div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-navy">{e.title}</div>
                    <div className="text-sm text-stone-600">{e.detail}</div>
                    <div className="text-xs text-stone-400 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> {formatDate(e.at)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )
      )}
    </div>
  );
}

const ActividadBlock = ({ title, a }) => {
  const empty = !a || !(a.actividad || a.descripcion || a.empresa || a.jefe || a.fecha_inicio || a.fecha_fin);
  return (
    <div className="mt-4 pt-4 border-t border-stone-100 first:mt-0 first:pt-0 first:border-t-0">
      <h3 className="font-semibold text-navy mb-2">{title}</h3>
      {empty ? <p className="text-sm text-stone-400">Sin información.</p> : (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-stone-700">
          <div><span className="text-stone-400">Actividad:</span> {a.actividad || "—"}</div>
          <div><span className="text-stone-400">Descripción:</span> {a.descripcion || "—"}</div>
          <div><span className="text-stone-400">Fecha de inicio:</span> {a.fecha_inicio || "—"}</div>
          <div><span className="text-stone-400">Fecha de fin:</span> {a.fecha_fin || "—"}</div>
          <div><span className="text-stone-400">Empresa / Razón social:</span> {a.empresa || "—"}</div>
          <div><span className="text-stone-400">Jefe inmediato:</span> {a.jefe || "—"}</div>
        </div>
      )}
    </div>
  );
};

const PrivatePhotos = ({ paths, label }) => {
  if (!paths || paths.length === 0) return null;
  return (
    <div className="mt-2">
      {label && <div className="text-xs text-stone-500 mb-1">{label}</div>}
      <div className="flex flex-wrap gap-2">
        {paths.map((p) => (
          <a key={p} href={`${API}/uploads/private/${p}`} target="_blank" rel="noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
            <img src={`${API}/uploads/private/${p}`} alt="doc" className="w-full h-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
};

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
  const [regStage, setRegStage] = useState("recibido");
  const [savingRegStage, setSavingRegStage] = useState(false);

  useEffect(() => {
    api.get(`/admin/members/${userId}`)
      .then(({ data }) => { setData(data); setNote(data.user?.admin_note || ""); setRegStage(data.user?.registro_stage || "recibido"); })
      .catch(() => setNotFound(true));
  }, [userId]);

  useEffect(() => {
    if (data && window.location.hash === "#actividad-economica") {
      const el = document.getElementById("actividad-economica");
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 150);
    }
  }, [data]);

  const setRegistroStage = async (stage) => {
    setSavingRegStage(true);
    setRegStage(stage);
    try {
      await api.patch(`/admin/members/${userId}/registro-stage`, { stage });
      toast.success("Estado del registro actualizado. Se notificó al arrendatario.");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSavingRegStage(false);
    }
  };

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

  const { user, properties, documents_summary, can_view_documents, fiscal_info, consent, contracts } = data;
  const isLandlord = user.role === "arrendador";
  const showTenant = !isLandlord || !!(fiscal_info && (fiscal_info.curp || (fiscal_info.cohabitantes || []).length > 0 || fiscal_info.mascotas || fiscal_info.adultos_18 != null || fiscal_info.es_extranjero)) || !!consent;
  const solicitanteIngreso = Number(fiscal_info?.ingreso_mensual || 0);
  const habitantesIngreso = (fiscal_info?.cohabitantes || []).reduce((s, c) => s + Number(c.ingreso_mensual || 0), 0);
  const ingresoTotal = solicitanteIngreso + habitantesIngreso;
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
          <Row icon={Phone} label="Teléfono" value={(fiscal_info?.phone || user.phone) ? `${fiscal_info?.phone_code ? fiscal_info.phone_code + " " : ""}${fiscal_info?.phone || user.phone}` : null} />
          <Row icon={User} label="Registrado" value={formatDate(user.created_at)} />
          <Row icon={BadgeCheck} label="Autenticación" value={user.auth_provider === "google" ? "Google" : "Correo/contraseña"} />
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          {isLandlord ? (
            <>
              <h2 className="font-display font-semibold text-navy mb-3">Información bancaria</h2>
              <Row icon={CreditCard} label="Banco" value={fiscal_info?.bank_name} />
              <Row icon={CreditCard} label="Titular" value={fiscal_info?.account_holder} />
              <Row icon={CreditCard} label="Número de cuenta" value={fiscal_info?.account_number} />
              <Row icon={CreditCard} label="CLABE" value={fiscal_info?.clabe} />
            </>
          ) : (
            <>
              <h2 className="font-display font-semibold text-navy mb-3">Información fiscal del solicitante</h2>
              {fiscal_info?.es_extranjero ? (
                <>
                  <Row icon={Globe} label="Extranjero" value="Sí" />
                  <Row icon={FileText} label="# Pasaporte" value={fiscal_info?.pasaporte} />
                </>
              ) : (
                <>
                  <Row icon={FileText} label="RFC" value={fiscal_info?.rfc} />
                  <Row icon={FileText} label="CURP" value={fiscal_info?.curp} />
                  <Row icon={FileText} label="Régimen fiscal" value={fiscal_info?.fiscal_regime} />
                </>
              )}
              <Row icon={User} label="Actividad económica" value={fiscal_info?.actividad_economica} />
              <Row icon={CreditCard} label="Ingreso mensual" value={fiscal_info?.ingreso_mensual != null ? formatMXN(fiscal_info.ingreso_mensual) : null} />
            </>
          )}
        </div>
      </div>

      {/* Registro del arrendatario: ocupantes, mascotas, comprobantes, habitantes */}
      {showTenant && fiscal_info && (
        <div className="bg-white border border-stone-200 rounded-2xl p-6" data-testid="tenant-registro-detail">
          <h2 className="font-display font-semibold text-navy mb-3 flex items-center gap-2"><Users className="w-5 h-5" /> Registro del arrendatario</h2>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-stone-50 border border-stone-200 p-3"><div className="text-xs text-stone-500">Adultos (18+ años)</div><div className="font-semibold text-navy">{fiscal_info.adultos_18 ?? 0}</div></div>
            <div className="rounded-xl bg-stone-50 border border-stone-200 p-3"><div className="text-xs text-stone-500">Menores (12 a 17)</div><div className="font-semibold text-navy">{fiscal_info.menores_12_17 ?? 0}</div></div>
            <div className="rounded-xl bg-stone-50 border border-stone-200 p-3"><div className="text-xs text-stone-500">Niños (0 a 11)</div><div className="font-semibold text-navy">{fiscal_info.ninos_0_11 ?? 0}</div></div>
          </div>
          <Row icon={PawPrint} label="Mascotas" value={fiscal_info.mascotas} />
          {can_view_documents && <PrivatePhotos paths={fiscal_info.comprobantes_ingresos} label="Comprobantes de ingresos" />}
          {can_view_documents && fiscal_info.es_extranjero && (
            <>
              <PrivatePhotos paths={fiscal_info.pasaporte_fotos} label="Foto del pasaporte" />
              <PrivatePhotos paths={fiscal_info.migratorio_fotos} label="Documento migratorio (permanencia en México)" />
            </>
          )}

          {(fiscal_info.cohabitantes || []).length > 0 && (
            <div className="mt-5 pt-5 border-t border-stone-100">
              <h3 className="font-semibold text-navy mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-terracotta" /> Personas que habitarán la propiedad</h3>
              <div className="space-y-3">
                {fiscal_info.cohabitantes.map((c, i) => (
                  <div key={i} className="border border-stone-200 rounded-xl p-3" data-testid={`admin-cohab-${i}`}>
                    <div className="text-sm font-medium text-navy mb-1 flex items-center gap-2">Habitante {i + 1}: {c.name || "—"}{c.es_extranjero && <Badge className="rounded-full bg-navy/10 text-navy hover:bg-navy/10 text-xs">Extranjero</Badge>}</div>
                    <div className="grid sm:grid-cols-3 gap-x-6 gap-y-1 text-sm text-stone-600">
                      {c.es_extranjero ? (
                        <div><span className="text-stone-400">Pasaporte:</span> {c.pasaporte || "—"}</div>
                      ) : (
                        <>
                          <div><span className="text-stone-400">RFC:</span> {c.rfc || "—"}</div>
                          <div><span className="text-stone-400">CURP:</span> {c.curp || "—"}</div>
                        </>
                      )}
                      <div><span className="text-stone-400">Ingreso:</span> {c.ingreso_mensual != null ? formatMXN(c.ingreso_mensual) : "—"}</div>
                      <div><span className="text-stone-400">Teléfono:</span> {c.phone ? `${c.phone_code || ""} ${c.phone}` : "—"}</div>
                      <div><span className="text-stone-400">Parentesco:</span> {c.parentesco || "—"}</div>
                    </div>
                    {can_view_documents && <PrivatePhotos paths={c.comprobantes} label="Comprobantes" />}
                    {can_view_documents && <PrivatePhotos paths={c.ine_fotos} label="Fotografía de INE" />}
                    {can_view_documents && c.es_extranjero && (
                      <>
                        <PrivatePhotos paths={c.pasaporte_fotos} label="Pasaporte" />
                        <PrivatePhotos paths={c.migratorio_fotos} label="Documento migratorio" />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Consent (tenant) */}
      {showTenant && (
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

      {/* Contratos del arrendatario — link para abrir y revisar */}
      {showTenant && (contracts || []).length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-6" data-testid="member-contracts">
          <div className="flex items-center gap-2 mb-3"><FileText className="w-5 h-5 text-terracotta" /><h2 className="font-display font-semibold text-navy">Contratos</h2></div>
          <div className="space-y-3">
            {contracts.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-200 rounded-xl p-4" data-testid={`member-contract-${c.id}`}>
                <div>
                  <div className="font-medium text-navy">{c.property_title}</div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {c.property_public_id ? <span className="font-bold text-red-600">{c.property_public_id}</span> : null}
                    {c.property_public_id ? " · " : ""}Renta {formatMXN(c.monthly_rent)} · Inicio {formatDate(c.start_date)}
                  </div>
                  <Badge className="rounded-full bg-amber-100 text-amber-700 mt-1.5">{STATUS_LABEL[c.status] || c.status}</Badge>
                </div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate(`/admin/contratos?open=${c.id}`)} data-testid={`open-contract-${c.id}`}>
                  <Eye className="w-4 h-4 mr-1" /> Abrir y revisar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actividad económica y empleos anteriores (solo cuando el arrendatario ya envió) */}
      {showTenant && user.actividad_economica_submitted && (
        <div id="actividad-economica" className="bg-white border border-stone-200 rounded-2xl p-6 scroll-mt-24" data-testid="admin-actividad-economica">
          <h2 className="font-display font-semibold text-navy mb-2 flex items-center gap-2"><Briefcase className="w-5 h-5 text-terracotta" /> Actividad económica y empleos anteriores</h2>
          <ActividadBlock title="Actividad económica actual" a={user.actividad_economica_detalle} />
          {(user.empleos_anteriores || []).map((e, i) => (
            <ActividadBlock key={i} title={`Empleo anterior ${i + 1}`} a={e} />
          ))}
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

            {/* Observación del administrador (máx. 50 caracteres) — solo arrendatario */}
            {!isLandlord && (
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
            )}

            {!isLandlord && (
              <div className="mt-5 pt-5 border-t border-stone-100" data-testid="ingreso-total-card">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm font-medium text-navy flex items-center gap-2"><CreditCard className="w-4 h-4 text-terracotta" /> Ingreso mensual total (capacidad de pago)</span>
                  <span className="font-display font-bold text-lg text-terracotta" data-testid="ingreso-total-value">${ingresoTotal.toLocaleString("en-US")} MX</span>
                </div>
                <p className="text-xs text-stone-500 mt-1">Solicitante: ${solicitanteIngreso.toLocaleString("en-US")} MX + habitantes: ${habitantesIngreso.toLocaleString("en-US")} MX</p>
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap rounded-xl bg-navy/5 border border-navy/10 p-3">
                  <span className="text-sm font-medium text-navy">Capacidad de pago mensual (30%)</span>
                  <span className="font-display font-bold text-lg text-navy" data-testid="capacidad-pago-value">${Math.round(ingresoTotal * 0.3).toLocaleString("en-US")} MX</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Properties (landlord) — revisión y validación bajo cada propiedad */}
      {isLandlord && (
        <div>
          <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-6" data-testid="member-registro-validation-landlord">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-navy flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-terracotta" /> Revisión y validación del registro</span>
              {savingRegStage && <Loader2 className="w-4 h-4 animate-spin text-terracotta" />}
            </div>
            <RadioGroup value={regStage} onValueChange={setRegistroStage} className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="registro-stage-radiogroup-landlord">
              {REGISTRO_STAGE_OPTIONS.map((opt) => (
                <label key={opt.value} htmlFor={`regl-${opt.value}`} className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${regStage === opt.value ? "border-terracotta bg-terracotta/5 ring-1 ring-terracotta" : "border-stone-200 hover:border-stone-300"}`}>
                  <RadioGroupItem value={opt.value} id={`regl-${opt.value}`} data-testid={`registro-stage-l-${opt.value}`} />
                  <span className="text-sm font-medium text-navy">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
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

                    <div className="mt-4 pt-4 border-t border-stone-100 space-y-4" data-testid={`member-prop-details-${p.id}`}>
                      {p.description && (
                        <div><div className="text-xs text-stone-400">Descripción</div><p className="text-sm text-navy whitespace-pre-line">{p.description}</p></div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        <div><div className="text-xs text-stone-400">Tipo</div><div className="text-navy font-medium">{TYPE_LABEL[p.property_type]}</div></div>
                        <div><div className="text-xs text-stone-400">Colonia</div><div className="text-navy font-medium">{p.colonia || "—"}</div></div>
                        <div><div className="text-xs text-stone-400">Ciudad</div><div className="text-navy font-medium">{p.city || "—"}</div></div>
                        <div><div className="text-xs text-stone-400">Estado</div><div className="text-navy font-medium">{p.state || "—"}</div></div>
                        <div className="col-span-2"><div className="text-xs text-stone-400">Dirección</div><div className="text-navy font-medium">{p.address || "—"}</div></div>
                        <div><div className="text-xs text-stone-400">Renta mensual</div><div className="text-navy font-medium">{formatMXN(p.price_month)}</div></div>
                        <div><div className="text-xs text-stone-400">Mantenimiento (4%)</div><div className="text-navy font-medium">{formatMXN(p.maintenance_fee || 0)}</div></div>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-stone-600">
                        <span className="flex items-center gap-1.5"><Bed className="w-4 h-4 text-terracotta" /> {p.bedrooms || 0} rec.</span>
                        <span className="flex items-center gap-1.5"><Bath className="w-4 h-4 text-terracotta" /> {p.bathrooms || 0} baños</span>
                        <span className="flex items-center gap-1.5"><Car className="w-4 h-4 text-terracotta" /> {p.parking || 0} estac.</span>
                        <span className="flex items-center gap-1.5"><Maximize className="w-4 h-4 text-terracotta" /> {p.area_m2 || 0} m²</span>
                        {p.furnished && <span className="flex items-center gap-1.5"><Sofa className="w-4 h-4 text-terracotta" /> Amueblado</span>}
                        {p.pets_allowed && <span className="flex items-center gap-1.5"><PawPrint className="w-4 h-4 text-terracotta" /> Pet friendly</span>}
                      </div>
                      {p.amenities?.length > 0 && (
                        <div>
                          <div className="text-xs text-stone-400 mb-1">Amenidades</div>
                          <div className="flex flex-wrap gap-2">{p.amenities.map((a) => <Badge key={a} className="rounded-full bg-stone-100 text-stone-600 hover:bg-stone-100">{a}</Badge>)}</div>
                        </div>
                      )}
                      {p.images?.length > 0 && (
                        <div>
                          <div className="text-xs text-stone-400 mb-1">Fotos ({p.images.length})</div>
                          <div className="flex flex-wrap gap-2">{p.images.map((im, i) => <img key={i} src={im} alt="" className="w-20 h-16 object-cover rounded-lg border border-stone-200" />)}</div>
                        </div>
                      )}
                    </div>

                    <PropertyActivity propertyId={p.id} />

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

      {/* Revisión y validación del registro (arrendatario) — al final de la hoja */}
      {!isLandlord && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4" data-testid="member-registro-validation">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-navy flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-terracotta" /> Revisión y validación del registro</span>
            {savingRegStage && <Loader2 className="w-4 h-4 animate-spin text-terracotta" />}
          </div>
          <RadioGroup value={regStage} onValueChange={setRegistroStage} className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="registro-stage-radiogroup">
            {REGISTRO_STAGE_OPTIONS.map((opt) => (
              <label key={opt.value} htmlFor={`reg-${opt.value}`} className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${regStage === opt.value ? "border-terracotta bg-terracotta/5 ring-1 ring-terracotta" : "border-stone-200 hover:border-stone-300"}`}>
                <RadioGroupItem value={opt.value} id={`reg-${opt.value}`} data-testid={`registro-stage-${opt.value}`} />
                <span className="text-sm font-medium text-navy">{opt.label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
      )}
    </div>
  );
}
