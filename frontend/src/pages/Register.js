import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth, apiError } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Home, Loader2, Building2, User } from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "arrendatario" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      toast.success("¡Cuenta creada con éxito!");
      navigate("/panel");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-6 sm:p-12 order-2 lg:order-1">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-terracotta flex items-center justify-center"><Home className="w-5 h-5 text-white" /></div>
            <span className="font-display font-bold text-lg text-navy">Réntalo en Línea</span>
          </Link>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Crea tu cuenta</h1>
          <p className="text-stone-500 mt-2">Elige cómo quieres usar Réntalo en Línea.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <Label>¿Cómo quieres registrarte?</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  data-testid="register-role-arrendatario"
                  onClick={() => setForm({ ...form, role: "arrendatario" })}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${form.role === "arrendatario" ? "border-terracotta bg-terracotta/5 ring-1 ring-terracotta" : "border-stone-200 hover:border-stone-300"}`}
                >
                  <User className={`w-5 h-5 ${form.role === "arrendatario" ? "text-terracotta" : "text-stone-400"}`} />
                  <span className="font-medium text-navy text-sm">Arrendatario</span>
                  <span className="text-xs text-stone-500">Busco un inmueble para rentar</span>
                </button>
                <button
                  type="button"
                  data-testid="register-role-arrendador"
                  onClick={() => setForm({ ...form, role: "arrendador" })}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${form.role === "arrendador" ? "border-terracotta bg-terracotta/5 ring-1 ring-terracotta" : "border-stone-200 hover:border-stone-300"}`}
                >
                  <Building2 className={`w-5 h-5 ${form.role === "arrendador" ? "text-terracotta" : "text-stone-400"}`} />
                  <span className="font-medium text-navy text-sm">Arrendador</span>
                  <span className="text-xs text-stone-500">Quiero publicar y rentar mi inmueble</span>
                </button>
              </div>
            </div>
            <div>
              <Label>Nombre completo</Label>
              <Input data-testid="register-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label>Correo electrónico</Label>
              <Input data-testid="register-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <Label>Contraseña</Label>
              <Input data-testid="register-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required />
            </div>
            <Button type="submit" disabled={loading} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover h-11" data-testid="register-submit">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear cuenta"}
            </Button>
          </form>

          <p className="text-center text-sm text-stone-500 mt-6">
            ¿Ya tienes cuenta? <Link to="/login" className="text-terracotta font-medium hover:underline" data-testid="go-login">Inicia sesión</Link>
          </p>
        </div>
      </div>

      <div className="hidden lg:block relative order-1 lg:order-2">
        <img src="https://images.unsplash.com/photo-1713942590368-09cfc6ae94ce?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative p-12 h-full flex flex-col justify-end">
          <h2 className="font-display font-bold text-4xl text-white leading-tight">Tu próximo hogar u oportunidad te espera</h2>
          <p className="text-stone-200 mt-3">Proceso claro, documentado y con respaldo legal.</p>
        </div>
      </div>
    </div>
  );
}
