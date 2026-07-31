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
import { PlusCircle, Trash2, Inbox, Building2, Loader2, MapPin, MessageSquare } from "lucide-react";

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
              <img src={p.images?.[0]} alt={p.title} className="w-full sm:w-40 h-32 object-cover rounded-xl bg-stone-100" />
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
