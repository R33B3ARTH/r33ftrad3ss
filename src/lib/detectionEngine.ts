
import type { AssetSymbol, PriceData, CandleData, AutomatedDetection, HtfStratMatrix, HtfCandleState } from './types';

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

function getStratForCandles(candles: CandleData[]): HtfCandleState {
  if (!candles || candles.length < 2) return '2D-Down';
  const raw = classifyStratCandle(candles[candles.length - 1], candles[candles.length - 2]);
  if (raw === '2-Up') return '2U-Up';
  if (raw === '2-Down') return '2D-Down';
  return raw as HtfCandleState;
}

export function computeAutomatedDetection(
  _symbol: AssetSymbol,
  _price: PriceData,
  candles: CandleData[]
): AutomatedDetection {
  const len = candles.length;
  const dailyCandles = candles;
  const h4Candles = len > 4 ? candles.filter((_, i) => i % 4 === 0) : candles;
  const h1Candles = len > 12 ? candles.filter((_, i) => i % 2 === 0) : candles;
  const weeklyCandles = len > 20 ? candles.filter((_, i) => i % 5 === 0) : candles;
  const monthlyCandles = len > 50 ? candles.filter((_, i) => i % 10 === 0) : candles;

  const defaultState: HtfCandleState = '2D-Down';

  const htfMatrix: HtfStratMatrix = {
    monthly: getStratForCandles(monthlyCandles) || defaultState,
    weekly: getStratForCandles(weeklyCandles) || defaultState,
    daily: getStratForCandles(dailyCandles) || defaultState,
    fourHour: getStratForCandles(h4Candles) || defaultState,
    oneHour: getStratForCandles(h1Candles) || defaultState,
  };

  const currentStrat = htfMatrix.daily;
  const isBullish = currentStrat.includes('Up');

  return {
    htfMatrix,
    ftcActive: false,
    ftcAlignment: isBullish ? 'bullish' : 'bearish',
    isBullish2d2u: isBullish,
    isBearish2u2d: !isBullish,
    fifteenMsState: defaultState,
    stratPattern: isBullish ? '2D-2U Reversal' : '2U-2D Reversal',
    ictArray: 'None',
    ictDescription: '',
    priceInFvg: false,
    priceNearOb: false,
    signal: isBullish ? 'LONG' : 'SHORT',
    confidence: 75,
    target: 20,
    stopLoss: 8,
  };
}
