import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PropertyCard from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { Loader2, Heart, Search } from "lucide-react";

export default function Favorites() {
  const navigate = useNavigate();
  const { favoriteIds } = useAuth();
  const [props, setProps] = useState(null);

  const load = () => api.get("/my/favorites").then(({ data }) => setProps(data)).catch(() => setProps([]));
  useEffect(() => { load(); }, [favoriteIds.length]); // eslint-disable-line

  if (!props) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Mis favoritos</h1>
          <p className="text-stone-500 mt-1">{props.length} inmueble(s) guardado(s)</p>
        </div>
        <Button onClick={() => navigate("/explorar")} className="rounded-full bg-terracotta hover:bg-terracotta-hover"><Search className="w-4 h-4 mr-2" /> Explorar</Button>
      </div>

      {props.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl py-20 flex flex-col items-center text-stone-500" data-testid="empty-favorites">
          <Heart className="w-12 h-12 mb-4" />
          <p className="font-medium">Aún no has guardado favoritos</p>
          <p className="text-sm">Toca el corazón en cualquier inmueble para guardarlo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {props.map((p, i) => <PropertyCard key={p.id} property={p} index={i} />)}
        </div>
      )}
    </div>
  );
}
