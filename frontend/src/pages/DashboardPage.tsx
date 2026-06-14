import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, CalendarRange, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { listActivities, listTeams } from "../lib/api";
import { ActivityCard } from "../components/ActivityCard";
import { ActivityFormModal } from "../components/ActivityFormModal";
import { Card, EmptyState, Loading, PageHeader } from "../components/ui";

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);

  const { data: activities, isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: () => listActivities(),
  });
  const { data: teams = [] } = useQuery({ queryKey: ["teams"], queryFn: listTeams });

  const upcoming = useMemo(() => {
    const now = Date.now();
    return (activities || [])
      .filter((a) => new Date(a.start_time).getTime() >= now - 2 * 3600 * 1000)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );
  }, [activities]);

  const canSchedule = user?.role === "admin" || user?.role === "trainer";
  const firstName = user?.full_name.split(" ")[0];

  return (
    <div>
      <PageHeader
        title={t("dashboard.welcome", { name: firstName })}
        subtitle={t("dashboard.subtitle")}
        actions={
          canSchedule && (
            <button className="btn-primary" onClick={() => setFormOpen(true)}>
              <CalendarPlus size={16} /> {t("dashboard.scheduleActivity")}
            </button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<CalendarRange size={18} />}
          label={t("dashboard.statUpcoming")}
          value={upcoming.length}
        />
        <StatCard
          icon={<Users size={18} />}
          label={t(user?.role === "player" ? "dashboard.statMyTeams" : "dashboard.statTeams")}
          value={teams.length}
        />
        <Link to="/calendar" className="hidden sm:block">
          <Card className="flex h-full items-center justify-center p-4 text-sm font-medium text-brand-700 hover:bg-brand-50">
            {t("dashboard.viewCalendar")}
          </Card>
        </Link>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-900">
        {t("dashboard.upcomingActivities")}
      </h2>
      {isLoading ? (
        <Loading />
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<CalendarRange size={32} />}
          title={t("dashboard.emptyTitle")}
          description={t(canSchedule ? "dashboard.emptyManage" : "dashboard.emptyPlayer")}
          action={
            canSchedule && (
              <button className="btn-primary" onClick={() => setFormOpen(true)}>
                <CalendarPlus size={16} /> {t("dashboard.scheduleActivity")}
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {upcoming.slice(0, 8).map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
        </div>
      )}

      <ActivityFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}
