import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getTeamPerformance } from "../lib/api";
import { Card } from "./ui";
import { StarRating } from "./StarRating";

const fmtAvg = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

/**
 * Per-player performance summary for a team (trainer/admin). Each row links to
 * that player's trend page. Hides itself if the viewer can't manage the team
 * (the endpoint returns 403). Shared by the team page and the Performance page.
 */
export function TeamPerformanceTable({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const { data = [], isError, isLoading } = useQuery({
    queryKey: ["performance", "team", teamId],
    queryFn: () => getTeamPerformance(teamId),
    enabled: !!teamId,
    retry: false,
  });

  if (isError) return null;
  if (isLoading) return null;
  if (data.length === 0)
    return (
      <p className="text-sm text-slate-400">{t("performance.notRatedYet")}</p>
    );

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2 font-medium">{t("common.fullName")}</th>
            <th className="px-3 py-2 font-medium">
              {t("performance.statAvgPerformance")}
            </th>
            <th className="px-3 py-2 font-medium">
              {t("performance.statAvgMentality")}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {t("performance.statAppearances")}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {t("performance.statAvailability")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row) => (
            <tr key={row.user.id} className="hover:bg-slate-50">
              <td className="px-4 py-2">
                <Link
                  to={`/players/${row.user.id}/performance?team=${teamId}`}
                  className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                >
                  {row.user.full_name}
                </Link>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {row.avg_performance != null && (
                    <StarRating
                      value={Math.round(row.avg_performance)}
                      readOnly
                      size={13}
                    />
                  )}
                  <span className="text-slate-500">
                    {fmtAvg(row.avg_performance)}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {row.avg_mentality != null && (
                    <StarRating
                      value={Math.round(row.avg_mentality)}
                      readOnly
                      size={13}
                    />
                  )}
                  <span className="text-slate-500">
                    {fmtAvg(row.avg_mentality)}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {row.appearances}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {fmtPct(row.availability_pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
