import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError, API } from "@/lib/api";
import { PROPERTY_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, FileCheck2, Upload, Camera, Save, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { MapEmbed } from "@/components/MapEmbed";

const Field = ({ label, testid, type = "text", inputMode, value, onChange, placeholder }) => (
  <div>
    <Label>{label}</Label>
    <Input data-testid={testid} type={type} inputMode={inputMode} value={value} onChange={onChange} placeholder={placeholder} />
  </div>
);

const MoneyInput = ({ label, testid, value, onChange, disabled, placeholder, hint }) => {
  const display = value !== "" && value != null ? Number(value).toLocaleString("en-US") : "";
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-medium pointer-events-none">$</span>
          <Input
            data-testid={testid}
            type="text"
            inputMode="numeric"
            value={display}
            disabled={disabled}
            onChange={disabled ? undefined : (e) => onChange(e.target.value.replace(/\D/g, ""))}
            placeholder={placeholder}
            className={`pl-7 ${disabled ? "bg-stone-100 text-stone-600" : ""}`}
          />
        </div>
        <span className="text-sm font-medium text-stone-500">MX</span>
      </div>
      {hint && <p className="text-xs text-stone-500 mt-1">{hint}</p>}
    </div>
  );
};

export default function PropertyForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [ownershipFile, setOwnershipFile] = useState(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", property_type: "departamento", city: "", state: "", colonia: "", address: "",
    price_month: "", bedrooms: "", bathrooms: "", parking: "", area_m2: "",
    furnished: false, pets_allowed: false, amenities: "", images: [],
    garantia_danos: false, garantia_pago_puntual: false,
  });

  useEffect(() => {
    if (!id) return;
    api.get(`/properties/${id}`).then(({ data }) => {
      setForm({
        title: data.title || "", description: data.description || "", property_type: data.property_type || "departamento",
        city: data.city || "", state: data.state || "", colonia: data.colonia || "", address: data.address || "",
        price_month: data.price_month != null ? String(data.price_month) : "",
        bedrooms: data.bedrooms != null ? String(data.bedrooms) : "",
        bathrooms: data.bathrooms != null ? String(data.bathrooms) : "",
        parking: data.parking != null ? String(data.parking) : "",
        area_m2: data.area_m2 != null ? String(data.area_m2) : "",
        furnished: !!data.furnished, pets_allowed: !!data.pets_allowed,
        amenities: (data.amenities || []).join(", "), images: data.images || [],
        garantia_danos: !!data.garantia_danos, garantia_pago_puntual: !!data.garantia_pago_puntual,
      });
    }).catch(() => toast.error("No se pudo cargar el inmueble"));
  }, [id]);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const rent = parseInt(form.price_month, 10) || 0;
  const danosAmt = Math.round(rent * 0.05);
  const pagoAmt = Math.round(rent * 0.05);
  const comisionAmt = Math.round(rent * 0.04);
  const totalAmt = rent - (form.garantia_danos ? danosAmt : 0) - (form.garantia_pago_puntual ? pagoAmt : 0) - comisionAmt;
  const money = (n) => `$${Number(n || 0).toLocaleString("en-US")}`;

  const addImage = (url) => {
    if (url && !form.images.includes(url)) set("images", [...form.images, url]);
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

  const submit = async (e, isDraft = false) => {
    e.preventDefault();
    if (!form.title || !form.city || !form.price_month) { toast.error("Completa título, ciudad y renta"); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        price_month: parseInt(form.price_month, 10) || 0,
        deposit: 0,
        maintenance_fee: 0,
        garantia_danos: !!form.garantia_danos,
        garantia_pago_puntual: !!form.garantia_pago_puntual,
        bedrooms: parseInt(form.bedrooms) || 0,
        bathrooms: parseInt(form.bathrooms) || 0,
        parking: parseInt(form.parking) || 0,
        area_m2: parseFloat(form.area_m2) || 0,
        amenities: form.amenities.split(",").map((a) => a.trim()).filter(Boolean),
        images: form.images,
        review_stage: isDraft ? "borrador" : "recibido",
      };
      if (isEdit) {
        await api.put(`/properties/${id}`, payload);
      } else {
        await api.post("/properties", payload);
      }
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
      toast.success(isDraft ? "Borrador guardado. Podrás editarlo y enviarlo después." : "¡Información enviada al departamento de validación!");
      navigate("/panel/inmuebles");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">{isEdit ? "Editar inmueble" : "Publicar inmueble"}</h1>
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
            <Field label="Colonia" testid="prop-colonia" value={form.colonia} onChange={(e) => set("colonia", e.target.value)} placeholder="Roma Norte" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Ciudad" testid="prop-city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Ciudad de México" />
            <Field label="Estado" testid="prop-state" value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="CDMX" />
          </div>
          <Field label="Dirección" testid="prop-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Calle y número (opcional)" />
          {[form.address, form.colonia, form.city, form.state].filter(Boolean).join(", ").trim() && (
            <div className="pt-1" data-testid="prop-map-wrapper">
              <Label className="text-stone-500">Ubicación en el mapa</Label>
              <MapEmbed address={[form.address, form.colonia, form.city, form.state].filter(Boolean).join(", ")} />
            </div>
          )}
        </section>

        <section className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-navy">Precios (MXN)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MoneyInput label="Renta mensual" testid="prop-price_month" value={form.price_month} onChange={(v) => set("price_month", v)} placeholder="0" />
          </div>
          <div className="space-y-3 pt-1">
            <label className="flex items-center justify-between gap-3 border border-stone-200 rounded-xl p-3 cursor-pointer hover:bg-stone-50 transition-colors">
              <div className="flex items-center gap-3">
                <Checkbox checked={form.garantia_danos} onCheckedChange={(v) => set("garantia_danos", !!v)} data-testid="prop-garantia-danos" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-navy">Garantía de daños <span className="text-xs font-normal text-stone-400">(opcional)</span></span>
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" onClick={(e) => e.preventDefault()} className="text-stone-400 hover:text-terracotta" data-testid="prop-garantia-danos-info"><Info className="w-3.5 h-3.5" /></button>
                        </TooltipTrigger>
                        <TooltipContent><p className="max-w-xs">Cubre por daños hasta: {money(danosAmt * 60)}</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="text-xs text-stone-500">5% de la renta mensual</div>
                </div>
              </div>
              <span className="text-sm font-semibold text-red-600" data-testid="prop-garantia-danos-amt">{form.garantia_danos ? `− ${money(danosAmt)}` : "—"}</span>
            </label>

            <label className="flex items-center justify-between gap-3 border border-stone-200 rounded-xl p-3 cursor-pointer hover:bg-stone-50 transition-colors">
              <div className="flex items-center gap-3">
                <Checkbox checked={form.garantia_pago_puntual} onCheckedChange={(v) => set("garantia_pago_puntual", !!v)} data-testid="prop-garantia-pago" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-navy">Garantía de pago puntual <span className="text-xs font-normal text-stone-400">(opcional)</span></span>
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" onClick={(e) => e.preventDefault()} className="text-stone-400 hover:text-terracotta" data-testid="prop-garantia-pago-info"><Info className="w-3.5 h-3.5" /></button>
                        </TooltipTrigger>
                        <TooltipContent><p className="max-w-xs">Cubre pago puntual antes del día 10 del mes. En caso de incumplimiento hasta 6 meses de renta.</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="text-xs text-stone-500">5% de la renta mensual</div>
                </div>
              </div>
              <span className="text-sm font-semibold text-red-600" data-testid="prop-garantia-pago-amt">{form.garantia_pago_puntual ? `− ${money(pagoAmt)}` : "—"}</span>
            </label>

            <div className="flex items-center justify-between gap-3 border border-stone-200 rounded-xl p-3 bg-stone-50">
              <div>
                <div className="text-sm font-medium text-navy">Comisión plataforma</div>
                <div className="text-xs text-stone-500">4% de la renta mensual (fijo)</div>
              </div>
              <span className="text-sm font-semibold text-red-600" data-testid="prop-comision-amt">− {money(comisionAmt)}</span>
            </div>

            <div className="flex items-center justify-between border-t border-stone-200 pt-3">
              <span className="font-display font-semibold text-navy">Total a recibir <span className="text-xs font-normal text-stone-400">(neto, informativo)</span></span>
              <span className="font-display font-bold text-lg text-terracotta" data-testid="prop-total">{money(totalAmt)} MX</span>
            </div>
            <p className="text-xs text-stone-500">Las garantías y la comisión de plataforma las cubre el arrendador y se descuentan de la renta; este es el monto neto que recibirás.</p>
          </div>
        </section>

        <section className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-navy">Características</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Recámaras" testid="prop-bedrooms" type="number" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} placeholder="0" />
            <Field label="Baños" testid="prop-bathrooms" type="number" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} placeholder="0" />
            <Field label="Estacionamientos" testid="prop-parking" type="number" value={form.parking} onChange={(e) => set("parking", e.target.value)} placeholder="0" />
            <Field label="Área m²" testid="prop-area_m2" type="text" inputMode="numeric" value={form.area_m2} onChange={(e) => set("area_m2", e.target.value.replace(/\D/g, ""))} placeholder="0" />
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" onClick={(e) => submit(e, true)} disabled={loading} className="rounded-full" data-testid="save-draft-property-btn">
                  <Save className="w-4 h-4 mr-1" /> Guardar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Guarda como borrador; podrás editarlo y enviarlo después.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button type="submit" disabled={loading} className="rounded-full bg-terracotta hover:bg-terracotta-hover flex-1" data-testid="submit-property-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar información"}
          </Button>
        </div>
      </form>
    </div>
  );
}
