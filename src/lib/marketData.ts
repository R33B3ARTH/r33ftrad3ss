import type { AssetSymbol, PriceData, CandleData, PriceSource } from './types';
import { ASSET_CONFIGS, YAHOO_SYMBOLS } from './assets';

type Listener = (price: PriceData) => void;
type CandleListener = (candles: CandleData[]) => void;
type SourceListener = (source: PriceSource) => void;

interface LiveQuote {
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
  candles: CandleData[];
}

interface ManualPrices {
  es_manual_price: number | null;
  nq_manual_price: number | null;
}

const MANUAL_KEY_MAP: Record<AssetSymbol, keyof ManualPrices> = {
  ES: 'es_manual_price',
  NQ: 'nq_manual_price',
};

const POLL_INTERVAL = 1000;
const CANDLE_INTERVAL = 1000;

export type Timeframe = '1m' | '3m' | '5m' | '10m' | '15m' | '30m' | '1h' | '4h' | '1D';
const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '10m': 600_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1D': 86_400_000,
};
const MAX_CANDLES_PER_TF: Record<Timeframe, number> = {
  '1m': 80,
  '3m': 80,
  '5m': 80,
  '10m': 60,
  '15m': 60,
  '30m': 60,
  '1h': 48,
  '4h': 30,
  '1D': 30,
};

class MarketDataEngine {
  private prices: Map<AssetSymbol, PriceData> = new Map();
  private apiCandles: Map<AssetSymbol, CandleData[]> = new Map();
  private candleHistory: Map<AssetSymbol, CandleData[]> = new Map();
  private priceListeners: Map<AssetSymbol, Set<Listener>> = new Map();
  private candleListeners: Map<AssetSymbol, Set<CandleListener>> = new Map();
  private sourceListeners: Set<SourceListener> = new Set();
  private priceIntervals: Map<AssetSymbol, ReturnType<typeof setInterval>> = new Map();
  private candleIntervals: Map<AssetSymbol, ReturnType<typeof setInterval>> = new Map();
  private currentSource: PriceSource = 'live';
  private manualPrices: ManualPrices = {
    es_manual_price: null,
    nq_manual_price: null,
  };
  private useManual = false;
  private liveQuotes: Map<AssetSymbol, LiveQuote> = new Map();
  private fetchInProgress = false;
  private lastFetchTime = 0;

  private pollInterval: number;

  constructor() {
    this.pollInterval = POLL_INTERVAL;
    this.initializeSimData();
  }

  setPollInterval(ms: number) {
    this.pollInterval = ms;
    (Object.keys(ASSET_CONFIGS) as AssetSymbol[]).forEach((symbol) => {
      if (this.priceIntervals.has(symbol)) {
        clearInterval(this.priceIntervals.get(symbol)!);
        this.priceIntervals.set(
          symbol,
          setInterval(() => {
            if (this.useManual) {
              const manualPrice = this.manualPrices[MANUAL_KEY_MAP[symbol]];
              if (manualPrice !== null && manualPrice > 0) {
                const current = this.prices.get(symbol);
                if (current && current.price !== manualPrice) {
                  this.applyManualPrice(symbol, manualPrice);
                }
              }
            } else {
              this.fetchLivePrices();
            }
          }, this.pollInterval),
        );
      }
    });
  }

  private initializeSimData() {
    (Object.keys(ASSET_CONFIGS) as AssetSymbol[]).forEach((symbol) => {
      const config = ASSET_CONFIGS[symbol];
      const basePrice = config.basePrice;
      const dayOpen = basePrice - (Math.random() - 0.5) * config.dailyAtr * 0.5;
      const prevDayHigh = basePrice + config.dailyAtr * 0.3;
      const prevDayLow = basePrice - config.dailyAtr * 0.3;

      this.prices.set(symbol, {
        symbol,
        price: basePrice,
        prevPrice: basePrice,
        change: basePrice - dayOpen,
        changePercent: ((basePrice - dayOpen) / dayOpen) * 100,
        dayHigh: basePrice + config.dailyAtr * 0.3,
        dayLow: dayOpen - config.dailyAtr * 0.2,
        dayOpen,
        volume: Math.floor(Math.random() * 500000) + 100000,
        timestamp: Date.now(),
        source: 'sim',
        prevDayHigh,
        prevDayLow,
      });

      this.candleHistory.set(symbol, this.generateInitialCandles(symbol, basePrice));
    });
  }

