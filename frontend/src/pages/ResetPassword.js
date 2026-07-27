import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Home, Loader2, ShieldCheck } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("Las contraseñas no coinciden"); return; }
    if (!token) { toast.error("Enlace inválido"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Contraseña actualizada. Inicia sesión.");
      navigate("/login");
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
          <div className="w-12 h-12 rounded-xl bg-terracotta/10 flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-terracotta" /></div>
          <h1 className="font-display font-bold text-2xl text-navy mt-4">Nueva contraseña</h1>
          <p className="text-stone-500 mt-2 text-sm">Crea una contraseña segura para tu cuenta.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>Nueva contraseña</Label>
              <Input data-testid="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            </div>
            <div>
              <Label>Confirmar contraseña</Label>
              <Input data-testid="reset-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
            </div>
            <Button type="submit" disabled={loading} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover h-11" data-testid="reset-submit">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Restablecer contraseña"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
