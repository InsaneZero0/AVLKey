import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PROPERTY_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, ImagePlus } from "lucide-react";

const SAMPLE_IMAGES = [
  "https://images.unsplash.com/photo-1708127665466-1f9a166a24c8?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.pexels.com/photos/17238410/pexels-photo-17238410.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.unsplash.com/photo-1700809888987-cf2b29ecbd2c?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1771530789155-b1f03fbf82b5?crop=entropy&cs=srgb&fm=jpg&q=85",
];

export default function PropertyForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [form, setForm] = useState({
    title: "", description: "", property_type: "departamento", city: "", state: "", colonia: "", address: "",
    price_month: "", deposit: "", maintenance_fee: "", bedrooms: "", bathrooms: "", parking: "", area_m2: "",
    furnished: false, pets_allowed: false, amenities: "", images: [],
  });

  const set = (k, v) => setForm({ ...form, [k]: v });

  const addImage = (url) => {
    if (url && !form.images.includes(url)) set("images", [...form.images, url]);
    setImageUrl("");
  };
  const removeImage = (url) => set("images", form.images.filter((i) => i !== url));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.city || !form.price_month) { toast.error("Completa título, ciudad y renta"); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        price_month: parseFloat(form.price_month) || 0,
        deposit: parseFloat(form.deposit) || 0,
        maintenance_fee: parseFloat(form.maintenance_fee) || 0,
        bedrooms: parseInt(form.bedrooms) || 0,
        bathrooms: parseInt(form.bathrooms) || 0,
        parking: parseInt(form.parking) || 0,
        area_m2: parseFloat(form.area_m2) || 0,
        amenities: form.amenities.split(",").map((a) => a.trim()).filter(Boolean),
        images: form.images.length ? form.images : [SAMPLE_IMAGES[0]],
      };
      await api.post("/properties", payload);
      toast.success("¡Inmueble publicado!");
      navigate("/panel/inmuebles");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ label, k, type = "text", ph }) => (
    <div>
      <Label>{label}</Label>
      <Input data-testid={`prop-${k}`} type={type} value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Publicar inmueble</h1>
      <p className="text-stone-500 mt-1">Completa la información para publicar tu propiedad en renta.</p>

      <form onSubmit={submit} className="mt-8 space-y-8">
        <section className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-navy">Información general</h2>
          <div>
            <Label>Título</Label>
            <Input data-testid="prop-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ej. Departamento moderno en la Condesa" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea data-testid="prop-description" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe el inmueble..." rows={4} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Tipo de inmueble</Label>
              <Select value={form.property_type} onValueChange={(v) => set("property_type", v)}>
                <SelectTrigger data-testid="prop-type"><SelectValue /></SelectTrigger>
                <SelectContent>{PROPERTY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Field label="Colonia" k="colonia" ph="Roma Norte" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Ciudad" k="city" ph="Ciudad de México" />
            <Field label="Estado" k="state" ph="CDMX" />
          </div>
          <Field label="Dirección" k="address" ph="Calle y número (opcional)" />
        </section>

        <section className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-navy">Precios (MXN)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Renta mensual" k="price_month" type="number" ph="18000" />
            <Field label="Depósito" k="deposit" type="number" ph="18000" />
            <Field label="Mantenimiento" k="maintenance_fee" type="number" ph="0" />
          </div>
        </section>

        <section className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-navy">Características</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Recámaras" k="bedrooms" type="number" ph="2" />
            <Field label="Baños" k="bathrooms" type="number" ph="2" />
            <Field label="Estac." k="parking" type="number" ph="1" />
            <Field label="Área m²" k="area_m2" type="number" ph="85" />
          </div>
          <div>
            <Label>Amenidades (separadas por coma)</Label>
            <Input data-testid="prop-amenities" value={form.amenities} onChange={(e) => set("amenities", e.target.value)} placeholder="Roof garden, Gimnasio, Seguridad 24h" />
          </div>
          <div className="flex gap-8">
            <div className="flex items-center gap-2"><Switch checked={form.furnished} onCheckedChange={(v) => set("furnished", v)} data-testid="prop-furnished" /><Label>Amueblado</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.pets_allowed} onCheckedChange={(v) => set("pets_allowed", v)} data-testid="prop-pets" /><Label>Pet friendly</Label></div>
          </div>
        </section>

        <section className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-navy">Fotos</h2>
          <div className="flex gap-2">
            <Input data-testid="prop-image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Pega una URL de imagen" />
            <Button type="button" variant="outline" onClick={() => addImage(imageUrl)} className="rounded-full whitespace-nowrap"><ImagePlus className="w-4 h-4 mr-1" /> Agregar</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_IMAGES.map((im) => (
              <button key={im} type="button" onClick={() => addImage(im)} className="w-20 h-16 rounded-lg overflow-hidden border border-stone-200 opacity-70 hover:opacity-100 transition-opacity">
                <img src={im} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
          {form.images.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {form.images.map((im) => (
                <div key={im} className="relative w-24 h-20 rounded-lg overflow-hidden border-2 border-terracotta">
                  <img src={im} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(im)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5"><X className="w-3 h-3 text-white" /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/panel/inmuebles")} className="rounded-full">Cancelar</Button>
          <Button type="submit" disabled={loading} className="rounded-full bg-terracotta hover:bg-terracotta-hover flex-1" data-testid="submit-property-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publicar inmueble"}
          </Button>
        </div>
      </form>
    </div>
  );
}
