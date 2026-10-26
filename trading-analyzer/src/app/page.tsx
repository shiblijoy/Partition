"use client";

import { useCallback, useEffect, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import type { Analysis, Interval, Signal } from "@/lib/types";

const INTERVALS: { v: Interval; label: string; horizon: number; unit: string }[] = [
  { v: "15m", label: "15 min", horizon: 8, unit: "bars of 15 min" },
  { v: "1h", label: "1 hour", horizon: 8, unit: "hours" },
  { v: "1d", label: "Daily", horizon: 5, unit: "trading days" },
  { v: "1wk", label: "Weekly", horizon: 4, unit: "weeks" },
];
const EXAMPLES = ["AAPL", "TSLA", "NVDA", "BTC-USD", "ETH-USD", "EURUSD=X", "^GSPC", "DEMO"];
const GROUP_LABEL: Record<Signal["group"], string> = {
  trend: "Trend",
  momentum: "Momentum",
  volatility: "Volatility",
  volume: "Volume",
  structure: "Structure",
  pattern: "Candles",
};

const pct = (p: number, d = 0) => `${(p * 100).toFixed(d)}%`;
const signed = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

async function load(sym: string, iv: Interval, h: number): Promise<{ data: Analysis } | { error: string }> {
  try {
    const res = await fetch(`/api/analyze?symbol=${encodeURIComponent(sym)}&interval=${iv}&horizon=${h}`);
    const json = await res.json();
    if (!res.ok) return { error: json.error || "Analysis failed" };
    return { data: json as Analysis };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export default function Home() {
  const [symbol, setSymbol] = useState("AAPL");
  const [interval, setIntervalV] = useState<Interval>("1d");
  const [horizon, setHorizon] = useState(5);
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((r: Awaited<ReturnType<typeof load>>) => {
    if ("error" in r) setError(r.error);
    else {
      setError(null);
      setData(r.data);
    }
    setLoading(false);
  }, []);

  const run = (sym: string, iv: Interval, h: number) => {
    setLoading(true);
    load(sym, iv, h).then(apply);
  };

  useEffect(() => {
    load("AAPL", "1d", 5).then(apply);
  }, [apply]);

  const unit = INTERVALS.find((i) => i.v === interval)!.unit;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trading Analyzer</h1>
          <p className="text-sm text-muted">Chart + news analysis with probabilities measured on the symbol&apos;s own history.</p>
        </div>
      </header>

      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(symbol, interval, horizon);
        }}
      >
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted">
          Symbol
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="AAPL, BTC-USD, EURUSD=X…"
            className="rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Timeframe
          <select
            value={interval}
            onChange={(e) => {
              const iv = e.target.value as Interval;
              setIntervalV(iv);
              setHorizon(INTERVALS.find((i) => i.v === iv)!.horizon);
            }}
            className="rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink"
          >
            {INTERVALS.map((i) => (
              <option key={i.v} value={i.v}>{i.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Forecast horizon ({unit})
          <input
            type="number"
            min={1}
            max={60}
            value={horizon}
            onChange={(e) => setHorizon(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            className="w-28 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink"
          />
        </label>
        <button disabled={loading} className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? "Analysing…" : "Analyse"}
        </button>
        <div className="flex w-full flex-wrap gap-1.5">
          {EXAMPLES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => {
                setSymbol(s);
                run(s, interval, horizon);
              }}
              className="rounded-md bg-panel-2 px-2 py-0.5 font-mono text-xs text-muted hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      {error && <div className="mb-4 rounded-xl border border-down/40 bg-down-soft px-4 py-3 text-sm text-down">{error}</div>}
      {!data && loading && <div className="rounded-xl border border-line bg-panel p-10 text-center text-muted">Fetching prices and news, running the backtest…</div>}
      {data && <Report a={data} loading={loading} />}

      <footer className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        <strong className="text-ink">Not financial advice.</strong> No method can predict every market move. These probabilities are
        estimates from how this chart behaved in similar past setups, adjusted slightly for news; markets change and past
        patterns can stop working. Never risk money you can&apos;t afford to lose, and always use a stop-loss.
      </footer>
    </main>
  );
}

function Report({ a, loading }: { a: Analysis; loading: boolean }) {
  const v = a.verdict;
  const dec = a.lastPrice < 2 ? 4 : 2;
  const tone = v.action === "BUY" ? "up" : v.action === "SELL" ? "down" : "warn";
  return (
    <div className={`grid gap-4 ${loading ? "opacity-60" : ""}`}>
      {a.notes.map((n) => (
        <div key={n} className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-2.5 text-sm text-warn">{n}</div>
      ))}

      <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 rounded-xl border border-line bg-panel p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-mono text-lg font-semibold">{a.market.symbol}</h2>
            <span className="truncate text-sm text-muted">{a.market.name}</span>
            <span className="ml-auto font-mono text-lg font-semibold">
              {a.lastPrice.toFixed(dec)} <span className="text-xs text-muted">{a.market.currency}</span>
            </span>
            <span className={`font-mono text-sm ${a.changePct >= 0 ? "text-up" : "text-down"}`}>{signed(a.changePct)}%</span>
          </div>
          <PriceChart a={a} />
        </div>

        <aside className="flex flex-col gap-4">
          <div className={`rounded-xl border p-4 ${tone === "up" ? "border-up/40 bg-up-soft" : tone === "down" ? "border-down/40 bg-down-soft" : "border-warn/40 bg-warn-soft"}`}>
            <div className="text-xs font-medium tracking-wide text-muted uppercase">Suggestion · next {a.horizonLabel}</div>
            <div className={`mt-1 text-4xl font-bold ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-warn"}`}>{v.action}</div>
            <div className="text-sm text-muted">{v.action === "HOLD" ? "No clear edge — wait" : `${v.strength} signal`}</div>
            <ProbBar up={v.probabilityUp} />
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <Stat k="Risk of loss" v={pct(v.riskOfLoss)} hint="Chance the stop is hit before the target, replayed on similar past setups" />
              <Stat k="Risk level" v={v.riskLevel} />
              <Stat k="Confidence" v={pct(v.confidence)} hint="How much evidence backs the lean: backtest accuracy, sample size, indicator agreement" />
              <Stat k="Reward : risk" v={`${v.rewardRisk.toFixed(2)} : 1`} />
              <Stat k="Entry" v={v.entry.toFixed(dec)} />
              <Stat k="Typical move" v={`±${v.expectedMovePct.toFixed(1)}%`} hint={`Average absolute move over ${a.horizonLabel}`} />
              <Stat k={v.probabilityUp >= 0.5 ? "Stop-loss" : "Stop (short)"} v={v.stop.toFixed(dec)} color="text-down" />
              <Stat k="Target 1 / 2" v={`${v.target.toFixed(dec)} / ${v.target2.toFixed(dec)}`} color="text-up" />
            </dl>
          </div>

          <div className="rounded-xl border border-line bg-panel p-4">
            <h3 className="mb-2 text-sm font-semibold">Why</h3>
            <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed">
              {v.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            {v.warnings.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-warn">
                {v.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
              </ul>
            )}
          </div>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Scenarios a={a} dec={dec} />
        <BacktestCard a={a} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Signals a={a} />
        <News a={a} />
      </section>
    </div>
  );
}

function ProbBar({ up }: { up: number }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs font-semibold">
        <span className="text-up">▲ Up {pct(up, 1)}</span>
        <span className="text-down">Down {pct(1 - up, 1)} ▼</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-down">
        <div className="bg-up" style={{ width: pct(up, 2) }} />
      </div>
    </div>
  );
}

function Stat({ k, v, hint, color }: { k: string; v: string; hint?: string; color?: string }) {
  return (
    <div title={hint}>
      <dt className="text-xs text-muted">{k}{hint && " ⓘ"}</dt>
      <dd className={`font-mono font-semibold ${color ?? ""}`}>{v}</dd>
    </div>
  );
}

function Scenarios({ a, dec }: { a: Analysis; dec: number }) {
  const max = Math.max(...a.scenarios.map((s) => s.probability));
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h3 className="text-sm font-semibold">Possible moves over the next {a.horizonLabel}</h3>
      <p className="mb-3 text-xs text-muted">Every outcome gets a probability. Bands are sized by this symbol&apos;s own volatility.</p>
      <div className="space-y-3">
        {a.scenarios.map((s) => {
          const color = s.key.includes("up") ? "var(--up)" : s.key.includes("down") ? "var(--down)" : "var(--muted)";
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{s.label} <span className="font-mono text-xs text-muted">{s.range}</span></span>
                <span className="font-mono font-semibold">{pct(s.probability, 1)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-panel-2">
                <div className="h-2 rounded-full" style={{ width: `${(s.probability / max) * 100}%`, background: color }} />
              </div>
              <div className="mt-1 text-xs text-muted">
                ≈ {s.priceFrom.toFixed(dec)} – {s.priceTo.toFixed(dec)}. {s.explanation}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BacktestCard({ a }: { a: Analysis }) {
  const b = a.backtest;
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h3 className="text-sm font-semibold">How reliable is this? (backtest)</h3>
      <p className="mb-3 text-xs text-muted">
        The same indicator model was run on every past bar of {a.market.symbol} and checked against what price did {a.horizonLabel} later.
      </p>
      <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat k="Bars tested" v={b.samples.toLocaleString()} />
        <Stat k="Direction accuracy" v={pct(b.hitRate, 1)} hint="How often a bullish/bearish score was followed by a move in that direction (50% = coin flip)" />
        <Stat k="Base rate up" v={pct(b.baseRateUp, 1)} hint="How often price rose over this horizon regardless of signals" />
        <Stat k="Similar setups up" v={pct(b.conditionalUp, 1)} hint={`Among the ${b.similarSamples} past bars with the closest score`} />
      </dl>
      <div className="text-xs text-muted">Share of times price rose, by technical score:</div>
      <div className="mt-2 flex h-32 items-end gap-1.5">
        {b.bins.map((bin) => {
          const current = a.technicalScore >= bin.from && a.technicalScore < bin.to + (bin.to === 1 ? 0.0001 : 0);
          return (
            <div key={bin.from} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="font-mono text-[10px] text-muted">{bin.samples ? pct(bin.upRate) : "–"}</span>
              <div
                className={`w-full rounded-t ${current ? "ring-2 ring-accent" : ""}`}
                style={{ height: `${bin.upRate * 75}%`, background: bin.upRate >= 0.5 ? "var(--up)" : "var(--down)", opacity: bin.samples ? 0.8 : 0.15 }}
                title={`${bin.samples} samples`}
              />
              <span className="font-mono text-[10px] text-muted">{bin.from.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Highlighted bar = today&apos;s score ({signed(a.technicalScore)}). If bars rise from left to right, the model has worked on this symbol.</p>
    </div>
  );
}

function Signals({ a }: { a: Analysis }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Technical breakdown</h3>
        <span className="font-mono text-sm">score <b className={a.technicalScore >= 0 ? "text-up" : "text-down"}>{signed(a.technicalScore)}</b></span>
      </div>
      <ul className="divide-y divide-line">
        {a.signals.map((s) => (
          <li key={s.key} className="py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] tracking-wide text-muted uppercase">{GROUP_LABEL[s.group]}</span>
              <span className="font-medium">{s.name}</span>
              <span className="ml-auto font-mono text-xs text-muted">{s.value}</span>
              <VoteMeter vote={s.vote} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.explanation}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VoteMeter({ vote }: { vote: number }) {
  const label = vote > 0.15 ? "Bullish" : vote < -0.15 ? "Bearish" : "Neutral";
  const color = vote > 0.15 ? "text-up" : vote < -0.15 ? "text-down" : "text-muted";
  return (
    <span className="flex w-24 shrink-0 items-center justify-end gap-1.5">
      <span className="relative h-1.5 w-10 rounded-full bg-panel-2">
        <span className="absolute top-0 left-1/2 h-1.5 w-px bg-muted" />
        <span
          className="absolute top-0 h-1.5 rounded-full"
          style={{
            left: vote >= 0 ? "50%" : `${50 + vote * 50}%`,
            width: `${Math.abs(vote) * 50}%`,
            background: vote >= 0 ? "var(--up)" : "var(--down)",
          }}
        />
      </span>
      <span className={`w-12 text-right text-xs font-medium ${color}`}>{label}</span>
    </span>
  );
}

function News({ a }: { a: Analysis }) {
  const n = a.news;
  const tone = n.label === "Bullish" ? "text-up" : n.label === "Bearish" ? "text-down" : "text-muted";
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">News analysis</h3>
        <span className="text-sm">
          <b className={tone}>{n.label}</b>
          {n.headlines.length > 0 && <span className="ml-1 font-mono text-xs text-muted">{signed(n.score)}</span>}
        </span>
      </div>
      <p className="text-sm leading-relaxed">{n.summary}</p>
      <p className="mt-1 text-xs text-muted">
        {n.method === "claude" ? "Scored by Claude, " : n.method === "lexicon" ? "Scored by keywords, " : ""}
        {n.headlines.length > 0 && "recent stories weigh more. News can shift the up-probability by at most ~7 points; the chart drives the rest."}
      </p>
      {(n.catalysts.length > 0 || n.risks.length > 0) && (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          {n.catalysts.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-up">Catalysts</div>
              <ul className="list-disc pl-4 text-xs leading-relaxed">{n.catalysts.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
          {n.risks.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-down">Risks</div>
              <ul className="list-disc pl-4 text-xs leading-relaxed">{n.risks.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      <ul className="mt-3 max-h-[520px] divide-y divide-line overflow-y-auto">
        {n.headlines.map((h) => (
          <li key={h.link + h.title} className="flex gap-3 py-2">
            <span
              className={`mt-0.5 w-11 shrink-0 rounded text-center font-mono text-[11px] font-semibold ${h.sentiment > 0.15 ? "bg-up-soft text-up" : h.sentiment < -0.15 ? "bg-down-soft text-down" : "bg-panel-2 text-muted"}`}
            >
              {signed(h.sentiment, 1)}
            </span>
            <div className="min-w-0">
              <a href={h.link} target="_blank" rel="noreferrer" className="text-sm leading-snug hover:underline">{h.title}</a>
              <div className="text-xs text-muted">
                {h.source}
                {h.published && ` · ${new Date(h.published).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                {!h.impact && h.matched.length > 0 && ` · keywords: ${h.matched.join(", ")}`}
              </div>
              {h.impact && <div className="mt-0.5 text-xs text-muted">{h.impact}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
