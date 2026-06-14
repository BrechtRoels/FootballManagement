import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CalendarPlus,
  DoorOpen,
  KeyRound,
  Layers,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  ClipboardList,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import {
  addFeeder,
  addMember,
  createUser,
  errorMessage,
  getTeam,
  listActivities,
  listResources,
  listTeams,
  listUsers,
  removeFeeder,
  removeMember,
  setTeamDressingRooms,
} from "../lib/api";
import { TeamPerformanceTable } from "../components/TeamPerformanceTable";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Loading,
  Modal,
  PageHeader,
} from "../components/ui";
import { ActivityCard } from "../components/ActivityCard";
import { ActivityFormModal } from "../components/ActivityFormModal";
import type {
  Membership,
  MembershipRole,
  TeamDetail,
  UserRole,
} from "../lib/types";

export default function TeamDetailPage() {
  const { teamId = "" } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const isAdmin = user?.role === "admin";

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => getTeam(teamId),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities", teamId],
    queryFn: () => listActivities({ team_id: teamId }),
    // Admins manage rosters, not the calendar — don't load activities for them.
    enabled: !isAdmin,
  });

  const removeMut = useMutation({
    mutationFn: (membershipId: string) => removeMember(teamId, membershipId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", teamId] }),
  });

  const { trainers, players } = useMemo(() => {
    const m = team?.memberships || [];
    return {
      trainers: m.filter((x) => x.role === "trainer"),
      players: m
        .filter((x) => x.role === "player")
        .sort((a, b) => (a.shirt_number || 99) - (b.shirt_number || 99)),
    };
  }, [team]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return activities
      .filter((a) => new Date(a.start_time).getTime() >= now - 2 * 3600 * 1000)
      .slice(0, 6);
  }, [activities]);

  if (isLoading) return <Loading />;
  if (!team)
    return (
      <EmptyState
        title={t("teamDetail.notFound")}
        description={t("teamDetail.notFoundDesc")}
      />
    );

  // Trainers schedule activities; admins manage people, not the calendar.
  const canSchedule = user?.role === "trainer";
  // Trainers/admins can review per-player performance (players cannot).
  const canViewPerf = user?.role === "trainer" || user?.role === "admin";

  return (
    <div>
      <Link
        to="/teams"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={15} /> {t("nav.teams")}
      </Link>
      <PageHeader
        title={team.name}
        subtitle={[
          team.category,
          team.season && t("teams.seasonBadge", { season: team.season }),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex gap-2">
            {canSchedule && (
              <button
                className="btn-secondary"
                onClick={() => setScheduleOpen(true)}
              >
                <CalendarPlus size={16} /> {t("teamDetail.schedule")}
              </button>
            )}
            {isAdmin && (
              <button className="btn-primary" onClick={() => setAddOpen(true)}>
                <UserPlus size={16} /> {t("teamDetail.addMember")}
              </button>
            )}
          </div>
        }
      />

      <div
        className={
          isAdmin ? "" : "grid grid-cols-1 gap-6 lg:grid-cols-3"
        }
      >
        <div className={isAdmin ? "space-y-6" : "lg:col-span-2 space-y-6"}>
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              <ClipboardList size={15} /> {t("teamDetail.staff")}
            </h2>
            {trainers.length === 0 ? (
              <p className="text-sm text-slate-400">{t("teamDetail.noTrainers")}</p>
            ) : (
              <div className="space-y-2">
                {trainers.map((m) => (
                  <MemberRow
                    key={m.id}
                    m={m}
                    isAdmin={isAdmin}
                    onRemove={() => removeMut.mutate(m.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              {t("teamDetail.playersCount", { count: players.length })}
            </h2>
            {players.length === 0 ? (
              <p className="text-sm text-slate-400">{t("teamDetail.noPlayers")}</p>
            ) : (
              <div className="space-y-2">
                {players.map((m) => (
                  <MemberRow
                    key={m.id}
                    m={m}
                    isAdmin={isAdmin}
                    onRemove={() => removeMut.mutate(m.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {canViewPerf && <TeamPerformanceSection teamId={teamId} />}
          {isAdmin && <DressingRoomSection team={team} />}
          {isAdmin && <FeederSection team={team} />}
        </div>

        {!isAdmin && (
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              {t("teamDetail.upcoming")}
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-400">{t("teamDetail.nothingScheduled")}</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((a) => (
                  <ActivityCard key={a.id} activity={a} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <AddMemberModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          teamId={teamId}
          existingUserIds={(team.memberships || []).map((m) => m.user.id)}
        />
      )}
      <ActivityFormModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        defaultTeamId={teamId}
      />
    </div>
  );
}

function MemberRow({
  m,
  isAdmin,
  onRemove,
}: {
  m: Membership;
  isAdmin: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 items-center gap-3">
        {m.shirt_number != null ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            {m.shirt_number}
          </div>
        ) : (
          <Avatar name={m.user.full_name} />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">
            {m.user.full_name}
          </p>
          <p className="truncate text-xs text-slate-500">{m.user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {m.position && <Badge color="slate">{m.position}</Badge>}
        {isAdmin && (
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title={t("teamDetail.removeFromTeam")}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </Card>
  );
}

function TeamPerformanceSection({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        <BarChart3 size={15} /> {t("performance.teamSummary")}
      </h2>
      <p className="mb-2 text-xs text-slate-400">{t("performance.teamSummaryDesc")}</p>
      <TeamPerformanceTable teamId={teamId} />
    </section>
  );
}

function DressingRoomSection({ team }: { team: TeamDetail }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: resources = [] } = useQuery({
    queryKey: ["resources"],
    queryFn: listResources,
  });
  const rooms = resources.filter((r) => r.type === "dressing_room");
  const assignedIds = new Set(team.dressing_rooms.map((r) => r.id));

  const saveMut = useMutation({
    mutationFn: (ids: string[]) => setTeamDressingRooms(team.id, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", team.id] }),
  });

  function toggle(id: string) {
    const current = team.dressing_rooms.map((r) => r.id);
    const next = assignedIds.has(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    saveMut.mutate(next);
  }

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        <DoorOpen size={15} /> {t("teamDetail.dressingRoomsTitle")}
      </h2>
      <p className="mb-2 text-xs text-slate-400">
        {t("teamDetail.dressingRoomsDesc")}
      </p>
      {rooms.length === 0 ? (
        <p className="text-sm text-slate-400">
          {t("teamDetail.dressingRoomsNone")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rooms.map((r) => {
            const active = assignedIds.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                disabled={saveMut.isPending}
                onClick={() => toggle(r.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FeederSection({ team }: { team: TeamDetail }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [adding, setAdding] = useState("");
  const { data: allTeams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });

  const feederIds = new Set(team.feeders.map((f) => f.id));
  const options = allTeams.filter(
    (tm) => tm.id !== team.id && !feederIds.has(tm.id),
  );

  const addMut = useMutation({
    mutationFn: (fid: string) => addFeeder(team.id, fid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", team.id] });
      setAdding("");
    },
  });
  const removeMut = useMutation({
    mutationFn: (fid: string) => removeFeeder(team.id, fid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", team.id] }),
  });

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        <Layers size={15} /> {t("teamDetail.feedersTitle")}
      </h2>
      <p className="mb-2 text-xs text-slate-400">
        {t("teamDetail.feedersDesc", { team: team.name })}
      </p>
      {team.feeders.length === 0 ? (
        <p className="mb-2 text-sm text-slate-400">{t("teamDetail.feedersEmpty")}</p>
      ) : (
        <div className="mb-2 space-y-2">
          {team.feeders.map((f) => (
            <Card
              key={f.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="flex items-center gap-2">
                <Badge color="steel">{f.name}</Badge>
                {f.category && (
                  <span className="text-xs text-slate-400">{f.category}</span>
                )}
              </div>
              <button
                onClick={() => removeMut.mutate(f.id)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title={t("teamDetail.removeFeeder")}
              >
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <div className="flex gap-2">
          <select
            className="select max-w-xs"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">{t("teamDetail.feederAdd")}</option>
            {options.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
          <button
            className="btn-secondary"
            disabled={!adding || addMut.isPending}
            onClick={() => addMut.mutate(adding)}
          >
            {addMut.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {t("teamDetail.feederLink")}
          </button>
        </div>
      )}
    </section>
  );
}

function AddMemberModal({
  open,
  onClose,
  teamId,
  existingUserIds,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  existingUserIds: string[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [role, setRole] = useState<MembershipRole>("player");
  const [shirt, setShirt] = useState("");
  const [position, setPosition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // existing mode
  const [selectedUser, setSelectedUser] = useState("");
  const [search, setSearch] = useState("");
  // new mode
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => listUsers(),
    enabled: open,
  });

  const candidates = users.filter(
    (u) =>
      !existingUserIds.includes(u.id) &&
      u.role !== "admin" &&
      (u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())),
  );

  function reset() {
    setMode("existing");
    setRole("player");
    setShirt("");
    setPosition("");
    setError(null);
    setTempPassword(null);
    setSelectedUser("");
    setSearch("");
    setFullName("");
    setEmail("");
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "new") {
        // Create the account and assign it to this team atomically.
        const created = await createUser({
          email,
          full_name: fullName,
          role: role as UserRole,
          team_id: teamId,
          shirt_number: shirt ? Number(shirt) : null,
          position: position || null,
        });
        return created.temporary_password;
      }
      if (!selectedUser) throw new Error("Please select a user");
      await addMember(teamId, {
        user_id: selectedUser,
        role,
        shirt_number: shirt ? Number(shirt) : null,
        position: position || null,
      });
      return null;
    },
    onSuccess: (tempPw) => {
      qc.invalidateQueries({ queryKey: ["team", teamId] });
      qc.invalidateQueries({ queryKey: ["users"] });
      if (tempPw) {
        setTempPassword(tempPw);
      } else {
        handleClose();
      }
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  if (tempPassword) {
    return (
      <Modal open={open} onClose={handleClose} title={t("addMember.createdTitle")}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-4">
            <KeyRound size={20} className="mt-0.5 text-brand-600" />
            <div className="text-sm text-slate-700">
              <p className="font-semibold">{t("addMember.shareSecurely")}</p>
              <p className="mt-1">{t("common.email")}: <strong>{email}</strong></p>
              <p>
                {t("addMember.tempPassword")}:{" "}
                <strong className="font-mono">{tempPassword}</strong>
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {t("addMember.shownOnce")}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={handleClose}>
              {t("common.done")}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title={t("addMember.title")}>
      <div className="space-y-4">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
          {(["existing", "new"] as const).map((mo) => (
            <button
              key={mo}
              onClick={() => setMode(mo)}
              className={`px-3 py-2 text-sm font-medium ${
                mode === mo
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {mo === "existing" ? t("addMember.existing") : t("addMember.new")}
            </button>
          ))}
        </div>

        {mode === "existing" ? (
          <div className="space-y-2">
            <input
              className="input"
              placeholder={t("addMember.searchPeople")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
              {candidates.length === 0 ? (
                <p className="px-2 py-3 text-center text-sm text-slate-400">
                  {t("addMember.noPeople")}
                </p>
              ) : (
                candidates.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(u.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                      selectedUser === u.id
                        ? "bg-brand-50 ring-1 ring-brand-400"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <Avatar name={u.full_name} size={28} />
                    <span className="flex-1">
                      <span className="font-medium text-slate-800">
                        {u.full_name}
                      </span>
                      <span className="ml-2 text-xs text-slate-400">
                        {u.email}
                      </span>
                    </span>
                    <Badge color={u.role === "trainer" ? "brand" : "steel"}>
                      {t(`roles.${u.role}`)}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{t("common.fullName")}</label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("addMember.fullNamePlaceholder")}
              />
            </div>
            <div>
              <label className="label">{t("common.email")}</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("addMember.emailPlaceholder")}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">{t("addMember.roleInTeam")}</label>
            <select
              className="select"
              value={role}
              onChange={(e) => setRole(e.target.value as MembershipRole)}
            >
              <option value="player">{t("roles.player")}</option>
              <option value="trainer">{t("roles.trainer")}</option>
            </select>
          </div>
          {role === "player" && (
            <>
              <div>
                <label className="label">{t("common.shirtNumber")}</label>
                <input
                  type="number"
                  className="input"
                  value={shirt}
                  onChange={(e) => setShirt(e.target.value)}
                  placeholder="10"
                />
              </div>
              <div>
                <label className="label">{t("common.position")}</label>
                <input
                  className="input"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="MF"
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={handleClose}>
            {t("common.cancel")}
          </button>
          <button
            className="btn-primary"
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              (mode === "existing" && !selectedUser) ||
              (mode === "new" && (!fullName || !email))
            }
          >
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            {t("addMember.addToTeam")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
