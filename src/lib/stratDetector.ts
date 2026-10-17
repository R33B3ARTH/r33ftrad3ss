import type { CandleData, HtfCandleState, HtfStratMatrix, FtcAlignment, AssetSymbol } from './types';
import { marketData, type Timeframe } from './marketData';
import { ASSET_CONFIGS } from './assets';

export function classifyCandlePair(curr: CandleData, prev: CandleData): HtfCandleState {
  const highBreak = curr.high > prev.high;
  const lowBreak = curr.low < prev.low;

  if (highBreak && lowBreak) return '3-Outside';
  if (highBreak && !lowBreak) return '2U-Up';
  if (!highBreak && lowBreak) return '2D-Down';
  return '1-Inside';
}

export function detectCandleState(candles: CandleData[]): HtfCandleState {
  if (candles.length < 2) return '1-Inside';
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  return classifyCandlePair(curr, prev);
}

/**
 * Algorithmically compute candle state for a given set of OHLC candles
 * representing a single timeframe's recent bars. Uses the last two completed
 * candles to determine 1-Inside / 2U-Up / 2D-Down / 3-Outside.
 */
export function computeCandleState(candles: CandleData[]): HtfCandleState {
  return detectCandleState(candles);
}

/**
 * Generate synthetic HTF candles from the session's 5m candles by aggregating
 * into the target timeframe. Used for replay sessions that don't have live
 * market data feeds.
 */
