import type { CandleData } from './types';

export function generateHybridHeikinAshiCandles(
  esCandles: CandleData[],
  spxCandles: CandleData[]
): CandleData[] {
  if (!esCandles || esCandles.length === 0) return [];

  let offset = 0;
  if (spxCandles && spxCandles.length > 0) {
    const lastSpx = spxCandles[spxCandles.length - 1];
    const matchingEs = esCandles.find(c => Math.abs(c.time - lastSpx.time) < 120000);
    if (matchingEs) {
      offset = lastSpx.close - matchingEs.close;
    }
  }

  const rawHybridCandles: CandleData[] = esCandles.map(es => {
    const spxMatch = spxCandles?.find(s => Math.abs(s.time - es.time) < 60000);

    if (spxMatch) {
      return {
        time: es.time,
        open: spxMatch.open,
        high: spxMatch.high,
        low: spxMatch.low,
        close: spxMatch.close,
        volume: es.volume
      };
    } else {
      return {
        time: es.time,
        open: es.open + offset,
        high: es.high + offset,
        low: es.low + offset,
        close: es.close + offset,
        volume: es.volume
      };
    }
  });

  const haCandles: CandleData[] = [];
  for (let i = 0; i < rawHybridCandles.length; i++) {
    const current = rawHybridCandles[i];
    const haClose = (current.open + current.high + current.low + current.close) / 4;
    let haOpen: number;

    if (i === 0) {
      haOpen = (current.open + current.close) / 2;
    } else {
      const prevHa = haCandles[i - 1];
      haOpen = (prevHa.open + prevHa.close) / 2;
    }

    const haHigh = Math.max(current.high, haOpen, haClose);
    const haLow = Math.min(current.low, haOpen, haClose);

    haCandles.push({
      time: current.time,
      open: Number(haOpen.toFixed(2)),
      high: Number(haHigh.toFixed(2)),
      low: Number(haLow.toFixed(2)),
      close: Number(haClose.toFixed(2)),
      volume: current.volume
    });
  }

  return haCandles;
}
