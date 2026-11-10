"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";
import { savePushSubscription } from "@/app/member/notifications/actions";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Turns on push notifications for this phone (FR-NTF-02). */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const t = useT();
  const [state, setState] = useState<"unknown" | "on" | "off" | "blocked" | "unsupported">("unknown");

  useEffect(() => {
    let live = true;
    const check = async (): Promise<typeof state> => {
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
      if (Notification.permission === "denied") return "blocked";
      try {
        const reg = await navigator.serviceWorker.ready;
        return (await reg.pushManager.getSubscription()) ? "on" : "off";
      } catch {
        return "off";
      }
    };
    check().then((s) => live && setState(s));
    return () => { live = false; };
  }, [publicKey]);

  if (state === "unsupported" || state === "unknown") return null;
  if (state === "on") return <p className="rounded-xl bg-good-bg px-4 py-3 text-[13px] font-semibold text-good">{t("Notifications are on for this phone.")}</p>;
  if (state === "blocked") return <p className="rounded-xl bg-paper px-4 py-3 text-[13px] text-muted">{t("Notifications are blocked in this phone's settings.")}</p>;
  return (
    <button
      type="button"
      onClick={async () => {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) as BufferSource });
        await savePushSubscription(JSON.parse(JSON.stringify(sub)));
        setState("on");
      }}
      className="h-12 rounded-xl border-2 border-brand bg-white text-sm font-bold text-brand"
    >
      {t("Turn on notifications for this phone")}
    </button>
  );
}
