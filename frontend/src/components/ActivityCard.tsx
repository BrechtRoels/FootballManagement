import { Link } from "react-router-dom";
import { Clock, MapPin } from "lucide-react";
import clsx from "clsx";
import { ActivityTypeBadge, StatusBadge, activityIcon } from "./badges";
import { fmtRange, fmtRelativeDay } from "../lib/format";
import type { Activity } from "../lib/types";

const accent: Record<Activity["type"], string> = {
  training: "border-l-steel-400",
  match: "border-l-brand-600",
  meeting: "border-l-ink-700",
  event: "border-l-steel-300",
};

export function ActivityCard({ activity }: { activity: Activity }) {
  const Icon = activityIcon(activity.type);
  const cancelled = activity.status === "cancelled";
  return (
    <Link
      to={`/activities/${activity.id}`}
      className={clsx(
        "block rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-card transition hover:shadow-md",
        accent[activity.type],
        cancelled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p
              className={clsx(
                "truncate font-semibold text-slate-900",
                cancelled && "line-through",
              )}
            >
              {activity.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock size={13} />
                {fmtRelativeDay(activity.start_time)} ·{" "}
                {fmtRange(activity.start_time, activity.end_time)}
              </span>
              {activity.location_text && (
                <span className="flex items-center gap-1">
                  <MapPin size={13} />
                  {activity.location_text}
                </span>
              )}
            </div>
            {activity.resources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {activity.resources.map((r) => (
                  <span
                    key={r.id}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500"
                  >
                    {r.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <ActivityTypeBadge type={activity.type} />
          {cancelled && <StatusBadge status={activity.status} />}
        </div>
      </div>
    </Link>
  );
}
