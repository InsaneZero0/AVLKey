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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { MapEmbed } from "@/components/MapEmbed";

const Field = ({ label, testid, type = "text", inputMode, value, onChange, placeholder, min, step }) => (
  <div>
    <Label>{label}</Label>
    <Input
      data-testid={testid}
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      min={min}
      step={step}
      onKeyDown={type === "number" ? (e) => { if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault(); } : undefined}
    />
  </div>
);

const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", property_type: "departamento", city: "", state: "", colonia: "", address: "", piso: "", numero_interior: "",
    price_month: "", bedrooms: "", bathrooms: "", parking: "", area_m2: "",
    work_areas: "", reception: false,
    furnished: false, pets_allowed: false, amenities: "", images: [],
    garantia_danos: false, garantia_pago_puntual: false, iva_rate: 0,
  });

  useEffect(() => {
    if (!id) return;
    api.get(`/properties/${id}`).then(({ data }) => {
      setForm({
        title: data.title || "", description: data.description || "", property_type: data.property_type || "departamento",
        city: data.city || "", state: data.state || "", colonia: data.colonia || "", address: data.address || "", piso: data.piso || "", numero_interior: data.numero_interior || "",
        price_month: data.price_month != null ? String(data.price_month) : "",
        bedrooms: data.bedrooms != null ? String(data.bedrooms) : "",
        bathrooms: data.bathrooms != null ? String(data.bathrooms) : "",
        parking: data.parking != null ? String(data.parking) : "",
        area_m2: data.area_m2 != null ? String(data.area_m2) : "",
        work_areas: data.work_areas != null ? String(data.work_areas) : "",
        reception: !!data.reception,
        furnished: !!data.furnished, pets_allowed: !!data.pets_allowed,
        amenities: (data.amenities || []).join(", "), images: data.images || [],
        garantia_danos: !!data.garantia_danos, garantia_pago_puntual: !!data.garantia_pago_puntual, iva_rate: data.iva_rate || 0,
      });
    }).catch(() => toast.error("No se pudo cargar el inmueble"));
  }, [id]);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const rent = parseInt(form.price_month, 10) || 0;
  const danosAmt = Math.round(rent * 0.05);
  const pagoAmt = Math.round(rent * 0.05);
  const comisionAmt = Math.round(rent * 0.04);
  const mantenimientoAmt = Math.round(rent * 0.04);
  const ivaDisabled = ["casa", "departamento"].includes(form.property_type) && !form.furnished;
  const ivaRate = ivaDisabled ? 0 : form.iva_rate || 0;
  const ivaAmt = Math.round(rent * ivaRate / 100);
  const totalAmt = rent - (form.garantia_danos ? danosAmt : 0) - (form.garantia_pago_puntual ? pagoAmt : 0) - comisionAmt + ivaAmt;
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
    if (e) e.preventDefault();
    if (!form.title || !form.city || !form.price_month) { toast.error("Completa título, ciudad y renta"); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        price_month: parseInt(form.price_month, 10) || 0,
        deposit: 0,
        maintenance_fee: mantenimientoAmt,
        garantia_danos: !!form.garantia_danos,
        garantia_pago_puntual: !!form.garantia_pago_puntual,
        iva_rate: ivaRate,
        bedrooms: parseInt(form.bedrooms) || 0,
        bathrooms: parseInt(form.bathrooms) || 0,
        parking: parseInt(form.parking) || 0,
        work_areas: parseInt(form.work_areas) || 0,
        reception: !!form.reception,
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

  const openConfirm = (e) => {
    if (e) e.preventDefault();
    if (!form.title || !form.city || !form.price_month) { toast.error("Completa título, ciudad y renta"); return; }
    setConfirmOpen(true);
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">{isEdit ? "Editar inmueble" : "Publicar inmueble"}</h1>
      <p className="text-stone-500 mt-1">Esta información pasará al departamento de validación y te estaremos enviando una notificación de tu status.</p>

      <form onSubmit={openConfirm} className="mt-8 space-y-8">
        <section className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-navy">Información general</h2>
          <div>
            <Label>Título</Label>
            <Input data-testid="prop-title" value={form.title} onChange={(e) => set("title", capFirst(e.target.value))} placeholder="Ej. Departamento moderno en la Condesa" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea data-testid="prop-description" value={form.description} onChange={(e) => set("description", capFirst(e.target.value))} placeholder="Describe el inmueble..." rows={4} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Tipo de inmueble</Label>
              <Select value={form.property_type} onValueChange={(v) => set("property_type", v)}>
                <SelectTrigger data-testid="prop-type"><SelectValue /></SelectTrigger>
                <SelectContent>{PROPERTY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Field label="Colonia" testid="prop-colonia" value={form.colonia} onChange={(e) => set("colonia", capFirst(e.target.value))} placeholder="Roma Norte" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Ciudad" testid="prop-city" value={form.city} onChange={(e) => set("city", capFirst(e.target.value))} placeholder="Ciudad de México" />
            <Field label="Estado" testid="prop-state" value={form.state} onChange={(e) => set("state", capFirst(e.target.value))} placeholder="CDMX" />
          </div>
          <Field label="Dirección" testid="prop-address" value={form.address} onChange={(e) => set("address", capFirst(e.target.value))} placeholder="Calle y número (opcional)" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Piso (opcional)" testid="prop-piso" value={form.piso} onChange={(e) => set("piso", e.target.value)} placeholder="Ej. 3" />
            <Field label="Número interior (opcional)" testid="prop-numero-interior" value={form.numero_interior} onChange={(e) => set("numero_interior", e.target.value)} placeholder="Ej. 4B" />
          </div>
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

            <div className="flex items-center justify-between gap-3 border border-stone-200 rounded-xl p-3 bg-stone-50">
              <div>
                <div className="text-sm font-medium text-navy">Mantenimiento</div>
                <div className="text-xs text-stone-500">4% de la renta mensual (lo paga el inquilino)</div>
              </div>
              <span className="text-sm font-semibold text-navy" data-testid="prop-mantenimiento-amt">{money(mantenimientoAmt)}</span>
            </div>

            {form.property_type !== "oficina" && (
              <div className="flex items-center gap-2 border border-stone-200 rounded-xl p-3 bg-stone-50">
                <Switch checked={form.furnished} onCheckedChange={(v) => set("furnished", v)} data-testid="prop-furnished" />
                <Label>Amueblado</Label>
              </div>
            )}

            <div className={`border border-stone-200 rounded-xl p-3 bg-stone-50 ${ivaDisabled ? "opacity-60" : ""}`} data-testid="prop-iva-box">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-navy">Régimen fiscal de IVA</div>
                  <div className="text-xs text-stone-500">
                    Lo puedes consultar en tu constancia de situación fiscal, en tu portal de Internet o con tu contador. <span className="font-semibold text-navy">Dato muy importante.</span>
                  </div>
                  <div className="flex gap-6 mt-2">
                    {[8, 16].map((r) => (
                      <label key={r} className={`flex items-center gap-2 text-sm ${ivaDisabled ? "cursor-not-allowed text-stone-400" : "cursor-pointer text-navy"}`}>
                        <Checkbox
                          data-testid={`prop-iva-${r}`}
                          disabled={ivaDisabled}
                          checked={ivaRate === r}
                          onCheckedChange={(v) => set("iva_rate", v ? r : 0)}
                        />
                        IVA {r}%
                      </label>
                    ))}
                  </div>
                </div>
                <span className="text-sm font-semibold text-emerald-700 whitespace-nowrap" data-testid="prop-iva-amt">+ {money(ivaAmt)}</span>
              </div>
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
          {form.property_type === "oficina" ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field label="Privados" testid="prop-bedrooms" type="number" min="0" step="1" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
                <Field label="Áreas de trabajo" testid="prop-work-areas" type="number" min="0" step="1" value={form.work_areas} onChange={(e) => set("work_areas", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
                <Field label="Baños" testid="prop-bathrooms" type="number" min="0" step="1" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
                <Field label="Estacionamientos" testid="prop-parking" type="number" min="0" step="1" value={form.parking} onChange={(e) => set("parking", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
                <Field label="Área m²" testid="prop-area_m2" type="number" min="0" step="1" value={form.area_m2} onChange={(e) => set("area_m2", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
              </div>
              <div className="flex items-center gap-2"><Switch checked={form.reception} onCheckedChange={(v) => set("reception", v)} data-testid="prop-reception" /><Label>Recepción</Label></div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field label="Recámaras" testid="prop-bedrooms" type="number" min="0" step="1" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
                <Field label="Baños" testid="prop-bathrooms" type="number" min="0" step="1" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
                <Field label="Estacionamientos" testid="prop-parking" type="number" min="0" step="1" value={form.parking} onChange={(e) => set("parking", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
                <Field label="Área m²" testid="prop-area_m2" type="number" min="0" step="1" value={form.area_m2} onChange={(e) => set("area_m2", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
              </div>
              <div className="flex items-center gap-2"><Switch checked={form.pets_allowed} onCheckedChange={(v) => set("pets_allowed", v)} data-testid="prop-pets" /><Label>Pet friendly</Label></div>
            </>
          )}
          <div>
            <Label>Amenidades (separadas por coma)</Label>
            <Input data-testid="prop-amenities" value={form.amenities} onChange={(e) => set("amenities", capFirst(e.target.value))} placeholder="Roof garden, Gimnasio, Seguridad 24h" />
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="publish-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Antes de enviar</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-stone-600">
                <p>Tu inquilino pagará el <strong>2.5% de mantenimiento</strong>; a los 12 meses o al término del contrato se te depositará en tu cuenta para mantenimiento.</p>
                <p>Tu inquilino además pagará el <strong>4% de comisión</strong>.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="publish-confirm-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); submit(null, false); }} className="bg-terracotta hover:bg-terracotta-hover" data-testid="publish-confirm-accept">Aceptar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
