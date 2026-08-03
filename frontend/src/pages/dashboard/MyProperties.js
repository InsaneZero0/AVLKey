import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import { TYPE_LABEL, formatMXN, STATUS_LABEL, PROPERTY_STATUS_COLOR } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PlusCircle, Trash2, Inbox, Building2, Loader2, MapPin, MessageSquare, Bed, Bath, Car, Maximize, Sofa, PawPrint } from "lucide-react";

export default function MyProperties() {
  const navigate = useNavigate();
  const [props, setProps] = useState(null);

  const load = () => api.get("/my/properties").then(({ data }) => setProps(data)).catch(() => setProps([]));
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    try {
      await api.delete(`/properties/${id}`);
      toast.success("Inmueble eliminado");
      load();
    } catch { toast.error("No se pudo eliminar"); }
  };

  const sendToAdmin = async (p) => {
    try {
      await api.put(`/properties/${p.id}`, {
        title: p.title, description: p.description || "", property_type: p.property_type,
        address: p.address || "", city: p.city, state: p.state || "", colonia: p.colonia || "",
        price_month: p.price_month, deposit: 0, maintenance_fee: p.maintenance_fee || 0,
        bedrooms: p.bedrooms || 0, bathrooms: p.bathrooms || 0, parking: p.parking || 0, area_m2: p.area_m2 || 0,
        furnished: !!p.furnished, pets_allowed: !!p.pets_allowed, amenities: p.amenities || [], images: p.images || [],
        review_stage: "recibido",
      });
      toast.success("¡Información enviada al departamento de validación!");
      load();
    } catch { toast.error("No se pudo enviar la información"); }
  };

  if (!props) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Mis inmuebles</h1>
          <p className="text-stone-500 mt-1">{props.length} propiedad(es) publicada(s)</p>
        </div>
        <Button onClick={() => navigate("/panel/publicar")} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="add-property-btn">
          <PlusCircle className="w-4 h-4 mr-2" /> Publicar
        </Button>
      </div>

      {props.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl py-20 flex flex-col items-center text-stone-500" data-testid="empty-properties">
          <Building2 className="w-12 h-12 mb-4" />
          <p className="font-medium">Aún no has publicado inmuebles</p>
          <Button onClick={() => navigate("/panel/publicar")} className="mt-4 rounded-full bg-terracotta hover:bg-terracotta-hover">Publicar mi primer inmueble</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {props.map((p) => (
            <div key={p.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col sm:flex-row gap-4" data-testid={`my-property-${p.id}`}>
              <div className="w-full sm:w-40 shrink-0 flex flex-col gap-2" data-testid={`prop-photos-${p.id}`}>
                {(p.images?.length ? p.images : [null]).map((im, i) => (
                  <img key={i} src={im || undefined} alt={p.title} className="w-full h-32 object-cover rounded-xl bg-stone-100" />
                ))}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-terracotta/10 text-terracotta hover:bg-terracotta/10 rounded-full">{TYPE_LABEL[p.property_type]}</Badge>
                      <Badge className={`rounded-full ${PROPERTY_STATUS_COLOR[p.display_status] || "bg-stone-100 text-stone-600"}`} data-testid={`my-prop-status-${p.id}`}>{STATUS_LABEL[p.display_status] || STATUS_LABEL[p.status]}</Badge>
                    </div>
                    <h3 className="font-display font-semibold text-lg text-navy mt-2">{p.title}</h3>
                    {p.public_id && <div className="text-xs font-mono text-stone-400" data-testid={`prop-folio-${p.id}`}>Folio: {p.public_id}</div>}
                    <div className="flex items-center gap-1.5 text-stone-500 text-sm"><MapPin className="w-3.5 h-3.5" />{p.city}</div>
                  </div>
                  <div className="font-display font-bold text-xl text-terracotta whitespace-nowrap">{formatMXN(p.price_month)}<span className="text-xs text-stone-400 font-normal">/mes</span></div>
                </div>

                {p.admin_note && (
                  <div className="mt-3 flex items-start gap-2 bg-amber-50 text-amber-800 rounded-lg px-3 py-2 text-sm" data-testid={`prop-admin-note-${p.id}`}>
                    <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                    <span><span className="font-medium">Observación de validación:</span> {p.admin_note}</span>
                  </div>
                )}

                <div className="flex items-center justify-between mt-4">
                  <button onClick={() => navigate("/panel/recibidas")} className="flex items-center gap-1.5 text-sm text-navy hover:text-terracotta transition-colors">
                    <Inbox className="w-4 h-4" /> {p.applications_count} solicitud(es)
                  </button>
                  <div className="flex gap-2">
                    {p.display_status === "borrador" && (
                      <>
                        <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate(`/panel/publicar/${p.id}`)} data-testid={`edit-${p.id}`}>Editar</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid={`send-${p.id}`}>Enviar información</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent data-testid={`send-dialog-${p.id}`}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Enviar información al administrador</AlertDialogTitle>
                              <AlertDialogDescription>Tu inmueble pasará al departamento de validación. Después de enviar ya no aparecerá como borrador editable.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel data-testid={`send-cancel-${p.id}`}>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => sendToAdmin(p)} className="bg-terracotta hover:bg-terracotta-hover" data-testid={`send-accept-${p.id}`}>Enviar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate(`/inmueble/${p.id}`)}>Ver</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-full text-red-600 border-red-200 hover:bg-red-50" data-testid={`delete-${p.id}`}><Trash2 className="w-4 h-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar este inmueble?</AlertDialogTitle>
                          <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(p.id)} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-stone-100 space-y-4" data-testid={`prop-details-${p.id}`}>
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
                      <div><div className="text-xs text-stone-400">Mantenimiento (3%)</div><div className="text-navy font-medium">{formatMXN(p.maintenance_fee || 0)}</div></div>
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
                  </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
