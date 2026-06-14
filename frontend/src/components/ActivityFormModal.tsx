import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Lock, MapPin, Repeat } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  type ActivityCreatePayload,
  checkConflicts,
  createActivity,
  createRecurringActivity,
  errorMessage,
  listResources,
  listTeams,
  updateActivity,
} from "../lib/api";
import { Modal } from "./ui";
import { MapLinks } from "./MapLinks";
import {
  AddressAutocomplete,
  type AddressAutocompleteHandle,
} from "./AddressAutocomplete";
import type {
  ActivityDetail,
  ActivityType,
  Conflict,
  EditScope,
  HomeAway,
  RecurrenceSpec,
  SkippedOccurrence,
} from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultTeamId?: string;
  defaultDate?: string; // yyyy-MM-dd
  /** When provided, the form edits this activity instead of creating a new one. */
  activity?: ActivityDetail;
}

const TYPES: ActivityType[] = ["training", "match", "meeting", "event"];
// 0=Mon .. 6=Sun (matches the backend RecurrenceSpec convention).
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

/** Weekday of a yyyy-MM-dd string as 0=Mon .. 6=Sun. */
function isoWeekday(dateStr: string): number {
  const jsDay = new Date(`${dateStr}T00:00`).getDay(); // 0=Sun .. 6=Sat
  return (jsDay + 6) % 7;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO string -> local "yyyy-MM-dd" for a <input type="date">. */
function localDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO string -> local "HH:mm" for a <input type="time">. */
function localTimeStr(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActivityFormModal({
  open,
  onClose,
  defaultTeamId,
  defaultDate,
  activity,
}: Props) {
  const isEdit = !!activity;
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: teams = [] } = useQuery({ queryKey: ["teams"], queryFn: listTeams });
  const { data: resources = [] } = useQuery({
    queryKey: ["resources"],
    queryFn: listResources,
  });

  const [teamId, setTeamId] = useState(defaultTeamId || "");
  const [type, setType] = useState<ActivityType>("training");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate || "");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [location, setLocation] = useState("");
  const [opponent, setOpponent] = useState("");
  const [homeAway, setHomeAway] = useState<HomeAway>("home");
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const addrRef = useRef<AddressAutocompleteHandle>(null);

  // Recurrence (create mode only)
  const [repeat, setRepeat] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [endMode, setEndMode] = useState<"until" | "count">("until");
  const [until, setUntil] = useState("");
  const [count, setCount] = useState(8);
  const [skipped, setSkipped] = useState<SkippedOccurrence[] | null>(null);
  // Series edit scope (edit mode, only when activity belongs to a series)
  const [editScope, setEditScope] = useState<EditScope>("one");

  useEffect(() => {
    if (!open) return;
    if (activity) {
      // Edit mode: prefill from the existing activity.
      setTeamId(activity.team_id);
      setType(activity.type);
      setTitle(activity.title);
      setDescription(activity.description || "");
      setDate(localDateStr(activity.start_time));
      setStartTime(localTimeStr(activity.start_time));
      setEndTime(localTimeStr(activity.end_time));
      setLocation(activity.location_text || "");
      setOpponent(activity.opponent || "");
      setHomeAway(activity.home_away || "home");
      setResourceIds(activity.resources.map((r) => r.id));
    } else {
      setTeamId(defaultTeamId || teams[0]?.id || "");
      setType("training");
      setTitle("");
      setDescription("");
      setDate(defaultDate || new Date().toISOString().slice(0, 10));
      setStartTime("18:00");
      setEndTime("20:00");
      setLocation("");
      setOpponent("");
      setHomeAway("home");
      setResourceIds([]);
    }
    setRepeat(false);
    setRepeatDays([]);
    setIntervalWeeks(1);
    setEndMode("until");
    setUntil("");
    setCount(8);
    setSkipped(null);
    setEditScope("one");
    setConflicts([]);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id, defaultTeamId, defaultDate]);

  // Home trainings/matches are played at our own complex: the trainer reserves a
  // pitch + dressing rooms and the location is taken from those facilities. Away
  // trainings/matches use only a free-text location, unrelated to our facilities.
  const hasHomeAway = type === "training" || type === "match";
  const isHome = hasHomeAway && homeAway === "home";
  const isAway = hasHomeAway && homeAway === "away";
  const showFacilities = isHome || type === "meeting" || type === "event";
  const showManualLocation = isAway || type === "meeting" || type === "event";
  const autoLocation = isHome;
  // Trainers pick the pitch/rooms; dressing rooms are assigned automatically.
  const pickableResources = resources.filter(
    (r) => r.type !== "dressing_room",
  );

  // Location derived from the addresses of the reserved facilities (home only).
  const derivedLocation = useMemo(() => {
    const locs = resourceIds
      .map((id) => resources.find((r) => r.id === id)?.location?.trim())
      .filter((l): l is string => !!l);
    return [...new Set(locs)].join(" · ");
  }, [resourceIds, resources]);

  // Away activities reserve no facilities — drop any stale selection.
  useEffect(() => {
    if (!showFacilities && resourceIds.length > 0) setResourceIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFacilities]);

  const payload: ActivityCreatePayload | null = useMemo(() => {
    if (!teamId || !date || !startTime || !endTime) return null;
    const loc = (autoLocation ? derivedLocation : location).trim();
    return {
      team_id: teamId,
      type,
      title: title || (type === "match" ? `Match vs ${opponent || "TBD"}` : ""),
      description: description || null,
      start_time: toIso(date, startTime),
      end_time: toIso(date, endTime),
      location_text: loc || null,
      opponent: type === "match" ? opponent || null : null,
      home_away: hasHomeAway ? homeAway : null,
      resource_ids: showFacilities ? resourceIds : [],
    };
  }, [teamId, type, title, description, date, startTime, endTime, location, derivedLocation, autoLocation, opponent, homeAway, hasHomeAway, showFacilities, resourceIds]);

  // Live conflict check whenever time/resources change
  useEffect(() => {
    if (!open || !payload || resourceIds.length === 0) {
      setConflicts([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const c = await checkConflicts(payload);
        // When editing, the activity holds its own bookings — don't flag itself.
        if (active)
          setConflicts(
            activity ? c.filter((x) => x.activity_id !== activity.id) : c,
          );
      } catch {
        /* ignore preview errors */
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, startTime, endTime, resourceIds.join(","), teamId, open]);

  function buildRecurrence(): RecurrenceSpec {
    const days = repeatDays.length ? [...repeatDays].sort((a, b) => a - b) : [isoWeekday(date)];
    return {
      freq: "weekly",
      interval: intervalWeeks,
      days_of_week: days,
      ...(endMode === "until" ? { until: until || null } : { count }),
    };
  }

  const mutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      if (activity) {
        // team and type are structural and locked while editing.
        const { team_id: _team, type: _type, ...changes } = payload!;
        await updateActivity(activity.id, changes, force, editScope);
        return { skipped: null as SkippedOccurrence[] | null };
      }
      if (repeat) {
        const res = await createRecurringActivity(
          { ...payload!, recurrence: buildRecurrence() },
          force,
        );
        return { skipped: res.skipped };
      }
      await createActivity(payload!, force);
      return { skipped: null as SkippedOccurrence[] | null };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (activity) {
        qc.invalidateQueries({ queryKey: ["activity", activity.id] });
        qc.invalidateQueries({ queryKey: ["squad", activity.id] });
      }
      // Recurring create with conflicts: keep the modal open to report which
      // sessions were skipped instead of silently dropping them.
      if (res.skipped && res.skipped.length > 0) {
        setSkipped(res.skipped);
        return;
      }
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function submit(force: boolean) {
    setError(null);
    if (!payload) {
      setError(t("activityForm.errComplete"));
      return;
    }
    if (!payload.title) {
      setError(t("activityForm.errTitle"));
      return;
    }
    if (new Date(payload.end_time) <= new Date(payload.start_time)) {
      setError(t("activityForm.errTimes"));
      return;
    }
    if (!activity && repeat) {
      if (endMode === "until" && !until) {
        setError(t("activityForm.recurrence.errUntil"));
        return;
      }
      if (endMode === "count" && (!count || count < 1)) {
        setError(t("activityForm.recurrence.errCount"));
        return;
      }
    }
    mutation.mutate({ force });
  }

  function toggleRepeatDay(day: number) {
    setRepeatDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
    );
  }

  function toggleResource(id: string) {
    setResourceIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(isEdit ? "activityForm.editTitle" : "activityForm.title")}
      size="lg"
    >
      {skipped ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">
                {t("activityForm.recurrence.skippedTitle", { count: skipped.length })}
              </p>
              <ul className="mt-1 list-inside list-disc">
                {skipped.map((s, i) => (
                  <li key={i}>
                    {new Date(s.start_time).toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    })}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button className="btn-primary" onClick={onClose}>
              {t("common.done")}
            </button>
          </div>
        </div>
      ) : (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{t("activityForm.team")}</label>
            {isEdit ? (
              <LockedField
                value={teams.find((tm) => tm.id === teamId)?.name ?? "—"}
              />
            ) : (
              <select
                className="select"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="label">{t("activityForm.type")}</label>
            {isEdit ? (
              <LockedField value={t(`activityType.${type}`)} />
            ) : (
              <select
                className="select"
                value={type}
                onChange={(e) => setType(e.target.value as ActivityType)}
              >
                {TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`activityType.${value}`)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div>
          <label className="label">{t("activityForm.titleLabel")}</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(
              type === "match"
                ? "activityForm.titlePlaceholderMatch"
                : "activityForm.titlePlaceholderOther",
            )}
          />
        </div>

        {hasHomeAway && (
          <div
            className={`grid grid-cols-1 gap-4 ${
              type === "match" ? "sm:grid-cols-2" : ""
            }`}
          >
            {type === "match" && (
              <div>
                <label className="label">{t("activityForm.opponent")}</label>
                <input
                  className="input"
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                  placeholder={t("activityForm.opponentPlaceholder")}
                />
              </div>
            )}
            <div>
              <label className="label">{t("activityForm.homeAway")}</label>
              <select
                className="select"
                value={homeAway}
                onChange={(e) => setHomeAway(e.target.value as HomeAway)}
              >
                <option value="home">{t("homeAway.home")}</option>
                <option value="away">{t("homeAway.away")}</option>
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">{t("activityForm.date")}</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t("activityForm.start")}</label>
            <input
              type="time"
              className="input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t("activityForm.end")}</label>
            <input
              type="time"
              className="input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        {!isEdit && (
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(e) => {
                  setRepeat(e.target.checked);
                  if (e.target.checked && repeatDays.length === 0 && date) {
                    setRepeatDays([isoWeekday(date)]);
                  }
                }}
              />
              <Repeat size={15} className="text-slate-400" />
              {t("activityForm.recurrence.repeat")}
            </label>

            {repeat && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="label">
                    {t("activityForm.recurrence.onDays")}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d) => {
                      const active = repeatDays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleRepeatDay(d)}
                          className={`rounded-lg border px-2.5 py-1 text-sm transition-colors ${
                            active
                              ? "border-brand-500 bg-brand-50 text-brand-700"
                              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {t(`weekdayShort.${d}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">
                      {t("activityForm.recurrence.everyNWeeks")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className="input"
                      value={intervalWeeks}
                      onChange={(e) =>
                        setIntervalWeeks(Math.max(1, Number(e.target.value) || 1))
                      }
                    />
                  </div>
                  <div>
                    <label className="label">
                      {t("activityForm.recurrence.ends")}
                    </label>
                    <select
                      className="select"
                      value={endMode}
                      onChange={(e) =>
                        setEndMode(e.target.value as "until" | "count")
                      }
                    >
                      <option value="until">
                        {t("activityForm.recurrence.untilDate")}
                      </option>
                      <option value="count">
                        {t("activityForm.recurrence.afterCount")}
                      </option>
                    </select>
                  </div>
                </div>

                {endMode === "until" ? (
                  <input
                    type="date"
                    className="input"
                    value={until}
                    min={date}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                ) : (
                  <input
                    type="number"
                    min={1}
                    max={200}
                    className="input"
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {showFacilities && (
          <div>
            <label className="label">{t("activityForm.reserveFacilities")}</label>
            {pickableResources.length === 0 ? (
              <p className="text-sm text-slate-400">
                {t("activityForm.noFacilities")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pickableResources.map((r) => {
                  const active = resourceIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleResource(r.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {r.name}
                      <span className="ml-1 text-xs text-slate-400">
                        {t(`resourceType.${r.type}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {isHome && (
              <p className="mt-2 text-xs text-slate-400">
                {t(
                  type === "match"
                    ? "activityForm.autoRoomsMatchHint"
                    : "activityForm.autoRoomsHint",
                )}
              </p>
            )}
            {autoLocation && (
              <p className="mt-1 text-xs text-slate-400">
                {t("activityForm.locationAutoHint")}
              </p>
            )}
          </div>
        )}

        {showManualLocation && (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label !mb-0">{t("activityForm.location")}</label>
              {type === "match" && isAway && opponent.trim().length > 1 && (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-700 hover:underline"
                  onClick={() => addrRef.current?.searchFor(opponent.trim())}
                >
                  {t("geo.findVenue", { opponent: opponent.trim() })}
                </button>
              )}
            </div>
            <AddressAutocomplete
              ref={addrRef}
              value={location}
              onChange={setLocation}
              placeholder={t("activityForm.locationPlaceholder")}
            />
            <MapLinks query={location} className="mt-2" />
          </div>
        )}

        {autoLocation && (
          <div>
            <label className="label">
              {t("activityForm.locationFromFacilities")}
            </label>
            {derivedLocation ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <MapPin size={15} className="shrink-0 text-slate-400" />
                  {derivedLocation}
                </div>
                <MapLinks query={derivedLocation} className="mt-2" />
              </>
            ) : (
              <p className="text-sm text-slate-400">
                {t("activityForm.locationDerivedEmpty")}
              </p>
            )}
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">{t("activityForm.conflictTitle")}</p>
              <ul className="mt-1 list-inside list-disc">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    {t("activityForm.conflictItem", {
                      resource: c.resource.name,
                      activity: c.activity_title,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {isEdit && activity?.series_id && (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Repeat size={15} className="text-slate-400" />
              {t("activityForm.recurrence.applyTo")}
            </p>
            <div className="flex flex-col gap-1.5 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="editScope"
                  checked={editScope === "one"}
                  onChange={() => setEditScope("one")}
                />
                {t("activityForm.recurrence.scopeOne")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="editScope"
                  checked={editScope === "future"}
                  onChange={() => setEditScope("future")}
                />
                {t("activityForm.recurrence.scopeFuture")}
              </label>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          {conflicts.length > 0 ? (
            <button
              className="btn-danger"
              onClick={() => submit(true)}
              disabled={mutation.isPending}
            >
              {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
              {t(isEdit ? "activityForm.saveAnyway" : "activityForm.scheduleAnyway")}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => submit(false)}
              disabled={mutation.isPending}
            >
              {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
              {t(isEdit ? "activityForm.saveChanges" : "activityForm.schedule")}
            </button>
          )}
        </div>
      </div>
      )}
    </Modal>
  );
}

// Team and type are structural and can't change once an activity exists, so in
// edit mode we show a clean read-only field instead of a greyed-out dropdown.
function LockedField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
      <Lock size={14} className="shrink-0 text-slate-400" />
      <span className="truncate">{value}</span>
    </div>
  );
}
