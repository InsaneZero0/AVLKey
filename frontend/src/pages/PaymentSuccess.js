import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { formatMXN } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle, Home } from "lucide-react";

const POLL_INTERVAL = 2000;
const MAX_POLLS = 8;

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState("checking");
  const [info, setInfo] = useState(null);
  const polls = useRef(0);

  useEffect(() => {
    if (!sessionId) { setStatus("error"); return; }
    let timer;
    const poll = async () => {
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        setInfo(data);
        if (data.payment_status === "paid") { setStatus("paid"); return; }
        if (["failed", "expired"].includes(data.payment_status)) { setStatus("error"); return; }
      } catch (e) { console.warn("payment status poll:", e?.message || e); }
      polls.current += 1;
      if (polls.current >= MAX_POLLS) { setStatus("timeout"); return; }
      timer = setTimeout(poll, POLL_INTERVAL);
    };
    poll();
    return () => clearTimeout(timer);
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-6">
      <div className="bg-white border border-stone-200 rounded-3xl p-10 max-w-md w-full text-center shadow-[0_20px_60px_rgb(0,0,0,0.08)]" data-testid="payment-result">
        {status === "checking" && (
          <>
            <Loader2 className="w-14 h-14 animate-spin text-terracotta mx-auto" />
            <h1 className="font-display font-bold text-2xl text-navy mt-6">Confirmando tu pago...</h1>
            <p className="text-stone-500 mt-2">Esto solo toma unos segundos.</p>
          </>
        )}
        {status === "paid" && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto"><CheckCircle2 className="w-9 h-9 text-green-600" /></div>
            <h1 className="font-display font-bold text-2xl text-navy mt-6" data-testid="payment-success">¡Pago realizado!</h1>
            <p className="text-stone-500 mt-2">Tu pago de {info?.amount ? formatMXN(info.amount) : ""} se registró correctamente.</p>
            <Button onClick={() => navigate("/panel/pagos")} className="mt-6 rounded-full bg-terracotta hover:bg-terracotta-hover w-full" data-testid="go-payments-btn">Ver mis pagos</Button>
          </>
        )}
        {(status === "error" || status === "timeout") && (
          <>
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto"><XCircle className="w-9 h-9 text-amber-600" /></div>
            <h1 className="font-display font-bold text-2xl text-navy mt-6">Pago en proceso</h1>
            <p className="text-stone-500 mt-2">Si realizaste el pago, aparecerá en breve en tu historial.</p>
            <Button onClick={() => navigate("/panel/pagos")} className="mt-6 rounded-full bg-terracotta hover:bg-terracotta-hover w-full">Ir a mis pagos</Button>
          </>
        )}
        <button onClick={() => navigate("/")} className="mt-4 text-sm text-stone-400 hover:text-terracotta flex items-center gap-1 mx-auto"><Home className="w-4 h-4" /> Volver al inicio</button>
      </div>
    </div>
  );
}
