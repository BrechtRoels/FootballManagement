import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  Check,
  ClipboardList,
  Clock,
  HelpCircle,
  MapPin,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import {
  cancelActivity,
  deleteActivity,
  getActivity,
  getSquad,
  setAvailability,
  setSelection,
} from "../lib/api";
import {
  ActivityTypeBadge,
  AvailabilityBadge,
  StatusBadge,
} from "../components/badges";
import { ActivityFormModal } from "../components/ActivityFormModal";
import { RatePlayersModal } from "../components/RatePlayersModal";
import { MapLinks } from "../components/MapLinks";
import { AddToCalendar } from "../components/AddToCalendar";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Loading,
  Modal,
  PageHeader,
  Spinner,
} from "../components/ui";
import { fmtDate, fmtRange } from "../lib/format";
import type {
  AvailabilityStatus,
  DeleteScope,
  SquadEntry,
} from "../lib/types";

export default function ActivityDetailPage() {
  const { activityId = "" } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  // For series occurrences, deleting/cancelling asks one-vs-series first.
  const [seriesPrompt, setSeriesPrompt] = useState<"cancel" | "delete" | null>(
    null,
  );

  const { data: activity, isLoading } = useQuery({
    queryKey: ["activity", activityId],
    queryFn: () => getActivity(activityId),
  });
  const { data: squad = [], isLoading: squadLoading } = useQuery({
    queryKey: ["squad", activityId],
    queryFn: () => getSquad(activityId),
    enabled: !!activityId,
  });

  const myAvailability = useMemo(
    () => activity?.availabilities.find((a) => a.user.id === user?.id),
    [activity, user],
  );

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["activity", activityId] });
    qc.invalidateQueries({ queryKey: ["squad", activityId] });
  }

  const availMut = useMutation({
    mutationFn: (status: AvailabilityStatus) =>
      setAvailability(activityId, status),
    onSuccess: invalidate,
  });
  const selectMut = useMutation({
    mutationFn: ({ userId, selected }: { userId: string; selected: boolean }) =>
      setSelection(activityId, userId, selected),
    onSuccess: invalidate,
  });
  const cancelMut = useMutation({
    mutationFn: (scope: DeleteScope) => cancelActivity(activityId, scope),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["activities"] });
      setSeriesPrompt(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (scope: DeleteScope) => deleteActivity(activityId, scope),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      navigate("/calendar");
    },
  });

  const sortByShirt = (a: SquadEntry, b: SquadEntry) =>
    (a.shirt_number || 99) - (b.shirt_number || 99);
  const own = useMemo(
    () => squad.filter((s) => !s.is_callup).sort(sortByShirt),
    [squad],
  );
  const callups = useMemo(
    () =>
      squad
        .filter((s) => s.is_callup)
        .sort(
          (a, b) =>
            a.team_name.localeCompare(b.team_name) || sortByShirt(a, b),
        ),
    [squad],
  );
  // Only players actually called up are listed; the rest stay searchable.
  const calledUp = useMemo(() => callups.filter((s) => s.selected), [callups]);
  const callupPool = useMemo(
    () => callups.filter((s) => !s.selected),
    [callups],
  );
  const selectedCount = squad.filter((s) => s.selected).length;

  if (isLoading) return <Loading />;
  if (!activity) return <EmptyState title={t("activityDetail.notFound")} />;

  const canManage = user?.role === "admin" || user?.role === "trainer";
  const isPlayer = user?.role === "player";
  // Squad selection is a match-only concept. Trainings, meetings and events
  // only track availability (everyone is expected).
  const isMatch = activity.type === "match";

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={15} /> {t("common.back")}
      </button>

      <PageHeader
        title={activity.title}
        actions={
          canManage &&
          activity.status === "scheduled" && (
            <div className="flex gap-2">
              {isMatch && (
                <button
                  className="btn-secondary"
                  onClick={() => setRateOpen(true)}
                >
                  <ClipboardList size={16} /> {t("performance.ratePlayers")}
                </button>
              )}
              <button className="btn-secondary" onClick={() => setEditOpen(true)}>
                <Pencil size={16} /> {t("activityDetail.edit")}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  if (activity.series_id) setSeriesPrompt("cancel");
                  else if (confirm(t("activityDetail.confirmCancel")))
                    cancelMut.mutate("one");
                }}
              >
                <Ban size={16} /> {t("activityDetail.cancel")}
              </button>
              <button
                className="btn-ghost text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (activity.series_id) setSeriesPrompt("delete");
                  else if (confirm(t("activityDetail.confirmDelete")))
                    deleteMut.mutate("one");
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Details */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ActivityTypeBadge type={activity.type} />
              <StatusBadge status={activity.status} />
              {activity.team_name && (
                <Badge color="slate">{activity.team_name}</Badge>
              )}
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock size={16} className="text-slate-400" />
                <span>
                  {fmtDate(activity.start_time)} ·{" "}
                  {fmtRange(activity.start_time, activity.end_time)}
                </span>
              </div>
              {activity.location_text && (
                <div className="flex items-start gap-2 text-slate-600">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p>{activity.location_text}</p>
                    <MapLinks query={activity.location_text} className="mt-1.5" />
                  </div>
                </div>
              )}
              {activity.opponent && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Users size={16} className="text-slate-400" />
                  {t("activityDetail.vs", { opponent: activity.opponent })}
                  {activity.home_away && ` (${t(`homeAway.${activity.home_away}`)})`}
                </div>
              )}
            </dl>
            {activity.status === "scheduled" && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <AddToCalendar
                  event={{
                    uid: `${activity.id}@ksvjabbeke`,
                    title: activity.title,
                    start: activity.start_time,
                    end: activity.end_time,
                    location: activity.location_text,
                    details: activity.description,
                  }}
                />
              </div>
            )}
            {activity.description && (
              <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm text-slate-600">
                {activity.description}
              </p>
            )}
            {activity.resources.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("activityDetail.reservedFacilities")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {activity.resources.map((r) => (
                    <Badge key={r.id} color="steel">
                      {r.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Player self-availability */}
          {isPlayer && activity.status === "scheduled" && (
            <Card className="p-5">
              <p className="mb-1 font-semibold text-slate-900">
                {t("activityDetail.canYouAttend")}
              </p>
              {isMatch && myAvailability?.selected && (
                <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-brand-700">
                  <Star size={15} className="fill-brand-500 text-brand-500" />
                  {t("activityDetail.youAreSelected")}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <AvailabilityButton
                  label={t("attend.yes")}
                  icon={<Check size={16} />}
                  active={myAvailability?.status === "available"}
                  activeClass="border-brand-500 bg-brand-50 text-brand-700"
                  onClick={() => availMut.mutate("available")}
                />
                <AvailabilityButton
                  label={t("attend.maybe")}
                  icon={<HelpCircle size={16} />}
                  active={myAvailability?.status === "maybe"}
                  activeClass="border-amber-500 bg-amber-50 text-amber-700"
                  onClick={() => availMut.mutate("maybe")}
                />
                <AvailabilityButton
                  label={t("attend.no")}
                  icon={<X size={16} />}
                  active={myAvailability?.status === "unavailable"}
                  activeClass="border-ink-500 bg-ink-100 text-ink-800"
                  onClick={() => availMut.mutate("unavailable")}
                />
              </div>
            </Card>
          )}
        </div>

        {/* Roster / selection */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {isMatch
                ? canManage
                  ? t("activityDetail.squadAvailability")
                  : t("activityDetail.squad")
                : t("activityDetail.availability")}
            </h2>
            {isMatch && (
              <Badge color="brand">
                {t("activityDetail.selectedCount", { count: selectedCount })}
              </Badge>
            )}
          </div>

          {squadLoading ? (
            <Card className="flex items-center justify-center py-12">
              <Spinner />
            </Card>
          ) : squad.length === 0 ? (
            <EmptyState
              icon={<Users size={28} />}
              title={t("activityDetail.emptyTitle")}
              description={t("activityDetail.emptyDesc")}
            />
          ) : (
            <div className="space-y-4">
              <Card>
                <div className="divide-y divide-slate-100">
                  {own.map((entry) => (
                    <PlayerRow
                      key={entry.user.id}
                      entry={entry}
                      isMatch={isMatch}
                      canManage={canManage}
                      onToggle={() =>
                        selectMut.mutate({
                          userId: entry.user.id,
                          selected: !entry.selected,
                        })
                      }
                    />
                  ))}
                </div>
              </Card>

              {/* Call-ups: managers search the feeder-team pool and add players;
                  everyone sees the players who were actually called up. */}
              {isMatch && (canManage ? callups.length > 0 : calledUp.length > 0) && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                    {t("activityDetail.callups")}
                    <span className="font-normal normal-case text-slate-400">
                      {t("activityDetail.callupsFrom")}
                    </span>
                  </h3>
                  {canManage && (
                    <CallupSearch
                      pool={callupPool}
                      onAdd={(userId) =>
                        selectMut.mutate({ userId, selected: true })
                      }
                    />
                  )}
                  {calledUp.length > 0 ? (
                    <Card className={canManage ? "mt-3" : ""}>
                      <div className="divide-y divide-slate-100">
                        {calledUp.map((entry) => (
                          <PlayerRow
                            key={entry.user.id}
                            entry={entry}
                            isMatch={isMatch}
                            canManage={canManage}
                            showOrigin
                            onToggle={() =>
                              selectMut.mutate({
                                userId: entry.user.id,
                                selected: !entry.selected,
                              })
                            }
                          />
                        ))}
                      </div>
                    </Card>
                  ) : (
                    canManage && (
                      <p className="mt-3 text-sm text-slate-400">
                        {t("activityDetail.callupEmpty")}
                      </p>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <>
          <ActivityFormModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            activity={activity}
          />
          <RatePlayersModal
            open={rateOpen}
            onClose={() => setRateOpen(false)}
            activityId={activityId}
          />
          <Modal
            open={seriesPrompt !== null}
            onClose={() => setSeriesPrompt(null)}
            title={t(
              seriesPrompt === "delete"
                ? "activityDetail.deleteSeriesTitle"
                : "activityDetail.cancelSeriesTitle",
            )}
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {t("activityDetail.seriesPrompt")}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  className="btn-secondary justify-center"
                  disabled={cancelMut.isPending || deleteMut.isPending}
                  onClick={() =>
                    seriesPrompt === "delete"
                      ? deleteMut.mutate("one")
                      : cancelMut.mutate("one")
                  }
                >
                  {t("activityDetail.seriesScopeOne")}
                </button>
                <button
                  className="btn-danger justify-center"
                  disabled={cancelMut.isPending || deleteMut.isPending}
                  onClick={() =>
                    seriesPrompt === "delete"
                      ? deleteMut.mutate("series_future")
                      : cancelMut.mutate("series_future")
                  }
                >
                  {t("activityDetail.seriesScopeFuture")}
                </button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}

// Type-ahead for calling up players from feeder teams. Instead of listing the
// whole feeder roster up front, the trainer searches by name/team and picks.
function CallupSearch({
  pool,
  onAdd,
}: {
  pool: SquadEntry[];
  onAdd: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close the results dropdown when clicking outside the widget.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = q
      ? pool.filter(
          (p) =>
            p.user.full_name.toLowerCase().includes(q) ||
            p.team_name.toLowerCase().includes(q),
        )
      : pool;
    return list.slice(0, 8);
  }, [pool, q]);

  function add(entry: SquadEntry) {
    onAdd(entry.user.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        className="input pl-9"
        placeholder={t("activityDetail.callupSearchPlaceholder")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches.length > 0) {
            e.preventDefault();
            add(matches[0]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">
              {pool.length === 0
                ? t("activityDetail.callupNoneLeft")
                : t("activityDetail.callupNoMatch")}
            </p>
          ) : (
            matches.map((entry) => (
              <button
                key={entry.user.id}
                onClick={() => add(entry)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
              >
                {entry.shirt_number != null ? (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {entry.shirt_number}
                  </div>
                ) : (
                  <Avatar name={entry.user.full_name} size={32} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {entry.user.full_name}
                  </p>
                  {entry.position && (
                    <span className="text-xs text-slate-400">
                      {entry.position}
                    </span>
                  )}
                </div>
                <Badge color="steel" className="!px-1.5 !py-0">
                  {entry.team_name}
                </Badge>
                <Plus size={16} className="shrink-0 text-slate-400" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  entry,
  isMatch,
  canManage,
  showOrigin = false,
  onToggle,
}: {
  entry: SquadEntry;
  isMatch: boolean;
  canManage: boolean;
  showOrigin?: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const selected = entry.selected;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {entry.shirt_number != null ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
            {entry.shirt_number}
          </div>
        ) : (
          <Avatar name={entry.user.full_name} size={32} />
        )}
        <div className="min-w-0">
          {canManage ? (
            <Link
              to={`/players/${entry.user.id}/performance`}
              className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline"
            >
              {entry.user.full_name}
            </Link>
          ) : (
            <p className="truncate text-sm font-medium text-slate-900">
              {entry.user.full_name}
            </p>
          )}
          <div className="flex items-center gap-2">
            {entry.position && (
              <span className="text-xs text-slate-400">{entry.position}</span>
            )}
            {showOrigin && (
              <Badge color="steel" className="!px-1.5 !py-0">
                {entry.team_name}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <AvailabilityBadge status={entry.status} />
        {isMatch && canManage ? (
          <button
            onClick={onToggle}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              selected
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Star size={13} className={selected ? "fill-white" : ""} />
            {selected ? t("activityDetail.selected") : t("activityDetail.select")}
          </button>
        ) : (
          isMatch &&
          selected && (
            <Star size={16} className="fill-brand-500 text-brand-500" />
          )
        )}
      </div>
    </div>
  );
}

function AvailabilityButton({
  label,
  icon,
  active,
  activeClass,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  activeClass: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border py-3 text-sm font-medium transition-colors ${
        active
          ? activeClass
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
