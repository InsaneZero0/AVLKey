import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { formatMXN, formatDate, STATUS_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, FileText } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "en_revision_admin", label: "En revisión (admin)" },
  { value: "ajustado", label: "Ajustado" },
  { value: "listo_para_firma", label: "Listo para firma" },
  { value: "borrador", label: "Borrador" },
];

const badgeCls = (s) => ({
  en_revision_admin: "bg-amber-100 text-amber-700",
  ajustado: "bg-blue-100 text-blue-700",
  listo_para_firma: "bg-green-100 text-green-700",
}[s] || "bg-stone-100 text-stone-600");

export default function AdminContracts() {
  const [contracts, setContracts] = useState(null);
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = () => api.get("/admin/contracts").then(({ data }) => setContracts(data)).catch(() => setContracts([]));
  useEffect(() => { load(); }, []);

  const openEdit = (c) => {
    setEditing(c);
    setText(c.contract_text || "");
    setStatus(c.status || "en_revision_admin");
  };

  useEffect(() => {
    const id = searchParams.get("open");
    if (id && contracts) {
      const c = contracts.find((x) => x.id === id);
      if (c) { openEdit(c); setSearchParams({}, { replace: true }); }
    }
  }, [contracts]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/contracts/${editing.id}`, { contract_text: text, status });
      toast.success("Contrato ajustado y guardado.");
      setEditing(null);
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  if (!contracts) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Contratos</h1>
      <p className="text-stone-500 mt-1">{contracts.length} contrato(s) — revisa y ajusta el borrador antes de coordinar firmas.</p>
      <div className="mt-6 bg-white border border-stone-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-6 py-3">Inmueble</th>
              <th className="text-left px-6 py-3">Arrendatario</th>
              <th className="text-left px-6 py-3">Arrendador</th>
              <th className="text-right px-6 py-3">Renta</th>
              <th className="text-left px-6 py-3">Inicio</th>
              <th className="text-left px-6 py-3">Estado</th>
              <th className="text-right px-6 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {contracts.map((c) => (
              <tr key={c.id} data-testid={`admin-contract-${c.id}`} className="hover:bg-stone-50">
                <td className="px-6 py-4 font-medium text-navy">
                  {c.property_title}
                  {c.property_public_id && <span className="block text-xs font-bold text-red-600">{c.property_public_id}</span>}
                </td>
                <td className="px-6 py-4 text-stone-600">{c.tenant_name}</td>
                <td className="px-6 py-4 text-stone-600">{c.landlord_name}</td>
                <td className="px-6 py-4 text-right font-semibold text-navy">{formatMXN(c.monthly_rent)}</td>
                <td className="px-6 py-4 text-stone-500">{formatDate(c.start_date)}</td>
                <td className="px-6 py-4"><Badge className={`rounded-full ${badgeCls(c.status)}`}>{STATUS_LABEL[c.status] || c.status}</Badge></td>
                <td className="px-6 py-4 text-right">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => openEdit(c)} data-testid={`review-contract-${c.id}`}>
                    <FileText className="w-4 h-4 mr-1" /> Revisar / ajustar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl" data-testid="admin-contract-dialog">
          <DialogHeader><DialogTitle className="font-display">Revisar y ajustar contrato</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="text-sm text-stone-600">
              <span className="font-medium text-navy">{editing?.property_title}</span> · {editing?.landlord_name} → {editing?.tenant_name}
            </div>
            <div>
              <Label>Estado del contrato</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="admin-contract-status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Texto del contrato (borrador de prueba, editable)</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} className="font-mono text-xs" data-testid="admin-contract-text" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="admin-contract-save">
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Guardar ajustes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
