import type { CandleData } from './types';
import { getNytMinutes, getNytMinutesFromTimestamp, isSameNytDay } from './nytTime';

export interface SessionRange {
  high: number;
  low: number;
  open: number;
  candleCount: number;
}

export interface SessionLiquidity {
  asia: SessionRange | null;
  london: SessionRange | null;
  ny: SessionRange | null;
}

export const SESSION_COLORS = {
  asia: { high: '#ffd700', low: '#ffd700', label: 'ASH/ASL' },
  london: { high: '#0055ff', low: '#0055ff', label: 'LNH/LNL' },
  ny: { high: '#ff5500', low: '#ff5500', label: 'NYH/NYL' },
} as const;

const ASIA_START = 18 * 60;
const ASIA_END = 3 * 60;
const LONDON_START = 3 * 60;
const LONDON_END = 9 * 60 + 30;
const NY_START = 9 * 60 + 30;
const NY_END = 16 * 60 + 15;
const SESSION_RESET = 18 * 60;

export function getActiveSession(): 'asia' | 'london' | 'ny' | 'off' {
  const m = getNytMinutes();
  if (m >= ASIA_START || m < ASIA_END) return 'asia';
  if (m >= LONDON_START && m < LONDON_END) return 'london';
  if (m >= NY_START && m < NY_END) return 'ny';
  return 'off';
}

function getAdjustedNytMinutes(timestamp: number): number {
  const m = getNytMinutesFromTimestamp(timestamp);
  return m < SESSION_RESET - 12 * 60 ? m + 24 * 60 : m;
}

export function calculateSessionLiquidity(candles: CandleData[]): SessionLiquidity {
  if (candles.length === 0) {
    return { asia: null, london: null, ny: null };
  }

  const currentMinutes = getNytMinutes();
  const currentSessionStart = currentMinutes >= SESSION_RESET
    ? SESSION_RESET
    : SESSION_RESET - 24 * 60;

  const asiaCandles: CandleData[] = [];
  const londonCandles: CandleData[] = [];
  const nyCandles: CandleData[] = [];

  for (const c of candles) {
    const adjustedMin = getAdjustedNytMinutes(c.time);
    const rawMin = getNytMinutesFromTimestamp(c.time);

    if (adjustedMin < currentSessionStart && !isSameNytDay(c.time)) continue;

    const inAsia = adjustedMin >= ASIA_START || (rawMin >= 0 && rawMin < ASIA_END);
    if (inAsia) { asiaCandles.push(c); continue; }

    if (rawMin >= LONDON_START && rawMin < LONDON_END) { londonCandles.push(c); continue; }

    if (rawMin >= NY_START && rawMin < NY_END) { nyCandles.push(c); continue; }
  }

  const buildRange = (cs: CandleData[]): SessionRange | null => {
    if (cs.length === 0) return null;
    return {
      high: Math.max(...cs.map((c) => c.high)),
      low: Math.min(...cs.map((c) => c.low)),
      open: cs[0].open,
      candleCount: cs.length,
    };
  };

  return {
    asia: buildRange(asiaCandles),
    london: buildRange(londonCandles),
    ny: buildRange(nyCandles),
  };
}
