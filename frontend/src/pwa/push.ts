import {
  deletePushSubscription,
  getVapidPublicKey,
  savePushSubscription,
} from "../lib/api";

/** Whether this browser can do Web Push at all. */
export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Current Notification permission ("default" | "granted" | "denied"). */
export function pushPermission(): NotificationPermission | "unsupported" {
  return isPushSupported() ? Notification.permission : "unsupported";
}

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

/** The active push subscription for this browser, if any. */
export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export type EnableResult = "enabled" | "denied" | "unsupported";

/** Request permission, subscribe, and register the subscription server-side. */
export async function enablePush(): Promise<EnableResult> {
  if (!isPushSupported()) return "unsupported";

  const key = await getVapidPublicKey();
  if (!key) return "unsupported"; // backend has no VAPID configured

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(key),
    });
  }
  await savePushSubscription(sub.toJSON());
  return "enabled";
}

/** Unsubscribe locally and remove the subscription server-side. */
export async function disablePush(): Promise<void> {
  const sub = await getActivePushSubscription();
  if (!sub) return;
  try {
    await deletePushSubscription(sub.endpoint);
  } catch {
    /* server-side cleanup is best-effort */
  }
  await sub.unsubscribe();
}
