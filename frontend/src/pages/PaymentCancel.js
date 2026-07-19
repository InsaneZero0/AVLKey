import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function PaymentCancel() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-6">
      <div className="bg-white border border-stone-200 rounded-3xl p-10 max-w-md w-full text-center" data-testid="payment-cancel">
        <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto"><XCircle className="w-9 h-9 text-stone-500" /></div>
        <h1 className="font-display font-bold text-2xl text-navy mt-6">Pago cancelado</h1>
        <p className="text-stone-500 mt-2">No se realizó ningún cargo. Puedes intentarlo de nuevo cuando quieras.</p>
        <Button onClick={() => navigate("/panel/contratos")} className="mt-6 rounded-full bg-terracotta hover:bg-terracotta-hover w-full">Volver a mis contratos</Button>
      </div>
    </div>
  );
}
