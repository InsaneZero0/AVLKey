import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PropertyCard from "@/components/PropertyCard";
import PropertySearch from "@/components/PropertySearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CITIES } from "@/lib/constants";
import api from "@/lib/api";
import {
  ShieldCheck, FileText, CreditCard, Wrench, Scale, Users, Search, Loader2,
  CalendarCheck, ClipboardCheck, Banknote, ArrowRight, CheckCircle2,
  UserCheck, PiggyBank, LifeBuoy, Star, MapPin, Send, Building2, Quote,
} from "lucide-react";

const HERO = "https://images.unsplash.com/photo-1707408118354-aeab9808100a?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600";

const TENANT_STEPS = [
  { icon: Search, title: "Busca y compara", desc: "Filtra por estado, ciudad, tipo, precio y características para encontrar tu inmueble ideal." },
  { icon: CalendarCheck, title: "Agenda y solicita", desc: "Agenda una visita y presenta tu solicitud de arrendamiento en línea." },
  { icon: UserCheck, title: "Verifícate", desc: "Completa tu perfil y documentación para agilizar la aprobación." },
  { icon: FileText, title: "Firma tu contrato", desc: "Revisa y firma un contrato claro con formatos preestablecidos." },
  { icon: CreditCard, title: "Paga en línea", desc: "Realiza tus pagos mensuales con tarjeta de forma segura." },
];

const LANDLORD_STEPS = [
  { icon: Building2, title: "Publica tu inmueble", desc: "Sube fotos, precio y características en minutos." },
  { icon: Users, title: "Recibe solicitudes", desc: "Compara candidatos con un análisis de perfil de riesgo." },
  { icon: FileText, title: "Genera el contrato", desc: "Aprueba una solicitud y el contrato se genera automáticamente." },
  { icon: Banknote, title: "Cobra sin preocuparte", desc: "Nosotros administramos pagos, cobranza y depósitos." },
];

const BENEFITS = [
  { icon: FileText, title: "Contratos claros", desc: "Formatos preestablecidos, revisados y listos para firmar." },
  { icon: UserCheck, title: "Verificación de usuarios", desc: "Validamos identidad y documentación de arrendadores y arrendatarios." },
  { icon: Banknote, title: "Cobranza", desc: "Seguimiento de pagos, recordatorios y gestión de atrasos." },
  { icon: ShieldCheck, title: "Protección del arrendador", desc: "Cobertura de pago bajo condiciones definidas y respaldo ante incumplimientos." },
  { icon: PiggyBank, title: "Administración del depósito", desc: "Retención segura del depósito en garantía durante el contrato." },
  { icon: Wrench, title: "Fondo de mantenimiento", desc: "Administración de un fondo por propiedad para reparaciones." },
  { icon: ClipboardCheck, title: "Inspecciones", desc: "Inspecciones iniciales y finales documentadas con evidencia." },
  { icon: Scale, title: "Acompañamiento legal", desc: "Apoyo jurídico y expedientes legales digitales." },
];

const TESTIMONIALS = [
  { name: "María Fernanda G.", role: "Arrendadora · CDMX", text: "Dejé de preocuparme por la cobranza. La plataforma administra todo y los pagos llegan puntuales." },
  { name: "Luis Ramírez", role: "Arrendatario · Monterrey", text: "Rentar fue rapidísimo. Todo en línea, con un contrato claro y sin sorpresas." },
  { name: "Grupo Inmobiliario Sur", role: "Arrendador · Guadalajara", text: "El análisis de riesgo nos ayuda a elegir mejores inquilinos. Excelente respaldo legal." },
];

const FAQS = [
  { q: "¿Qué tipo de inmuebles puedo rentar?", a: "Viviendas, departamentos, oficinas, locales comerciales, terrenos, bodegas y espacios industriales en todo México." },
  { q: "¿Cómo se administran los pagos?", a: "Los pagos mensuales se realizan con tarjeta de forma segura. La plataforma da seguimiento, gestiona la cobranza y administra el depósito en garantía." },
  { q: "¿Cómo verifican a los usuarios?", a: "Validamos identidad y documentación, y analizamos el perfil de riesgo de cada candidato con reglas claras basadas en ingresos, empleo y aval." },
  { q: "¿Qué pasa si el arrendatario no paga?", a: "Ofrecemos gestión de cobranza, recordatorios y protección del arrendador bajo condiciones definidas, además de acompañamiento legal." },
  { q: "¿La plataforma genera el contrato?", a: "Sí. Al aprobar una solicitud se genera un contrato con formatos preestablecidos, listo para revisión y firma." },
  { q: "¿Tiene costo publicar una propiedad?", a: "Publicar es gratis. La plataforma aplica una comisión sobre la administración del arrendamiento." },
];

