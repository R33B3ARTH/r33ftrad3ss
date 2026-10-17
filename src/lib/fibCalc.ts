import type { CandleData, PriceData } from './types';

export interface FibLevel {
  pct: number;
  price: number;
  color: string;
  label: string;
}

export const FIB_COLORS = {
  pct0: '#8B5CF6',
  pct236: '#10B981',
  pct50: '#06B6D4',
  pct786: '#10B981',
  pct100: '#8B5CF6',
} as const;

function roundToTick(value: number, tickSize: number): number {
  return Math.round(value / tickSize) * tickSize;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getGlobexSessionRange(
  candles: CandleData[],
  price: PriceData,
  tickSize: number,
): { pdh: number; pdl: number; range: number } {
  let pdh: number;
  let pdl: number;

  if (price.prevDayHigh > 0 && price.prevDayLow > 0) {
    pdh = roundToTick(price.prevDayHigh, tickSize);
    pdl = roundToTick(price.prevDayLow, tickSize);
  } else {
    const recent = candles.slice(-120);
    pdh = recent.length > 0 ? Math.max(...recent.map((c) => c.high)) : price.dayHigh;
    pdl = recent.length > 0 ? Math.min(...recent.map((c) => c.low)) : price.dayLow;
    pdh = roundToTick(pdh, tickSize);
    pdl = roundToTick(pdl, tickSize);
  }

  return { pdh, pdl, range: round2(pdh - pdl) };
}

export function calculateFibLevels(
  pdh: number,
  pdl: number,
  tickSize: number,
): FibLevel[] {
  const range = pdh - pdl;

  const levels = [
    { pct: 100, price: pdh, color: FIB_COLORS.pct100, label: '100% (PDH)' },
    { pct: 78.6, price: pdh - range * 0.214, color: FIB_COLORS.pct786, label: '78.6% OTE' },
    { pct: 50, price: pdl + range * 0.50, color: FIB_COLORS.pct50, label: '50% Equilibrium' },
    { pct: 23.6, price: pdl + range * 0.236, color: FIB_COLORS.pct236, label: '23.6%' },
    { pct: 0, price: pdl, color: FIB_COLORS.pct0, label: '0% (PDL)' },
  ];

  return levels.map((l) => ({
    ...l,
    price: round2(roundToTick(l.price, tickSize)),
  }));
}
