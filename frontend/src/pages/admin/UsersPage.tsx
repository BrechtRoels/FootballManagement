import { useState } from "react";
import {
  KeyRound,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserCog,
  UserMinus,
  UserCheck,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createUser,
  deleteUser,
  errorMessage,
  listTeams,
  listUsers,
  resetUserPassword,
  updateUser,
} from "../../lib/api";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Loading,
  Modal,
  PageHeader,
} from "../../components/ui";
import type { User, UserRole } from "../../lib/types";

const roleColor: Record<UserRole, "ink" | "brand" | "steel"> = {
  admin: "ink",
  trainer: "brand",
  player: "steel",
};

export default function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users", roleFilter, search],
    queryFn: () =>
      listUsers({
        role: roleFilter || undefined,
        search: search || undefined,
      }),
  });

  const toggleActive = useMutation({
    mutationFn: (u: User) => updateUser(u.id, { is_active: !u.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const resetPw = useMutation({
    mutationFn: (u: User) => resetUserPassword(u.id),
    onSuccess: (res) =>
      setCredential({ email: res.user.email, password: res.temporary_password! }),
  });
  const removeUser = useMutation({
    mutationFn: (u: User) => deleteUser(u.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div>
      <PageHeader
        title={t("people.title")}
        subtitle={t("people.subtitle")}
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> {t("people.newAccount")}
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder={t("people.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select max-w-[10rem]"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | "")}
        >
          <option value="">{t("people.allRoles")}</option>
          <option value="admin">{t("roles.adminPlural")}</option>
          <option value="trainer">{t("roles.trainerPlural")}</option>
          <option value="player">{t("roles.playerPlural")}</option>
        </select>
      </div>

      {isLoading ? (
        <Loading />
      ) : users.length === 0 ? (
        <EmptyState
          icon={<UserCog size={32} />}
          title={t("people.emptyTitle")}
          description={t("people.emptyDesc")}
          action={
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={16} /> {t("people.newAccount")}
            </button>
          }
        />
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={u.full_name} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {u.full_name}
                      {!u.is_active && (
                        <span className="ml-2 text-xs font-normal text-red-500">
                          {t("people.deactivated")}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={roleColor[u.role]}>
                    {t(`roles.${u.role}`)}
                  </Badge>
                  <button
                    title={t("people.resetPassword")}
                    onClick={() => resetPw.mutate(u)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <KeyRound size={16} />
                  </button>
                  <button
                    title={
                      u.is_active
                        ? t("people.deactivate")
                        : t("people.reactivate")
                    }
                    onClick={() => toggleActive.mutate(u)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    {u.is_active ? (
                      <UserMinus size={16} />
                    ) : (
                      <UserCheck size={16} />
                    )}
                  </button>
                  {u.role !== "admin" && (
                    <button
                      title={t("people.delete")}
                      onClick={() => {
                        if (
                          confirm(
                            t("people.confirmDelete", { name: u.full_name }),
                          )
                        )
                          removeUser.mutate(u);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(email, password) => {
          qc.invalidateQueries({ queryKey: ["users"] });
          qc.invalidateQueries({ queryKey: ["teams"] });
          if (password) setCredential({ email, password });
        }}
      />

      <Modal
        open={!!credential}
        onClose={() => setCredential(null)}
        title={t("people.tempPasswordTitle")}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-4">
            <KeyRound size={20} className="mt-0.5 text-brand-600" />
            <div className="text-sm text-slate-700">
              <p className="font-semibold">{t("people.shareSecurely")}</p>
              <p className="mt-1">
                {t("common.email")}: <strong>{credential?.email}</strong>
              </p>
              <p>
                {t("people.password")}:{" "}
                <strong className="font-mono">{credential?.password}</strong>
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {t("people.shownOnceShort")}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setCredential(null)}>
              {t("common.done")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (email: string, password: string | null) => void;
}) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("player");
  const [teamId, setTeamId] = useState("");
  const [shirt, setShirt] = useState("");
  const [position, setPosition] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
    enabled: open,
  });

  function reset() {
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("player");
    setTeamId("");
    setShirt("");
    setPosition("");
  }

  const mutation = useMutation({
    mutationFn: () =>
      createUser({
        email,
        full_name: fullName,
        role,
        phone: phone || null,
        // Players must be assigned to a team; trainers may optionally be.
        team_id: role === "admin" ? null : teamId || null,
        shirt_number: role === "player" && shirt ? Number(shirt) : null,
        position: role === "player" ? position || null : null,
      }),
    onSuccess: (res) => {
      onCreated(res.user.email, res.temporary_password);
      reset();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const needsTeam = role === "player" && !teamId;

  return (
    <Modal open={open} onClose={onClose} title={t("people.createTitle")}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{t("people.createHint")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{t("common.fullName")}</label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("people.fullNamePlaceholder")}
              autoFocus
            />
          </div>
          <div>
            <label className="label">{t("common.email")}</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("people.emailPlaceholder")}
            />
          </div>
          <div>
            <label className="label">{t("people.phoneOptional")}</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+32…"
            />
          </div>
          <div>
            <label className="label">{t("common.role")}</label>
            <select
              className="select"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="player">{t("roles.player")}</option>
              <option value="trainer">{t("roles.trainer")}</option>
              <option value="admin">{t("people.administrator")}</option>
            </select>
          </div>
        </div>

        {/* Team assignment — required for players, optional for trainers. */}
        {role !== "admin" && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className={role === "player" ? "" : "sm:col-span-3"}>
                <label className="label">
                  {t("people.teamRequired")}{" "}
                  {role === "player" ? (
                    <span className="text-red-500">*</span>
                  ) : (
                    <span className="font-normal text-slate-400">(optional)</span>
                  )}
                </label>
                <select
                  className="select"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  <option value="">
                    {role === "player"
                      ? t("people.teamSelect")
                      : t("people.teamNone")}
                  </option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
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
                      placeholder="Middenvelder"
                    />
                  </div>
                </>
              )}
            </div>
            {role === "player" && (
              <p className="mt-2 text-xs text-slate-500">
                {t("people.playerNeedsTeam")}
              </p>
            )}
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
          <button
            className="btn-primary"
            onClick={() => mutation.mutate()}
            disabled={!fullName || !email || needsTeam || mutation.isPending}
          >
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            {t("people.createAccount")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
