import type { Candle } from "./types";

type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line: Series = closes.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const start = line.findIndex((v) => v != null);
  const sig: Series = new Array(closes.length).fill(null);
  if (start >= 0) {
    const compact = ema(line.slice(start) as number[], signal);
    compact.forEach((v, j) => (sig[start + j] = v));
  }
  const hist: Series = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i]! : null));
  return { line, signal: sig, hist };
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i]!;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) ** 2;
    const sd = Math.sqrt(v / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function trueRange(c: Candle[], i: number): number {
  if (i === 0) return c[0].high - c[0].low;
  const pc = c[i - 1].close;
  return Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc));
}

export function atr(c: Candle[], period = 14): Series {
  const out: Series = new Array(c.length).fill(null);
  if (c.length <= period) return out;
  let a = 0;
  for (let i = 1; i <= period; i++) a += trueRange(c, i);
  a /= period;
  out[period] = a;
  for (let i = period + 1; i < c.length; i++) {
    a = (a * (period - 1) + trueRange(c, i)) / period;
    out[i] = a;
  }
  return out;
}

export function stochastic(c: Candle[], period = 14, smooth = 3) {
  const k: Series = new Array(c.length).fill(null);
  for (let i = period - 1; i < c.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, c[j].high);
      lo = Math.min(lo, c[j].low);
    }
    k[i] = hi === lo ? 50 : ((c[i].close - lo) / (hi - lo)) * 100;
  }
  const d: Series = new Array(c.length).fill(null);
  for (let i = period - 1 + smooth - 1; i < c.length; i++) {
    let s = 0;
    for (let j = i - smooth + 1; j <= i; j++) s += k[j]!;
    d[i] = s / smooth;
  }
  return { k, d };
}

/** Wilder's ADX with +DI / -DI. */
export function adx(c: Candle[], period = 14) {
  const n = c.length;
  const adxOut: Series = new Array(n).fill(null);
  const plusOut: Series = new Array(n).fill(null);
  const minusOut: Series = new Array(n).fill(null);
  if (n < period * 2 + 1) return { adx: adxOut, plusDI: plusOut, minusDI: minusOut };
  let trS = 0;
  let pS = 0;
  let mS = 0;
  const dx: number[] = [];
  for (let i = 1; i < n; i++) {
    const up = c[i].high - c[i - 1].high;
    const down = c[i - 1].low - c[i].low;
    const pdm = up > down && up > 0 ? up : 0;
    const mdm = down > up && down > 0 ? down : 0;
    const tr = trueRange(c, i);
    if (i <= period) {
      trS += tr;
      pS += pdm;
      mS += mdm;
      if (i < period) continue;
    } else {
      trS = trS - trS / period + tr;
      pS = pS - pS / period + pdm;
      mS = mS - mS / period + mdm;
    }
    const pdi = trS === 0 ? 0 : (100 * pS) / trS;
    const mdi = trS === 0 ? 0 : (100 * mS) / trS;
    plusOut[i] = pdi;
    minusOut[i] = mdi;
    dx.push(pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi));
    if (dx.length === period) {
      adxOut[i] = dx.reduce((a, b) => a + b, 0) / period;
    } else if (dx.length > period) {
      adxOut[i] = (adxOut[i - 1]! * (period - 1) + dx[dx.length - 1]) / period;
    }
  }
  return { adx: adxOut, plusDI: plusOut, minusDI: minusOut };
}

export function obv(c: Candle[]): number[] {
  const out = [0];
  for (let i = 1; i < c.length; i++) {
    const d = c[i].close - c[i - 1].close;
    out.push(out[i - 1] + (d > 0 ? c[i].volume : d < 0 ? -c[i].volume : 0));
  }
  return out;
}

/** Least-squares slope of the last `period` values, as % of the mean per bar. */
export function slopePct(values: number[], end: number, period: number): number | null {
  const start = end - period + 1;
  if (start < 0) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < period; i++) {
    const y = values[start + i];
    sx += i;
    sy += y;
    sxy += i * y;
    sxx += i * i;
  }
  const slope = (period * sxy - sx * sy) / (period * sxx - sx * sx);
  return (slope / (sy / period)) * 100;
}

/**
 * Support / resistance from swing pivots in the recent window, clustered so
 * nearby pivots merge into one level. Returns levels nearest to price first.
 */
