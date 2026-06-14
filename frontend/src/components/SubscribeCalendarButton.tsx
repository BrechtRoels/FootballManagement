import { useState } from "react";
import {
  CalendarCheck,
  Check,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  calendarFeedUrl,
  getCalendarSubscription,
  resetCalendarSubscription,
} from "../lib/api";
import { Modal, Spinner } from "./ui";

export function SubscribeCalendarButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <CalendarCheck size={16} /> {t("subscribe.button")}
      </button>
      <SubscribeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SubscribeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["calendar-subscription"],
    queryFn: getCalendarSubscription,
    enabled: open,
  });
  const resetMut = useMutation({
    mutationFn: resetCalendarSubscription,
    onSuccess: (d) => qc.setQueryData(["calendar-subscription"], d),
  });

  const url = data ? calendarFeedUrl(data.path) : "";
  const webcal = url.replace(/^https?:/, "webcal:");
  const googleUrl = url
    ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`
    : "";

  function copy() {
    if (!url) return;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal open={open} onClose={onClose} title={t("subscribe.title")}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t("subscribe.intro")}</p>

        {isLoading || !data ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="input font-mono text-xs"
              />
              <button className="btn-secondary shrink-0" onClick={copy}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? t("subscribe.copied") : t("subscribe.copy")}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <a className="btn-primary" href={webcal}>
                {t("subscribe.apple")}
              </a>
              <a
                className="btn-secondary"
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("subscribe.google")}
              </a>
            </div>

            <p className="text-xs text-slate-400">{t("subscribe.autoUpdate")}</p>

            <div className="border-t border-slate-100 pt-3">
              <button
                onClick={() => {
                  if (confirm(t("subscribe.resetConfirm"))) resetMut.mutate();
                }}
                disabled={resetMut.isPending}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                {resetMut.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                {t("subscribe.reset")}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
