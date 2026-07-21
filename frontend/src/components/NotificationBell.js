import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Bell, CalendarClock, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

function timeAgo(iso) {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 1) return "ahora";
    if (diff < 60) return `hace ${Math.floor(diff)} min`;
    if (diff < 1440) return `hace ${Math.floor(diff / 60)} h`;
    return `hace ${Math.floor(diff / 1440)} d`;
  } catch { return ""; }
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState({ notifications: [], unread: 0, reminders: [] });
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    api.get("/my/notifications").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const markAll = async () => {
    setLoading(true);
    try { await api.post("/notifications/read-all"); load(); } finally { setLoading(false); }
  };

  return (
    <DropdownMenu onOpenChange={(o) => o && data.unread > 0 && markAll()}>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-stone-100 transition-colors" data-testid="notification-bell">
          <Bell className="w-5 h-5 text-stone-600" />
          {data.unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-terracotta text-white text-[10px] rounded-full flex items-center justify-center" data-testid="notif-count">{data.unread}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 max-h-96 overflow-y-auto">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <span className="font-semibold text-navy text-sm">Notificaciones</span>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-terracotta" />}
        </div>

        {data.reminders.length > 0 && (
          <div className="p-2 bg-amber-50">
            {data.reminders.map((r) => (
              <div key={r.visit_id} className="flex items-start gap-2 px-2 py-2 text-sm" data-testid="reminder-item">
                <CalendarClock className="w-4 h-4 text-amber-600 mt-0.5" />
                <div><div className="text-amber-800 font-medium">Recordatorio de visita</div><div className="text-amber-700 text-xs">{r.property_title} · en {r.hours} h</div></div>
              </div>
            ))}
          </div>
        )}

        {data.notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-stone-400">Sin notificaciones</div>
        ) : (
          data.notifications.slice(0, 12).map((n) => (
            <button key={n.id} onClick={() => n.link && navigate(n.link)} className={`w-full text-left px-4 py-3 border-b border-stone-50 hover:bg-stone-50 transition-colors ${!n.read ? "bg-terracotta/5" : ""}`} data-testid={`notif-${n.id}`}>
              <div className="text-sm font-medium text-navy">{n.title}</div>
              <div className="text-xs text-stone-500">{n.message}</div>
              <div className="text-[10px] text-stone-400 mt-0.5">{timeAgo(n.created_at)}</div>
            </button>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
