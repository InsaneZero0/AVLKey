import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Home, Menu, X, LayoutDashboard, LogOut, Building2 } from "lucide-react";
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

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-600">
          <Link to="/explorar" className="hover:text-terracotta transition-colors" data-testid="nav-explorar">Explorar inmuebles</Link>
          <Link to="/#como-funciona" className="hover:text-terracotta transition-colors" data-testid="nav-como-funciona">Cómo funciona</Link>
          <Link to="/#servicios" className="hover:text-terracotta transition-colors" data-testid="nav-servicios">Servicios</Link>
        </nav>

        <div className="hidden md:flex items-center gap-3">
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
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5 text-xs text-stone-500">{user.role === "arrendador" ? "Arrendador" : "Arrendatario"}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/panel")} data-testid="menu-panel">
                  <LayoutDashboard className="w-4 h-4 mr-2" /> Mi panel
                </DropdownMenuItem>
                {user.role === "arrendador" && (
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

        <button className="md:hidden p-2" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-stone-200 bg-white px-5 py-4 space-y-3" data-testid="mobile-menu">
          <Link to="/explorar" onClick={() => setOpen(false)} className="block py-2 text-stone-700">Explorar inmuebles</Link>
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
