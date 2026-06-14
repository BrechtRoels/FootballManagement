/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> };

// Precache the built app shell (manifest injected at build time).
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback: serve index.html for client-side routes, but never for API
// calls or the worker itself.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /\/sw\.js$/, /^\/manifest\.webmanifest$/],
  }),
);

// Apply updates immediately (registerType: autoUpdate).
self.skipWaiting();
self.addEventListener("activate", () => {
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Phase 2 — Web Push. Handlers are in place; they only fire once the backend
// sends pushes to a subscription (see frontend/src/pwa/push.ts when wired up).
// ---------------------------------------------------------------------------
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  let payload: PushPayload = {};
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "KSV Jabbeke", {
      body: payload.body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            void client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
