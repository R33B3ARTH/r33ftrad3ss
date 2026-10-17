import type { AssetSymbol, PriceData, CandleData, AutomatedDetection, HtfStratMatrix } from './types';
import { ASSET_CONFIGS } from './assets';
import { marketData } from './marketData';
import { detectHtfMatrix, analyzeFtc, detect15mStratPattern, detectTimeframeCandleState } from './stratDetector';
import { detectIctArrays } from './ictDetector';

export function computeAutomatedDetection(
  symbol: AssetSymbol,
  price: PriceData,
  candles: CandleData[],
): AutomatedDetection {
  const config = ASSET_CONFIGS[symbol];

  const htfMatrix: HtfStratMatrix = detectHtfMatrix(symbol);
  const ftc = analyzeFtc(htfMatrix);
  const fifteenMsState = detectTimeframeCandleState(symbol, '15m');
  const stratPattern = detect15mStratPattern(
    marketData.getCandlesForTimeframe(symbol, '15m'),
  );

  const candles15m = marketData.getCandlesForTimeframe(symbol, '15m');
  const ict = detectIctArrays(candles15m, candles15m, price, config.tickSize);

  return {
    htfMatrix,
    ftcAlignment: ftc.alignment,
    ftcActive: ftc.ftcActive,
    fifteenMsState,
    stratPattern: stratPattern.pattern,
    isBullish2d2u: stratPattern.isBullish2d2u,
    isBearish2u2d: stratPattern.isBearish2u2d,
    ictArray: ict.arrayProximity,
    ictDescription: ict.arrayDescription,
    priceInFvg: ict.priceInFvg,
    priceNearOb: ict.priceNearOb,
  };
}
