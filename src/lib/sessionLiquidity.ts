import type { CandleData } from './types';

export interface SessionRange {
  high: number;
  low: number;
}

export interface SessionLiquidityResult {
  asia: SessionRange | null;
  london: SessionRange | null;
  ny: SessionRange | null;
}

export const SESSION_COLORS = {
  asia: { high: '#3b82f6', low: '#3b82f6' },   // Blue
  london: { high: '#eab308', low: '#eab308' }, // Yellow
  ny: { high: '#ec4899', low: '#ec4899' },     // Pink
};

export function getActiveSession(): 'asia' | 'london' | 'ny' | 'closed' {
  const now = new Date();
  // Convert to NY time representation or use UTC hour checks
  const nyHours = Number(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  const nyMinutes = Number(now.toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric' }));
  const timeVal = nyHours + nyMinutes / 60;

  // Asia: 18:00 - 03:00 NY (spanning midnight)
  if (timeVal >= 18.0 || timeVal < 3.0) return 'asia';
  // London: 03:00 - 09:30 NY
  if (timeVal >= 3.0 && timeVal < 9.5) return 'london';
  // NY RTH: 09:30 - 16:15 NY
  if (timeVal >= 9.5 && timeVal < 16.25) return 'ny';

  return 'closed';
}

export function calculateSessionLiquidity(candles: CandleData[]): SessionLiquidityResult {
  if (!candles || candles.length === 0) {
    return { asia: null, london: null, ny: null };
  }

  // Get the latest candle date to isolate today's trading session
  const latestCandle = candles[candles.length - 1];
  const latestDate = new Date(latestCandle.time);
  
  // Filter candles belonging strictly to today / current session cycle (starting from Asia 18:00 previous day or current day)
  const todaysCandles = candles.filter(c => {
    const cDate = new Date(c.time);
    // Ensure we are looking at candles within the last 24-30 hours max to prevent old historical bleeding
    const diffHours = (latestDate.getTime() - cDate.getTime()) / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours <= 24;
  });

  const asiaCandles: CandleData[] = [];
  const londonCandles: CandleData[] = [];
  const nyCandles: CandleData[] = [];

  todaysCandles.forEach(c => {
    const date = new Date(c.time);
    const nyHour = Number(date.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
    const nyMin = Number(date.toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric' }));
    const timeVal = nyHour + nyMin / 60;

    // Categorize precisely into session time windows
    if (timeVal >= 18.0 || timeVal < 3.0) {
      asiaCandles.push(c);
    } else if (timeVal >= 3.0 && timeVal < 9.5) {
      londonCandles.push(c);
    } else if (timeVal >= 9.5 && timeVal <= 16.25) {
      nyCandles.push(c);
    }
  });

  const getRange = (arr: CandleData[]): SessionRange | null => {
    if (arr.length === 0) return null;
    let high = -Infinity;
    let low = Infinity;
    arr.forEach(c => {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    });
    return { high, low };
  };

  return {
    asia: getRange(asiaCandles),
    london: getRange(londonCandles),
    ny: getRange(nyCandles),
  };
}
