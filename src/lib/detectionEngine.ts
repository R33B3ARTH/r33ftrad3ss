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

export function computeAutomatedDetection(
  _symbol: AssetSymbol,
  _price: PriceData,
  candles: CandleData[]
): AutomatedDetection {
  // Build a realistic default HTF matrix structure using Strat classification
  const defaultStrat = candles.length >= 2 
    ? classifyStratCandle(candles[candles.length - 1], candles[candles.length - 2]) 
    : '2-Down';

  const htfMatrix: HtfMatrix = {
    monthly: defaultStrat,
    weekly: defaultStrat,
    daily: defaultStrat,
    '4-hour': defaultStrat,
    '1-hour': defaultStrat,
  };

  return {
    htfMatrix,
    signal: defaultStrat.includes('Up') ? 'LONG' : defaultStrat.includes('Down') ? 'SHORT' : 'NEUTRAL',
    confidence: 75,
    target: 20,
    stopLoss: 8,
  };
}
