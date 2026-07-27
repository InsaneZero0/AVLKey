import React, { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Home, Loader2, MailCheck, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email, origin_url: window.location.origin });
      setSent(true);
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-terracotta flex items-center justify-center"><Home className="w-5 h-5 text-white" /></div>
          <span className="font-display font-bold text-lg text-navy">Réntalo en Línea</span>
        </Link>
        <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-[0_20px_60px_rgb(0,0,0,0.06)]">
          {sent ? (
            <div className="text-center" data-testid="forgot-sent">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto"><MailCheck className="w-7 h-7 text-green-600" /></div>
              <h1 className="font-display font-bold text-2xl text-navy mt-5">Revisa tu correo</h1>
              <p className="text-stone-500 mt-2 text-sm">Si el correo está registrado, enviamos un enlace para restablecer tu contraseña. El enlace expira en 1 hora y es de un solo uso.</p>
              <Link to="/login"><Button className="mt-6 rounded-full bg-terracotta hover:bg-terracotta-hover w-full">Volver a inicio de sesión</Button></Link>
            </div>
          ) : (
            <>
              <h1 className="font-display font-bold text-2xl text-navy">Recupera tu contraseña</h1>
              <p className="text-stone-500 mt-2 text-sm">Ingresa tu correo y te enviaremos un enlace para restablecerla.</p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <Label>Correo electrónico</Label>
                  <Input data-testid="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" required />
                </div>
                <Button type="submit" disabled={loading} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover h-11" data-testid="forgot-submit">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar enlace"}
                </Button>
              </form>
              <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-stone-500 hover:text-terracotta mt-6"><ArrowLeft className="w-4 h-4" /> Volver</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
