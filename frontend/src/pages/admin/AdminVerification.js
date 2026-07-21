import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Eye, Check, X, RotateCcw, FileText } from "lucide-react";

const statusMap = {
  pendiente: { label: "En revisión", cls: "bg-amber-100 text-amber-700" },
  aprobado: { label: "Aprobado", cls: "bg-green-100 text-green-700" },
  rechazado: { label: "Rechazado", cls: "bg-red-100 text-red-700" },
  correccion: { label: "Corrección", cls: "bg-blue-100 text-blue-700" },
};

export default function AdminVerification() {
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const [docs, setDocs] = useState(null);
  const [tab, setTab] = useState("pendiente");
  const [reviewing, setReviewing] = useState(null);
  const [decision, setDecision] = useState("aprobado");
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/admin/verification/documents").then(({ data }) => setDocs(data)).catch(() => setDocs([]));
  useEffect(() => { load(); }, []);

  const openReview = (d, dec) => { setReviewing(d); setDecision(dec); setNote(""); setExpiry(d.expiry_date || ""); };

  const submit = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/verification/documents/${reviewing.id}/review`, { decision, note, expiry_date: expiry || null });
      toast.success("Documento actualizado");
      setReviewing(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Sin permiso"); }
    finally { setSaving(false); }
  };

  if (!docs) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const filtered = docs.filter((d) => d.status === tab);

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Verificación de documentos</h1>
      <p className="text-stone-500 mt-1">Aprueba, rechaza o solicita correcciones de los documentos cargados.</p>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList data-testid="doc-review-tabs">
          <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
          <TabsTrigger value="aprobado">Aprobados</TabsTrigger>
          <TabsTrigger value="rechazado">Rechazados</TabsTrigger>
          <TabsTrigger value="correccion">Corrección</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <div className="mt-6 bg-white border border-dashed border-stone-300 rounded-xl py-16 flex flex-col items-center text-stone-500"><FileText className="w-10 h-10 mb-3" /><p>Sin documentos en este estado</p></div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((d) => (
            <div key={d.id} className="bg-white border border-stone-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3" data-testid={`review-doc-${d.id}`}>
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="rounded-full bg-navy/10 text-navy capitalize">{d.category}</Badge>
                  <Badge className={`rounded-full ${statusMap[d.status]?.cls}`}>{statusMap[d.status]?.label}</Badge>
                </div>
                <div className="font-medium text-navy mt-2">{d.user_name} · {d.doc_type.replace(/_/g, " ")}</div>
                <div className="text-xs text-stone-500">v{d.version} · {d.original_filename} · {formatDate(d.created_at)}{d.expiry_date && ` · vence ${formatDate(d.expiry_date)}`}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.open(`${API}/documents/${d.id}/download`, "_blank")} data-testid={`admin-view-doc-${d.id}`}><Eye className="w-4 h-4" /></Button>
                {perms.includes("aprobar") && <Button size="sm" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => openReview(d, "aprobado")} data-testid={`doc-approve-${d.id}`}><Check className="w-4 h-4" /></Button>}
                {perms.includes("editar") && <Button size="sm" variant="outline" className="rounded-full text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openReview(d, "correccion")} data-testid={`doc-correction-${d.id}`}><RotateCcw className="w-4 h-4" /></Button>}
                {perms.includes("rechazar") && <Button size="sm" variant="outline" className="rounded-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => openReview(d, "rechazado")} data-testid={`doc-reject-${d.id}`}><X className="w-4 h-4" /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display capitalize">{decision === "aprobado" ? "Aprobar" : decision === "rechazado" ? "Rechazar" : "Solicitar corrección"} documento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Nota / motivo</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comentario para el usuario" data-testid="review-note" /></div>
            {decision === "aprobado" && <div><Label>Fecha de vencimiento (opcional)</Label><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} data-testid="review-expiry" /></div>}
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={saving} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="submit-review-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
