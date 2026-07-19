import React from "react";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-navy text-stone-300 mt-24">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-terracotta flex items-center justify-center">
              <Home className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-lg text-white">Réntalo en Línea</span>
          </div>
          <p className="text-sm text-stone-400 leading-relaxed">La plataforma que administra tus arrendamientos con reglas claras, pagos seguros y respaldo legal en todo México.</p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-[0.15em]">Plataforma</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/explorar" className="hover:text-terracotta transition-colors">Explorar inmuebles</Link></li>
            <li><Link to="/registro" className="hover:text-terracotta transition-colors">Publicar inmueble</Link></li>
            <li><Link to="/registro" className="hover:text-terracotta transition-colors">Crear cuenta</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-[0.15em]">Servicios</h4>
          <ul className="space-y-2 text-sm">
            <li>Contratos y expedientes</li>
            <li>Pagos y cobranza</li>
            <li>Depósitos en garantía</li>
            <li>Inspecciones y mantenimiento</li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-[0.15em]">Contacto</h4>
          <ul className="space-y-2 text-sm">
            <li>hola@rentaloenlinea.mx</li>
            <li>55 1234 5678</li>
            <li>Ciudad de México, MX</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-6 text-center text-xs text-stone-500">
        © {new Date().getFullYear()} Réntalo en Línea. Todos los derechos reservados.
      </div>
    </footer>
  );
}
