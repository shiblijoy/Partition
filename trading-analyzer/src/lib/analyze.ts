import { backtest, historicalSamples, scenarios, tilt, verdict } from "./forecast";
import { supportResistance } from "./indicators";
import { demoData, fetchYahoo } from "./market";
import { analyseNews } from "./news";
import { buildContext, scoreOf, signalsAt } from "./signals";
import type { Analysis, Interval, MarketData } from "./types";

export const DEFAULT_HORIZON: Record<Interval, number> = { "15m": 8, "1h": 8, "1d": 5, "1wk": 4 };
const BAR_LABEL: Record<Interval, [string, string]> = {
  "15m": ["15-minute bar", "15-minute bars"],
  "1h": ["hour", "hours"],
  "1d": ["trading day", "trading days"],
  "1wk": ["week", "weeks"],
};
/** How far news can move the up-probability, at most, in odds terms. */
const NEWS_WEIGHT = 0.15;
const CHART_BARS = 160;

export function horizonLabel(interval: Interval, bars: number) {
  return `${bars} ${BAR_LABEL[interval][bars === 1 ? 0 : 1]}`;
}

export async function loadMarket(symbol: string, interval: Interval): Promise<{ market: MarketData; note?: string }> {
  if (symbol.toUpperCase().startsWith("DEMO")) return { market: demoData(symbol, interval) };
  try {
    return { market: await fetchYahoo(symbol, interval) };
  } catch (e) {
    const msg = (e as Error).message;
    if (/not found|No price data|not enough/i.test(msg)) throw e;
    return {
      market: demoData(symbol, interval),
      note: `Live market data was unreachable (${msg}), so this analysis runs on SYNTHETIC demo prices. Do not trade on it.`,
    };
  }
}

export function analyseMarket(market: MarketData, horizonBars: number) {
  const ctx = buildContext(market.candles);
  const last = ctx.closes.length - 1;
  const signals = signalsAt(ctx, last, true);
  const technicalScore = scoreOf(signals);
  const samples = historicalSamples(ctx, horizonBars);
  const bt = backtest(samples, technicalScore);
  const sr = supportResistance(ctx.candles, ctx.atr[last] ?? ctx.closes[last] * 0.02);

  let agreeW = 0;
  let totW = 0;
  for (const s of signals) {
    if (Math.abs(s.vote) < 0.05) continue;
    totW += s.weight * Math.abs(s.vote);
    if (Math.sign(s.vote) === Math.sign(technicalScore)) agreeW += s.weight * Math.abs(s.vote);
  }
  const agreement = totW ? Math.max(0, (agreeW / totW - 0.5) * 2) : 0;
  return { ctx, signals, technicalScore, samples, bt, sr, agreement };
}

export async function analyse(symbol: string, interval: Interval, horizonBars = DEFAULT_HORIZON[interval]): Promise<Analysis> {
  const { market, note } = await loadMarket(symbol, interval);
  const { ctx, signals, technicalScore, samples, bt, sr, agreement } = analyseMarket(market, horizonBars);
  const last = ctx.closes.length - 1;
  const price = ctx.closes[last];
  const hLabel = horizonLabel(interval, horizonBars);

  const technicalContext = `price ${price.toFixed(2)} ${market.currency}, technical score ${technicalScore.toFixed(2)} on a -1..+1 scale, RSI ${ctx.rsi[last]?.toFixed(0) ?? "n/a"}, historical up-probability over the next ${hLabel} ${(bt.conditionalUp * 100).toFixed(0)}%.`;
  const news = await analyseNews(market.symbol, market.name, technicalContext, market.source === "demo");

  const newsTilt = news.score * NEWS_WEIGHT * Math.min(1, news.headlines.length / 5);
  const pUp = tilt(bt.conditionalUp, newsTilt);
  const scen = scenarios(bt.near, samples, price, newsTilt, hLabel);
  const v = verdict({
    ctx,
    near: bt.near,
    bt,
    pUp,
    technicalScore,
    newsScore: news.score,
    newsCount: news.headlines.length,
    support: sr.support,
    resistance: sr.resistance,
    horizonBars,
    agreement,
  });

  const from = Math.max(0, ctx.closes.length - CHART_BARS);
  const cut = <T,>(xs: T[]) => xs.slice(from);
  const notes: string[] = [];
  if (note) notes.push(note);
  if (market.source === "demo" && !note) notes.push("You are viewing synthetic DEMO prices for testing the app. Do not trade on them.");
  if (news.error) notes.push(news.error);

  const { candles, ...meta } = market;
  return {
    market: meta,
    generatedAt: Date.now(),
    horizonBars,
    horizonLabel: hLabel,
    lastPrice: price,
    changePct: (price / ctx.closes[last - 1] - 1) * 100,
    candles: cut(candles),
    overlays: {
      sma20: cut(ctx.sma20),
      sma50: cut(ctx.sma50),
      sma200: cut(ctx.sma200),
      bbUpper: cut(ctx.bb.upper),
      bbLower: cut(ctx.bb.lower),
      rsi: cut(ctx.rsi),
      macd: cut(ctx.macd.line),
      macdSignal: cut(ctx.macd.signal),
      macdHist: cut(ctx.macd.hist),
    },
    levels: sr,
    signals,
    technicalScore,
    news,
    combinedScore: technicalScore * 0.8 + news.score * 0.2,
    backtest: { samples: bt.samples, similarSamples: bt.similarSamples, baseRateUp: bt.baseRateUp, conditionalUp: bt.conditionalUp, hitRate: bt.hitRate, avgMovePct: bt.avgMovePct, bins: bt.bins },
    scenarios: scen,
    verdict: v,
    notes,
  };
}
