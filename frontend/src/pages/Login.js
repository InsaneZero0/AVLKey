import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth, apiError } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Home, Loader2 } from "lucide-react";

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
);

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success("¡Bienvenido de vuelta!");
      navigate(u?.account_type === "internal" ? "/admin" : "/panel");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/panel";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img src="https://images.pexels.com/photos/7746560/pexels-photo-7746560.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1200&w=1000" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative p-12 h-full flex flex-col justify-end">
          <h2 className="font-display font-bold text-4xl text-white leading-tight">Administra tus arrendamientos con confianza</h2>
          <p className="text-stone-200 mt-3">Contratos, pagos y cobranza en un solo lugar.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-xl bg-terracotta flex items-center justify-center"><Home className="w-5 h-5 text-white" /></div>
            <span className="font-display font-bold text-lg text-navy">Réntalo en Línea</span>
          </Link>
          <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Inicia sesión</h1>
          <p className="text-stone-500 mt-2">Accede a tu panel para administrar tus rentas.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <Label>Correo electrónico</Label>
              <Input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" required />
            </div>
            <div>
              <Label>Contraseña</Label>
              <Input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <Button type="submit" disabled={loading} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover h-11" data-testid="login-submit">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-stone-400">
            <div className="flex-1 h-px bg-stone-200" /> o continúa con <div className="flex-1 h-px bg-stone-200" />
          </div>

          <Button variant="outline" onClick={googleLogin} className="w-full rounded-full h-11 gap-2" data-testid="google-login-btn">
            <GoogleIcon /> Continuar con Google
          </Button>

          <p className="text-center text-sm text-stone-500 mt-8">
            ¿No tienes cuenta? <Link to="/registro" className="text-terracotta font-medium hover:underline" data-testid="go-register">Regístrate</Link>
          </p>
          <div className="mt-6 text-xs text-stone-400 text-center bg-stone-50 rounded-lg p-3">
            Demo: arrendador@demo.mx / arrendatario@demo.mx — contraseña <b>Demo123!</b>
          </div>
        </div>
      </div>
    </div>
  );
}
