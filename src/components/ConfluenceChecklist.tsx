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

  const defaultState = '2D-Down'; // Ensure it matches HtfCandleState type ('2U-Up' | '2D-Down' | '1-Inside' | '3-Outside')

  const htfMatrix = {
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
