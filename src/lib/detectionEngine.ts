import type { AssetSymbol, PriceData, CandleData, AutomatedDetection, HtfMatrix } from './types';

export function classifyStratCandle(current: CandleData, prev: CandleData): '1-Inside' | '2-Up' | '2-Down' | '3-Outside' {
  if (!prev) return '2-Down';

  const inside = current.high <= prev.high && current.low >= prev.low;
  const outside = current.high > prev.high && current.low < prev.low;
  const up = current.high > prev.high && current.low >= prev.low;
  const down = current.low < prev.low && current.high <= prev.high;

  if (inside) return '1-Inside';
  if (outside) return '3-Outside';
  if (up) return '2-Up';
  if (down) return '2-Down';

  // Default fallback if overlapping extremes
  return current.close >= current.open ? '2-Up' : '2-Down';
}

// Helper to evaluate strat state from a subset of candles representing a timeframe
function getStratForCandles(candles: CandleData[]): '1-Inside' | '2-Up' | '2-Down' | '3-Outside' {
  if (!candles || candles.length < 2) return '2-Down';
  return classifyStratCandle(candles[candles.length - 1], candles[candles.length - 2]);
}

export function computeAutomatedDetection(
  _symbol: AssetSymbol,
  _price: PriceData,
  candles: CandleData[]
): AutomatedDetection {
  // Slice candles to simulate multi-timeframe perspective if full array is present
  const len = candles.length;
  const dailyCandles = candles;
  const h4Candles = len > 4 ? candles.filter((_, i) => i % 4 === 0) : candles;
  const h1Candles = len > 12 ? candles.filter((_, i) => i % 2 === 0) : candles;
  const weeklyCandles = len > 20 ? candles.filter((_, i) => i % 5 === 0) : candles;
  const monthlyCandles = len > 50 ? candles.filter((_, i) => i % 10 === 0) : candles;

  const htfMatrix: HtfMatrix = {
    monthly: getStratForCandles(monthlyCandles),
    weekly: getStratForCandles(weeklyCandles),
    daily: getStratForCandles(dailyCandles),
    '4-hour': getStratForCandles(h4Candles),
    '1-hour': getStratForCandles(h1Candles),
  };

  const currentStrat = htfMatrix.daily;

  return {
    htfMatrix,
    signal: currentStrat.includes('Up') ? 'LONG' : currentStrat.includes('Down') ? 'SHORT' : 'NEUTRAL',
    confidence: 75,
    target: 20,
    stopLoss: 8,
  };
}
