import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PropertyCard from "@/components/PropertyCard";
import api from "@/lib/api";
import { PROPERTY_TYPES, formatMXN } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, Loader2, Frown } from "lucide-react";

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [type, setType] = useState("todos");
  const [beds, setBeds] = useState("0");
  const [maxPrice, setMaxPrice] = useState(100000);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProps = useCallback(async () => {
    setLoading(true);
    try {
      const p = {};
      if (q) p.q = q;
      if (type !== "todos") p.property_type = type;
      if (beds !== "0") p.bedrooms = beds;
      if (maxPrice < 100000) p.max_price = maxPrice;
      const { data } = await api.get("/properties", { params: p });
      setProperties(data);
    } catch {
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [q, type, beds, maxPrice]);

  useEffect(() => { fetchProps(); }, []); // eslint-disable-line

  const applyFilters = () => {
    setParams(q ? { q } : {});
    fetchProps();
  };

  return (
    <div className="App">
      <Navbar />
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Explorar inmuebles</h1>
          <p className="text-stone-600 mt-1">Encuentra la propiedad ideal para arrendar en México.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Filters */}
        <aside className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 sticky top-20 space-y-6">
            <div className="flex items-center gap-2 text-navy font-semibold">
              <SlidersHorizontal className="w-4 h-4" /> Filtros
            </div>
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1.5 block">Búsqueda</label>
              <div className="flex items-center gap-2 border border-stone-200 rounded-lg px-3">
                <Search className="w-4 h-4 text-stone-400" />
                <Input data-testid="filter-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ciudad, colonia..." className="border-0 focus-visible:ring-0 shadow-none px-0" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1.5 block">Tipo de inmueble</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger data-testid="filter-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {PROPERTY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1.5 block">Recámaras (mín.)</label>
              <Select value={beds} onValueChange={setBeds}>
                <SelectTrigger data-testid="filter-beds"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Cualquiera</SelectItem>
                  {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-stone-700 mb-2 block">Renta máxima: {formatMXN(maxPrice)}</label>
              <Slider data-testid="filter-price" value={[maxPrice]} onValueChange={(v) => setMaxPrice(v[0])} min={5000} max={100000} step={1000} />
            </div>
            <Button onClick={applyFilters} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="apply-filters-btn">Aplicar filtros</Button>
          </div>
        </aside>

        {/* Results */}
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
