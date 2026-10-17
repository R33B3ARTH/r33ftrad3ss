import { corsHeaders } from "../_shared/cors.ts";

const YAHOO_SYMBOLS: Record<string, string> = {
  ES: "ES=F",
  NQ: "NQ=F",
};

interface YahooCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AssetResult {
  symbol: string;
  yahooSymbol: string;
  price: number;
  prevClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  change: number;
  changePercent: number;
  prevDayHigh: number;
  prevDayLow: number;
  candles: YahooCandle[];
}

async function fetchYahooData(yahooSymbol: string): Promise<AssetResult | null> {
  // Fetch 1m candles for today + previous day's range
  // range=2d gives enough 1m data to compute prev day high/low
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=2d&includePrePost=false`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!resp.ok) return null;

  const data = await resp.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  if (!meta) return null;

  const timestamps: number[] = result.timestamp ?? [];
  const quoteData = result.indicators?.quote?.[0];
  if (!quoteData) return null;

  // Build candles, skip any with null values
  const candles: YahooCandle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quoteData.open?.[i];
    const h = quoteData.high?.[i];
    const l = quoteData.low?.[i];
    const c = quoteData.close?.[i];
    const v = quoteData.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      timestamp: timestamps[i] * 1000,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v ?? 0,
    });
  }

  // The most recent candle close is the most real-time price
  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;

  const price = lastCandle?.close ?? meta.regularMarketPrice ?? meta.previousClose ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const open = meta.regularMarketPrice ?? prevClose;
  const dayHigh = meta.regularMarketDayHigh ?? price;
  const dayLow = meta.regularMarketDayLow ?? price;
  const volume = meta.regularMarketVolume ?? 0;
  const change = price - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

  // Compute previous day's high and low from candles
  // Today's date in the exchange's timezone - just use the most recent candle's date
  let prevDayHigh = 0;
  let prevDayLow = 0;

  if (candles.length > 0) {
    const lastCandleDate = new Date(lastCandle!.timestamp);
    const todayKey = lastCandleDate.getFullYear() * 10000 + (lastCandleDate.getMonth() + 1) * 100 + lastCandleDate.getDate();

    const prevDayCandles = candles.filter((c) => {
      const d = new Date(c.timestamp);
      const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      return key < todayKey;
    });

    if (prevDayCandles.length > 0) {
      prevDayHigh = Math.max(...prevDayCandles.map((c) => c.high));
      prevDayLow = Math.min(...prevDayCandles.map((c) => c.low));
    }

    // Fallback: if no previous day candles found, use the meta previous close as approximation
    if (prevDayHigh === 0 || prevDayLow === 0) {
      // Use dayHigh/dayLow from meta as fallback
      prevDayHigh = prevDayHigh || dayHigh;
      prevDayLow = prevDayLow || dayLow;
    }
  }

  return {
    symbol: "",
    yahooSymbol,
    price,
    prevClose,
    open,
    dayHigh,
    dayLow,
    volume,
    change,
    changePercent,
    prevDayHigh,
    prevDayLow,
    candles: candles.slice(-500), // Last 500 1m candles (~8 hours)
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const symbols = Object.keys(YAHOO_SYMBOLS);
    const results: Record<string, AssetResult | { error: string }> = {};

    const fetches = symbols.map(async (sym) => {
      const yahooSymbol = YAHOO_SYMBOLS[sym];
      try {
        const data = await fetchYahooData(yahooSymbol);
        if (data) {
          results[sym] = { ...data, symbol: sym };
        } else {
          results[sym] = { error: `No data for ${yahooSymbol}` };
        }
      } catch {
        results[sym] = { error: `Failed to fetch ${yahooSymbol}` };
      }
    });

    await Promise.all(fetches);

    const hasAnySuccess = symbols.some((s) => !("error" in (results[s] || {})));

    return new Response(
      JSON.stringify({ success: hasAnySuccess, data: results, timestamp: Date.now() }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
