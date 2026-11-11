/* Dreamhive service worker: push notifications, offline pages, and sending payments saved offline. */
const CACHE = "dreamhive-v2";
const OFFLINE_PAGES = ["/member", "/member/history", "/member/invest", "/member/notifications"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(OFFLINE_PAGES.map((u) => c.add(u)))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// §2.4: show the last copy of member pages when offline. Pages always try the network first.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (req.mode === "navigate" && url.pathname.startsWith("/member")) {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/member")))
    );
  }
});

// Notices and due reminders ring, vibrate and stay on screen until tapped; Android plays the phone's
// notification sound (members can pick another one in the app's notification settings).
const LOUD = ["notice", "reminder"];
self.addEventListener("push", (event) => {
  let data = { title: "Dreamhive", body: "Open the app for the details.", url: "/", kind: "" };
  try { data = { ...data, ...event.data.json() }; } catch {}
  const loud = LOUD.includes(data.kind);
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: data.kind || undefined, // a newer notice replaces the older one, and still rings
      renotify: !!data.kind,
      silent: false,
      vibrate: loud ? [400, 150, 400, 150, 400] : [200, 100, 200],
      requireInteraction: loud,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w) { w.navigate(url); return w.focus(); }
      return self.clients.openWindow(url);
    })
  );
});

// NFR-REL-04: background sync sends payments saved while offline (same store the page uses).
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dreamhive-offline", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("payments", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function sendSaved() {
  const db = await openDb();
  const items = await new Promise((r) => { const q = db.transaction("payments").objectStore("payments").getAll(); q.onsuccess = () => r(q.result); });
  for (const item of items) {
    const form = new FormData();
    for (const [k, v] of item.fields) form.append(k, v);
    if (item.file) form.append("proof", new File([item.file.data], item.file.name, { type: item.file.type }));
    form.set("offline", "1");
    const res = await fetch("/api/payments", { method: "POST", body: form, credentials: "same-origin" });
    if (res.status >= 500) throw new Error("retry later");
    await new Promise((r) => { const d = db.transaction("payments", "readwrite").objectStore("payments").delete(item.id); d.onsuccess = r; });
  }
}
self.addEventListener("sync", (event) => {
  if (event.tag === "send-payments") event.waitUntil(sendSaved());
});
