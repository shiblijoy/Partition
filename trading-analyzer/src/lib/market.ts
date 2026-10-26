import type { Candle, Interval, MarketData } from "./types";

const RANGE: Record<Interval, string> = { "15m": "60d", "1h": "730d", "1d": "5y", "1wk": "10y" };
const UA = "Mozilla/5.0 (compatible; TradingAnalyzer/0.1)";

type YahooChart = {
  chart: {
    result?: {
      meta: { symbol: string; currency?: string; shortName?: string; longName?: string; instrumentType?: string };
      timestamp?: number[];
      indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
};

export async function fetchYahoo(symbol: string, interval: Interval): Promise<MarketData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${RANGE[interval]}&interval=${interval}&includePrePost=false`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(res.status === 404 ? `Symbol "${symbol}" not found` : `Market data request failed (${res.status})`);
  const json = (await res.json()) as YahooChart;
  const r = json.chart.result?.[0];
  if (!r || !r.timestamp?.length) throw new Error(json.chart.error?.description || `No price data for "${symbol}"`);
  const q = r.indicators.quote[0];
  const candles: Candle[] = [];
  r.timestamp.forEach((t, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) return;
    candles.push({ time: t, open: o, high: h, low: l, close: c, volume: q.volume[i] ?? 0 });
  });
  if (candles.length < 60) throw new Error(`Only ${candles.length} bars of history for "${symbol}" — not enough to analyse`);
  return {
    symbol: r.meta.symbol,
    name: r.meta.longName || r.meta.shortName || r.meta.symbol,
    currency: r.meta.currency || "",
    interval,
    candles,
    source: "yahoo",
  };
}

/** Deterministic PRNG so a demo symbol always draws the same chart. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synthetic regime-switching price series, used when live data is unreachable or the symbol is DEMO. */
export function demoData(symbol: string, interval: Interval): MarketData {
  let seed = 0;
  for (const ch of symbol + interval) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rnd = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const step = { "15m": 900, "1h": 3600, "1d": 86400, "1wk": 604800 }[interval];
  const n = interval === "1d" ? 1000 : interval === "1wk" ? 520 : 1200;
  const vol = { "15m": 0.003, "1h": 0.006, "1d": 0.018, "1wk": 0.04 }[interval];
  const candles: Candle[] = [];
  let price = 100 + rnd() * 100;
  let drift = 0;
  const end = Math.floor(Date.now() / 1000 / step) * step;
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.02) drift = (rnd() - 0.5) * vol * 0.6;
    const open = price;
    const close = open * Math.exp(drift + vol * gauss());
    const high = Math.max(open, close) * (1 + Math.abs(gauss()) * vol * 0.5);
    const low = Math.min(open, close) * (1 - Math.abs(gauss()) * vol * 0.5);
    candles.push({ time: end - (n - 1 - i) * step, open, high, low, close, volume: Math.round(1e6 * (0.6 + rnd()) * (1 + Math.abs(close / open - 1) * 40)) });
    price = close;
  }
  return { symbol: symbol.toUpperCase(), name: "Demo data (synthetic)", currency: "USD", interval, candles, source: "demo" };
}
