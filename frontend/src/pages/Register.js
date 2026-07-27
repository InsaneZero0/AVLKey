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
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({ ...form, role: "arrendatario" });
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
          <p className="text-stone-500 mt-2">Explora propiedades y guarda tus favoritas.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
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
