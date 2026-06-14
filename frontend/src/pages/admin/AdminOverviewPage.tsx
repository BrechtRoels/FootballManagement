import { Link } from "react-router-dom";
import {
  Building2,
  ChevronRight,
  ClipboardList,
  Plus,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { listResources, listTeams, listUsers } from "../../lib/api";
import { Avatar, Badge, Card, Loading, PageHeader } from "../../components/ui";
import type { UserRole } from "../../lib/types";

const roleColor: Record<UserRole, "ink" | "brand" | "steel"> = {
  admin: "ink",
  trainer: "brand",
  player: "steel",
};

export default function AdminOverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => listUsers(),
  });
  const { data: resources = [] } = useQuery({
    queryKey: ["resources"],
    queryFn: listResources,
  });

  if (teamsLoading || usersLoading) return <Loading label="Loading club…" />;

  const trainers = users.filter((u) => u.role === "trainer");
  const players = users.filter((u) => u.role === "player");
  const recent = [...users]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title={t("admin.overviewTitle")}
        subtitle={t("admin.overviewSubtitle")}
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          icon={<Users size={18} />}
          label={t("admin.statTeams")}
          value={teams.length}
        />
        <Stat
          icon={<ClipboardList size={18} />}
          label={t("admin.statTrainers")}
          value={trainers.length}
        />
        <Stat
          icon={<UserCog size={18} />}
          label={t("admin.statPlayers")}
          value={players.length}
        />
        <Stat
          icon={<Building2 size={18} />}
          label={t("admin.statFacilities")}
          value={resources.length}
        />
      </div>

      {/* Quick actions */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ActionCard
          to="/admin/users"
          icon={<UserPlus size={18} />}
          title={t("admin.actionAddPersonTitle")}
          desc={t("admin.actionAddPersonDesc")}
        />
        <ActionCard
          to="/teams"
          icon={<Plus size={18} />}
          title={t("admin.actionCreateTeamTitle")}
          desc={t("admin.actionCreateTeamDesc")}
        />
        <ActionCard
          to="/admin/resources"
          icon={<Building2 size={18} />}
          title={t("admin.actionAddFacilityTitle")}
          desc={t("admin.actionAddFacilityDesc")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Teams */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("admin.teams")}
            </h2>
            <Link
              to="/teams"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              {t("admin.manageAll")}
            </Link>
          </div>
          <Card>
            {teams.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                {t("admin.noTeams")}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    to={`/teams/${team.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                        <Users size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {team.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {[team.category, team.season]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* Recent people */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("admin.recentPeople")}
            </h2>
            <Link
              to="/admin/users"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              {t("admin.manageAll")}
            </Link>
          </div>
          <Card>
            {recent.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                {t("admin.noAccounts")}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recent.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={u.full_name} size={34} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {u.full_name}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {u.email}
                        </p>
                      </div>
                    </div>
                    <Badge color={roleColor[u.role]}>
                      {t(`roles.${u.role}`)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">
        {t("admin.signedInAs", { name: user?.full_name })}
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
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

function ActionCard({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link to={to}>
      <Card className="flex h-full items-center gap-3 p-4 transition hover:border-brand-300 hover:shadow-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-400">{desc}</p>
        </div>
      </Card>
    </Link>
  );
}
