import type { Candle, Signal } from "./types";
import {
  adx,
  atr,
  bollinger,
  candlePatterns,
  ema,
  macd,
  obv,
  rsi,
  slopePct,
  sma,
  stochastic,
  supportResistance,
} from "./indicators";

/** Every indicator series, computed once so scoring any bar is cheap (the backtest scores every bar). */
export type Context = ReturnType<typeof buildContext>;

export function buildContext(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  return {
    candles,
    closes,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    rsi: rsi(closes, 14),
    macd: macd(closes),
    bb: bollinger(closes, 20, 2),
    atr: atr(candles, 14),
    stoch: stochastic(candles),
    adx: adx(candles),
    obv: obv(candles),
    volSma: sma(candles.map((c) => c.volume), 20),
  };
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const f = (v: number, d = 2) => v.toFixed(d);

/** First bar index at which every core indicator has a value. */
export function warmup(ctx: Context): number {
  const n = ctx.closes.length;
  const long = n >= 260 ? 200 : 50;
  return Math.min(n - 1, Math.max(long, 35));
}

/**
 * Score bar `i`. `full` adds the slow, current-bar-only signals
 * (support/resistance and candlestick patterns) that the backtest skips.
 */
export function signalsAt(ctx: Context, i: number, full = false): Signal[] {
  const s: Signal[] = [];
  const price = ctx.closes[i];
  const atrNow = ctx.atr[i] ?? price * 0.02;

  // --- Trend ---
  const s50 = ctx.sma50[i];
  const s200 = ctx.sma200[i];
  if (s50 != null && s200 != null) {
    const above50 = price > s50;
    const above200 = price > s200;
    const golden = s50 > s200;
    let vote = (above50 ? 0.3 : -0.3) + (above200 ? 0.3 : -0.3) + (golden ? 0.4 : -0.4);
    vote = clamp(vote);
    s.push({
      key: "ma",
      group: "trend",
      name: "Moving averages (50 / 200)",
      vote,
      weight: 1.4,
      value: `50: ${f(s50)} · 200: ${f(s200)}`,
      explanation: `Price is ${above50 ? "above" : "below"} the 50-period and ${above200 ? "above" : "below"} the 200-period average; the 50 is ${golden ? "above the 200 (golden-cross regime, long-term uptrend)" : "below the 200 (death-cross regime, long-term downtrend)"}.`,
    });
  } else if (s50 != null) {
    const vote = price > s50 ? 0.5 : -0.5;
    s.push({
      key: "ma",
      group: "trend",
      name: "Moving average (50)",
      vote,
      weight: 1.0,
      value: f(s50),
      explanation: `Price is ${price > s50 ? "above" : "below"} its 50-period average (not enough history for the 200).`,
    });
  }

  const e20 = ctx.ema20[i];
  const e50 = ctx.ema50[i];
  const slope = slopePct(ctx.closes, i, 20);
  if (e20 != null && e50 != null && slope != null) {
    const spread = (e20 - e50) / atrNow;
    const vote = clamp(spread * 0.35 + clamp(slope / 0.4) * 0.4);
    s.push({
      key: "ema",
      group: "trend",
      name: "Short-term trend (EMA 20/50 + slope)",
      vote,
      weight: 1.2,
      value: `slope ${f(slope, 3)}%/bar`,
      explanation: `EMA20 is ${f(Math.abs(spread), 1)} ATR ${spread >= 0 ? "above" : "below"} EMA50 and the 20-bar regression line is ${slope > 0.05 ? "rising" : slope < -0.05 ? "falling" : "flat"} (${f(slope, 3)}% per bar).`,
    });
  }

  const a = ctx.adx.adx[i];
  const pdi = ctx.adx.plusDI[i];
  const mdi = ctx.adx.minusDI[i];
  if (a != null && pdi != null && mdi != null) {
    const dir = pdi > mdi ? 1 : -1;
    const strength = clamp((a - 15) / 25, 0, 1);
    s.push({
      key: "adx",
      group: "trend",
      name: "ADX trend strength",
      vote: dir * strength * 0.8,
      weight: 1.0,
      value: `ADX ${f(a, 1)} · +DI ${f(pdi, 1)} · −DI ${f(mdi, 1)}`,
      explanation:
        a < 20
          ? `ADX ${f(a, 1)} is below 20: no strong trend, the market is ranging, so trend signals are less reliable.`
          : `ADX ${f(a, 1)} shows a ${a > 35 ? "strong" : "developing"} trend, and ${dir > 0 ? "+DI above −DI means buyers drive it" : "−DI above +DI means sellers drive it"}.`,
    });
  }

  // --- Momentum ---
  const r = ctx.rsi[i];
  if (r != null) {
    let vote: number;
    let text: string;
    if (r < 30) {
      vote = clamp((30 - r) / 15 + 0.3, 0, 0.9);
      text = `RSI ${f(r, 1)} is oversold (<30): selling looks exhausted and bounces are statistically more likely.`;
    } else if (r > 70) {
      vote = -clamp((r - 70) / 15 + 0.3, 0, 0.9);
      text = `RSI ${f(r, 1)} is overbought (>70): the move is stretched and pullbacks become more likely.`;
    } else {
      vote = ((r - 50) / 20) * 0.4;
      text = `RSI ${f(r, 1)} is in the neutral zone; ${r >= 50 ? "above 50 means momentum leans bullish" : "below 50 means momentum leans bearish"}.`;
    }
    s.push({ key: "rsi", group: "momentum", name: "RSI (14)", vote, weight: 1.0, value: f(r, 1), explanation: text });
  }

  const h = ctx.macd.hist[i];
  const hp = ctx.macd.hist[i - 1];
  const ml = ctx.macd.line[i];
  if (h != null && hp != null && ml != null) {
    const crossUp = hp <= 0 && h > 0;
    const crossDown = hp >= 0 && h < 0;
    const rising = h > hp;
    let vote = (h > 0 ? 0.4 : -0.4) + (rising ? 0.25 : -0.25);
    if (crossUp) vote = 0.85;
    if (crossDown) vote = -0.85;
    s.push({
      key: "macd",
      group: "momentum",
      name: "MACD (12, 26, 9)",
      vote: clamp(vote),
      weight: 1.2,
      value: `hist ${f(h, 3)}`,
      explanation: crossUp
        ? "MACD just crossed above its signal line — a fresh bullish momentum signal."
        : crossDown
          ? "MACD just crossed below its signal line — a fresh bearish momentum signal."
          : `MACD is ${h > 0 ? "above" : "below"} its signal line and the gap is ${(h > 0) === rising ? "widening" : "narrowing"}, so ${h > 0 ? "bullish" : "bearish"} momentum is ${(h > 0) === rising ? "strengthening" : "fading"}.`,
    });
  }

  const k = ctx.stoch.k[i];
  const d = ctx.stoch.d[i];
  if (k != null && d != null) {
    let vote = 0;
    let text = `%K ${f(k, 0)} / %D ${f(d, 0)} — mid-range, no extreme.`;
    if (k < 20 && k > d) {
      vote = 0.6;
      text = `Stochastic is oversold (${f(k, 0)}) and %K is turning up through %D — a buy trigger.`;
    } else if (k > 80 && k < d) {
      vote = -0.6;
      text = `Stochastic is overbought (${f(k, 0)}) and %K is turning down through %D — a sell trigger.`;
    } else if (k < 20) {
      vote = 0.3;
      text = `Stochastic is oversold (${f(k, 0)}) but hasn't turned up yet.`;
    } else if (k > 80) {
      vote = -0.3;
      text = `Stochastic is overbought (${f(k, 0)}) but hasn't turned down yet.`;
    } else vote = k > d ? 0.15 : -0.15;
    s.push({ key: "stoch", group: "momentum", name: "Stochastic (14, 3)", vote, weight: 0.7, value: `${f(k, 0)} / ${f(d, 0)}`, explanation: text });
  }

  if (i >= 10) {
    const roc = (price / ctx.closes[i - 10] - 1) * 100;
    const atrPct = (atrNow / price) * 100;
    const vote = clamp(roc / (atrPct * 3)) * 0.7;
    s.push({
      key: "roc",
      group: "momentum",
      name: "Rate of change (10)",
      vote,
      weight: 0.8,
      value: `${roc >= 0 ? "+" : ""}${f(roc)}%`,
      explanation: `Price moved ${roc >= 0 ? "+" : ""}${f(roc)}% over the last 10 bars (${f(roc / atrPct, 1)}× the typical bar range).`,
    });
  }

  // --- Volatility ---
  const up = ctx.bb.upper[i];
  const lo = ctx.bb.lower[i];
  if (up != null && lo != null && up > lo) {
    const pb = (price - lo) / (up - lo);
    let vote: number;
    let text: string;
    if (pb < 0) {
      vote = 0.5;
      text = "Price closed below the lower Bollinger band — statistically stretched to the downside; mean reversion favours a bounce.";
    } else if (pb > 1) {
      vote = -0.5;
      text = "Price closed above the upper Bollinger band — stretched to the upside; mean reversion favours a pullback.";
    } else {
      vote = (0.5 - pb) * 0.4;
      text = `Price sits at ${f(pb * 100, 0)}% of the Bollinger range (0% = lower band, 100% = upper band).`;
    }
    const width = ((up - lo) / price) * 100;
    s.push({ key: "bb", group: "volatility", name: "Bollinger bands (20, 2)", vote, weight: 0.7, value: `%B ${f(pb * 100, 0)} · width ${f(width, 1)}%`, explanation: text });
  }

  // --- Volume ---
  const os = slopePct(ctx.obv.map((v) => v + 1e12), i, 20); // offset keeps the mean positive
  const ps = slopePct(ctx.closes, i, 20);
  const vs = ctx.volSma[i];
  if (os != null && ps != null && vs) {
    const obvUp = os > 0;
    const priceUp = ps > 0;
    const relVol = ctx.candles[i].volume / vs;
    let vote = obvUp === priceUp ? (priceUp ? 0.4 : -0.4) : priceUp ? -0.35 : 0.35;
    if (relVol > 1.5) vote *= 1.4;
    s.push({
      key: "obv",
      group: "volume",
      name: "Volume / OBV",
      vote: clamp(vote),
      weight: vs > 0 ? 0.8 : 0,
      value: `rel. volume ${f(relVol, 1)}×`,
      explanation:
        obvUp === priceUp
          ? `On-balance volume is ${obvUp ? "rising" : "falling"} with price, so volume confirms the ${priceUp ? "up" : "down"}move${relVol > 1.5 ? `; today's volume is ${f(relVol, 1)}× average, adding conviction` : ""}.`
          : `Divergence: price is ${priceUp ? "rising" : "falling"} but on-balance volume is ${obvUp ? "rising" : "falling"} — ${priceUp ? "the rally lacks volume support" : "selling is drying up / accumulation"}.`,
    });
  }

  if (full) {
    const { support, resistance } = supportResistance(ctx.candles.slice(0, i + 1), atrNow);
    const ds = support.length ? (price - support[0]) / atrNow : null;
    const dr = resistance.length ? (resistance[0] - price) / atrNow : null;
    let vote = 0;
    const parts: string[] = [];
    if (ds != null) parts.push(`nearest support ${f(support[0])} (${f(ds, 1)} ATR below)`);
    if (dr != null) parts.push(`nearest resistance ${f(resistance[0])} (${f(dr, 1)} ATR above)`);
    if (ds != null && dr != null) vote = clamp((dr - ds) / (dr + ds)) * 0.6;
    else if (dr == null) vote = 0.3; // trading above every recent pivot: open sky
    else if (ds == null) vote = -0.3;
    s.push({
      key: "sr",
      group: "structure",
      name: "Support & resistance",
      vote,
      weight: 0.9,
      value: parts.length ? "" : "none found",
      explanation:
        (parts.join("; ") || "No nearby swing levels.") +
        (vote > 0.15 ? ". More room to run up than down before hitting a level." : vote < -0.15 ? ". Resistance is close, limiting upside, while support is further away." : "."),
    });

    for (const p of candlePatterns(ctx.candles.slice(0, i + 1))) {
      s.push({ key: `pat-${p.name}`, group: "pattern", name: `Pattern: ${p.name}`, vote: p.vote, weight: 0.6, value: "last bars", explanation: p.description });
    }
  }
  return s;
}

/** Weighted average vote, in -1..1. */
export function scoreOf(signals: Signal[]): number {
  let w = 0;
  let v = 0;
  for (const s of signals) {
    w += s.weight;
    v += s.vote * s.weight;
  }
  return w ? v / w : 0;
}
