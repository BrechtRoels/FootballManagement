import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/api";

export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
    refetchInterval: 30000,
  });
  const unread = notifications.filter((n) => !n.is_read).length;

  async function handleMarkAll() {
    await markAllNotificationsRead();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function handleClick(id: string, isRead: boolean) {
    if (!isRead) {
      await markNotificationRead(id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={t("notifications.title")}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="font-semibold text-slate-800">
                {t("notifications.title")}
              </span>
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <CheckCheck size={14} /> {t("notifications.markAllRead")}
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  {t("notifications.empty")}
                </p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n.id, n.is_read)}
                    className={`flex w-full flex-col items-start gap-0.5 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                      n.is_read ? "" : "bg-brand-50/40"
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </div>
                    {n.body && (
                      <span className="text-xs text-slate-500">{n.body}</span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