export function supportResistance(c: Candle[], atrNow: number, lookback = 150, wing = 3) {
  const start = Math.max(wing, c.length - lookback);
  const pivots: number[] = [];
  for (let i = start; i < c.length - wing; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (c[j].high >= c[i].high) isHigh = false;
      if (c[j].low <= c[i].low) isLow = false;
    }
    if (isHigh) pivots.push(c[i].high);
    if (isLow) pivots.push(c[i].low);
  }
  pivots.sort((a, b) => a - b);
  const clusters: { level: number; touches: number }[] = [];
  const tol = atrNow * 0.6;
  for (const p of pivots) {
    const last = clusters[clusters.length - 1];
    if (last && p - last.level <= tol) {
      last.level = (last.level * last.touches + p) / (last.touches + 1);
      last.touches++;
    } else clusters.push({ level: p, touches: 1 });
  }
  const price = c[c.length - 1].close;
  const support = clusters
    .filter((x) => x.level < price)
    .sort((a, b) => b.level - a.level)
    .map((x) => x.level);
  const resistance = clusters
    .filter((x) => x.level > price)
    .sort((a, b) => a.level - b.level)
    .map((x) => x.level);
  return { support: support.slice(0, 3), resistance: resistance.slice(0, 3) };
}

export type Pattern = { name: string; vote: number; description: string };

/** Classic candlestick patterns on the last bars. */
export function candlePatterns(c: Candle[]): Pattern[] {
  const out: Pattern[] = [];
  const n = c.length;
  if (n < 3) return out;
  const a = c[n - 3], b = c[n - 2], x = c[n - 1];
  const body = (k: Candle) => Math.abs(k.close - k.open);
  const range = (k: Candle) => k.high - k.low || 1e-9;
  const bull = (k: Candle) => k.close > k.open;
  const bear = (k: Candle) => k.close < k.open;
  const lowerWick = (k: Candle) => Math.min(k.open, k.close) - k.low;
  const upperWick = (k: Candle) => k.high - Math.max(k.open, k.close);
  const priorDown = c[n - 2].close < c[Math.max(0, n - 7)].close;
  const priorUp = c[n - 2].close > c[Math.max(0, n - 7)].close;

  if (bear(b) && bull(x) && x.close >= b.open && x.open <= b.close && body(x) > body(b))
    out.push({ name: "Bullish engulfing", vote: 0.7, description: "Today's green body fully swallows yesterday's red body — buyers overpowered sellers." });
  if (bull(b) && bear(x) && x.open >= b.close && x.close <= b.open && body(x) > body(b))
    out.push({ name: "Bearish engulfing", vote: -0.7, description: "Today's red body fully swallows yesterday's green body — sellers took control." });
  if (lowerWick(x) > 2 * body(x) && upperWick(x) < body(x) + range(x) * 0.1 && priorDown)
    out.push({ name: "Hammer", vote: 0.5, description: "Long lower wick after a decline: sellers pushed price down but buyers drove it back up." });
  if (upperWick(x) > 2 * body(x) && lowerWick(x) < body(x) + range(x) * 0.1 && priorUp)
    out.push({ name: "Shooting star", vote: -0.5, description: "Long upper wick after a rally: buyers pushed up but were rejected." });
  if (body(x) < range(x) * 0.1)
    out.push({ name: "Doji", vote: 0, description: "Open ≈ close — indecision; often precedes a reversal when it appears after a strong move." });
  if (bear(a) && body(b) < body(a) * 0.4 && bull(x) && x.close > (a.open + a.close) / 2 && priorDown)
    out.push({ name: "Morning star", vote: 0.8, description: "Three-candle bottom reversal: big red, small indecisive candle, then a strong green close." });
  if (bull(a) && body(b) < body(a) * 0.4 && bear(x) && x.close < (a.open + a.close) / 2 && priorUp)
    out.push({ name: "Evening star", vote: -0.8, description: "Three-candle top reversal: big green, small indecisive candle, then a strong red close." });
  if ([a, b, x].every(bull) && b.close > a.close && x.close > b.close && [a, b, x].every((k) => body(k) > range(k) * 0.5))
    out.push({ name: "Three white soldiers", vote: 0.6, description: "Three strong green candles closing higher each day — sustained buying." });
  if ([a, b, x].every(bear) && b.close < a.close && x.close < b.close && [a, b, x].every((k) => body(k) > range(k) * 0.5))
    out.push({ name: "Three black crows", vote: -0.6, description: "Three strong red candles closing lower each day — sustained selling." });
  return out;
}
