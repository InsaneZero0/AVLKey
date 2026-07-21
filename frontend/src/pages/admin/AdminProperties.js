import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TYPE_LABEL, formatMXN } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Check, X, Building2, MapPin } from "lucide-react";

const reviewColor = { pendiente: "bg-amber-100 text-amber-700", aprobada: "bg-green-100 text-green-700", rechazada: "bg-red-100 text-red-700" };

export default function AdminProperties() {
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const [props, setProps] = useState(null);
  const [tab, setTab] = useState("pendiente");

  const load = () => api.get("/admin/properties").then(({ data }) => setProps(data)).catch(() => setProps([]));
  useEffect(() => { load(); }, []);

  const review = async (id, decision) => {
    try {
      await api.patch(`/admin/properties/${id}/review`, { decision });
      toast.success(decision === "aprobada" ? "Propiedad aprobada" : "Propiedad rechazada");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Sin permiso"); }
  };

  if (!props) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const filtered = props.filter((p) => (p.review_status || "aprobada") === tab);

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Revisión de propiedades</h1>
      <p className="text-stone-500 mt-1">Aprueba o rechaza las publicaciones de los arrendadores.</p>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList data-testid="review-tabs">
          <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
          <TabsTrigger value="aprobada">Aprobadas</TabsTrigger>
          <TabsTrigger value="rechazada">Rechazadas</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <div className="mt-6 bg-white border border-dashed border-stone-300 rounded-xl py-16 flex flex-col items-center text-stone-500"><Building2 className="w-10 h-10 mb-3" /><p>No hay propiedades en este estado</p></div>
      ) : (
        <div className="mt-6 space-y-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4" data-testid={`review-property-${p.id}`}>
              <img src={p.images?.[0]} alt="" className="w-full sm:w-36 h-28 object-cover rounded-lg bg-stone-100" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge className="rounded-full bg-terracotta/10 text-terracotta hover:bg-terracotta/10">{TYPE_LABEL[p.property_type]}</Badge>
                  <Badge className={`rounded-full ${reviewColor[p.review_status || "aprobada"]}`}>{p.review_status || "aprobada"}</Badge>
                </div>
                <h3 className="font-display font-semibold text-navy mt-2">{p.title}</h3>
                <div className="flex items-center gap-1.5 text-stone-500 text-sm"><MapPin className="w-3.5 h-3.5" />{p.city} · {formatMXN(p.price_month)}/mes</div>
                {tab === "pendiente" && (
                  <div className="flex gap-2 mt-3">
                    {perms.includes("aprobar") && <Button size="sm" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => review(p.id, "aprobada")} data-testid={`approve-prop-${p.id}`}><Check className="w-4 h-4 mr-1" /> Aprobar</Button>}
                    {perms.includes("rechazar") && <Button size="sm" variant="outline" className="rounded-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => review(p.id, "rechazada")} data-testid={`reject-prop-${p.id}`}><X className="w-4 h-4 mr-1" /> Rechazar</Button>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
