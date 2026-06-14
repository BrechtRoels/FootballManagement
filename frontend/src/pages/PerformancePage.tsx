import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listTeams } from "../lib/api";
import { EmptyState, Loading, PageHeader } from "../components/ui";
import { TeamPerformanceTable } from "../components/TeamPerformanceTable";

/**
 * Dedicated trainer/admin view: pick a team and see every player's performance
 * indicator over time. Each row links to that player's trend page.
 */
export default function PerformancePage() {
  const { t } = useTranslation();
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });
  const [teamId, setTeamId] = useState("");

  useEffect(() => {
    if (!teamId && teams.length) setTeamId(teams[0].id);
  }, [teams, teamId]);

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title={t("performance.overviewTitle")}
        subtitle={t("performance.overviewSubtitle")}
      />

      {teams.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={28} />}
          title={t("performance.noTeams")}
        />
      ) : (
        <>
          <div className="mb-5">
            <select
              className="select max-w-xs"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </div>
          {teamId && <TeamPerformanceTable teamId={teamId} />}
        </>
      )}
    </div>
  );
}
