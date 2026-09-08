import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatMXN, formatDate, STATUS_LABEL, RISK_LABEL, EMPLOYMENT_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Inbox, Loader2, Check, X, ShieldCheck, User, Briefcase, Users, CalendarClock } from "lucide-react";

const riskColor = { bajo: "text-green-600 bg-green-100", medio: "text-amber-600 bg-amber-100", alto: "text-red-600 bg-red-100" };
const statusColor = { pendiente: "bg-amber-100 text-amber-700", en_revision: "bg-blue-100 text-blue-700", aprobada: "bg-green-100 text-green-700", rechazada: "bg-red-100 text-red-700" };
const empLabel = Object.fromEntries(EMPLOYMENT_TYPES.map((e) => [e.value, e.label]));

export default function Applications() {
  const [apps, setApps] = useState(null);
  const [schedApp, setSchedApp] = useState(null);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("10:00");
  const [schedNote, setSchedNote] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const load = () => api.get("/landlord/applications").then(({ data }) => setApps(data)).catch(() => setApps([]));
  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    try {
      const { data } = await api.patch(`/applications/${id}/status`, { status });
      if (status === "aprobada") toast.success("Solicitud aceptada. Se generó un contrato en borrador.");
      else if (status === "rechazada") toast.success("Solicitud rechazada.");
      else toast.success("Estado actualizado.");
      load();
    } catch { toast.error("No se pudo actualizar"); }
  };

  const openSchedule = (a) => { setSchedApp(a); setSchedDate(""); setSchedTime("10:00"); setSchedNote(""); };

  const scheduleVisit = async () => {
    if (!schedDate) { toast.error("Selecciona una fecha"); return; }
    setScheduling(true);
    try {
      await api.post(`/applications/${schedApp.id}/schedule-visit`, {
        scheduled_at: `${schedDate}T${schedTime}:00`,
        note: schedNote,
      });
      toast.success("Cita agendada. Se notificó al arrendatario.");
      setSchedApp(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "No se pudo agendar la cita"); }
    finally { setScheduling(false); }
  };

  if (!apps) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Solicitudes recibidas</h1>
      <p className="text-stone-500 mt-1">Revisa el perfil de riesgo y decide sobre cada candidato.</p>

      {apps.length === 0 ? (
        <div className="mt-8 bg-white border border-dashed border-stone-300 rounded-2xl py-20 flex flex-col items-center text-stone-500" data-testid="empty-applications">
          <Inbox className="w-12 h-12 mb-4" />
          <p className="font-medium">Aún no tienes solicitudes</p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {apps.map((a) => (
            <div key={a.id} className="bg-white border border-stone-200 rounded-2xl p-6" data-testid={`application-${a.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className={`rounded-full ${statusColor[a.status]}`}>{STATUS_LABEL[a.status]}</Badge>
                    <span className="text-xs text-stone-400">{formatDate(a.created_at)}</span>
                  </div>
                  <h3 className="font-display font-semibold text-lg text-navy mt-2 flex items-center gap-2"><User className="w-4 h-4 text-stone-400" />{a.tenant_name}</h3>
                  <p className="text-sm text-stone-500">Para: <span className="font-medium text-navy">{a.property_title}</span></p>
                </div>
                <div className={`text-right px-4 py-2 rounded-xl ${riskColor[a.risk_level]}`}>
                  <div className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="w-4 h-4" />{RISK_LABEL[a.risk_level]}</div>
                  <div className="text-xs mt-0.5">Score {a.risk_score}/100</div>
                </div>
              </div>

              <div className="mt-4">
                <Progress value={a.risk_score} className="h-2" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 text-sm">
                <div><div className="text-stone-400 text-xs">Ingreso mensual</div><div className="font-medium text-navy">{formatMXN(a.monthly_income)}</div></div>
                <div><div className="text-stone-400 text-xs">Relación ingreso/renta</div><div className="font-medium text-navy">{a.income_ratio}x</div></div>
                <div><div className="text-stone-400 text-xs flex items-center gap-1"><Briefcase className="w-3 h-3" />Situación</div><div className="font-medium text-navy">{empLabel[a.employment_type] || a.employment_type}</div></div>
                <div><div className="text-stone-400 text-xs flex items-center gap-1"><Users className="w-3 h-3" />Ocupantes</div><div className="font-medium text-navy">{a.num_occupants} · {a.has_guarantor ? "Con aval" : "Sin aval"}</div></div>
              </div>

              {a.message && <p className="mt-4 text-sm text-stone-600 bg-stone-50 rounded-xl p-3 italic">"{a.message}"</p>}
              {a.video_url && (
                <div className="mt-4" data-testid={`app-video-${a.id}`}>
                  <div className="text-xs text-stone-400 mb-1">Video de presentación (45 seg)</div>
                  <video src={a.video_url} controls preload="metadata" className="w-full max-w-md rounded-xl bg-black max-h-64" />
                </div>
              )}

              {a.status !== "rechazada" && (
                <div className="flex flex-wrap gap-2 mt-5">
                  {a.status === "pendiente" && (
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => updateStatus(a.id, "en_revision")} data-testid={`review-${a.id}`}>Marcar en revisión</Button>
                  )}
                  {(a.status === "pendiente" || a.status === "en_revision") && (
                    <>
                      <Button size="sm" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => updateStatus(a.id, "aprobada")} data-testid={`approve-${a.id}`}><Check className="w-4 h-4 mr-1" /> Aceptar</Button>
                      <Button variant="outline" size="sm" className="rounded-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => updateStatus(a.id, "rechazada")} data-testid={`reject-${a.id}`}><X className="w-4 h-4 mr-1" /> Rechazar</Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" className="rounded-full text-terracotta border-terracotta/40 hover:bg-terracotta/5 hover:text-terracotta" onClick={() => openSchedule(a)} data-testid={`schedule-cita-${a.id}`}><CalendarClock className="w-4 h-4 mr-1" /> Agendar cita</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!schedApp} onOpenChange={(o) => !o && setSchedApp(null)}>
        <DialogContent className="max-w-md" data-testid="schedule-cita-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Agendar cita</DialogTitle>
          </DialogHeader>
          {schedApp && (
            <div className="space-y-4 py-1">
              <p className="text-sm text-stone-600">Cita con <strong>{schedApp.tenant_name}</strong> para <strong>{schedApp.property_title}</strong>.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} data-testid="sched-date" />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} data-testid="sched-time" />
                </div>
              </div>
              <div>
                <Label>Nota (opcional)</Label>
                <Textarea value={schedNote} onChange={(e) => setSchedNote(e.target.value)} placeholder="Indicaciones para la cita..." data-testid="sched-note" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={scheduleVisit} disabled={scheduling} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="sched-confirm-btn">
              {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Agendar cita"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
