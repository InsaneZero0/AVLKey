import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PropertyCard from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import {
  Search, ShieldCheck, FileText, CreditCard, Wrench, Scale, Users,
  CalendarCheck, ClipboardCheck, Banknote, ArrowRight, CheckCircle2,
} from "lucide-react";

const HERO = "https://images.unsplash.com/photo-1707408118354-aeab9808100a?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600";

const SERVICES = [
  { icon: FileText, title: "Contratos y expedientes", desc: "Formatos preestablecidos, ratificación de firmas y expedientes legales digitales." },
  { icon: CreditCard, title: "Pagos y cobranza", desc: "Renta mensual con tarjeta, seguimiento de atrasos y gestión de cobranza." },
  { icon: ShieldCheck, title: "Depósitos en garantía", desc: "Retención segura de depósitos y fondos de mantenimiento administrados." },
  { icon: ClipboardCheck, title: "Inspecciones", desc: "Inspecciones iniciales y finales documentadas con evidencia fotográfica." },
  { icon: Wrench, title: "Mantenimiento", desc: "Coordinación de solicitudes y fondo de mantenimiento por propiedad." },
  { icon: Scale, title: "Respaldo legal", desc: "Análisis de perfil de riesgo y apoyo jurídico ante incumplimientos." },
];

const STEPS = [
  { icon: Search, title: "Publica o busca", desc: "Los arrendadores publican inmuebles; los arrendatarios buscan y comparan." },
  { icon: CalendarCheck, title: "Solicita y agenda", desc: "Presenta tu solicitud de arrendamiento y agenda una visita." },
  { icon: ShieldCheck, title: "Verificación", desc: "Analizamos el perfil de riesgo y verificamos la documentación." },
  { icon: FileText, title: "Contrato", desc: "Generamos el contrato y coordinamos la ratificación de firmas." },
  { icon: Banknote, title: "Administra", desc: "Pagos mensuales, cobranza, mantenimiento e inspecciones en un solo lugar." },
];

export default function Landing() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    api.get("/properties").then(({ data }) => setFeatured(data.slice(0, 6))).catch(() => {});
  }, []);

  const search = () => navigate(`/explorar${query ? `?q=${encodeURIComponent(query)}` : ""}`);

  return (
    <div className="App">
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[92vh] flex items-center">
        <img src={HERO} alt="Arrendamiento en México" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 w-full">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-2xl">
            <span className="inline-block text-xs uppercase tracking-[0.2em] text-amber-300 font-semibold mb-4">Arrendamiento tradicional · México</span>
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] tracking-tight">
              Rentar nunca fue tan <span className="text-amber-400">claro y confiable</span>
            </h1>
            <p className="mt-6 text-lg text-stone-100/90 leading-relaxed max-w-xl">
              Conectamos arrendadores y arrendatarios con contratos, pagos, cobranza y respaldo legal administrados de principio a fin.
            </p>

            <div className="mt-8 bg-white rounded-2xl p-2 flex flex-col sm:flex-row gap-2 shadow-2xl max-w-xl">
              <div className="flex items-center gap-2 flex-1 px-3">
                <Search className="w-5 h-5 text-stone-400" />
                <Input
                  data-testid="hero-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder="Ciudad, colonia o tipo de inmueble..."
                  className="border-0 focus-visible:ring-0 text-base shadow-none"
                />
              </div>
              <Button data-testid="hero-search-btn" onClick={search} className="rounded-xl bg-terracotta hover:bg-terracotta-hover h-12 px-8 text-base">
                Buscar
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-100/80">
              {["Sin comisiones ocultas", "Contratos verificados", "Pagos seguros"].map((t) => (
                <span key={t} className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-amber-400" />{t}</span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold">Inmuebles destacados</span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight mt-2">Encuentra tu próximo espacio</h2>
          </div>
          <Button variant="ghost" onClick={() => navigate("/explorar")} className="hidden sm:flex text-terracotta hover:text-terracotta-hover" data-testid="ver-todos-btn">
            Ver todos <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((p, i) => <PropertyCard key={p.id} property={p} index={i} />)}
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="bg-white border-y border-stone-200 py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mb-14">
            <span className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold">Cómo funciona</span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight mt-2">Un proceso simple, de inicio a fin</h2>
            <p className="text-stone-600 mt-3">Inspirado en la facilidad de las mejores plataformas, enfocado en arrendamiento de mediano y largo plazo.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative">
                <div className="w-12 h-12 rounded-xl bg-terracotta/10 flex items-center justify-center mb-4">
                  <s.icon className="w-6 h-6 text-terracotta" strokeWidth={1.8} />
                </div>
                <div className="text-xs font-bold text-stone-300 mb-1">0{i + 1}</div>
                <h3 className="font-display font-semibold text-navy">{s.title}</h3>
                <p className="text-sm text-stone-600 mt-1 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="servicios" className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="max-w-2xl mb-14">
          <span className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold">Servicios</span>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight mt-2">Administramos toda la relación de arrendamiento</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((s) => (
            <div key={s.title} className="bg-white rounded-2xl border border-stone-200 p-7 hover:shadow-[0_20px_40px_rgb(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-navy/5 flex items-center justify-center mb-5">
                <s.icon className="w-6 h-6 text-navy" strokeWidth={1.8} />
              </div>
              <h3 className="font-display font-semibold text-lg text-navy">{s.title}</h3>
              <p className="text-sm text-stone-600 mt-2 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-navy p-10 sm:p-16">
          <div className="relative max-w-2xl">
            <Users className="w-10 h-10 text-amber-400 mb-5" />
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight">Únete a la comunidad de arrendamiento formal</h2>
            <p className="text-stone-300 mt-4 text-lg">Miles de arrendadores y arrendatarios confiables ya administran sus rentas con nosotros.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button onClick={() => navigate("/registro")} className="rounded-full bg-terracotta hover:bg-terracotta-hover h-12 px-8 text-base" data-testid="cta-register-btn">
                Crear cuenta gratis
              </Button>
              <Button onClick={() => navigate("/explorar")} variant="outline" className="rounded-full h-12 px-8 text-base bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white" data-testid="cta-explore-btn">
                Explorar inmuebles
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
