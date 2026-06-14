import type { ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPlayerPerformance } from "../lib/api";
import {
  Avatar,
  Card,
  EmptyState,
  Loading,
  PageHeader,
} from "../components/ui";
import { ActivityTypeBadge } from "../components/badges";
import { Sparkline } from "../components/Sparkline";
import { StarRating } from "../components/StarRating";
import { fmtDate } from "../lib/format";

export default function PlayerPerformancePage() {
  const { userId = "" } = useParams();
  const [params] = useSearchParams();
  const teamId = params.get("team") || undefined;
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["performance", "player", userId, teamId ?? null],
    queryFn: () => getPlayerPerformance(userId, teamId),
  });

  if (isLoading) return <Loading />;
  if (isError || !data)
    return <EmptyState title={t("performance.notFound")} />;

  const fmtAvg = (v: number | null) => (v == null ? "—" : v.toFixed(1));
  const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

  const perfHist = data.history.map((h) => h.performance_rating);
  const mentHist = data.history.map((h) => h.mentality_rating);
  const recent = [...data.history].reverse();

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={15} /> {t("common.back")}
      </button>

      <PageHeader
        title={data.user.full_name}
        subtitle={t("performance.subtitle")}
        actions={<Avatar name={data.user.full_name} size={44} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label={t("performance.statAvgPerformance")}
          value={fmtAvg(data.avg_performance)}
          sub={
            data.avg_performance != null && (
              <StarRating
                value={Math.round(data.avg_performance)}
                readOnly
                size={13}
              />
            )
          }
        />
        <StatTile
          label={t("performance.statAvgMentality")}
          value={fmtAvg(data.avg_mentality)}
          sub={
            data.avg_mentality != null && (
              <StarRating
                value={Math.round(data.avg_mentality)}
                readOnly
                size={13}
              />
            )
          }
        />
        <StatTile label={t("performance.statRated")} value={String(data.rated_count)} />
        <StatTile
          label={t("performance.statAppearances")}
          value={String(data.appearances)}
        />
        <StatTile
          label={t("performance.statAvailability")}
          value={fmtPct(data.availability_pct)}
        />
        <StatTile
          label={t("performance.statSelection")}
          value={fmtPct(data.selection_rate)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TrendCard
          title={t("performance.performanceRating")}
          values={perfHist}
          empty={t("performance.noData")}
        />
        <TrendCard
          title={t("performance.mentalityRating")}
          values={mentHist}
          empty={t("performance.noData")}
        />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {t("performance.recent")}
      </h2>
      {recent.length === 0 ? (
        <EmptyState title={t("performance.notRatedYet")} />
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {recent.map((h) => (
              <div
                key={h.activity_id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ActivityTypeBadge type={h.activity_type} />
                    <span className="truncate text-sm font-medium text-slate-900">
                      {h.title}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{fmtDate(h.date)}</p>
                </div>
                <div className="flex items-center gap-5">
                  <RatingCell
                    label={t("performance.performanceRating")}
                    value={h.performance_rating}
                  />
                  <RatingCell
                    label={t("performance.mentalityRating")}
                    value={h.mentality_rating}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </Card>
  );
}

function TrendCard({
  title,
  values,
  empty,
}: {
  title: string;
  values: (number | null)[];
  empty: string;
}) {
  const hasData = values.some((v) => v != null);
  return (
    <Card className="p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      {hasData ? (
        <Sparkline values={values} width={260} height={56} className="text-brand-600" />
      ) : (
        <p className="py-4 text-sm text-slate-400">{empty}</p>
      )}
    </Card>
  );
}

function RatingCell({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      {value == null ? (
        <span className="text-sm text-slate-300">—</span>
      ) : (
        <StarRating value={value} readOnly size={14} />
      )}
    </div>
  );
}
