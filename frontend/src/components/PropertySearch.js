import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROPERTY_TYPES, MEX_STATES, LEASE_TERMS } from "@/lib/constants";
import { Search, SlidersHorizontal, ChevronUp } from "lucide-react";

const initial = {
  state: "todos", city: "", colonia: "", property_type: "todos",
  min_price: "", max_price: "", bedrooms: "0", bathrooms: "0", min_area: "",
  furnished: false, parking: "0", pets_allowed: false, available_from: "", lease_term: "0",
};

export default function PropertySearch({ variant = "hero" }) {
  const navigate = useNavigate();
  const [f, setF] = useState(initial);
  const [open, setOpen] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });

  const submit = () => {
    const p = new URLSearchParams();
    if (f.state !== "todos") p.set("state", f.state);
    if (f.city) p.set("city", f.city);
    if (f.colonia) p.set("colonia", f.colonia);
    if (f.property_type !== "todos") p.set("property_type", f.property_type);
    if (f.min_price) p.set("min_price", f.min_price);
    if (f.max_price) p.set("max_price", f.max_price);
    if (f.bedrooms !== "0") p.set("bedrooms", f.bedrooms);
    if (f.bathrooms !== "0") p.set("bathrooms", f.bathrooms);
    if (f.min_area) p.set("min_area", f.min_area);
    if (f.furnished) p.set("furnished", "true");
    if (f.parking !== "0") p.set("parking", f.parking);
    if (f.pets_allowed) p.set("pets_allowed", "true");
    navigate(`/explorar?${p.toString()}`);
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-2xl w-full" data-testid="property-search">
      {/* Primary row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-stone-500">Estado</Label>
          <Select value={f.state} onValueChange={(v) => set("state", v)}>
            <SelectTrigger data-testid="search-state" className="mt-1"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="todos">Todos los estados</SelectItem>
              {MEX_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-stone-500">Ciudad</Label>
          <Input data-testid="search-city" className="mt-1" value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Ciudad" />
        </div>
        <div>
          <Label className="text-xs text-stone-500">Tipo de inmueble</Label>
          <Select value={f.property_type} onValueChange={(v) => set("property_type", v)}>
            <SelectTrigger data-testid="search-type" className="mt-1"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {PROPERTY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={submit} className="w-full rounded-xl bg-terracotta hover:bg-terracotta-hover h-10" data-testid="search-submit">
            <Search className="w-4 h-4 mr-2" /> Buscar
          </Button>
        </div>
      </div>

      <button onClick={() => setOpen(!open)} className="mt-3 flex items-center gap-1.5 text-sm text-terracotta font-medium hover:text-terracotta-hover" data-testid="toggle-advanced">
        {open ? <ChevronUp className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
        {open ? "Ocultar filtros" : "Filtros avanzados"}
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="advanced-filters">
          <div>
            <Label className="text-xs text-stone-500">Municipio / Alcaldía</Label>
            <Input className="mt-1" value={f.colonia} onChange={(e) => set("colonia", e.target.value)} placeholder="Colonia o zona" data-testid="search-colonia" />
          </div>
          <div>
            <Label className="text-xs text-stone-500">Precio mínimo</Label>
            <Input className="mt-1" type="number" value={f.min_price} onChange={(e) => set("min_price", e.target.value)} placeholder="$" data-testid="search-min-price" />
          </div>
          <div>
            <Label className="text-xs text-stone-500">Precio máximo</Label>
            <Input className="mt-1" type="number" value={f.max_price} onChange={(e) => set("max_price", e.target.value)} placeholder="$" data-testid="search-max-price" />
          </div>
          <div>
            <Label className="text-xs text-stone-500">Superficie mín. (m²)</Label>
            <Input className="mt-1" type="number" value={f.min_area} onChange={(e) => set("min_area", e.target.value)} placeholder="m²" data-testid="search-area" />
          </div>
          <div>
            <Label className="text-xs text-stone-500">Habitaciones</Label>
            <Select value={f.bedrooms} onValueChange={(v) => set("bedrooms", v)}>
              <SelectTrigger className="mt-1" data-testid="search-beds"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="0">Cualquiera</SelectItem>{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-stone-500">Baños</Label>
            <Select value={f.bathrooms} onValueChange={(v) => set("bathrooms", v)}>
              <SelectTrigger className="mt-1" data-testid="search-baths"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="0">Cualquiera</SelectItem>{[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-stone-500">Estacionamientos</Label>
            <Select value={f.parking} onValueChange={(v) => set("parking", v)}>
              <SelectTrigger className="mt-1" data-testid="search-parking"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="0">Cualquiera</SelectItem>{[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-stone-500">Plazo mínimo</Label>
            <Select value={f.lease_term} onValueChange={(v) => set("lease_term", v)}>
              <SelectTrigger className="mt-1" data-testid="search-term"><SelectValue placeholder="Plazo" /></SelectTrigger>
              <SelectContent><SelectItem value="0">Cualquiera</SelectItem>{LEASE_TERMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-stone-500">Disponible desde</Label>
            <Input className="mt-1" type="date" value={f.available_from} onChange={(e) => set("available_from", e.target.value)} data-testid="search-date" />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={f.furnished} onCheckedChange={(v) => set("furnished", v)} data-testid="search-furnished" />
            <Label className="text-sm">Amueblado</Label>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={f.pets_allowed} onCheckedChange={(v) => set("pets_allowed", v)} data-testid="search-pets" />
            <Label className="text-sm">Mascotas</Label>
          </div>
        </div>
      )}
    </div>
  );
}
