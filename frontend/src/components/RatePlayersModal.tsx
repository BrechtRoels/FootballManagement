import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  errorMessage,
  getActivityPerformance,
  getSquad,
  rateSquad,
  type RatingInput,
} from "../lib/api";
import { Avatar, Badge, Modal } from "../components/ui";
import { StarRating } from "../components/StarRating";

interface Draft {
  performance: number | null;
  mentality: number | null;
  note: string;
}

export function RatePlayersModal({
  open,
  onClose,
  activityId,
}: {
  open: boolean;
  onClose: () => void;
  activityId: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  const squadQ = useQuery({
    queryKey: ["squad", activityId],
    queryFn: () => getSquad(activityId),
    enabled: open,
  });
  const perfQ = useQuery({
    queryKey: ["performance", activityId],
    queryFn: () => getActivityPerformance(activityId),
    enabled: open,
  });

  const squad = squadQ.data ?? [];

  // Build the editable draft once, when both queries have settled for this open.
  useEffect(() => {
    if (!open) {
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    if (!squadQ.isSuccess || !perfQ.isSuccess) return;
    const byUser = new Map((perfQ.data ?? []).map((e) => [e.user.id, e]));
    const next: Record<string, Draft> = {};
    for (const s of squad) {
      const e = byUser.get(s.user.id);
      next[s.user.id] = {
        performance: e?.performance_rating ?? null,
        mentality: e?.mentality_rating ?? null,
        note: e?.note ?? "",
      };
    }
    setDraft(next);
    initRef.current = true;
  }, [open, squadQ.isSuccess, perfQ.isSuccess, squadQ.data, perfQ.data, squad]);

  function set(userId: string, patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, [userId]: { ...d[userId], ...patch } }));
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const prevByUser = new Map(
        (perfQ.data ?? []).map((e) => [e.user.id, e]),
      );
      const ratings: RatingInput[] = [];
      for (const s of squad) {
        const d = draft[s.user.id];
        if (!d) continue;
        const prev = prevByUser.get(s.user.id);
        const hadData = !!prev && (prev.rated || (prev.note ?? "") !== "");
        const hasData =
          d.performance != null || d.mentality != null || d.note.trim() !== "";
        // Skip never-rated players left untouched; otherwise send (incl. clears).
        if (!hasData && !hadData) continue;
        ratings.push({
          user_id: s.user.id,
          performance_rating: d.performance,
          mentality_rating: d.mentality,
          note: d.note.trim() || null,
        });
      }
      return rateSquad(activityId, ratings);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance"] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const loading = squadQ.isLoading || perfQ.isLoading;

  return (
    <Modal open={open} onClose={onClose} title={t("performance.ratePlayers")} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{t("performance.rateIntro")}</p>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-slate-400" />
          </div>
        ) : squad.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {t("performance.noPlayers")}
          </p>
        ) : (
          <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {squad.map((s) => {
              const d = draft[s.user.id] ?? {
                performance: null,
                mentality: null,
                note: "",
              };
              return (
                <div key={s.user.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    {s.shirt_number != null ? (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        {s.shirt_number}
                      </div>
                    ) : (
                      <Avatar name={s.user.full_name} size={28} />
                    )}
                    <span className="text-sm font-medium text-slate-900">
                      {s.user.full_name}
                    </span>
                    {s.is_callup && (
                      <Badge color="steel" className="!px-1.5 !py-0">
                        {s.team_name}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-9">
                    <label className="flex items-center gap-2">
                      <span className="w-24 text-xs text-slate-500">
                        {t("performance.performanceRating")}
                      </span>
                      <StarRating
                        value={d.performance}
                        size={18}
                        onChange={(v) => set(s.user.id, { performance: v })}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="w-24 text-xs text-slate-500">
                        {t("performance.mentalityRating")}
                      </span>
                      <StarRating
                        value={d.mentality}
                        size={18}
                        onChange={(v) => set(s.user.id, { mentality: v })}
                      />
                    </label>
                  </div>
                  <input
                    className="input ml-9 w-[calc(100%-2.25rem)] !py-1 text-sm"
                    placeholder={t("performance.notePlaceholder")}
                    value={d.note}
                    onChange={(e) => set(s.user.id, { note: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="btn-primary"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || loading}
          >
            {saveMut.isPending && <Loader2 size={16} className="animate-spin" />}
            {t("performance.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
