import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { createTeam, errorMessage, listTeams } from "../lib/api";
import { Badge, Card, EmptyState, Loading, Modal, PageHeader } from "../components/ui";

export default function TeamsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });

  const isAdmin = user?.role === "admin";

  return (
    <div>
      <PageHeader
        title={t("teams.title")}
        subtitle={t(isAdmin ? "teams.subtitleAdmin" : "teams.subtitleMember")}
        actions={
          isAdmin && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus size={16} /> {t("teams.newTeam")}
            </button>
          )
        }
      />

      {isLoading ? (
        <Loading />
      ) : !teams || teams.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title={t("teams.emptyTitle")}
          description={t(isAdmin ? "teams.emptyAdmin" : "teams.emptyMember")}
          action={
            isAdmin && (
              <button className="btn-primary" onClick={() => setOpen(true)}>
                <Plus size={16} /> {t("teams.newTeam")}
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link key={team.id} to={`/teams/${team.id}`}>
              <Card className="h-full p-5 transition hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                    <Users size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {team.name}
                    </p>
                    {team.category && (
                      <p className="truncate text-xs text-slate-500">
                        {team.category}
                      </p>
                    )}
                  </div>
                </div>
                {team.season && (
                  <div className="mt-4">
                    <Badge color="slate">
                      {t("teams.seasonBadge", { season: team.season })}
                    </Badge>
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {isAdmin && (
        <CreateTeamModal
          open={open}
          onClose={() => setOpen(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ["teams"] })}
        />
      )}
    </div>
  );
}

function CreateTeamModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createTeam({
        name,
        season: season || null,
        category: category || null,
      }),
    onSuccess: () => {
      onCreated();
      setName("");
      setSeason("");
      setCategory("");
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal open={open} onClose={onClose} title={t("teams.createTitle")}>
      <div className="space-y-4">
        <div>
          <label className="label">{t("teams.teamName")}</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("teams.teamNamePlaceholder")}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t("common.season")}</label>
            <input
              className="input"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="2025/26"
            />
          </div>
          <div>
            <label className="label">{t("common.category")}</label>
            <input
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("teams.categoryPlaceholder")}
            />
          </div>
        </div>
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
            disabled={!name || mutation.isPending}
          >
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            {t("teams.createTeam")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
