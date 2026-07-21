import React from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { STAFF_ROLE_LABELS } from "@/lib/constants";
import {
  Home, LayoutDashboard, Users, Building2, ClipboardList, FileText, CreditCard,
  FileLock2, ScrollText, LogOut, ShieldCheck, FileCheck2,
} from "lucide-react";

const NAV = [
  { to: "/admin", label: "Resumen", icon: LayoutDashboard, perm: "consultar", end: true },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users, perm: "administrar_usuarios" },
  { to: "/admin/propiedades", label: "Revisión de propiedades", icon: Building2, perm: "consultar" },
  { to: "/admin/solicitudes", label: "Solicitudes", icon: ClipboardList, perm: "consultar" },
  { to: "/admin/contratos", label: "Contratos", icon: FileText, perm: "consultar" },
  { to: "/admin/pagos", label: "Pagos", icon: CreditCard, perm: "administrar_pagos" },
  { to: "/admin/documentos", label: "Documentos sensibles", icon: FileLock2, perm: "consultar_documentos_sensibles" },
  { to: "/admin/verificacion", label: "Verificación de docs", icon: FileCheck2, perm: "consultar" },
  { to: "/admin/auditoria", label: "Auditoría", icon: ScrollText, perm: "administrar_usuarios" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const perms = user?.permissions || [];
  const links = NAV.filter((l) => perms.includes(l.perm));

  const doLogout = async () => { await logout(); navigate("/"); };
  const initials = (user?.name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-stone-100 flex">
      <aside className="hidden lg:flex flex-col w-64 bg-navy text-stone-300 fixed h-screen">
        <Link to="/" className="flex items-center gap-2 px-6 h-16 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-terracotta flex items-center justify-center"><ShieldCheck className="w-4 h-4 text-white" /></div>
          <span className="font-display font-bold text-white">Panel interno</span>
        </Link>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} data-testid={`admin-nav-${l.to.split("/").pop() || "resumen"}`}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-terracotta text-white" : "text-stone-300 hover:bg-white/10"}`}>
              <l.icon className="w-4 h-4" /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-terracotta text-white flex items-center justify-center text-xs font-medium">{initials}</div>
            <div className="min-w-0"><div className="text-sm font-medium text-white truncate">{user?.name}</div><div className="text-xs text-stone-400">{STAFF_ROLE_LABELS[user?.staff_role]}</div></div>
          </div>
          <button onClick={doLogout} className="flex items-center gap-2 text-sm text-red-300 hover:bg-white/10 w-full px-3 py-2 rounded-lg" data-testid="admin-logout">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 inset-x-0 bg-navy h-14 flex items-center justify-between px-4 z-40">
        <span className="font-display font-bold text-white text-sm">Panel interno</span>
        <button onClick={doLogout} className="text-red-300"><LogOut className="w-5 h-5" /></button>
      </div>

      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0">
        <div className="lg:hidden bg-white border-b border-stone-200 px-4 py-2 flex gap-3 overflow-x-auto">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `text-xs whitespace-nowrap px-2 py-1 rounded ${isActive ? "text-terracotta font-semibold" : "text-stone-500"}`}>{l.label}</NavLink>
          ))}
        </div>
        <div className="max-w-6xl mx-auto p-5 sm:p-8"><Outlet /></div>
      </main>
    </div>
  );
}
