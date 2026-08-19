import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import {
  Home, LayoutDashboard, Building2, FileText, CreditCard, User, LogOut,
  ClipboardList, PlusCircle, Inbox, FileCheck2, CalendarClock, Heart, Lock,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isLandlord = user?.role === "arrendador";
  const authorized = user?.registro_stage === "autorizado";
  const [hasPublished, setHasPublished] = useState(false);

  useEffect(() => {
    if (!isLandlord) return;
    api.get("/my/properties")
      .then(({ data }) => setHasPublished((data || []).some((p) => (p.review_stage || p.display_status) === "publicado")))
      .catch(() => setHasPublished(false));
  }, [isLandlord]);

  const doLogout = async () => { await logout(); navigate("/"); };

  const links = isLandlord ? [
    { to: "/panel/perfil", label: "Mi perfil", icon: User, enabled: true },
    { to: "/panel/publicar", label: "Publicar inmueble", icon: PlusCircle, enabled: authorized, hint: "Llena este formulario y al ser aprobada tu información podrás publicar." },
    { to: "/panel/inmuebles", label: "Mis inmuebles", icon: Building2, enabled: hasPublished, hint: "Se habilitará cuando el administrador autorice la publicación de tu inmueble." },
    { to: "/panel/recibidas", label: "Solicitudes recibidas", icon: Inbox, enabled: hasPublished, hint: "Se habilitará cuando el administrador autorice la publicación de tu inmueble." },
    { to: "/panel/visitas", label: "Visitas", icon: CalendarClock, enabled: hasPublished, hint: "Se habilitará cuando el administrador autorice la publicación de tu inmueble." },
    { to: "/panel/contratos", label: "Contratos", icon: FileText, enabled: hasPublished, hint: "Se habilitará cuando el administrador autorice la publicación de tu inmueble." },
    { to: "/panel/pagos", label: "Pagos", icon: CreditCard, enabled: hasPublished, hint: "Se habilitará cuando el administrador autorice la publicación de tu inmueble." },
    { to: "/panel", label: "Resumen", icon: LayoutDashboard, end: true, enabled: hasPublished, hint: "Se habilitará cuando el administrador autorice la publicación de tu inmueble." },
  ] : [
    { to: "/panel/verificacion", label: "Registro", icon: FileCheck2, enabled: true },
    { to: "/panel/perfil", label: "Mi perfil", icon: User, enabled: true },
    { to: "/panel", label: "Resumen", icon: LayoutDashboard, end: true, enabled: true },
    { to: "/panel/solicitudes", label: "Mis solicitudes", icon: ClipboardList, enabled: true },
    { to: "/panel/favoritos", label: "Favoritos", icon: Heart, enabled: true },
    { to: "/panel/visitas", label: "Visitas", icon: CalendarClock, enabled: true },
    { to: "/panel/contratos", label: "Contratos", icon: FileText, enabled: true },
    { to: "/panel/pagos", label: "Pagos", icon: CreditCard, enabled: true },
  ];

  const initials = (user?.name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-sand flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-stone-200 fixed h-screen">
        <Link to="/" className="flex items-center gap-2 px-6 h-16 border-b border-stone-200">
          <div className="w-8 h-8 rounded-lg bg-terracotta flex items-center justify-center"><Home className="w-4 h-4 text-white" /></div>
          <span className="font-display font-bold text-navy">Réntalo</span>
        </Link>
        <nav className="flex-1 p-4 space-y-1">
          {links.map((l) => (
            l.enabled ? (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                data-testid={`sidebar-${l.to.split("/").pop() || "resumen"}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-terracotta text-white" : "text-stone-600 hover:bg-stone-100"}`
                }
              >
                <l.icon className="w-4 h-4" /> {l.label}
              </NavLink>
            ) : (
              <div
                key={l.to}
                title={l.hint || "Opción no disponible"}
                data-testid={`sidebar-disabled-${l.to.split("/").pop() || "resumen"}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-300 cursor-not-allowed select-none"
              >
                <l.icon className="w-4 h-4" /> {l.label} <Lock className="w-3 h-3 ml-auto" />
              </div>
            )
          ))}
        </nav>
        <div className="p-4 border-t border-stone-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center text-xs font-medium">{initials}</div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-navy truncate">{user?.name}</div>
              <div className="text-xs text-stone-500">{isLandlord ? "Arrendador" : "Arrendatario"}{user?.public_id ? ` · ${user.public_id}` : ""}</div>
            </div>
          </div>
          <button onClick={doLogout} className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 w-full px-3 py-2 rounded-lg" data-testid="dashboard-logout">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 bg-white border-b border-stone-200 h-14 flex items-center justify-between px-4 z-40">
        <Link to="/" className="flex items-center gap-2"><div className="w-7 h-7 rounded-lg bg-terracotta flex items-center justify-center"><Home className="w-4 h-4 text-white" /></div><span className="font-display font-bold text-navy text-sm">Réntalo</span></Link>
        <div className="flex items-center gap-1"><NotificationBell /><button onClick={doLogout} className="text-red-600 p-2"><LogOut className="w-5 h-5" /></button></div>
      </div>

      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0">
        <div className="hidden lg:flex items-center justify-between h-16 px-8 border-b border-stone-200 bg-white/60">
          <div className="text-sm" data-testid="panel-topbar-user">
            <span className="font-mono font-semibold text-navy">{user?.public_id || "—"}</span>
            <span className="text-stone-500"> · {user?.name}</span>
          </div>
          <NotificationBell />
        </div>
        <div className="max-w-6xl mx-auto p-5 sm:p-8">
          <Outlet />
        </div>
        {/* Mobile nav */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 flex justify-around py-2 z-40">
          {links.slice(0, 5).map((l) => (
            l.enabled ? (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 text-[10px] px-2 ${isActive ? "text-terracotta" : "text-stone-500"}`}>
                <l.icon className="w-5 h-5" /> {l.label.split(" ")[0]}
              </NavLink>
            ) : (
              <div key={l.to} title={l.hint || "Opción no disponible"} className="flex flex-col items-center gap-0.5 text-[10px] px-2 text-stone-300 cursor-not-allowed select-none">
                <l.icon className="w-5 h-5" /> {l.label.split(" ")[0]}
              </div>
            )
          ))}
        </div>
      </main>
    </div>
  );
}
