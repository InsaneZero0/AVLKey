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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Bed, Bath, Maximize, Car, MapPin, Loader2, Check, ShieldCheck, PawPrint, Sofa, Building, CalendarClock,
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
    num_occupants: "1", has_guarantor: false, message: "",
  });
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitSubmitting, setVisitSubmitting] = useState(false);
  const [vDate, setVDate] = useState("");
  const [vTime, setVTime] = useState("10:00");
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
    if (!vDate) { toast.error("Selecciona una fecha"); return; }
    setVisitSubmitting(true);
    try {
      await api.post("/visits", { property_id: id, scheduled_at: `${vDate}T${vTime}:00`, note: vNote });
      toast.success("¡Visita solicitada! El arrendador la confirmará pronto.");
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

  const facts = [
    prop.bedrooms > 0 && { icon: Bed, label: `${prop.bedrooms} recámaras` },
    prop.bathrooms > 0 && { icon: Bath, label: `${prop.bathrooms} baños` },
    prop.parking > 0 && { icon: Car, label: `${prop.parking} estac.` },
    prop.area_m2 > 0 && { icon: Maximize, label: `${prop.area_m2} m²` },
    prop.furnished && { icon: Sofa, label: "Amueblado" },
    prop.pets_allowed && { icon: PawPrint, label: "Pet friendly" },
  ].filter(Boolean);

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
                <div className="flex justify-between"><span className="text-stone-500">Depósito en garantía</span><span className="font-medium">{formatMXN(prop.deposit)}</span></div>
                {prop.maintenance_fee > 0 && <div className="flex justify-between"><span className="text-stone-500">Mantenimiento</span><span className="font-medium">{formatMXN(prop.maintenance_fee)}/mes</span></div>}
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
                  <DialogTrigger asChild>
                    <Button className="w-full mt-5 rounded-full bg-terracotta hover:bg-terracotta-hover h-12 text-base" data-testid="apply-btn">
                      Solicitar arrendamiento
                    </Button>
                  </DialogTrigger>
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
                        <Input data-testid="app-occupation" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} placeholder="Ej. Ingeniero de software" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="guarantor" checked={form.has_guarantor} onCheckedChange={(v) => setForm({ ...form, has_guarantor: !!v })} data-testid="app-guarantor" />
                        <Label htmlFor="guarantor" className="cursor-pointer">Cuento con aval / fiador</Label>
                      </div>
                      <div>
                        <Label>Mensaje al arrendador</Label>
                        <Textarea data-testid="app-message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Cuéntale por qué eres un buen candidato..." />
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
                    <div className="space-y-4 py-2">
                      <div>
                        <Label>Fecha</Label>
                        <Input data-testid="visit-date" type="date" min={new Date().toISOString().split("T")[0]} value={vDate} onChange={(e) => setVDate(e.target.value)} />
                      </div>
                      <div>
                        <Label>Hora</Label>
                        <Select value={vTime} onValueChange={setVTime}>
                          <SelectTrigger data-testid="visit-time"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIME_SLOTS.map((t) => {
                              const taken = busy.some((b) => b.startsWith(vDate) && b.slice(11, 16) === t);
                              return <SelectItem key={t} value={t} disabled={taken}>{t}{taken ? " (ocupado)" : ""}</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Mensaje (opcional)</Label>
                        <Textarea data-testid="visit-note" value={vNote} onChange={(e) => setVNote(e.target.value)} placeholder="Comparte tu disponibilidad o dudas..." />
                      </div>
                      <p className="text-xs text-stone-400 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> La dirección exacta se mostrará al confirmar la visita.</p>
                    </div>
                    <DialogFooter>
                      <Button onClick={submitVisit} disabled={visitSubmitting} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="submit-visit-btn">
                        {visitSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Solicitar visita"}
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
