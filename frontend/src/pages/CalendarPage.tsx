import { useMemo, useState } from "react";
import { CalendarPlus, CalendarRange } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useAuth } from "../auth/AuthContext";
import { listActivities, listTeams } from "../lib/api";
import { ActivityCard } from "../components/ActivityCard";
import { ActivityFormModal } from "../components/ActivityFormModal";
import { SubscribeCalendarButton } from "../components/SubscribeCalendarButton";
import { EmptyState, Loading, PageHeader } from "../components/ui";
import { fmtFullDay } from "../lib/format";
import type { Activity } from "../lib/types";

export default function CalendarPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const [teamFilter, setTeamFilter] = useState("");
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");

  const { data: teams = [] } = useQuery({ queryKey: ["teams"], queryFn: listTeams });
  const { data: activities, isLoading } = useQuery({
    queryKey: ["activities", teamFilter],
    queryFn: () => listActivities(teamFilter ? { team_id: teamFilter } : undefined),
  });

  const grouped = useMemo(() => {
    const now = Date.now();
    let list = [...(activities || [])];
    if (scope === "upcoming") {
      list = list.filter(
        (a) => new Date(a.start_time).getTime() >= now - 2 * 3600 * 1000,
      );
    }
    list.sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    const map = new Map<string, Activity[]>();
    for (const a of list) {
      const key = format(new Date(a.start_time), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries());
  }, [activities, scope]);

  const canSchedule = user?.role === "admin" || user?.role === "trainer";

  return (
    <div>
      <PageHeader
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <SubscribeCalendarButton />
            {canSchedule && (
              <button className="btn-primary" onClick={() => setFormOpen(true)}>
                <CalendarPlus size={16} /> {t("calendar.schedule")}
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          className="select max-w-xs"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
        >
          <option value="">{t("calendar.allTeams")}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </select>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
          {(["upcoming", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-2 text-sm font-medium ${
                scope === s
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t(`calendar.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<CalendarRange size={32} />}
          title={t("calendar.emptyTitle")}
          description={t("calendar.emptyText")}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                {fmtFullDay(day)}
              </h3>
              <div className="space-y-3">
                {items.map((a) => (
                  <ActivityCard key={a.id} activity={a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ActivityFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        defaultTeamId={teamFilter || undefined}
      />
    </div>
  );
}