  private generateInitialCandles(symbol: AssetSymbol, basePrice: number): CandleData[] {
    const config = ASSET_CONFIGS[symbol];
    const candles: CandleData[] = [];
    const count = 120;
    const intervalMs = 60000;
    let price = basePrice - config.dailyAtr * 0.4;
    const now = Date.now();

    for (let i = count - 1; i >= 0; i--) {
      const time = now - i * intervalMs;
      const volatility = config.dailyAtr * 0.15;
      const open = price;
      const trendBias = Math.sin(i / 10) * volatility * 0.3;
      const close = open + (Math.random() - 0.5) * volatility + trendBias;
      const high = Math.max(open, close) + Math.random() * volatility * 0.4;
      const low = Math.min(open, close) - Math.random() * volatility * 0.4;
      const volume = Math.floor(Math.random() * 10000) + 2000;

      candles.push({
        time,
        open: this.round(open, symbol),
        high: this.round(high, symbol),
        low: this.round(low, symbol),
        close: this.round(close, symbol),
        volume,
      });

      price = close;
    }

    return candles;
  }

  private round(value: number, symbol: AssetSymbol): number {
    const config = ASSET_CONFIGS[symbol];
    return Math.round(value / config.tickSize) * config.tickSize;
  }

  setManualPrices(manual: ManualPrices, useManual: boolean) {
    this.manualPrices = manual;
    this.useManual = useManual;

    const newSource: PriceSource = useManual ? 'manual' : (this.liveQuotes.size > 0 ? 'live' : 'sim');
    if (newSource !== this.currentSource) {
      this.currentSource = newSource;
      this.notifySourceListeners(newSource);
    }

    if (useManual) {
      (Object.keys(ASSET_CONFIGS) as AssetSymbol[]).forEach((symbol) => {
        const manualPrice = manual[MANUAL_KEY_MAP[symbol]];
        if (manualPrice !== null && manualPrice > 0) {
          this.applyManualPrice(symbol, manualPrice);
        }
      });
    }
  }

  private applyManualPrice(symbol: AssetSymbol, manualPrice: number) {
    const current = this.prices.get(symbol);
    if (!current) return;

    const config = ASSET_CONFIGS[symbol];
    const dayOpen = current.dayOpen || manualPrice - config.dailyAtr * 0.2;
    const change = manualPrice - dayOpen;
    const changePercent = dayOpen > 0 ? (change / dayOpen) * 100 : 0;

    const updated: PriceData = {
      ...current,
      prevPrice: current.price,
      price: this.round(manualPrice, symbol),
      change,
      changePercent,
      dayHigh: Math.max(current.dayHigh, manualPrice),
      dayLow: Math.min(current.dayLow, manualPrice),
      dayOpen,
      timestamp: Date.now(),
      source: 'manual',
    };

    this.prices.set(symbol, updated);
    this.notifyPriceListeners(symbol, updated);
  }

