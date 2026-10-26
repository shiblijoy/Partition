import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { headlineSentiment } from "./sentiment";
import type { Headline, NewsAnalysis } from "./types";

const UA = "Mozilla/5.0 (compatible; TradingAnalyzer/0.1)";
const DAY = 86_400_000;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function parseRss(xml: string, fallbackSource: string): Omit<Headline, "sentiment" | "matched">[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.map((it) => {
    const tag = (t: string) => decode(it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
    let title = tag("title");
    const source = tag("source") || fallbackSource;
    // Google News appends " - Source" to titles
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const date = Date.parse(tag("pubDate"));
    return { title, link: tag("link"), source, published: Number.isNaN(date) ? null : date };
  });
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

export async function fetchHeadlines(symbol: string, name: string): Promise<Headline[]> {
  const bare = symbol.replace(/[-=^].*$/, "");
  const query = name && name !== symbol ? `"${name.replace(/,? (Inc|Corp|Corporation|Ltd|plc|Limited)\.?$/i, "")}" OR ${bare}` : bare;
  const feeds = [
    getText(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`).then((x) => parseRss(x, "Yahoo Finance")),
    getText(`https://news.google.com/rss/search?q=${encodeURIComponent(query + " stock when:14d")}&hl=en-US&gl=US&ceid=US:en`).then((x) => parseRss(x, "Google News")),
  ];
  const results = await Promise.allSettled(feeds);
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const h of r.value) {
      const key = h.title.toLowerCase().slice(0, 60);
      if (!h.title || seen.has(key)) continue;
      seen.add(key);
      const s = headlineSentiment(h.title);
      out.push({ ...h, sentiment: s.score, matched: s.matched });
    }
  }
  if (!out.length && results.every((r) => r.status === "rejected")) throw new Error("News feeds unreachable");
  return out.sort((a, b) => (b.published ?? 0) - (a.published ?? 0)).slice(0, 25);
}

/** Recency-weighted mean: a headline from 3 days ago counts ~37% as much as one from today. */
export function aggregate(headlines: Headline[]): number {
  let w = 0;
  let v = 0;
  const now = Date.now();
  for (const h of headlines) {
    const age = h.published ? Math.max(0, now - h.published) : 7 * DAY;
    const weight = Math.exp(-age / (3 * DAY));
    w += weight;
    v += h.sentiment * weight;
  }
  return w ? v / w : 0;
}

function labelOf(score: number, count: number): NewsAnalysis["label"] {
  if (!count) return "No news";
  return score > 0.12 ? "Bullish" : score < -0.12 ? "Bearish" : "Neutral";
}

const ClaudeNews = z.object({
  headlines: z.array(z.object({ index: z.number().int(), sentiment: z.number(), impact: z.string() })),
  summary: z.string(),
  catalysts: z.array(z.string()),
  risks: z.array(z.string()),
});

async function analyseWithClaude(symbol: string, name: string, headlines: Headline[], technicalContext: string) {
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  const list = headlines
    .map((h, i) => `${i}. [${h.published ? new Date(h.published).toISOString().slice(0, 10) : "undated"}] ${h.title} (${h.source})`)
    .join("\n");
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ClaudeNews) },
    system:
      "You are an equity and crypto news analyst. For each headline, judge its likely price impact on the named asset over the next few days, from -1 (very bearish) to +1 (very bullish); 0 when it is irrelevant or already priced in. Explain the impact in one sentence. Then write a 2-4 sentence summary of what the news flow means for the asset, and list the main upcoming catalysts and risks it mentions. Be balanced and never overstate certainty.",
    messages: [
      {
        role: "user",
        content: `Asset: ${name} (${symbol})\nTechnical picture: ${technicalContext}\n\nHeadlines (index. [date] title (source)):\n${list}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to analyse these headlines");
  if (!response.parsed_output) throw new Error("Claude returned no structured analysis");
  return response.parsed_output;
}

export async function analyseNews(symbol: string, name: string, technicalContext: string, demo: boolean): Promise<NewsAnalysis> {
  if (demo) {
    return { headlines: [], score: 0, label: "No news", method: "none", summary: "Demo data has no news. Analyse a real symbol to include news sentiment.", catalysts: [], risks: [] };
  }
  let headlines: Headline[];
  try {
    headlines = await fetchHeadlines(symbol, name);
  } catch (e) {
    return { headlines: [], score: 0, label: "No news", method: "none", summary: "News could not be loaded, so the forecast uses the chart only.", catalysts: [], risks: [], error: (e as Error).message };
  }
  if (!headlines.length) {
    return { headlines, score: 0, label: "No news", method: "none", summary: "No recent headlines were found for this symbol.", catalysts: [], risks: [] };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const ai = await analyseWithClaude(symbol, name, headlines, technicalContext);
      for (const h of ai.headlines) {
        const target = headlines[h.index];
        if (!target) continue;
        target.sentiment = Math.max(-1, Math.min(1, h.sentiment));
        target.impact = h.impact;
      }
      const score = aggregate(headlines);
      return { headlines, score, label: labelOf(score, headlines.length), method: "claude", summary: ai.summary, catalysts: ai.catalysts, risks: ai.risks };
    } catch (e) {
      const score = aggregate(headlines);
      return lexiconResult(headlines, score, `AI news analysis failed (${(e as Error).message}); fell back to keyword scoring.`);
    }
  }
  return lexiconResult(headlines, aggregate(headlines));
}

function lexiconResult(headlines: Headline[], score: number, error?: string): NewsAnalysis {
  const pos = headlines.filter((h) => h.sentiment > 0.15).length;
  const neg = headlines.filter((h) => h.sentiment < -0.15).length;
  return {
    headlines,
    score,
    label: labelOf(score, headlines.length),
    method: "lexicon",
    summary: `${headlines.length} recent headlines: ${pos} positive, ${neg} negative, ${headlines.length - pos - neg} neutral, scored by keyword with recent stories weighted more. Set ANTHROPIC_API_KEY for a deeper AI reading of each story.`,
    catalysts: [],
    risks: [],
    error,
  };
}
