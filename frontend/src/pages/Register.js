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
  const [role, setRole] = useState("arrendatario");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({ ...form, role });
      toast.success("¡Cuenta creada con éxito!");
      navigate("/panel");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const RoleCard = ({ value, icon: Icon, title, desc }) => (
    <button
      type="button"
      onClick={() => setRole(value)}
      data-testid={`role-${value}`}
      className={`text-left p-4 rounded-xl border-2 transition-all ${role === value ? "border-terracotta bg-terracotta/5" : "border-stone-200 hover:border-stone-300"}`}
    >
      <Icon className={`w-6 h-6 mb-2 ${role === value ? "text-terracotta" : "text-stone-400"}`} />
      <div className="font-semibold text-navy text-sm">{title}</div>
      <div className="text-xs text-stone-500 mt-0.5">{desc}</div>
    </button>
  );

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-6 sm:p-12 order-2 lg:order-1">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-terracotta flex items-center justify-center"><Home className="w-5 h-5 text-white" /></div>
            <span className="font-display font-bold text-lg text-navy">Réntalo en Línea</span>
          </Link>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Crea tu cuenta</h1>
          <p className="text-stone-500 mt-2">Únete a la comunidad de arrendamiento formal.</p>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <RoleCard value="arrendatario" icon={User} title="Soy arrendatario" desc="Busco un inmueble para rentar" />
            <RoleCard value="arrendador" icon={Building2} title="Soy arrendador" desc="Quiero publicar mis inmuebles" />
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>Nombre completo</Label>
              <Input data-testid="register-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label>Correo electrónico</Label>
              <Input data-testid="register-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Teléfono</Label>
                <Input data-testid="register-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>Contraseña</Label>
                <Input data-testid="register-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required />
              </div>
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