  private async fetchLivePrices() {
    if (this.fetchInProgress) return;
    if (Date.now() - this.lastFetchTime < 800) return;

    this.fetchInProgress = true;
    this.lastFetchTime = Date.now();

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/futures-prices`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (anonKey) {
        headers['Authorization'] = `Bearer ${anonKey}`;
        headers['apikey'] = anonKey;
      }

      const resp = await fetch(apiUrl, { headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (!json.success || !json.data) throw new Error('No success in response');

      (Object.keys(ASSET_CONFIGS) as AssetSymbol[]).forEach((symbol) => {
        const entry = json.data[symbol];
        if (entry && !entry.error && typeof entry.price === 'number') {
          const apiCandles: CandleData[] = (entry.candles || []).map((c: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }) => ({
            time: c.timestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));

          this.liveQuotes.set(symbol, {
            price: entry.price,
            prevClose: entry.prevClose,
            open: entry.open,
            dayHigh: entry.dayHigh,
            dayLow: entry.dayLow,
            volume: entry.volume,
            change: entry.change,
            changePercent: entry.changePercent,
            prevDayHigh: entry.prevDayHigh ?? entry.dayHigh,
            prevDayLow: entry.prevDayLow ?? entry.dayLow,
            candles: apiCandles,
          });

          if (apiCandles.length > 0) {
            this.apiCandles.set(symbol, apiCandles);
          }
        }
      });

      if (!this.useManual && this.liveQuotes.size > 0) {
        if (this.currentSource !== 'live') {
          this.currentSource = 'live';
          this.notifySourceListeners('live');
        }
        this.updatePricesFromLive();
      }
    } catch {
      if (!this.useManual && this.liveQuotes.size === 0) {
        if (this.currentSource !== 'sim') {
          this.currentSource = 'sim';
          this.notifySourceListeners('sim');
        }
      }
    } finally {
      this.fetchInProgress = false;
    }
  }

  private updatePricesFromLive() {
    (Object.keys(ASSET_CONFIGS) as AssetSymbol[]).forEach((symbol) => {
      const quote = this.liveQuotes.get(symbol);
      if (!quote) return;

      const current = this.prices.get(symbol);
      const newPrice: PriceData = {
        symbol,
        price: quote.price,
        prevPrice: current?.price ?? quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        dayHigh: Math.max(quote.dayHigh, current?.dayHigh ?? quote.dayHigh),
        dayLow: Math.min(quote.dayLow, current?.dayLow ?? quote.dayLow),
        dayOpen: quote.prevClose,
        volume: quote.volume,
        timestamp: Date.now(),
        source: 'live',
        prevDayHigh: quote.prevDayHigh,
        prevDayLow: quote.prevDayLow,
      };

      this.prices.set(symbol, newPrice);
      this.notifyPriceListeners(symbol, newPrice);
    });

    // Notify candle listeners with updated API data
    (Object.keys(ASSET_CONFIGS) as AssetSymbol[]).forEach((symbol) => {
      const apiCandles = this.apiCandles.get(symbol);
      if (apiCandles && apiCandles.length > 0) {
        this.candleHistory.set(symbol, apiCandles);
        this.notifyCandleListeners(symbol, apiCandles);
      }
    });
  }

  start(symbol: AssetSymbol) {
    if (this.priceIntervals.has(symbol)) return;

    this.fetchLivePrices();

    this.priceIntervals.set(
      symbol,
      setInterval(() => {
        if (this.useManual) {
          const manualPrice = this.manualPrices[MANUAL_KEY_MAP[symbol]];
          if (manualPrice !== null && manualPrice > 0) {
            const current = this.prices.get(symbol);
            if (current && current.price !== manualPrice) {
              this.applyManualPrice(symbol, manualPrice);
            }
          }
        } else {
          this.fetchLivePrices();
        }
      }, this.pollInterval),
    );

    this.candleIntervals.set(
      symbol,
      setInterval(() => this.tickCandle(symbol), CANDLE_INTERVAL),
    );
  }

  forceResync() {
    this.apiCandles.clear();
    this.liveQuotes.clear();
    this.lastFetchTime = 0;
    (Object.keys(ASSET_CONFIGS) as AssetSymbol[]).forEach((symbol) => {
      this.fetchLivePrices();
    });
  }

  stop(symbol: AssetSymbol) {
    const interval = this.priceIntervals.get(symbol);
    if (interval) {
      clearInterval(interval);
      this.priceIntervals.delete(symbol);
    }
    const candleInterval = this.candleIntervals.get(symbol);
    if (candleInterval) {
      clearInterval(candleInterval);
      this.candleIntervals.delete(symbol);
    }
  }

  stopAll() {
    (Object.keys(ASSET_CONFIGS) as AssetSymbol[]).forEach((s) => this.stop(s));
  }

  private tickCandle(symbol: AssetSymbol) {
    if (this.useManual || this.currentSource === 'sim') {
      // Only tick sim candles when not live
      const candles = this.candleHistory.get(symbol);
      if (!candles || candles.length === 0) return;

      const current = this.prices.get(symbol);
      if (!current) return;

      const lastCandle = candles[candles.length - 1];
      const candleAge = Date.now() - lastCandle.time;

      if (candleAge >= 60000) {
        const newCandle: CandleData = {
          time: Date.now(),
          open: current.price,
          high: current.price,
          low: current.price,
          close: current.price,
          volume: Math.floor(Math.random() * 3000) + 500,
        };
        candles.push(newCandle);
        if (candles.length > 120) candles.shift();
      } else {
        lastCandle.close = current.price;
        lastCandle.high = Math.max(lastCandle.high, current.price);
        lastCandle.low = Math.min(lastCandle.low, current.price);
        lastCandle.volume += Math.floor(Math.random() * 200);
      }

      this.candleHistory.set(symbol, [...candles]);
      this.notifyCandleListeners(symbol, candles);
    }
  }

  getPrice(symbol: AssetSymbol): PriceData | undefined {
    return this.prices.get(symbol);
  }

  getCandles(symbol: AssetSymbol): CandleData[] {
    return this.candleHistory.get(symbol) ?? [];
  }

  getCandlesForTimeframe(symbol: AssetSymbol, timeframe: Timeframe): CandleData[] {
    const base = this.candleHistory.get(symbol);
    if (!base || base.length === 0) return [];
    if (timeframe === '1m') return base.slice(-MAX_CANDLES_PER_TF[timeframe]);

    const tfMs = TIMEFRAME_MS[timeframe];
    const maxCount = MAX_CANDLES_PER_TF[timeframe];
    const buckets = new Map<number, CandleData[]>();

    for (const c of base) {
      const bucketTime = Math.floor(c.time / tfMs) * tfMs;
      if (!buckets.has(bucketTime)) buckets.set(bucketTime, []);
      buckets.get(bucketTime)!.push(c);
    }

    const aggregated: CandleData[] = [];
    const sortedTimes = [...buckets.keys()].sort((a, b) => a - b);
    for (const bt of sortedTimes) {
      const group = buckets.get(bt)!;
      if (group.length === 0) continue;
      const open = group[0].open;
      const close = group[group.length - 1].close;
      const high = Math.max(...group.map((c) => c.high));
      const low = Math.min(...group.map((c) => c.low));
      const volume = group.reduce((sum, c) => sum + c.volume, 0);
      aggregated.push({ time: bt, open, high, low, close, volume });
    }

    return aggregated.slice(-maxCount);
  }

  getSource(): PriceSource {
    return this.currentSource;
  }

  quickSyncPrice(symbol: AssetSymbol, price: number) {
    this.applyManualPrice(symbol, price);
  }

  subscribePrice(symbol: AssetSymbol, listener: Listener): () => void {
    if (!this.priceListeners.has(symbol)) {
      this.priceListeners.set(symbol, new Set());
    }
    this.priceListeners.get(symbol)!.add(listener);

    const current = this.prices.get(symbol);
    if (current) listener(current);

    return () => {
      this.priceListeners.get(symbol)?.delete(listener);
    };
  }

  subscribeCandles(symbol: AssetSymbol, listener: CandleListener): () => void {
    if (!this.candleListeners.has(symbol)) {
      this.candleListeners.set(symbol, new Set());
    }
    this.candleListeners.get(symbol)!.add(listener);

    const current = this.candleHistory.get(symbol);
    if (current) listener(current);

    return () => {
      this.candleListeners.get(symbol)?.delete(listener);
    };
  }

  subscribeCandlesForTimeframe(symbol: AssetSymbol, timeframe: Timeframe, listener: CandleListener): () => void {
    if (!this.candleListeners.has(symbol)) {
      this.candleListeners.set(symbol, new Set());
    }

    const wrapped = () => {
      listener(this.getCandlesForTimeframe(symbol, timeframe));
    };
    this.candleListeners.get(symbol)!.add(wrapped);

    wrapped();

    return () => {
      this.candleListeners.get(symbol)?.delete(wrapped);
    };
  }

  subscribeSource(listener: SourceListener): () => void {
    this.sourceListeners.add(listener);
    listener(this.currentSource);
    return () => { this.sourceListeners.delete(listener); };
  }

  private notifyPriceListeners(symbol: AssetSymbol, price: PriceData) {
    this.priceListeners.get(symbol)?.forEach((l) => l(price));
  }

  private notifyCandleListeners(symbol: AssetSymbol, candles: CandleData[]) {
    this.candleListeners.get(symbol)?.forEach((l) => l(candles));
  }

  private notifySourceListeners(source: PriceSource) {
    this.sourceListeners.forEach((l) => l(source));
  }
}

export const marketData = new MarketDataEngine();

export function startAllFeeds() {
  (Object.keys(ASSET_CONFIGS) as AssetSymbol[]).forEach((s) => marketData.start(s));
}

export function applyManualPrices(preferences: {
  price_source: 'live' | 'manual';
  es_manual_price: number | null;
  nq_manual_price: number | null;
}) {
  marketData.setManualPrices(
    {
      es_manual_price: preferences.es_manual_price,
      nq_manual_price: preferences.nq_manual_price,
    },
    preferences.price_source === 'manual',
  );
}

export { YAHOO_SYMBOLS };
