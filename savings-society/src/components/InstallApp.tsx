"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "@/components/I18n";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Platform = "installed" | "ios" | "other";

const DISMISSED = "dreamhive-install-dismissed";

function platform(): Platform {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "other";
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

const noSubscribe = () => () => {};

/**
 * "Get the app" card on the member home page. On Android Chrome it installs the
 * app with one tap (the browser's install prompt); on iPhone it explains Add to
 * Home Screen. Hidden once the app is installed or the card is dismissed.
 */
export function InstallApp() {
  const t = useT();
  // Read on the client only; the server renders nothing.
  const where = useSyncExternalStore<Platform | null>(noSubscribe, platform, () => null);
  const hidden = useSyncExternalStore(noSubscribe, wasDismissed, () => true);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [closed, setClosed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our own button
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!where || where === "installed" || hidden || closed || installed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      /* private mode: hide for this visit only */
    }
    setClosed(true);
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-[15px] font-bold">{t("Get the Dreamhive app")}</p>
          <p className="text-[13px] leading-relaxed text-muted">
            {where === "ios"
              ? t("In Safari, tap Share, then Add to Home Screen. Dreamhive then opens like an app.")
              : prompt
                ? t("Install it on this phone: it opens full screen from its own icon and gets notifications.")
                : t("In Chrome, tap the ⋮ menu, then Install app (or Add to Home screen).")}
          </p>
        </div>
        <button type="button" onClick={dismiss} aria-label={t("Close")} className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-muted">
          ×
        </button>
      </div>
      {prompt && where !== "ios" && (
        <button
          type="button"
          onClick={async () => {
            await prompt.prompt();
            const { outcome } = await prompt.userChoice;
            if (outcome === "accepted") setInstalled(true);
            setPrompt(null);
          }}
          className="h-11 rounded-xl bg-brand text-sm font-bold text-white"
        >
          {t("Install app")}
        </button>
      )}
    </div>
  );
}
