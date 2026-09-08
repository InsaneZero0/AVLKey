import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TYPE_LABEL, EMPLOYMENT_TYPES, formatMXN } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapEmbed } from "@/components/MapEmbed";
import { Video } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const DAYS = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Bed, Bath, Maximize, Car, MapPin, Loader2, Check, ShieldCheck, PawPrint, Sofa, Building, CalendarClock,
  DoorClosed, LayoutGrid, Bell,
} from "lucide-react";

const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

export default function PropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [prop, setProp] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    monthly_income: "", occupation: "", employment_type: "empleado_formal",
    num_occupants: "1", has_guarantor: false, stay_months: "6", video_url: "", message: "",
  });
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitSubmitting, setVisitSubmitting] = useState(false);
  const [avail, setAvail] = useState({});
  const [vNote, setVNote] = useState("");
  const [busy, setBusy] = useState([]);
  const [myFiscal, setMyFiscal] = useState(null);

  useEffect(() => {
    if (user && user.role === "arrendatario") api.get("/my/fiscal").then(({ data }) => setMyFiscal(data)).catch(() => setMyFiscal({}));
  }, [user]);

  useEffect(() => {
    if (user && visitOpen) api.get(`/properties/${id}/visits/busy`).then(({ data }) => setBusy(data)).catch(() => {});
  }, [id, user, visitOpen]);

  const submitVisit = async () => {
    if (!user) { navigate("/login"); return; }
    const availability = DAYS.filter((d) => avail[d.key]?.checked).map((d) => ({ day: d.label, time: avail[d.key]?.time || "10:00" }));
    if (availability.length === 0) { toast.error("Selecciona al menos un día"); return; }
    setVisitSubmitting(true);
    try {
      await api.post("/visits", { property_id: id, availability, note: vNote });
      toast.success("¡Disponibilidad enviada! El arrendador la revisará pronto.");
      setVisitOpen(false);
      navigate("/panel/visitas");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setVisitSubmitting(false);
    }
  };

  useEffect(() => {
    api.get(`/properties/${id}`).then(({ data }) => setProp(data)).catch(() => toast.error("Inmueble no encontrado"));
  }, [id]);

  const handleVideo = async (file) => {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["mp4", "webm", "mov", "ogg"].includes(ext)) { toast.error("Formato no permitido (MP4, WEBM, MOV u OGG)"); return; }
    if (file.size > 60 * 1024 * 1024) { toast.error("El video excede 60 MB"); return; }
    const duration = await new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { window.URL.revokeObjectURL(v.src); resolve(v.duration); };
      v.onerror = () => resolve(null);
      v.src = URL.createObjectURL(file);
    });
    if (duration && duration > 46) { toast.error("El video no debe exceder 45 segundos"); return; }
    setUploadingVideo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/applications/upload-video", fd);
      setForm((f) => ({ ...f, video_url: `${API}/api/media/${data.path}` }));
      toast.success("Video subido");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setUploadingVideo(false); }
  };

  const submitApplication = async () => {
    if (!user) { navigate("/login"); return; }
    setSubmitting(true);
    try {
      await api.post("/applications", {
        property_id: id,
        monthly_income: 0,
        occupation: form.occupation,
        employment_type: form.employment_type,
        num_occupants: 1,
        has_guarantor: form.has_guarantor,
        stay_months: parseInt(form.stay_months, 10) || 6,
        video_url: form.video_url,
        message: form.message,
      });
      toast.success("¡Solicitud enviada! Se calculó tu perfil de riesgo automáticamente.");
      setOpen(false);
      navigate("/panel/solicitudes");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  if (!prop) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const facts = (["oficina", "local", "bodega", "industrial"].includes(prop.property_type) ? [
    prop.bedrooms > 0 && { icon: DoorClosed, label: `${prop.bedrooms} privados` },
    prop.work_areas > 0 && { icon: LayoutGrid, label: `${prop.work_areas} áreas de trabajo` },
    prop.bathrooms > 0 && { icon: Bath, label: `${prop.bathrooms} baños` },
    prop.parking > 0 && { icon: Car, label: `${prop.parking} estac.` },
    prop.area_m2 > 0 && { icon: Maximize, label: `${prop.area_m2} m²` },
    prop.reception && { icon: Bell, label: "Recepción" },
  ] : [
    prop.bedrooms > 0 && { icon: Bed, label: `${prop.bedrooms} recámaras` },
    prop.bathrooms > 0 && { icon: Bath, label: `${prop.bathrooms} baños` },
    prop.parking > 0 && { icon: Car, label: `${prop.parking} estac.` },
    prop.area_m2 > 0 && { icon: Maximize, label: `${prop.area_m2} m²` },
    prop.furnished && { icon: Sofa, label: "Amueblado" },
    prop.pets_allowed && { icon: PawPrint, label: "Pet friendly" },
  ]).filter(Boolean);

  const isTenant = user?.role === "arrendatario";
  const canApply = !user || isTenant;
  const rentTotal = prop.price_month + (prop.maintenance_fee || 0);
  const totalIncome = myFiscal ? Number(myFiscal.ingreso_mensual || 0) + (myFiscal.cohabitantes || []).reduce((s, c) => s + Number(c.ingreso_mensual || 0), 0) : 0;
  const capacidadPago = Math.round(totalIncome * 0.3);
  const insufficient = isTenant && totalIncome > 0 && capacidadPago < prop.price_month;

  return (
    <div className="App">
      <Navbar />
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
        {/* Gallery */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-8">
          <div className="lg:col-span-2 aspect-[16/10] rounded-2xl overflow-hidden bg-stone-100">
            <img src={prop.images?.[activeImg] || prop.images?.[0]} alt={prop.title} className="w-full h-full object-cover" data-testid="detail-main-image" />
          </div>
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
            {(prop.images || []).slice(0, 3).map((im, i) => (
              <button key={i} onClick={() => setActiveImg(i)} className={`aspect-[16/10] lg:aspect-auto rounded-xl overflow-hidden border-2 ${activeImg === i ? "border-terracotta" : "border-transparent"}`}>
                <img src={im} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <Badge className="bg-terracotta/10 text-terracotta hover:bg-terracotta/10 rounded-full mb-3">{TYPE_LABEL[prop.property_type]}</Badge>
            {prop.public_id && <div className="font-mono font-bold text-red-600 mb-1" data-testid="detail-property-folio">ID: {prop.public_id}</div>}
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight">{prop.title}</h1>
            <div className="flex items-center gap-1.5 text-stone-500 mt-2">
              <MapPin className="w-4 h-4" /> {prop.colonia ? `${prop.colonia}, ` : ""}{prop.city}{prop.state ? `, ${prop.state}` : ""}
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              {facts.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-700">
                  <f.icon className="w-4 h-4 text-terracotta" /> {f.label}
                </div>
              ))}
            </div>

            {(prop.colonia || prop.city) && (
              <div className="mt-8" data-testid="detail-map-section">
                <h2 className="font-display font-semibold text-navy mb-2 flex items-center gap-2"><MapPin className="w-5 h-5 text-terracotta" /> Ubicación aproximada</h2>
                <p className="text-sm text-stone-500 mb-3">Ubicación aproximada por zona. La dirección exacta se comparte al confirmar una visita.</p>
                <MapEmbed address={[prop.colonia, prop.city, prop.state, "México"].filter(Boolean).join(", ")} />
              </div>
            )}

            <div className="mt-8">
              <h2 className="font-display font-semibold text-xl text-navy">Descripción</h2>
              <p className="text-stone-600 leading-relaxed mt-3">{prop.description}</p>
            </div>

            {prop.amenities?.length > 0 && (
              <div className="mt-8">
                <h2 className="font-display font-semibold text-xl text-navy">Amenidades</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                  {prop.amenities.map((a) => (
                    <div key={a} className="flex items-center gap-2 text-stone-700 text-sm">
                      <Check className="w-4 h-4 text-terracotta" /> {a}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky booking */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-stone-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sticky top-20">
              <div className="flex items-baseline gap-1">
                <span className="font-display font-bold text-3xl text-terracotta">{formatMXN(prop.price_month)}</span>
                <span className="text-stone-500">/mes</span>
              </div>
              <div className="mt-4 space-y-2 text-sm border-t border-stone-100 pt-4">
                <div className="flex justify-between"><span className="text-stone-500">Depósito en garantía <span className="text-xs text-stone-400">(1 mes de renta)</span></span><span className="font-medium">{formatMXN(prop.price_month)}</span></div>
                <div className="flex justify-between"><span className="text-stone-500">Cuota Réntalo en Línea <span className="text-xs text-stone-400">(4%)</span></span><span className="font-medium">{formatMXN(Math.round(prop.price_month * 0.04))}</span></div>
                <div className="flex justify-between"><span className="text-stone-500">Mantenimiento <span className="text-xs text-stone-400">(4%)</span></span><span className="font-medium">{formatMXN(Math.round(prop.price_month * 0.04))}/mes</span></div>
              </div>

              {prop.owner && (
                <div className="mt-4 flex items-center gap-3 border-t border-stone-100 pt-4">
                  <div className="w-10 h-10 rounded-full bg-navy text-white flex items-center justify-center font-medium">{(prop.owner.public_id || "A")[0]}</div>
                  <div><div className="text-sm font-medium text-navy font-mono" data-testid="detail-owner-id">ID: {prop.owner.public_id || "—"}</div><div className="text-xs text-stone-500">Arrendador verificado</div></div>
                </div>
              )}

              {canApply ? (
                insufficient ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block mt-5" tabIndex={0} data-testid="apply-btn-wrapper">
                          <Button className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover h-12 text-base pointer-events-none" data-testid="apply-btn" disabled>
                            Solicitar arrendamiento
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent data-testid="apply-capacity-tooltip">Tu capacidad de pago es hasta: {formatMXN(capacidadPago)}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                <Dialog open={open} onOpenChange={setOpen}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block mt-5" tabIndex={0} data-testid="apply-btn-wrapper">
                          <Button className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover h-12 text-base pointer-events-none opacity-60" data-testid="apply-btn" disabled>
                            Solicitar arrendamiento
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent data-testid="apply-disabled-tooltip">Las solicitudes de arrendamiento están deshabilitadas temporalmente.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="font-display text-xl">Solicitud de arrendamiento</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="rounded-xl bg-navy/5 border border-navy/10 p-4" data-testid="app-capacity-panel">
                        <p className="text-sm text-navy">Tu perfil de riesgo se calcula automáticamente con la información de tu <strong>Registro</strong> (ingresos de todos los habitantes y documentos validados) frente a la renta.</p>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div><div className="text-xs text-stone-500">Tu capacidad de pago (30%)</div><div className="font-display font-bold text-terracotta" data-testid="app-capacidad">{formatMXN(capacidadPago)}</div></div>
                          <div><div className="text-xs text-stone-500">Renta + mantenimiento</div><div className="font-display font-bold text-navy">{formatMXN(rentTotal)}</div></div>
                        </div>
                        {totalIncome > 0 && capacidadPago < rentTotal && (
                          <p className="text-xs text-amber-700 mt-2">Tu capacidad de pago es menor a la renta; esto puede aumentar tu nivel de riesgo.</p>
                        )}
                        {myFiscal && totalIncome === 0 && (
                          <p className="text-xs text-amber-700 mt-2">Completa tu <strong>Registro</strong> (ingresos y documentos) para mejorar tu evaluación.</p>
                        )}
                      </div>
                      <div>
                        <Label>Ocupación</Label>
                        <Input data-testid="app-occupation" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1) })} placeholder="Ej. Ingeniero de software" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="guarantor" checked={form.has_guarantor} onCheckedChange={(v) => setForm({ ...form, has_guarantor: !!v })} data-testid="app-guarantor" />
                        <Label htmlFor="guarantor" className="cursor-pointer">Cuento con aval / fiador</Label>
                      </div>
                      <div>
                        <Label>¿Cuánto tiempo estimas tu estadía?</Label>
                        <Select value={form.stay_months} onValueChange={(v) => setForm({ ...form, stay_months: v })}>
                          <SelectTrigger data-testid="app-stay-months" className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[6, 12, 18, 24, 30].map((m) => <SelectItem key={m} value={String(m)}>{m} meses</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Mensaje al arrendador (video)</Label>
                        <p className="text-xs text-stone-500 mt-0.5 mb-2">Graba un video de máximo 45 segundos: Di tu nombre, tu ocupación, tu antigüedad, quiénes habitarían la propiedad (familiares, esposa, amig@s) y explica el motivo de la búsqueda en renta.</p>
                        <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-4 cursor-pointer transition-colors ${uploadingVideo ? "opacity-60 pointer-events-none border-stone-200" : "border-stone-300 hover:border-terracotta"}`} data-testid="app-video-label">
                          <input type="file" accept="video/*" className="hidden" data-testid="app-video-input" onChange={(e) => handleVideo(e.target.files?.[0])} />
                          {uploadingVideo ? <Loader2 className="w-5 h-5 text-terracotta animate-spin" /> : <Video className="w-5 h-5 text-terracotta" />}
                          <span className="text-sm text-navy">{uploadingVideo ? "Subiendo video..." : (form.video_url ? "Cambiar video" : "Subir video (máx. 45 seg)")}</span>
                        </label>
                        {form.video_url && <video src={form.video_url} controls className="mt-3 w-full rounded-lg max-h-52 bg-black" data-testid="app-video-preview" />}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={submitApplication} disabled={submitting} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="submit-application-btn">
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar solicitud"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                )
              ) : (
                <div className="mt-5 text-sm text-stone-500 bg-stone-50 rounded-xl p-4 flex items-start gap-2">
                  <Building className="w-4 h-4 mt-0.5" /> Inicia sesión como arrendatario para enviar una solicitud.
                </div>
              )}

              {canApply && (
                <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full mt-3 rounded-full h-11 border-terracotta/40 text-terracotta hover:bg-terracotta/5 hover:text-terracotta" data-testid="schedule-visit-btn" disabled={insufficient}>
                      <CalendarClock className="w-4 h-4 mr-2" /> Agendar una visita
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="font-display text-xl">Agendar visita</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2">
                      <Label>Selecciona los días y horarios en que puedes visitar</Label>
                      <div className="space-y-2">
                        {DAYS.map((d) => {
                          const row = avail[d.key] || {};
                          return (
                            <div key={d.key} className="flex items-center gap-3">
                              <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
                                <Checkbox checked={!!row.checked} onCheckedChange={(c) => setAvail({ ...avail, [d.key]: { ...row, checked: !!c, time: row.time || "10:00" } })} data-testid={`visit-day-${d.key}`} />
                                <span className="text-sm text-navy">{d.label}</span>
                              </label>
                              <Select value={row.time || "10:00"} onValueChange={(t) => setAvail({ ...avail, [d.key]: { ...row, time: t } })} disabled={!row.checked}>
                                <SelectTrigger data-testid={`visit-time-${d.key}`} className="flex-1"><SelectValue /></SelectTrigger>
                                <SelectContent>{TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                      <div>
                        <Label>Mensaje (opcional)</Label>
                        <Textarea data-testid="visit-note" value={vNote} onChange={(e) => setVNote(e.target.value)} placeholder="Comparte detalles o dudas..." />
                      </div>
                      <p className="text-xs text-stone-400 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> La dirección exacta se mostrará al confirmar la visita.</p>
                    </div>
                    <DialogFooter>
                      <Button onClick={submitVisit} disabled={visitSubmitting} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="submit-visit-btn">
                        {visitSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar disponibilidad"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              <div className="mt-4 flex items-center gap-2 text-xs text-stone-500 justify-center">
                <ShieldCheck className="w-4 h-4 text-green-600" /> Proceso administrado y verificado
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
