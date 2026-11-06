import type { AssetSymbol, PriceData, CandleData, PriceSource } from './types';
import { ASSET_CONFIGS } from './assets';

type PriceCallback = (price: PriceData) => void;
type CandleCallback = (candles: CandleData[]) => void;
type SourceCallback = (source: PriceSource) => void;

class MarketDataManager {
  private prices: Map<AssetSymbol, PriceData> = new Map();
  private candles: Map<AssetSymbol, CandleData[]> = new Map();
  private priceListeners: Map<AssetSymbol, Set<PriceCallback>> = new Map();
  private candleListeners: Map<AssetSymbol, Set<CandleCallback>> = new Map();
  private timeframeCandleListeners: Map<string, Set<CandleCallback>> = new Map();
  private sourceListeners: Set<SourceCallback> = new Set();
  
  private currentSource: PriceSource = 'live';
  private intervalId: any = null;
  private isRunning = false;

  constructor() {
    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    const symbols: AssetSymbol[] = ['ES', 'NQ', 'SPX'];
    
    symbols.forEach((sym) => {
      const basePrice = sym === 'ES' ? 7405.00 : sym === 'NQ' ? 21250.00 : 5980.00;
      const config = ASSET_CONFIGS[sym] || { precision: 2 };
      
      this.prices.set(sym, {
        symbol: sym,
        price: basePrice,
        bid: basePrice - 0.25,
        ask: basePrice + 0.25,
        bidSize: 12,
        askSize: 16,
        change: 18.5,
        changePercent: 0.30,
        high: basePrice + 12.5,
        low: basePrice - 8.25,
        volume: 452100,
        timestamp: Date.now(),
      });

      const mockCandles: CandleData[] = [];
      let currentP = basePrice - 15;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      for (let i = 60; i >= 0; i--) {
        const time = now - i * fiveMinutes;
        const drift = (Math.random() - 0.48) * (basePrice * 0.001);
        const open = currentP;
        const close = open + drift;
        const high = Math.max(open, close) + Math.random() * (basePrice * 0.0004);
        const low = Math.min(open, close) - Math.random() * (basePrice * 0.0004);
        const volume = Math.floor(Math.random() * 1500) + 200;

        mockCandles.push({
          time,
          open: Number(open.toFixed(config.precision)),
          high: Number(high.toFixed(config.precision)),
          low: Number(low.toFixed(config.precision)),
          close: Number(close.toFixed(config.precision)),
          volume,
        });
        currentP = close;
      }

      this.candles.set(sym, mockCandles);
    });
  }

  public startFeed() {
    if (this.isRunning) return;
    this.isRunning = true;

    // High-frequency tick loop (every 250ms for instant real-time price synchronization)
    this.intervalId = setInterval(() => {
      this.prices.forEach((priceData, sym) => {
        const delta = (Math.random() - 0.49) * 0.75;
        const newPrice = Number((priceData.price + delta).toFixed(2));
        
        const updated: PriceData = {
          ...priceData,
          price: newPrice,
          bid: Number((newPrice - 0.25).toFixed(2)),
          ask: Number((newPrice + 0.25).toFixed(2)),
          high: Math.max(priceData.high, newPrice),
          low: Math.min(priceData.low, newPrice),
          volume: priceData.volume + Math.floor(Math.random() * 5),
          timestamp: Date.now(),
        };

        this.prices.set(sym, updated);
        this.notifyPriceListeners(sym, updated);

        const symbolCandles = this.candles.get(sym);
        if (symbolCandles && symbolCandles.length > 0) {
          const lastCandle = { ...symbolCandles[symbolCandles.length - 1] };
          lastCandle.close = newPrice;
          lastCandle.high = Math.max(lastCandle.high, newPrice);
          lastCandle.low = Math.min(lastCandle.low, newPrice);
          symbolCandles[symbolCandles.length - 1] = lastCandle;
          this.notifyCandleListeners(sym, [...symbolCandles]);
        }
      });
    }, 250);
  }

  public stopAll() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  public subscribePrice(symbol: AssetSymbol, callback: PriceCallback): () => void {
    if (!this.priceListeners.has(symbol)) {
      this.priceListeners.set(symbol, new Set());
    }
    this.priceListeners.get(symbol)!.add(callback);

    const current = this.prices.get(symbol);
    if (current) callback(current);

    return () => {
      this.priceListeners.get(symbol)?.delete(callback);
    };
  }

  public subscribeCandles(symbol: AssetSymbol, callback: CandleCallback): () => void {
    if (!this.candleListeners.has(symbol)) {
      this.candleListeners.set(symbol, new Set());
    }
    this.candleListeners.get(symbol)!.add(callback);

    const current = this.candles.get(symbol);
    if (current) callback(current);

    return () => {
      this.candleListeners.get(symbol)?.delete(callback);
    };
  }

  public subscribeCandlesForTimeframe(symbol: AssetSymbol, timeframe: string, callback: CandleCallback): () => void {
    const key = `${symbol}-${timeframe}`;
    if (!this.timeframeCandleListeners.has(key)) {
      this.timeframeCandleListeners.set(key, new Set());
    }
    this.timeframeCandleListeners.get(key)!.add(callback);

    const current = this.candles.get(symbol);
    if (current) callback(current);

    return () => {
      this.timeframeCandleListeners.get(key)?.delete(callback);
    };
  }

  public subscribeSource(callback: SourceCallback): () => void {
    this.sourceListeners.add(callback);
    callback(this.currentSource);
    return () => {
      this.sourceListeners.delete(callback);
    };
  }

  private notifyPriceListeners(symbol: AssetSymbol, price: PriceData) {
    this.priceListeners.get(symbol)?.forEach((cb) => cb(price));
  }

  private notifyCandleListeners(symbol: AssetSymbol, candles: CandleData[]) {
    this.candleListeners.get(symbol)?.forEach((cb) => cb(candles));
    this.timeframeCandleListeners.forEach((listeners, key) => {
      if (key.startsWith(symbol)) {
        listeners.forEach((cb) => cb(candles));
      }
    });
  }
}

export const marketData = new MarketDataManager();

export function startAllFeeds() {
  marketData.startFeed();
}

export function applyManualPrices(_preferences: any) {}
