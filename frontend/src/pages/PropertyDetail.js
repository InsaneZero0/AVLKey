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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Bed, Bath, Maximize, Car, MapPin, Loader2, Check, ShieldCheck, PawPrint, Sofa, Building,
} from "lucide-react";

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

  useEffect(() => {
    api.get(`/properties/${id}`).then(({ data }) => setProp(data)).catch(() => toast.error("Inmueble no encontrado"));
  }, [id]);

  const submitApplication = async () => {
    if (!user) { navigate("/login"); return; }
    if (!form.monthly_income) { toast.error("Ingresa tu ingreso mensual"); return; }
    setSubmitting(true);
    try {
      await api.post("/applications", {
        property_id: id,
        monthly_income: parseFloat(form.monthly_income),
        occupation: form.occupation,
        employment_type: form.employment_type,
        num_occupants: parseInt(form.num_occupants) || 1,
        has_guarantor: form.has_guarantor,
        message: form.message,
      });
      toast.success("¡Solicitud enviada! El arrendador la revisará pronto.");
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
                  <div className="w-10 h-10 rounded-full bg-navy text-white flex items-center justify-center font-medium">{prop.owner.name?.[0]}</div>
                  <div><div className="text-sm font-medium text-navy">{prop.owner.name}</div><div className="text-xs text-stone-500">Arrendador verificado</div></div>
                </div>
              )}

              {canApply ? (
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
                      <div>
                        <Label>Ingreso mensual (MXN)</Label>
                        <Input data-testid="app-income" type="number" value={form.monthly_income} onChange={(e) => setForm({ ...form, monthly_income: e.target.value })} placeholder="45000" />
                      </div>
                      <div>
                        <Label>Ocupación</Label>
                        <Input data-testid="app-occupation" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} placeholder="Ej. Ingeniero de software" />
                      </div>
                      <div>
                        <Label>Situación laboral</Label>
                        <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
                          <SelectTrigger data-testid="app-employment"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Número de ocupantes</Label>
                        <Input data-testid="app-occupants" type="number" value={form.num_occupants} onChange={(e) => setForm({ ...form, num_occupants: e.target.value })} />
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
              ) : (
                <div className="mt-5 text-sm text-stone-500 bg-stone-50 rounded-xl p-4 flex items-start gap-2">
                  <Building className="w-4 h-4 mt-0.5" /> Inicia sesión como arrendatario para enviar una solicitud.
                </div>
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
