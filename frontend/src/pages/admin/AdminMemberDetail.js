import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { API } from "@/lib/api";
import {
  TYPE_LABEL, STATUS_LABEL, PROPERTY_STATUS_COLOR, DOC_STATUS_COLOR, formatMXN, formatDate,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, ArrowLeft, Mail, Phone, Building2, User, FileText, Eye,
  MapPin, BadgeCheck, ShieldAlert, CreditCard,
} from "lucide-react";

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 py-2">
    <Icon className="w-4 h-4 text-stone-400" />
    <span className="text-sm text-stone-500 w-40">{label}</span>
    <span className="text-sm font-medium text-navy">{value || "—"}</span>
  </div>
);

export default function AdminMemberDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get(`/admin/members/${userId}`).then(({ data }) => setData(data)).catch(() => setNotFound(true));
  }, [userId]);

  if (notFound) return <div className="text-center py-20 text-stone-500">Usuario no encontrado.</div>;
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const { user, properties, documents, can_view_documents, fiscal_info, consent } = data;
  const isLandlord = user.role === "arrendador";

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

      {/* Documents */}
      <div>
        <h2 className="font-display font-semibold text-navy mb-3 flex items-center gap-2"><FileText className="w-5 h-5" /> Documentos</h2>
        {!can_view_documents ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-6 text-sm text-stone-400">No tienes permiso para ver documentos sensibles.</div>
        ) : documents.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-6 text-sm text-stone-400" data-testid="member-no-docs">Este usuario no ha subido documentos.</div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-4" data-testid={`member-doc-${d.id}`}>
                <div>
                  <div className="font-medium text-navy">{d.label}</div>
                  <div className="text-xs text-stone-500">{d.original_filename} · v{d.version} · {formatDate(d.created_at)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={`rounded-full ${DOC_STATUS_COLOR[d.status] || "bg-stone-100 text-stone-600"}`}>{d.status}</Badge>
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.open(`${API}/documents/${d.id}/download`, "_blank")} data-testid={`member-view-doc-${d.id}`}><Eye className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Properties (landlord) */}
      {isLandlord && (
        <div>
          <h2 className="font-display font-semibold text-navy mb-3 flex items-center gap-2"><Building2 className="w-5 h-5" /> Propiedades registradas ({properties.length})</h2>
          {properties.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 text-sm text-stone-400" data-testid="member-no-props">Sin propiedades registradas.</div>
          ) : (
            <div className="space-y-3">
              {properties.map((p) => (
                <div key={p.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex gap-4 items-center" data-testid={`member-prop-${p.id}`}>
                  <img src={p.images?.[0]} alt={p.title} className="w-24 h-20 object-cover rounded-xl bg-stone-100" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="rounded-full bg-terracotta/10 text-terracotta hover:bg-terracotta/10">{TYPE_LABEL[p.property_type]}</Badge>
                      <Badge className={`rounded-full ${PROPERTY_STATUS_COLOR[p.display_status] || "bg-stone-100 text-stone-600"}`} data-testid={`member-prop-status-${p.id}`}>{STATUS_LABEL[p.display_status]}</Badge>
                    </div>
                    <h3 className="font-display font-semibold text-navy mt-1.5 truncate">{p.title}</h3>
                    <div className="flex items-center gap-1.5 text-stone-500 text-sm"><MapPin className="w-3.5 h-3.5" />{p.city} · {p.applications_count} solicitud(es)</div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="font-display font-bold text-lg text-terracotta">{formatMXN(p.price_month)}<span className="text-xs text-stone-400 font-normal">/mes</span></div>
                    <Button variant="outline" size="sm" className="rounded-full mt-1" onClick={() => navigate(`/inmueble/${p.id}`)}>Ver</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
