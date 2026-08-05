import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, CalendarClock, Check, X, RefreshCw, MapPin, Ban, CheckCircle2, UserX, History, FileText,
} from "lucide-react";

const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

const statusMap = {
  solicitada: { label: "Solicitada", cls: "bg-amber-100 text-amber-700" },
  confirmada: { label: "Aceptada", cls: "bg-green-100 text-green-700" },
  reprogramada: { label: "Reprogramada", cls: "bg-blue-100 text-blue-700" },
  cancelada: { label: "Cancelada", cls: "bg-red-100 text-red-700" },
  completada: { label: "Completada", cls: "bg-navy/10 text-navy" },
  no_asistio: { label: "No asistió", cls: "bg-stone-200 text-stone-600" },
};

function fmt(iso) {
  if (!iso) return "Por confirmar";
  try { return new Date(iso).toLocaleString("es-MX", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const dateStr = (d) => d.toISOString().split("T")[0];
const contractDateBounds = () => {
  const min = new Date(); min.setHours(0, 0, 0, 0); min.setDate(min.getDate() + 4);
  const max = new Date(); max.setHours(0, 0, 0, 0); max.setDate(max.getDate() + 10);
  return { min: dateStr(min), max: dateStr(max) };
};

export default function Visits() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visits, setVisits] = useState(null);
  const [reschedule, setReschedule] = useState(null);
  const [rDate, setRDate] = useState("");
  const [rTime, setRTime] = useState("10:00");
  const [historyOpen, setHistoryOpen] = useState(null);
  const [slot, setSlot] = useState(null);
  const [contractVisit, setContractVisit] = useState(null);
  const [startDate, setStartDate] = useState("");

  const createContract = (v) => {
    const { min } = contractDateBounds();
    setContractVisit(v);
    setStartDate(min);
  };

  const submitContract = async () => {
    if (!startDate) { toast.error("Selecciona una fecha de inicio"); return; }
    try {
      const { data } = await api.post(`/visits/${contractVisit.id}/create-contract`, { start_date: startDate });
      toast.success(data.existing ? "Ya existe un contrato para este arrendatario." : "Contrato enviado al administrador para revisión y ajuste.");
      setContractVisit(null);
      navigate("/panel/contratos");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const formalize = async () => {
    try {
      await api.post(`/visits/${slot.visitId}/formalize`, { day: slot.day, time: slot.time });
      toast.success("Cita formalizada. Se notificó al arrendatario.");
      setSlot(null);
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const load = () => api.get("/my/visits").then(({ data }) => setVisits(data)).catch(() => setVisits([]));
  useEffect(() => { load(); }, []);

  const act = async (id, action, body) => {
    try {
      await api.patch(`/visits/${id}/${action}`, body || {});
      toast.success("Visita actualizada");
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const submitReschedule = async () => {
    if (!rDate) { toast.error("Selecciona una fecha"); return; }
    await act(reschedule.id, "reschedule", { scheduled_at: `${rDate}T${rTime}:00` });
    setReschedule(null);
  };

  if (!visits) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-terracotta" /></div>;

  const isLandlord = (v) => v.landlord_id === user.id;

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-navy tracking-tight">Visitas</h1>
      <p className="text-stone-500 mt-1">Agenda y da seguimiento a las visitas a inmuebles.</p>

      {visits.length === 0 ? (
        <div className="mt-8 bg-white border border-dashed border-stone-300 rounded-2xl py-20 flex flex-col items-center text-stone-500" data-testid="empty-visits">
          <CalendarClock className="w-12 h-12 mb-4" />
          <p className="font-medium">No tienes visitas todavía</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {visits.map((v) => {
            const st = statusMap[v.status];
            const landlord = isLandlord(v);
            const active = !["cancelada", "completada", "no_asistio"].includes(v.status);
            return (
              <div key={v.id} className="bg-white border border-stone-200 rounded-2xl p-5" data-testid={`visit-${v.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    {v.property_image && <img src={v.property_image} alt="" className="w-16 h-16 rounded-lg object-cover" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className={`rounded-full ${st.cls}`} data-testid={`visit-status-${v.id}`}>{st.label}</Badge>
                        {v.status === "reprogramada" && <span className="text-xs text-stone-400">propuesta por {v.proposed_by === (landlord ? "arrendador" : "arrendatario") ? "ti" : v.proposed_by}</span>}
                      </div>
                      <h3 className="font-display font-semibold text-navy mt-1">{v.property_title}</h3>
                      {v.scheduled_at ? (
                        <div className="flex items-center gap-1.5 text-sm text-terracotta font-medium mt-1"><CalendarClock className="w-4 h-4" />{fmt(v.scheduled_at)}</div>
                      ) : (v.availability && v.availability.length > 0) ? (
                        <div className="flex items-start gap-1.5 text-sm mt-1" data-testid={`visit-availability-${v.id}`}>
                          <CalendarClock className="w-4 h-4 mt-0.5 shrink-0 text-terracotta" />
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-stone-500">Disponibilidad:</span>
                            {v.availability.map((a, i) => (
                              landlord ? (
                                <button key={i} onClick={() => setSlot({ visitId: v.id, day: a.day, time: a.time })} className="text-terracotta font-medium underline underline-offset-2 hover:text-terracotta-hover" data-testid={`avail-link-${v.id}-${i}`}>
                                  {a.day} {a.time}
                                </button>
                              ) : (
                                <span key={i} className="text-terracotta font-medium">{a.day} {a.time}{i < v.availability.length - 1 ? "," : ""}</span>
                              )
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-sm text-terracotta font-medium mt-1"><CalendarClock className="w-4 h-4" />Por confirmar</div>
                      )}
                      <div className="text-xs text-stone-500 mt-0.5">{landlord ? `Interesado: ${v.tenant_name}` : v.property_city}</div>
                      {v.address_revealed ? (
                        <div className="flex items-center gap-1.5 text-sm text-stone-700 mt-1" data-testid={`visit-address-${v.id}`}><MapPin className="w-3.5 h-3.5 text-green-600" />{v.exact_address}</div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-stone-400 mt-1"><MapPin className="w-3.5 h-3.5" />Dirección exacta visible al confirmar</div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setHistoryOpen(v)} className="text-xs text-stone-400 hover:text-terracotta flex items-center gap-1" data-testid={`history-${v.id}`}><History className="w-3.5 h-3.5" /> Historial</button>
                </div>

                {active && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-stone-100">
                    {landlord ? (
                      <>
                        {(v.status === "solicitada" || (v.status === "reprogramada" && v.proposed_by === "arrendatario")) && (
                          <>
                            <Button size="sm" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => act(v.id, "confirm")} data-testid={`confirm-${v.id}`}><Check className="w-4 h-4 mr-1" /> Confirmar</Button>
                            <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setReschedule(v); setRDate(""); }} data-testid={`propose-${v.id}`}><RefreshCw className="w-4 h-4 mr-1" /> Proponer fecha</Button>
                            <Button size="sm" variant="outline" className="rounded-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => act(v.id, "reject", { note: "" })} data-testid={`reject-${v.id}`}><X className="w-4 h-4 mr-1" /> Rechazar</Button>
                          </>
                        )}
                        {v.status === "confirmada" && (
                          <>
                            <Button size="sm" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => act(v.id, "complete", { attended: true })} data-testid={`complete-${v.id}`}><CheckCircle2 className="w-4 h-4 mr-1" /> Completada</Button>
                            <Button size="sm" variant="outline" className="rounded-full" onClick={() => act(v.id, "complete", { attended: false })} data-testid={`noshow-${v.id}`}><UserX className="w-4 h-4 mr-1" /> No asistió</Button>
                            <Button size="sm" variant="outline" className="rounded-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => act(v.id, "cancel", {})} data-testid={`cancel-${v.id}`}><Ban className="w-4 h-4 mr-1" /> Cancelar</Button>
                          </>
                        )}
                        {v.status === "reprogramada" && v.proposed_by === "arrendador" && <span className="text-sm text-stone-400">Esperando respuesta del interesado</span>}
                      </>
                    ) : (
                      <>
                        {v.status === "reprogramada" && v.proposed_by === "arrendador" && (
                          <Button size="sm" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => act(v.id, "confirm")} data-testid={`accept-${v.id}`}><Check className="w-4 h-4 mr-1" /> Aceptar fecha</Button>
                        )}
                        {v.status !== "confirmada" && (
                          <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setReschedule(v); setRDate(""); }} data-testid={`tenant-propose-${v.id}`}><RefreshCw className="w-4 h-4 mr-1" /> Proponer otra fecha</Button>
                        )}
                        <Button size="sm" variant="outline" className="rounded-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => act(v.id, "cancel", {})} data-testid={`tenant-cancel-${v.id}`}><Ban className="w-4 h-4 mr-1" /> Cancelar</Button>
                      </>
                    )}
                  </div>
                )}

                {landlord && v.status === "completada" && (
                  <div className="mt-4 pt-4 border-t border-stone-100">
                    <Button size="sm" className="rounded-full bg-terracotta hover:bg-terracotta-hover" onClick={() => createContract(v)} data-testid={`make-contract-${v.id}`}>
                      <FileText className="w-4 h-4 mr-1" /> ¿Quieres hacer un contrato de arrendamiento con: {v.tenant_name}?
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reschedule dialog */}
      <Dialog open={!!reschedule} onOpenChange={(o) => !o && setReschedule(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Proponer nueva fecha</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Fecha</Label><Input type="date" value={rDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => setRDate(e.target.value)} data-testid="reschedule-date" /></div>
            <div><Label>Hora</Label>
              <Select value={rTime} onValueChange={setRTime}>
                <SelectTrigger data-testid="reschedule-time"><SelectValue /></SelectTrigger>
                <SelectContent>{TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={submitReschedule} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="submit-reschedule">Proponer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyOpen} onOpenChange={(o) => !o && setHistoryOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Historial de la visita</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-80 overflow-y-auto">
            {(historyOpen?.history || []).slice().reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-terracotta mt-1.5" />
                <div>
                  <div className="text-sm font-medium text-navy">{statusMap[h.status]?.label || h.status}</div>
                  <div className="text-xs text-stone-500">{h.by} · {fmt(h.at)}{h.note ? ` · ${h.note}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Formalizar cita desde disponibilidad */}
      <AlertDialog open={!!slot} onOpenChange={(o) => !o && setSlot(null)}>
        <AlertDialogContent data-testid="formalize-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Formalizar cita</AlertDialogTitle>
            <AlertDialogDescription>
              Estás enviando y formalizando una cita{slot ? ` para el ${slot.day} a las ${slot.time}` : ""}. ¿Estás segura?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="formalize-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={formalize} className="bg-terracotta hover:bg-terracotta-hover" data-testid="formalize-accept">Aceptar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Crear contrato desde visita completada */}
      <Dialog open={!!contractVisit} onOpenChange={(o) => !o && setContractVisit(null)}>
        <DialogContent data-testid="contract-dialog">
          <DialogHeader><DialogTitle className="font-display">Contrato de arrendamiento</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-stone-600">
              Inmueble: <span className="font-medium text-navy">{contractVisit?.property_title}</span><br />
              Arrendatario: <span className="font-medium text-navy">{contractVisit?.tenant_name}</span>
            </p>
            <div>
              <Label htmlFor="contract-start-date">A partir de:</Label>
              <Input
                id="contract-start-date"
                type="date"
                value={startDate}
                min={contractDateBounds().min}
                max={contractDateBounds().max}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="contract-start-date"
              />
              <p className="text-xs text-stone-500 mt-1.5">
                Solo puedes elegir una fecha dentro de los próximos 4 a 10 días.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitContract} className="w-full rounded-full bg-terracotta hover:bg-terracotta-hover" data-testid="submit-contract">Crear contrato</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
