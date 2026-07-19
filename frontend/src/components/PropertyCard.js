import React from "react";
import { useNavigate } from "react-router-dom";
import { TYPE_LABEL, formatMXN, STATUS_LABEL } from "@/lib/constants";
import { Bed, Bath, Maximize, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function PropertyCard({ property, index = 0 }) {
  const navigate = useNavigate();
  const img = property.images?.[0] || "https://images.pexels.com/photos/7746560/pexels-photo-7746560.jpeg?auto=compress&cs=tinysrgb&w=940";

  return (
    <div
      onClick={() => navigate(`/inmueble/${property.id}`)}
      data-testid={`property-card-${property.id}`}
      className="group cursor-pointer bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        <img src={img} alt={property.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className="bg-white/90 text-navy hover:bg-white backdrop-blur-sm rounded-full">{TYPE_LABEL[property.property_type]}</Badge>
        </div>
        {property.status && property.status !== "disponible" && (
          <div className="absolute top-3 right-3">
            <Badge className="bg-navy/90 text-white rounded-full">{STATUS_LABEL[property.status]}</Badge>
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-center gap-1.5 text-stone-500 text-xs mb-1.5">
          <MapPin className="w-3.5 h-3.5" />
          <span>{property.colonia ? `${property.colonia}, ` : ""}{property.city}</span>
        </div>
        <h3 className="font-display font-semibold text-lg text-navy leading-snug line-clamp-1">{property.title}</h3>
        <div className="flex items-center gap-4 mt-3 text-stone-600 text-sm">
          {property.bedrooms > 0 && <span className="flex items-center gap-1"><Bed className="w-4 h-4" />{property.bedrooms}</span>}
          {property.bathrooms > 0 && <span className="flex items-center gap-1"><Bath className="w-4 h-4" />{property.bathrooms}</span>}
          {property.area_m2 > 0 && <span className="flex items-center gap-1"><Maximize className="w-4 h-4" />{property.area_m2} m²</span>}
        </div>
        <div className="mt-4 pt-4 border-t border-stone-100 flex items-baseline gap-1">
          <span className="font-display font-bold text-xl text-terracotta">{formatMXN(property.price_month)}</span>
          <span className="text-stone-500 text-sm">/mes</span>
        </div>
      </div>
    </div>
  );
}
