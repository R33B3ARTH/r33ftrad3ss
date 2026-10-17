import type { CandleData, PriceData } from './types';

export interface FvgZone {
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  index: number;
  timeframe: string;
}

export interface OrderBlock {
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  index: number;
}

export interface IctDetection {
  fvg5m: FvgZone | null;
  fvg15m: FvgZone | null;
  orderBlock: OrderBlock | null;
  priceInFvg: boolean;
  priceNearOb: boolean;
  arrayProximity: string;
  arrayDescription: string;
}

export function detectFvgs(candles: CandleData[], timeframe: string): FvgZone[] {
  const fvgs: FvgZone[] = [];
  if (candles.length < 3) return fvgs;

  for (let i = 2; i < candles.length; i++) {
    const twoBack = candles[i - 2];
    const current = candles[i];

    if (twoBack.high < current.low) {
      fvgs.push({
        type: 'bullish',
        top: current.low,
        bottom: twoBack.high,
        index: i,
        timeframe,
      });
    }
    if (twoBack.low > current.high) {
      fvgs.push({
        type: 'bearish',
        top: twoBack.low,
        bottom: current.high,
        index: i,
        timeframe,
      });
    }
  }
  return fvgs;
}

export function detectOrderBlocks(candles: CandleData[]): OrderBlock[] {
  const obs: OrderBlock[] = [];
  if (candles.length < 3) return obs;

  for (let i = 1; i < candles.length - 1; i++) {
    const curr = candles[i];
    const next = candles[i + 1];

    if (curr.close < curr.open && next.close > curr.high) {
      obs.push({ type: 'bullish', top: curr.high, bottom: curr.low, index: i });
    }
    if (curr.close > curr.open && next.close < curr.low) {
      obs.push({ type: 'bearish', top: curr.high, bottom: curr.low, index: i });
    }
  }
  return obs;
}

function isPriceInZone(price: number, zone: { top: number; bottom: number }): boolean {
  return price >= zone.bottom && price <= zone.top;
}

function isPriceNearZone(
  price: number,
  zone: { top: number; bottom: number },
  threshold: number,
): boolean {
  const distTop = Math.abs(price - zone.top);
  const distBottom = Math.abs(price - zone.bottom);
  return distTop < threshold || distBottom < threshold;
}

export function detectIctArrays(
  candles5m: CandleData[],
  candles15m: CandleData[],
  price: PriceData,
  tickSize: number,
): IctDetection {
  const fvg5mList = detectFvgs(candles5m, '5m');
  const fvg15mList = detectFvgs(candles15m, '15m');
  const obList = detectOrderBlocks(candles5m);

  const recentFvg5m = fvg5mList.length > 0 ? fvg5mList[fvg5mList.length - 1] : null;
  const recentFvg15m = fvg15mList.length > 0 ? fvg15mList[fvg15mList.length - 1] : null;
  const recentOb = obList.length > 0 ? obList[obList.length - 1] : null;

  const proximityThreshold = tickSize * 8;

  const inFvg5m = recentFvg5m !== null && isPriceInZone(price.price, recentFvg5m);
  const inFvg15m = recentFvg15m !== null && isPriceInZone(price.price, recentFvg15m);
  const nearFvg5m = recentFvg5m !== null && isPriceNearZone(price.price, recentFvg5m, proximityThreshold);
  const nearFvg15m = recentFvg15m !== null && isPriceNearZone(price.price, recentFvg15m, proximityThreshold);
  const nearOb = recentOb !== null && isPriceNearZone(price.price, recentOb, proximityThreshold);

  const priceInFvg = inFvg5m || inFvg15m;
  const priceNearOb = nearOb;

  let arrayProximity = 'None';
  let arrayDescription = 'No active ICT array detected near current price';

  if (inFvg5m) {
    arrayProximity = 'FVG 5m';
    arrayDescription = `Price trading inside 5m ${recentFvg5m!.type} FVG — imbalance zone active`;
  } else if (inFvg15m) {
    arrayProximity = 'FVG 15m';
    arrayDescription = `Price trading inside 15m ${recentFvg15m!.type} FVG — imbalance zone active`;
  } else if (nearFvg5m) {
    arrayProximity = 'FVG 5m';
    arrayDescription = `Price adjacent to 5m ${recentFvg5m!.type} FVG — watch for retest`;
  } else if (nearFvg15m) {
    arrayProximity = 'FVG 15m';
    arrayDescription = `Price adjacent to 15m ${recentFvg15m!.type} FVG — watch for retest`;
  } else if (nearOb) {
    arrayProximity = 'Order Block';
    arrayDescription = `Price testing ${recentOb!.type} order block — reaction zone`;
  }

  return {
    fvg5m: recentFvg5m,
    fvg15m: recentFvg15m,
    orderBlock: recentOb,
    priceInFvg,
    priceNearOb,
    arrayProximity,
    arrayDescription,
  };
}
