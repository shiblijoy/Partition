"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/types";

const PAD = { l: 8, r: 64, t: 12, b: 22 };
const FUTURE = 14; // empty slots right of the last candle for the projection

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function path(values: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

function fmtTime(t: number, intraday: boolean) {
  const d = new Date(t * 1000);
  return intraday
    ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "numeric" });
}

export function PriceChart({ a }: { a: Analysis }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [show, setShow] = useState({ sma20: true, sma50: true, sma200: true, bb: true, levels: true, plan: true });

  const c = a.candles;
  const o = a.overlays;
  const v = a.verdict;
  const n = c.length;
  const H = 360, RH = 90, MH = 100, GAP = 10;
  const total = H + GAP + RH + GAP + MH;
  const slots = n + FUTURE;
  const cw = (width - PAD.l - PAD.r) / slots;
  const x = (i: number) => PAD.l + cw * (i + 0.5);

  const vals: number[] = [];
  c.forEach((k) => vals.push(k.high, k.low));
  if (show.bb) [...o.bbUpper, ...o.bbLower].forEach((z) => z != null && vals.push(z));
  if (show.plan) vals.push(v.stop, v.target);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const padV = (hi - lo) * 0.06;
  const yMin = lo - padV, yMax = hi + padV;
  const y = (p: number) => PAD.t + ((yMax - p) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const rTop = H + GAP;
  const yr = (r: number) => rTop + ((100 - r) / 100) * RH;
  const mTop = rTop + RH + GAP;
  const mVals = [...o.macd, ...o.macdSignal, ...o.macdHist].filter((z): z is number => z != null);
  const mAbs = Math.max(1e-9, ...mVals.map(Math.abs));
  const ym = (m: number) => mTop + MH / 2 - (m / mAbs) * (MH / 2 - 6);

  const ticks = Array.from({ length: 6 }, (_, i) => yMin + ((yMax - yMin) * i) / 5);
  const intraday = a.market.interval === "15m" || a.market.interval === "1h";
  const dec = a.lastPrice < 2 ? 4 : 2;
  const bbArea =
    show.bb && o.bbUpper.some((z) => z != null)
      ? (() => {
          const idx = o.bbUpper.map((z, i) => (z != null ? i : -1)).filter((i) => i >= 0);
          const top = idx.map((i) => `${x(i)},${y(o.bbUpper[i]!)}`);
          const bot = idx.reverse().map((i) => `${x(i)},${y(o.bbLower[i]!)}`);
          return `M${top.join("L")}L${bot.join("L")}Z`;
        })()
      : "";

  const lastX = x(n - 1);
  const endX = x(n - 1 + Math.min(FUTURE - 1, a.horizonBars * 2));
  const hc = hover != null ? c[hover] : null;
  const toggles: [keyof typeof show, string, string][] = [
    ["sma20", "SMA 20", "var(--sma20)"],
    ["sma50", "SMA 50", "var(--sma50)"],
    ["sma200", "SMA 200", "var(--sma200)"],
    ["bb", "Bollinger", "var(--muted)"],
    ["levels", "Support / resistance", "var(--accent)"],
    ["plan", "Trade plan", "var(--up)"],
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {toggles.map(([k, label, color]) => (
          <button
            key={k}
            onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${show[k] ? "border-line bg-panel-2 text-ink" : "border-transparent text-muted line-through"}`}
          >
            <span className="inline-block h-0.5 w-3" style={{ background: color }} />
            {label}
          </button>
        ))}
      </div>
      <div ref={ref} className="relative w-full select-none">
        <svg
          width={width}
          height={total}
          className="block"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round((e.clientX - r.left - PAD.l) / cw - 0.5);
            setHover(i >= 0 && i < n ? i : null);
          }}
        >
          {/* grid + price axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={width - PAD.r + 6} y={y(t) + 4} fontSize="10" fill="var(--muted)">{t.toFixed(dec)}</text>
            </g>
          ))}
          {[0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].map((i) => (
            <text key={i} x={x(i)} y={H - 6} fontSize="10" fill="var(--muted)" textAnchor="middle">{fmtTime(c[i].time, intraday)}</text>
          ))}

          {bbArea && <path d={bbArea} fill="var(--muted)" opacity="0.08" />}
          {show.bb && <path d={path(o.bbUpper, x, y)} stroke="var(--muted)" strokeWidth="1" fill="none" strokeDasharray="2 3" opacity="0.6" />}
          {show.bb && <path d={path(o.bbLower, x, y)} stroke="var(--muted)" strokeWidth="1" fill="none" strokeDasharray="2 3" opacity="0.6" />}

          {show.levels &&
            [...a.levels.support.map((p) => ["S", p] as const), ...a.levels.resistance.map((p) => ["R", p] as const)].map(([kind, p]) =>
              p > yMin && p < yMax ? (
                <g key={kind + p}>
                  <line x1={PAD.l} x2={lastX} y1={y(p)} y2={y(p)} stroke="var(--accent)" strokeDasharray="6 4" opacity="0.55" />
                  <text x={PAD.l + 2} y={y(p) - 3} fontSize="10" fill="var(--accent)">{kind === "S" ? "Support" : "Resistance"} {p.toFixed(dec)}</text>
                </g>
              ) : null,
            )}

          {/* candles */}
          {c.map((k, i) => {
            const up = k.close >= k.open;
            const col = up ? "var(--up)" : "var(--down)";
            const bw = Math.max(1, cw * 0.7);
            return (
              <g key={k.time}>
                <line x1={x(i)} x2={x(i)} y1={y(k.high)} y2={y(k.low)} stroke={col} />
                <rect x={x(i) - bw / 2} width={bw} y={y(Math.max(k.open, k.close))} height={Math.max(1, Math.abs(y(k.open) - y(k.close)))} fill={col} />
              </g>
            );
          })}

          {show.sma20 && <path d={path(o.sma20, x, y)} stroke="var(--sma20)" strokeWidth="1.5" fill="none" />}
          {show.sma50 && <path d={path(o.sma50, x, y)} stroke="var(--sma50)" strokeWidth="1.5" fill="none" />}
          {show.sma200 && <path d={path(o.sma200, x, y)} stroke="var(--sma200)" strokeWidth="1.5" fill="none" />}

          {/* projection: probable range, target and stop */}
          {show.plan && (
            <g>
              {(() => {
                const s = a.scenarios;
                const upHi = s.find((z) => z.key === "up")!.priceTo;
                const dnLo = s.find((z) => z.key === "down")!.priceFrom;
                return <path d={`M${lastX},${y(a.lastPrice)}L${endX},${y(upHi)}L${endX},${y(dnLo)}Z`} fill="var(--accent)" opacity="0.1" />;
              })()}
              {v.action !== "HOLD" && (
                <>
                  <line x1={lastX} x2={endX} y1={y(v.target)} y2={y(v.target)} stroke="var(--up)" strokeWidth="1.5" />
                  <line x1={lastX} x2={endX} y1={y(v.stop)} y2={y(v.stop)} stroke="var(--down)" strokeWidth="1.5" />
                  <text x={endX} y={y(v.target) - 4} fontSize="10" fill="var(--up)" textAnchor="end">Target {v.target.toFixed(dec)}</text>
                  <text x={endX} y={y(v.stop) + 12} fontSize="10" fill="var(--down)" textAnchor="end">Stop {v.stop.toFixed(dec)}</text>
                </>
              )}
            </g>
          )}

          {/* last price tag */}
          <line x1={PAD.l} x2={width - PAD.r} y1={y(a.lastPrice)} y2={y(a.lastPrice)} stroke="var(--ink)" strokeDasharray="1 3" opacity="0.5" />
          <rect x={width - PAD.r + 2} y={y(a.lastPrice) - 8} width={PAD.r - 4} height={16} rx="3" fill="var(--ink)" />
          <text x={width - PAD.r + 6} y={y(a.lastPrice) + 4} fontSize="10" fontWeight="600" fill="var(--bg)">{a.lastPrice.toFixed(dec)}</text>

          {/* RSI */}
          <rect x={PAD.l} y={rTop} width={width - PAD.l - PAD.r} height={RH} fill="var(--panel-2)" opacity="0.5" />
          <rect x={PAD.l} y={yr(70)} width={width - PAD.l - PAD.r} height={yr(30) - yr(70)} fill="var(--accent)" opacity="0.06" />
          {[30, 50, 70].map((l) => (
            <g key={l}>
              <line x1={PAD.l} x2={width - PAD.r} y1={yr(l)} y2={yr(l)} stroke="var(--grid)" strokeDasharray={l === 50 ? "2 3" : undefined} />
              <text x={width - PAD.r + 6} y={yr(l) + 4} fontSize="10" fill="var(--muted)">{l}</text>
            </g>
          ))}
          <path d={path(o.rsi, x, yr)} stroke="var(--accent)" strokeWidth="1.5" fill="none" />
          <text x={PAD.l + 4} y={rTop + 12} fontSize="10" fill="var(--muted)">RSI 14</text>

          {/* MACD */}
          <rect x={PAD.l} y={mTop} width={width - PAD.l - PAD.r} height={MH} fill="var(--panel-2)" opacity="0.5" />
          <line x1={PAD.l} x2={width - PAD.r} y1={ym(0)} y2={ym(0)} stroke="var(--grid)" />
          {o.macdHist.map((h, i) =>
            h == null ? null : (
              <rect key={i} x={x(i) - Math.max(1, cw * 0.6) / 2} width={Math.max(1, cw * 0.6)} y={Math.min(ym(0), ym(h))} height={Math.abs(ym(h) - ym(0))} fill={h >= 0 ? "var(--up)" : "var(--down)"} opacity="0.55" />
            ),
          )}
          <path d={path(o.macd, x, ym)} stroke="var(--sma50)" strokeWidth="1.5" fill="none" />
          <path d={path(o.macdSignal, x, ym)} stroke="var(--sma20)" strokeWidth="1.5" fill="none" />
          <text x={PAD.l + 4} y={mTop + 12} fontSize="10" fill="var(--muted)">MACD 12·26·9</text>

          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={total} stroke="var(--muted)" strokeDasharray="3 3" />}
        </svg>
        {hc && hover != null && (
          <div className="pointer-events-none absolute top-2 left-2 rounded-md border border-line bg-panel/95 px-2.5 py-1.5 font-mono text-[11px] leading-5 shadow-sm">
            <div className="text-muted">{fmtTime(hc.time, intraday)}</div>
            <div>O {hc.open.toFixed(dec)} H {hc.high.toFixed(dec)} L {hc.low.toFixed(dec)} C <span className={hc.close >= hc.open ? "text-up" : "text-down"}>{hc.close.toFixed(dec)}</span></div>
            <div className="text-muted">RSI {o.rsi[hover]?.toFixed(1) ?? "–"} · Vol {hc.volume.toLocaleString()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
