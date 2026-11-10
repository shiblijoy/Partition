"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/** FR-APR-02: the proof with zoom, rotate and download. */
export function ProofViewer({ url, pdf, alt }: { url: string | null; pdf: boolean; alt: string }) {
  const [zoom, setZoom] = useState(1);
  const [turn, setTurn] = useState(0);
  if (!url) return <div className="flex min-h-[420px] items-center justify-center rounded-xl bg-[#ECEAE2] text-sm text-muted">No proof attached (recorded by admin)</div>;
  const btn = "flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-bold hover:bg-paper";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-[420px] items-center justify-center overflow-auto rounded-xl bg-[#ECEAE2]">
        {pdf ? (
          <iframe src={url} title={alt} className="h-[600px] w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- private file behind auth, transformed with CSS
          <img
            src={url}
            alt={alt}
            style={{ transform: `rotate(${turn}deg) scale(${zoom})`, transition: "transform .15s" }}
            className="max-h-[720px] max-w-full origin-center object-contain"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {!pdf && (
          <>
            <button type="button" className={btn} onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} aria-label="Zoom out">−</button>
            <span className="w-12 text-center text-[13px] text-muted">{Math.round(zoom * 100)}%</span>
            <button type="button" className={btn} onClick={() => setZoom(Math.min(4, zoom + 0.25))} aria-label="Zoom in">+</button>
            <button type="button" className={btn} onClick={() => setTurn((turn + 90) % 360)}>Rotate</button>
            <button type="button" className={btn} onClick={() => { setZoom(1); setTurn(0); }}>Reset</button>
          </>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" className={`${btn} no-underline`}><Icon name="eye" size={18} /> Full size</a>
        <a href={url} download className={`${btn} no-underline`}><Icon name="download" size={18} /> Download</a>
      </div>
    </div>
  );
}
