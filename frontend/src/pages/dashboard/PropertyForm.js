import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError, API } from "@/lib/api";
import { PROPERTY_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, ImagePlus, FileCheck2, Upload, Camera } from "lucide-react";

export default function PropertyForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [ownershipFile, setOwnershipFile] = useState(null);
  const [uploadingImg, setUploadingImg] = useState(false);
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

  const uploadImages = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUploadingImg(true);
    try {
      for (const f of list) {
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post("/properties/upload-image", fd);
        const url = `${API}/media/${data.path}`;
        setForm((prev) => (prev.images.includes(url) ? prev : { ...prev, images: [...prev.images, url] }));
      }
      toast.success(list.length > 1 ? "Fotos agregadas" : "Foto agregada");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setUploadingImg(false);
    }
  };

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
      if (ownershipFile) {
        const fd = new FormData();
        fd.append("file", ownershipFile);
        fd.append("doc_type", "acreditacion_propiedad");
        fd.append("category", "arrendador");
        try {
          await api.post("/documents/upload", fd);
        } catch (docErr) {
          toast.error("El inmueble se registró, pero no se pudo subir el documento de propiedad. Súbelo en Verificación.");
        }
      }
      toast.success("¡Información enviada al departamento de validación!");
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
      <Input
        data-testid={`prop-${k}`}
        type={type === "number" ? "text" : type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        placeholder={ph}
      />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Publicar inmueble</h1>
      <p className="text-stone-500 mt-1">Esta información pasará al departamento de validación y te estaremos enviando una notificación de tu status.</p>

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
          <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-6 cursor-pointer transition-colors ${uploadingImg ? "border-stone-200 opacity-60 pointer-events-none" : "border-stone-300 hover:border-terracotta"}`} data-testid="photo-upload-label">
            <div className="w-11 h-11 rounded-xl bg-terracotta/10 flex items-center justify-center">
              {uploadingImg ? <Loader2 className="w-5 h-5 text-terracotta animate-spin" /> : <Camera className="w-5 h-5 text-terracotta" />}
            </div>
            <div>
              <div className="font-medium text-navy">{uploadingImg ? "Subiendo fotos..." : "Subir fotos desde tu dispositivo"}</div>
              <div className="text-xs text-stone-500">PC o móvil · JPG, PNG, WEBP o GIF (máx. 10 MB c/u)</div>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              data-testid="photo-upload-input"
              onChange={(e) => { uploadImages(e.target.files); e.target.value = ""; }}
            />
          </label>
          <div className="flex gap-2">
            <Input data-testid="prop-image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="O pega una URL de imagen" />
            <Button type="button" variant="outline" onClick={() => addImage(imageUrl)} className="rounded-full whitespace-nowrap" data-testid="add-image-url-btn"><ImagePlus className="w-4 h-4 mr-1" /> Agregar</Button>
          </div>
          {form.images.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2" data-testid="selected-images">
              {form.images.map((im) => (
                <div key={im} className="relative w-24 h-20 rounded-lg overflow-hidden border-2 border-terracotta">
                  <img src={im} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(im)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5"><X className="w-3 h-3 text-white" /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-navy">Documento que acredite la propiedad</h2>
          <p className="text-sm text-stone-500">Sube el documento que acredite que eres el propietario del inmueble (escritura, boleta predial u otro). Formatos: PDF, JPG o PNG (máx. 10 MB).</p>
          <label className="flex items-center gap-3 border-2 border-dashed border-stone-300 rounded-xl px-4 py-6 cursor-pointer hover:border-terracotta transition-colors" data-testid="ownership-doc-label">
            <div className="w-11 h-11 rounded-xl bg-terracotta/10 flex items-center justify-center">
              {ownershipFile ? <FileCheck2 className="w-5 h-5 text-terracotta" /> : <Upload className="w-5 h-5 text-terracotta" />}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-navy truncate">{ownershipFile ? ownershipFile.name : "Seleccionar archivo"}</div>
              <div className="text-xs text-stone-500">{ownershipFile ? "Documento listo para enviar" : "Haz clic para subir tu documento de propiedad"}</div>
            </div>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              data-testid="ownership-doc-input"
              onChange={(e) => setOwnershipFile(e.target.files?.[0] || null)}
            />
          </label>
        </section>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/panel/inmuebles")} className="rounded-full">Cancelar</Button>
          <Button type="submit" disabled={loading} className="rounded-full bg-terracotta hover:bg-terracotta-hover flex-1" data-testid="submit-property-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar información"}
          </Button>
        </div>
      </form>
    </div>
  );
}
