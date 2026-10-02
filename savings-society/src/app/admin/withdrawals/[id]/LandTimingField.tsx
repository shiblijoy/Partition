"use client";

import { useState } from "react";

const seg = (on: boolean) =>
  `flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 text-sm ${on ? "bg-white font-bold text-ink shadow-sm" : "font-semibold text-muted"}`;

export function LandTimingField({ estimate }: { estimate: string }) {
  const [timing, setTiming] = useState<"ON_SALE" | "NOW">("ON_SALE");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[13px] font-semibold text-muted">Land share ({estimate} estimate) is paid</legend>
      <div className="flex gap-1 rounded-xl bg-line p-1">
        <label className={seg(timing === "ON_SALE")}>
          <input type="radio" name="landTiming" value="ON_SALE" checked={timing === "ON_SALE"} onChange={() => setTiming("ON_SALE")} className="sr-only" />
          When land is sold
        </label>
        <label className={seg(timing === "NOW")}>
          <input type="radio" name="landTiming" value="NOW" checked={timing === "NOW"} onChange={() => setTiming("NOW")} className="sr-only" />
          Now, at estimate
        </label>
      </div>
    </fieldset>
  );
}
