import type { NextRequest } from "next/server";
import { analyse, DEFAULT_HORIZON } from "@/lib/analyze";
import type { Interval } from "@/lib/types";

const INTERVALS: Interval[] = ["15m", "1h", "1d", "1wk"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = (params.get("symbol") ?? "").trim().toUpperCase();
  const interval = (params.get("interval") ?? "1d") as Interval;
  if (!/^[A-Z0-9.\-=^]{1,20}$/.test(symbol)) {
    return Response.json({ error: "Enter a ticker such as AAPL, TSLA, BTC-USD, EURUSD=X or ^GSPC." }, { status: 400 });
  }
  if (!INTERVALS.includes(interval)) return Response.json({ error: "Unsupported interval" }, { status: 400 });
  const horizon = Number(params.get("horizon") ?? DEFAULT_HORIZON[interval]);
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 60) {
    return Response.json({ error: "Horizon must be 1–60 bars" }, { status: 400 });
  }
  try {
    return Response.json(await analyse(symbol, interval, horizon));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