const BLOG = [
  { title: "Guía para rentar tu primer departamento en México", tag: "Arrendatarios", img: "https://images.unsplash.com/photo-1708127665429-37cb0a7036f1?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { title: "5 claves para elegir un buen inquilino", tag: "Arrendadores", img: "https://images.pexels.com/photos/21853674/pexels-photo-21853674.jpeg?auto=compress&cs=tinysrgb&w=600" },
  { title: "Depósito en garantía: cómo funciona y cómo se administra", tag: "Legal", img: "https://images.pexels.com/photos/36729673/pexels-photo-36729673.jpeg?auto=compress&cs=tinysrgb&w=600" },
];

export default function Landing() {
  const navigate = useNavigate();
  const [featured, setFeatured] = useState([]);
  const [folioQuery, setFolioQuery] = useState("");
  const [folioLoading, setFolioLoading] = useState(false);

  useEffect(() => {
    api.get("/properties").then(({ data }) => setFeatured(data.slice(0, 6))).catch(() => {});
  }, []);

  const searchByFolio = async (e) => {
    e.preventDefault();
    const folio = folioQuery.trim();
    if (!folio) return;
    setFolioLoading(true);
    try {
      const { data } = await api.get(`/properties/by-folio/${encodeURIComponent(folio)}`);
      navigate(`/inmueble/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "No encontramos una propiedad con ese ID");
    } finally {
      setFolioLoading(false);
    }
  };

  return (
    <div className="App">
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[94vh] flex items-center">
        <img src={HERO} alt="Arrendamiento en México" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 w-full py-24">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-3xl">
            <span className="inline-block text-xs uppercase tracking-[0.2em] text-amber-300 font-semibold mb-4">Arrendamiento tradicional · México</span>
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] tracking-tight">
              Rentar con <span className="text-amber-400">confianza</span> nunca fue tan fácil
            </h1>
            <p className="mt-6 text-lg text-stone-100/90 leading-relaxed max-w-xl">
              Publica, busca y administra arrendamientos con contratos claros, pagos seguros, cobranza y respaldo legal, de principio a fin.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button onClick={() => navigate("/explorar")} className="rounded-full bg-terracotta hover:bg-terracotta-hover h-12 px-8 text-base" data-testid="hero-buscar-btn">
                <Search className="w-4 h-4 mr-2" /> Buscar una propiedad
              </Button>
              <Button onClick={() => navigate("/panel/publicar")} variant="outline" className="rounded-full h-12 px-8 text-base bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white" data-testid="hero-publicar-btn">
                Publicar mi propiedad
              </Button>
            </div>

            <form onSubmit={searchByFolio} className="mt-6 flex items-center gap-2 max-w-md" data-testid="folio-search-form">
              <Input
                value={folioQuery}
                onChange={(e) => setFolioQuery(e.target.value.toUpperCase())}
                placeholder="ID de la propiedad que viste (ej. P310726001)"
                data-testid="folio-search-input"
                className="h-12 rounded-full bg-white/95 border-0 text-navy placeholder:text-stone-400"
              />
              <Button type="submit" disabled={folioLoading} className="rounded-full bg-navy hover:bg-navy/90 h-12 px-6 shrink-0" data-testid="folio-search-btn">
                {folioLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-2" /> Buscar por ID</>}
              </Button>
            </form>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }} className="mt-10 max-w-4xl">
            <PropertySearch />
          </motion.div>
        </div>
      </section>

      {/* Featured */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold">Propiedades destacadas</span>
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
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight mt-2">Un proceso simple para todos</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <h3 className="font-display font-semibold text-xl text-navy flex items-center gap-2 mb-6"><Users className="w-5 h-5 text-terracotta" /> Para arrendatarios</h3>
              <div className="space-y-5">
                {TENANT_STEPS.map((s, i) => (
                  <div key={s.title} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-terracotta/10 flex items-center justify-center shrink-0"><s.icon className="w-5 h-5 text-terracotta" /></div>
                    <div>
                      <div className="font-medium text-navy">{i + 1}. {s.title}</div>
                      <p className="text-sm text-stone-600 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-display font-semibold text-xl text-navy flex items-center gap-2 mb-6"><Building2 className="w-5 h-5 text-navy" /> Para arrendadores</h3>
              <div className="space-y-5">
                {LANDLORD_STEPS.map((s, i) => (
                  <div key={s.title} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center shrink-0"><s.icon className="w-5 h-5 text-navy" /></div>
                    <div>
                      <div className="font-medium text-navy">{i + 1}. {s.title}</div>
                      <p className="text-sm text-stone-600 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="max-w-2xl mb-14">
          <span className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold">Beneficios</span>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight mt-2">Todo lo que necesitas para administrar tu renta</h2>
          <p className="text-stone-600 mt-3">Pagar y administrar mediante la plataforma te da tranquilidad y respaldo en cada etapa.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {BENEFITS.map((s) => (
            <div key={s.title} className="bg-white rounded-2xl border border-stone-200 p-6 hover:shadow-[0_20px_40px_rgb(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300">
              <div className="w-11 h-11 rounded-xl bg-navy/5 flex items-center justify-center mb-4"><s.icon className="w-5 h-5 text-navy" strokeWidth={1.8} /></div>
              <h3 className="font-display font-semibold text-navy">{s.title}</h3>
              <p className="text-sm text-stone-600 mt-2 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cities */}
      <section className="bg-white border-y border-stone-200 py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mb-10">
            <span className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold">Ciudades disponibles</span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight mt-2">Estamos en las principales ciudades</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CITIES.map((c) => (
              <button key={c.name} onClick={() => navigate(`/explorar?city=${encodeURIComponent(c.name)}`)} data-testid={`city-${c.name}`} className="group relative aspect-[3/4] rounded-2xl overflow-hidden">
                <img src={c.img} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-3 left-3 text-white"><div className="font-display font-semibold">{c.name}</div><div className="text-xs text-stone-200 flex items-center gap-1"><MapPin className="w-3 h-3" />{c.state}</div></div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="max-w-2xl mb-14">
          <span className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold">Testimonios</span>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight mt-2">Historias de confianza</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="bg-white rounded-2xl border border-stone-200 p-7">
              <Quote className="w-8 h-8 text-terracotta/30" />
              <p className="text-stone-700 mt-3 leading-relaxed">{t.text}</p>
              <div className="flex items-center gap-1 mt-4 text-amber-400">{[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}</div>
              <div className="mt-4 border-t border-stone-100 pt-4"><div className="font-medium text-navy">{t.name}</div><div className="text-xs text-stone-500">{t.role}</div></div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ + Help center */}
      <section id="ayuda" className="bg-white border-y border-stone-200 py-20">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 text-terracotta font-semibold text-xs uppercase tracking-[0.2em]"><LifeBuoy className="w-4 h-4" /> Centro de ayuda</div>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight mt-2">Preguntas frecuentes</h2>
          </div>
          <Accordion type="single" collapsible className="w-full" data-testid="faq-accordion">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left font-medium text-navy" data-testid={`faq-${i}`}>{f.q}</AccordionTrigger>
                <AccordionContent className="text-stone-600 leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Blog */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold">Blog</span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-navy tracking-tight mt-2">Aprende sobre arrendamiento</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {BLOG.map((b) => (
            <div key={b.title} className="group cursor-pointer bg-white rounded-2xl overflow-hidden border border-stone-200 hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300">
              <div className="aspect-[16/10] overflow-hidden"><img src={b.img} alt={b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /></div>
              <div className="p-6">
                <span className="text-xs uppercase tracking-wider text-terracotta font-semibold">{b.tag}</span>
                <h3 className="font-display font-semibold text-navy mt-2 leading-snug">{b.title}</h3>
                <span className="text-sm text-terracotta font-medium mt-3 inline-flex items-center gap-1">Leer más <ArrowRight className="w-4 h-4" /></span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA publish */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-navy p-10 sm:p-16">
          <div className="relative max-w-2xl">
            <Send className="w-10 h-10 text-amber-400 mb-5" />
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight">¿Tienes una propiedad para rentar?</h2>
            <p className="text-stone-300 mt-4 text-lg">Publícala gratis y deja que administremos contratos, pagos y cobranza por ti.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button onClick={() => navigate("/panel/publicar")} className="rounded-full bg-terracotta hover:bg-terracotta-hover h-12 px-8 text-base" data-testid="cta-publish-btn">
                Publicar mi propiedad
              </Button>
              <Button onClick={() => navigate("/registro")} variant="outline" className="rounded-full h-12 px-8 text-base bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white" data-testid="cta-register-btn">
                Crear cuenta gratis
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
