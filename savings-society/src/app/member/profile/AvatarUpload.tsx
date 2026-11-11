"use client";

import { useRef, useState, useTransition } from "react";
import { compressImage } from "@/lib/client/compress";
import { useT } from "@/components/I18n";
import { removeAvatar, uploadAvatar } from "./actions";

/** Change or remove the profile picture. Photos are shrunk on the phone first (max 512px). */
export function AvatarUpload({ hasPhoto }: { hasPhoto: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-3 text-[13px] font-bold">
        <button type="button" disabled={pending} onClick={() => input.current?.click()} className="text-brand">
          {pending ? t("Saving…") : hasPhoto ? t("Change photo") : t("Add a profile photo")}
        </button>
        {hasPhoto && !pending && (
          <button type="button" onClick={() => start(async () => setError((await removeAvatar()).error ?? null))} className="text-muted">
            {t("Remove")}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={t("Profile photo")}
        onChange={async (e) => {
          const original = e.target.files?.[0];
          e.target.value = "";
          if (!original) return;
          const file = await compressImage(original, 200_000, 512);
          const data = new FormData();
          data.set("photo", file);
          start(async () => setError((await uploadAvatar(data)).error ?? null));
        }}
      />
      {error && <p className="text-xs font-semibold text-bad">{t(error)}</p>}
    </div>
  );
}