export function aggregateCandlesToTimeframe(candles: CandleData[], tfMs: number): CandleData[] {
  if (candles.length === 0) return [];
  const buckets = new Map<number, CandleData[]>();
  for (const c of candles) {
    const bucketTime = Math.floor(c.time / tfMs) * tfMs;
    if (!buckets.has(bucketTime)) buckets.set(bucketTime, []);
    buckets.get(bucketTime)!.push(c);
  }
  const result: CandleData[] = [];
  const sortedTimes = [...buckets.keys()].sort((a, b) => a - b);
  for (const bt of sortedTimes) {
    const group = buckets.get(bt)!;
    if (group.length === 0) continue;
    result.push({
      time: bt,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

const TF_MS: Record<Timeframe, number> = {
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

const MONTHLY_MS = 30 * 86_400_000;
const WEEKLY_MS = 7 * 86_400_000;

/**
 * Compute the full 5-timeframe HTF STRAT Matrix algorithmically from
 * a set of base candles (typically 5m session candles for replay, or
 * live 1m candles for real-time). Aggregates into Monthly, Weekly, Daily,
 * 4H, and 1H timeframes and classifies candle state for each.
 */
export function computeHtfMatrixFromCandles(candles: CandleData[]): HtfStratMatrix {
  const monthly = computeCandleState(aggregateCandlesToTimeframe(candles, MONTHLY_MS));
  const weekly = computeCandleState(aggregateCandlesToTimeframe(candles, WEEKLY_MS));
  const daily = computeCandleState(aggregateCandlesToTimeframe(candles, TF_MS['1D']));
  const fourHour = computeCandleState(aggregateCandlesToTimeframe(candles, TF_MS['4h']));
  const oneHour = computeCandleState(aggregateCandlesToTimeframe(candles, TF_MS['1h']));
  return { monthly, weekly, daily, fourHour, oneHour };
}

export function detectHtfMatrix(symbol: AssetSymbol): HtfStratMatrix {
  const monthly = detectCandleState(aggregateCandlesToTimeframe(
    marketData.getCandles(symbol), MONTHLY_MS));
  const weekly = detectCandleState(aggregateCandlesToTimeframe(
    marketData.getCandles(symbol), WEEKLY_MS));
  const daily = detectCandleState(marketData.getCandlesForTimeframe(symbol, '1D'));
  const fourHour = detectCandleState(marketData.getCandlesForTimeframe(symbol, '4h'));
  const oneHour = detectCandleState(marketData.getCandlesForTimeframe(symbol, '1h'));
  return { monthly, weekly, daily, fourHour, oneHour };
}

export function analyzeFtc(matrix: HtfStratMatrix): { alignment: FtcAlignment; ftcActive: boolean } {
  const allStates = [matrix.monthly, matrix.weekly, matrix.daily, matrix.fourHour, matrix.oneHour];
  const allBullish = allStates.every((s) => s === '2U-Up');
  const allBearish = allStates.every((s) => s === '2D-Down');

  if (allBullish) return { alignment: 'bullish', ftcActive: true };
  if (allBearish) return { alignment: 'bearish', ftcActive: true };

  const bullCount = allStates.filter((s) => s === '2U-Up' || s === '3-Outside').length;
  const bearCount = allStates.filter((s) => s === '2D-Down' || s === '3-Outside').length;

  if (bullCount >= 3 && bearCount === 0) return { alignment: 'bullish', ftcActive: false };
  if (bearCount >= 3 && bullCount === 0) return { alignment: 'bearish', ftcActive: false };
  return { alignment: 'mixed', ftcActive: false };
}

/**
 * Check if Monthly or Weekly is in strong directional continuation.
 * Returns the macro direction and whether it's a strong continuation.
 */
export function getMacroBias(matrix: HtfStratMatrix): {
  direction: 'bullish' | 'bearish' | 'neutral';
  strongContinuation: boolean;
} {
  const bullStates: HtfCandleState[] = ['2U-Up', '3-Outside'];
  const bearStates: HtfCandleState[] = ['2D-Down', '3-Outside'];

  const monthlyBull = bullStates.includes(matrix.monthly);
  const monthlyBear = bearStates.includes(matrix.monthly);
  const weeklyBull = bullStates.includes(matrix.weekly);
  const weeklyBear = bearStates.includes(matrix.weekly);

  if (monthlyBull && weeklyBull) return { direction: 'bullish', strongContinuation: true };
  if (monthlyBear && weeklyBear) return { direction: 'bearish', strongContinuation: true };
  if (monthlyBull || weeklyBull) return { direction: 'bullish', strongContinuation: false };
  if (monthlyBear || weeklyBear) return { direction: 'bearish', strongContinuation: false };
  return { direction: 'neutral', strongContinuation: false };
}

/**
 * Detect Strat 2d-2u / 2u-2d reversal pattern on 15-minute candles.
 */
export function detect15mStratPattern(candles: CandleData[]): {
  pattern: string;
  isBullish2d2u: boolean;
  isBearish2u2d: boolean;
} {
  if (candles.length < 4) {
    return { pattern: 'Insufficient Data', isBullish2d2u: false, isBearish2u2d: false };
  }
  const recent = candles.slice(-4);
  const [c1, c2, c3, c4] = recent;
  const d1 = c2.close < c1.open;
  const d2 = c3.close < c2.open;
  const u1 = c2.close > c1.open;
  const u2 = c3.close > c2.open;
  const isBullish2d2u = d1 && d2 && c4.close > c3.open;
  const isBearish2u2d = u1 && u2 && c4.close < c3.open;
  return {
    pattern: isBullish2d2u
      ? '2d-2u Bullish Reversal'
      : isBearish2u2d
        ? '2u-2d Bearish Reversal'
        : 'No Strat Reversal',
    isBullish2d2u,
    isBearish2u2d,
  };
}

/**
 * Detect Strat 2d-2u / 2u-2d reversal pattern on 5m candles (legacy).
 */
export function detect5mStratPattern(candles: CandleData[]): {
  pattern: string;
  isBullish2d2u: boolean;
  isBearish2u2d: boolean;
} {
  return detect15mStratPattern(candles);
}

export function detectTimeframeCandleState(
  symbol: AssetSymbol,
  tf: Timeframe,
): HtfCandleState {
  return detectCandleState(marketData.getCandlesForTimeframe(symbol, tf));
}

/**
 * Detect 15m candle state from session candles (for replay mode).
 */
export function detect15mCandleState(candles: CandleData[]): HtfCandleState {
  const aggregated = aggregateCandlesToTimeframe(candles, TF_MS['15m']);
  return detectCandleState(aggregated);
}
