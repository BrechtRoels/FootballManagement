import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  disablePush,
  enablePush,
  getActivePushSubscription,
  isPushSupported,
  pushPermission,
} from "../pwa/push";

/** A compact enable/disable control for browser push notifications. Hidden when
 *  the browser doesn't support push at all. */
export function PushToggle() {
  const { t } = useTranslation();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    setBlocked(pushPermission() === "denied");
    getActivePushSubscription().then((s) => setSubscribed(!!s));
  }, []);

  if (!isPushSupported()) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
      } else {
        const result = await enablePush();
        if (result === "enabled") setSubscribed(true);
        else if (result === "denied") setBlocked(true);
      }
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <p className="px-4 py-2 text-[11px] text-slate-400">
        {t("notifications.pushBlocked")}
      </p>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : subscribed ? (
        <BellOff size={14} />
      ) : (
        <Bell size={14} />
      )}
      {subscribed
        ? t("notifications.disablePush")
        : t("notifications.enablePush")}
    </button>
  );
}
