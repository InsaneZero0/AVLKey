import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Home, Menu, X, LayoutDashboard, LogOut, Building2, Globe } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const initials = (user?.name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const doLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group" data-testid="navbar-logo">
          <div className="w-9 h-9 rounded-xl bg-terracotta flex items-center justify-center transition-transform group-hover:scale-105">
            <Home className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-navy">Réntalo <span className="text-terracotta">en Línea</span></span>
        </Link>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-stone-600">
          <Link to="/" className="hover:text-terracotta transition-colors" data-testid="nav-inicio">Inicio</Link>
          <Link to="/explorar" className="hover:text-terracotta transition-colors" data-testid="nav-explorar">Buscar propiedades</Link>
          <Link to="/#como-funciona" className="hover:text-terracotta transition-colors" data-testid="nav-como-funciona">Cómo funciona</Link>
          <Link to="/panel/publicar" className="hover:text-terracotta transition-colors" data-testid="nav-publicar">Publicar propiedad</Link>
          <Link to="/#beneficios" className="hover:text-terracotta transition-colors" data-testid="nav-beneficios">Beneficios</Link>
          <Link to="/#ayuda" className="hover:text-terracotta transition-colors" data-testid="nav-ayuda">Centro de ayuda</Link>
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-terracotta transition-colors" data-testid="lang-selector">
                <Globe className="w-4 h-4" /> ES
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="lang-es">Español</DropdownMenuItem>
              <DropdownMenuItem data-testid="lang-en" onClick={() => toast.info("English version coming soon")}>English (próximamente)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-stone-100 transition-colors" data-testid="user-menu-trigger">
                  <Avatar className="w-8 h-8">
                    {user.picture && <AvatarImage src={user.picture} />}
                    <AvatarFallback className="bg-navy text-white text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-stone-700">{user.name?.split(" ")[0]}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <div className="px-2 py-1.5" data-testid="user-menu-header">
                  <div className="text-sm font-medium text-navy truncate">{user.name}</div>
                  <div className="text-xs text-stone-500">
                    {user.account_type === "internal"
                      ? "Personal interno"
                      : `${user.public_id ? user.public_id + " · " : ""}${user.role === "arrendador" ? "Arrendador" : "Arrendatario"}`}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(user.account_type === "internal" ? "/admin" : "/panel")} data-testid="menu-panel">
                  <LayoutDashboard className="w-4 h-4 mr-2" /> {user.account_type === "internal" ? "Panel interno" : "Mi panel"}
                </DropdownMenuItem>
                {user.account_type !== "internal" && user.role === "arrendador" && (
                  <DropdownMenuItem onClick={() => navigate("/panel/publicar")} data-testid="menu-publicar">
                    <Building2 className="w-4 h-4 mr-2" /> Publicar inmueble
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={doLogout} data-testid="menu-logout" className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate("/login")} data-testid="nav-login-btn" className="rounded-full">Inicia sesión</Button>
              <Button onClick={() => navigate("/registro")} data-testid="nav-register-btn" className="rounded-full bg-terracotta hover:bg-terracotta-hover">Regístrate</Button>
            </>
          )}
        </div>

        <button className="lg:hidden p-2" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-stone-200 bg-white px-5 py-4 space-y-1" data-testid="mobile-menu">
          <Link to="/" onClick={() => setOpen(false)} className="block py-2 text-stone-700">Inicio</Link>
          <Link to="/explorar" onClick={() => setOpen(false)} className="block py-2 text-stone-700">Buscar propiedades</Link>
          <Link to="/#como-funciona" onClick={() => setOpen(false)} className="block py-2 text-stone-700">Cómo funciona</Link>
          <Link to="/panel/publicar" onClick={() => setOpen(false)} className="block py-2 text-stone-700">Publicar propiedad</Link>
          <Link to="/#beneficios" onClick={() => setOpen(false)} className="block py-2 text-stone-700">Beneficios</Link>
          <Link to="/#ayuda" onClick={() => setOpen(false)} className="block py-2 text-stone-700">Centro de ayuda</Link>
          {user ? (
            <>
              <Link to="/panel" onClick={() => setOpen(false)} className="block py-2 text-stone-700">Mi panel</Link>
              <button onClick={doLogout} className="block py-2 text-red-600">Cerrar sesión</button>
            </>
          ) : (
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 rounded-full" onClick={() => { setOpen(false); navigate("/login"); }}>Inicia sesión</Button>
              <Button className="flex-1 rounded-full bg-terracotta hover:bg-terracotta-hover" onClick={() => { setOpen(false); navigate("/registro"); }}>Regístrate</Button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
