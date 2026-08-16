import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PropertyCard from "@/components/PropertyCard";
import api from "@/lib/api";
import { PROPERTY_TYPES, MEX_STATES, formatMXN } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, Loader2, Frown } from "lucide-react";

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  const [f, setF] = useState({
    q: params.get("q") || "",
    state: params.get("state") || "todos",
    city: params.get("city") || "",
    colonia: params.get("colonia") || "",
    property_type: params.get("property_type") || "todos",
    bedrooms: params.get("bedrooms") || "0",
    bathrooms: params.get("bathrooms") || "0",
    min_area: params.get("min_area") || "",
    max_price: params.get("max_price") ? Number(params.get("max_price")) : 100000,
    furnished: params.get("furnished") === "true",
    parking: params.get("parking") || "0",
    pets_allowed: params.get("pets_allowed") === "true",
  });
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const fetchProps = useCallback(async (state) => {
    setLoading(true);
    try {
      const p = {};
      if (state.q) p.q = state.q;
      if (state.state !== "todos") p.state = state.state;
      if (state.city) p.city = state.city;
      if (state.colonia) p.colonia = state.colonia;
      if (state.property_type !== "todos") p.property_type = state.property_type;
      if (state.bedrooms !== "0") p.bedrooms = state.bedrooms;
      if (state.bathrooms !== "0") p.bathrooms = state.bathrooms;
      if (state.min_area) p.min_area = state.min_area;
      if (state.max_price < 100000) p.max_price = state.max_price;
      if (state.furnished) p.furnished = true;
      if (state.parking !== "0") p.parking = state.parking;
      if (state.pets_allowed) p.pets_allowed = true;
      const { data } = await api.get("/properties", { params: p });
      setProperties(data);
    } catch {
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProps(f); }, []); // eslint-disable-line

  const applyFilters = () => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (v && v !== "todos" && v !== "0" && !(k === "max_price" && v >= 100000) && v !== false) p.set(k, v);
    });
    setParams(p);
    fetchProps(f);
  };

  return (
    <div className="App">
      <Navbar />
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Buscar propiedades</h1>
          <p className="text-stone-600 mt-1">Encuentra la propiedad ideal para arrendar en México.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 lg:sticky lg:top-20 space-y-5 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="flex items-center gap-2 text-navy font-semibold"><SlidersHorizontal className="w-4 h-4" /> Filtros</div>
            <div>
              <Label className="text-sm">ID de la propiedad que viste</Label>
              <div className="flex items-center gap-2 border border-stone-200 rounded-lg px-3 mt-1">
                <Search className="w-4 h-4 text-stone-400" />
                <Input data-testid="filter-id" value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Ej. P160826002" className="border-0 focus-visible:ring-0 shadow-none px-0" />
              </div>
            </div>
            <div>
              <Label className="text-sm">Estado</Label>
              <Select value={f.state} onValueChange={(v) => set("state", v)}>
                <SelectTrigger data-testid="filter-state" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72"><SelectItem value="todos">Todos</SelectItem>{MEX_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Ciudad</Label>
              <Input data-testid="filter-city" value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Ciudad" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Tipo de inmueble</Label>
              <Select value={f.property_type} onValueChange={(v) => set("property_type", v)}>
                <SelectTrigger data-testid="filter-type" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos</SelectItem>{PROPERTY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Recámaras</Label>
                <Select value={f.bedrooms} onValueChange={(v) => set("bedrooms", v)}>
                  <SelectTrigger data-testid="filter-beds" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="0">Todas</SelectItem>{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Baños</Label>
                <Select value={f.bathrooms} onValueChange={(v) => set("bathrooms", v)}>
                  <SelectTrigger data-testid="filter-baths" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="0">Todos</SelectItem>{[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm">Renta máxima: {formatMXN(f.max_price)}</Label>
              <Slider data-testid="filter-price" value={[f.max_price]} onValueChange={(v) => set("max_price", v[0])} min={5000} max={100000} step={1000} className="mt-2" />
            </div>
            <div>
              <Label className="text-sm">Superficie mín. (m²)</Label>
              <Input data-testid="filter-area" type="number" value={f.min_area} onChange={(e) => set("min_area", e.target.value)} placeholder="m²" className="mt-1" />
            </div>
            <div className="flex items-center justify-between"><Label className="text-sm">Amueblado</Label><Switch checked={f.furnished} onCheckedChange={(v) => set("furnished", v)} data-testid="filter-furnished" /></div>
            <div className="flex items-center justify-between"><Label className="text-sm">Mascotas permitidas</Label><Switch checked={f.pets_allowed} onCheckedChange={(v) => set("pets_allowed", v)} data-testid="filter-pets" /></div>
            <Button onClick={applyFilters} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="apply-filters-btn">Aplicar filtros</Button>
          </div>
        </aside>

        <div className="lg:col-span-3">
          {loading ? (
            <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>
          ) : properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-stone-500" data-testid="no-results">
              <Frown className="w-12 h-12 mb-4" />
              <p className="text-lg font-medium">No encontramos inmuebles con esos filtros</p>
              <p className="text-sm">Intenta ampliar tu búsqueda.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-500 mb-5" data-testid="results-count">{properties.length} inmueble(s) encontrado(s)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {properties.map((p, i) => <PropertyCard key={p.id} property={p} index={i} />)}
              </div>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
