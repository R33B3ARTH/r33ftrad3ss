import type { AssetSymbol, CandleData, HtfStratMatrix } from './types';
import { ASSET_CONFIGS } from './assets';

export interface ReplaySession {
  id: string;
  label: string;
  symbol: AssetSymbol;
  date: string;
  timeLabel: string;
  pattern: string;
  context: string;
  winRate: number;
  htfMatrix: HtfStratMatrix;
  prevDayHigh: number;
  prevDayLow: number;
  fibLow: number;
  fibHigh: number;
  candles: CandleData[];
}

function generateSessionCandles(
  basePrice: number,
  dailyAtr: number,
  tickSize: number,
  startTime: number,
  count: number,
  trendBias: number,
  volatility: number,
): CandleData[] {
  const candles: CandleData[] = [];
  let price = basePrice;
  const intervalMs = 5 * 60_000;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * intervalMs;
    const open = price;
    const wave = Math.sin(i / 6) * volatility * 0.3;
    const noise = (Math.random() - 0.5) * volatility;
    const close = open + noise + wave + trendBias;
    const high = Math.max(open, close) + Math.random() * volatility * 0.4;
    const low = Math.min(open, close) - Math.random() * volatility * 0.4;

    candles.push({
      time,
      open: Math.round(open / tickSize) * tickSize,
      high: Math.round(high / tickSize) * tickSize,
      low: Math.round(low / tickSize) * tickSize,
      close: Math.round(close / tickSize) * tickSize,
      volume: Math.floor(Math.random() * 8000) + 2000,
    });

    price = close;
  }

  return candles;
}

function roundPrice(p: number, tickSize: number): number {
  return Math.round(p / tickSize) * tickSize;
}

export function generateCurrentDaySession(symbol: AssetSymbol): ReplaySession {
  const config = ASSET_CONFIGS[symbol];
  const base = config.basePrice;
  const pdh = roundPrice(base + config.dailyAtr * 0.35, config.tickSize);
  const pdl = roundPrice(base - config.dailyAtr * 0.35, config.tickSize);
  const today = new Date();
  today.setHours(9, 30, 0, 0);
  const start = today.getTime();
  const vol = symbol === 'ES' ? config.dailyAtr * 0.07 : config.dailyAtr * 0.06;
  const candles = generateSessionCandles(base, config.dailyAtr, config.tickSize, start, 54, 0.5, vol);
  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return {
    id: `${symbol.toLowerCase()}-current-day`,
    label: `Current Day ${symbol} Live Session (${dateStr})`,
    symbol,
    date: dateStr,
    timeLabel: '09:30 - 14:00 NY',
    pattern: 'Live Session Replay',
    context: 'Current Day',
    winRate: 0,
    htfMatrix: { monthly: '1-Inside', weekly: '1-Inside', daily: '1-Inside', fourHour: '1-Inside', oneHour: '1-Inside' },
    prevDayHigh: pdh,
    prevDayLow: pdl,
    fibLow: roundPrice(pdl, config.tickSize),
    fibHigh: roundPrice(pdh, config.tickSize),
    candles,
  };
}

export function generateReplaySessions(): ReplaySession[] {
  const sessions: ReplaySession[] = [];

  const esConfig = ASSET_CONFIGS.ES;
  const nqConfig = ASSET_CONFIGS.NQ;
  const esBase = esConfig.basePrice;
  const nqBase = nqConfig.basePrice;

  const mkTime = (h: number, m: number, dayOffset: number): number => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    d.setDate(d.getDate() - dayOffset);
    return d.getTime();
  };

  // Session 1: ES 2d-2u at Fib Support
  {
    const pdh = roundPrice(esBase + esConfig.dailyAtr * 0.4, esConfig.tickSize);
    const pdl = roundPrice(esBase - esConfig.dailyAtr * 0.4, esConfig.tickSize);
    const range = pdh - pdl;
    const fibLow = roundPrice(pdl, esConfig.tickSize);
    const fibHigh = roundPrice(pdh, esConfig.tickSize);
    const start = mkTime(9, 30, 71);
    const candles = generateSessionCandles(
      esBase - esConfig.dailyAtr * 0.15,
      esConfig.dailyAtr,
      esConfig.tickSize,
      start,
      54,
      -2.0,
      esConfig.dailyAtr * 0.08,
    );
    // Force a dip to Fib low around bar 20-25, then reversal
    for (let i = 18; i < 25; i++) {
      candles[i].low = roundPrice(fibLow - 2, esConfig.tickSize);
      candles[i].close = roundPrice(fibLow + 1, esConfig.tickSize);
    }
    for (let i = 25; i < 40; i++) {
      candles[i].close = roundPrice(candles[i - 1].close + 3, esConfig.tickSize);
      candles[i].high = roundPrice(candles[i].close + 2, esConfig.tickSize);
    }
    sessions.push({
      id: 'es-fib-2d2u',
      label: '2026-08-06 ES 14:45 Fib Support Tap',
      symbol: 'ES',
      date: '2026-08-06',
      timeLabel: '09:30 - 14:00 NY',
      pattern: '2d-2u Reversal',
      context: 'Fib Boundary',
      winRate: 78,
      htfMatrix: { monthly: '2U-Up', weekly: '2U-Up', daily: '2U-Up', fourHour: '2U-Up', oneHour: '2D-Down' },
      prevDayHigh: pdh,
      prevDayLow: pdl,
      fibLow,
      fibHigh,
      candles,
    });
  }

  // Session 2: ES 2u-2d at PDH Rejection
  {
    const pdh = roundPrice(esBase + esConfig.dailyAtr * 0.5, esConfig.tickSize);
    const pdl = roundPrice(esBase - esConfig.dailyAtr * 0.3, esConfig.tickSize);
    const start = mkTime(9, 30, 70);
    const candles = generateSessionCandles(
      esBase + esConfig.dailyAtr * 0.2,
      esConfig.dailyAtr,
      esConfig.tickSize,
      start,
      54,
      1.5,
      esConfig.dailyAtr * 0.07,
    );
    // Rally to PDH around bar 30-35, then reject
    for (let i = 28; i < 35; i++) {
      candles[i].high = roundPrice(pdh + 1.5, esConfig.tickSize);
      candles[i].close = roundPrice(pdh - 2, esConfig.tickSize);
    }
    for (let i = 35; i < 50; i++) {
      candles[i].close = roundPrice(candles[i - 1].close - 2.5, esConfig.tickSize);
    }
    sessions.push({
      id: 'es-pdh-2u2d',
      label: '2026-08-07 ES 10:30 2u-2d PDH Reversal',
      symbol: 'ES',
      date: '2026-08-07',
      timeLabel: '09:30 - 14:00 NY',
      pattern: '2u-2d Reversal',
      context: 'PDH Rejection',
      winRate: 74,
      htfMatrix: { monthly: '2D-Down', weekly: '2D-Down', daily: '2D-Down', fourHour: '2D-Down', oneHour: '2U-Up' },
      prevDayHigh: pdh,
      prevDayLow: pdl,
      fibLow: roundPrice(pdl, esConfig.tickSize),
      fibHigh: roundPrice(pdh, esConfig.tickSize),
      candles,
    });
  }

  // Session 3: ES Liquidity Sweep Reversal
  {
    const pdh = roundPrice(esBase + esConfig.dailyAtr * 0.3, esConfig.tickSize);
    const pdl = roundPrice(esBase - esConfig.dailyAtr * 0.5, esConfig.tickSize);
    const start = mkTime(9, 30, 68);
    const candles = generateSessionCandles(
      esBase,
      esConfig.dailyAtr,
      esConfig.tickSize,
      start,
      54,
      0.5,
      esConfig.dailyAtr * 0.09,
    );
    // Sweep session low around bar 15, then strong reversal
    for (let i = 12; i < 18; i++) {
      candles[i].low = roundPrice(pdl - 1.5, esConfig.tickSize);
      candles[i].close = roundPrice(pdl + 2, esConfig.tickSize);
    }
    for (let i = 18; i < 48; i++) {
      candles[i].close = roundPrice(candles[i - 1].close + 2.8, esConfig.tickSize);
    }
    sessions.push({
      id: 'es-liq-sweep',
      label: '2026-08-09 ES 11:15 Liquidity Sweep Reversal',
      symbol: 'ES',
      date: '2026-08-09',
      timeLabel: '09:30 - 14:00 NY',
      pattern: '2d-2u Reversal',
      context: 'Liquidity Sweep',
      winRate: 77,
      htfMatrix: { monthly: '2U-Up', weekly: '2U-Up', daily: '2U-Up', fourHour: '1-Inside', oneHour: '2D-Down' },
      prevDayHigh: pdh,
      prevDayLow: pdl,
      fibLow: roundPrice(pdl, esConfig.tickSize),
      fibHigh: roundPrice(pdh, esConfig.tickSize),
      candles,
    });
  }

  // Session 4: NQ 2d-2u at Fib Support
  {
    const pdh = roundPrice(nqBase + nqConfig.dailyAtr * 0.4, nqConfig.tickSize);
    const pdl = roundPrice(nqBase - nqConfig.dailyAtr * 0.4, nqConfig.tickSize);
    const start = mkTime(9, 30, 65);
    const candles = generateSessionCandles(
      nqBase - nqConfig.dailyAtr * 0.1,
      nqConfig.dailyAtr,
      nqConfig.tickSize,
      start,
      54,
      -8.0,
      nqConfig.dailyAtr * 0.08,
    );
    for (let i = 20; i < 28; i++) {
      candles[i].low = roundPrice(pdl - 3, nqConfig.tickSize);
      candles[i].close = roundPrice(pdl + 4, nqConfig.tickSize);
    }
    for (let i = 28; i < 48; i++) {
      candles[i].close = roundPrice(candles[i - 1].close + 12, nqConfig.tickSize);
    }
    sessions.push({
      id: 'nq-fib-2d2u',
      label: '2026-08-12 NQ 13:45 Fib Support Reversal',
      symbol: 'NQ',
      date: '2026-08-12',
      timeLabel: '09:30 - 14:00 NY',
      pattern: '2d-2u Reversal',
      context: 'Fib Boundary',
      winRate: 77,
      htfMatrix: { monthly: '2U-Up', weekly: '2U-Up', daily: '2U-Up', fourHour: '2U-Up', oneHour: '2D-Down' },
      prevDayHigh: pdh,
      prevDayLow: pdl,
      fibLow: roundPrice(pdl, nqConfig.tickSize),
      fibHigh: roundPrice(pdh, nqConfig.tickSize),
      candles,
    });
  }

  // Session 5: NQ PDH Breakout
  {
    const pdh = roundPrice(nqBase + nqConfig.dailyAtr * 0.3, nqConfig.tickSize);
    const pdl = roundPrice(nqBase - nqConfig.dailyAtr * 0.3, nqConfig.tickSize);
    const start = mkTime(9, 30, 60);
    const candles = generateSessionCandles(
      nqBase + nqConfig.dailyAtr * 0.1,
      nqConfig.dailyAtr,
      nqConfig.tickSize,
      start,
      54,
      6.0,
      nqConfig.dailyAtr * 0.07,
    );
    // Consolidate then breakout through PDH
    for (let i = 15; i < 30; i++) {
      candles[i].close = roundPrice(candles[i - 1].close + (Math.random() - 0.5) * 5, nqConfig.tickSize);
    }
    for (let i = 30; i < 50; i++) {
      candles[i].close = roundPrice(candles[i - 1].close + 15, nqConfig.tickSize);
      candles[i].high = roundPrice(candles[i].close + 8, nqConfig.tickSize);
    }
    sessions.push({
      id: 'nq-pdh-breakout',
      label: '2026-08-17 NQ 10:15 PDH Breakout Extension',
      symbol: 'NQ',
      date: '2026-08-17',
      timeLabel: '09:30 - 14:00 NY',
      pattern: 'Fib Breakout',
      context: 'PDH Breakout',
      winRate: 65,
      htfMatrix: { monthly: '2U-Up', weekly: '2U-Up', daily: '2U-Up', fourHour: '2U-Up', oneHour: '2U-Up' },
      prevDayHigh: pdh,
      prevDayLow: pdl,
      fibLow: roundPrice(pdl, nqConfig.tickSize),
      fibHigh: roundPrice(pdh, nqConfig.tickSize),
      candles,
    });
  }

  // Session 6: ES 50% Equilibrium Hold
  {
    const pdh = roundPrice(esBase + esConfig.dailyAtr * 0.35, esConfig.tickSize);
    const pdl = roundPrice(esBase - esConfig.dailyAtr * 0.35, esConfig.tickSize);
    const mid = roundPrice((pdh + pdl) / 2, esConfig.tickSize);
    const start = mkTime(9, 30, 55);
    const candles = generateSessionCandles(
      mid,
      esConfig.dailyAtr,
      esConfig.tickSize,
      start,
      54,
      0,
      esConfig.dailyAtr * 0.05,
    );
    sessions.push({
      id: 'es-eq-hold',
      label: '2026-08-22 ES 12:00 50% Equilibrium Rotation',
      symbol: 'ES',
      date: '2026-08-22',
      timeLabel: '09:30 - 14:00 NY',
      pattern: '50% Equilibrium',
      context: 'Fib Mid-Range',
      winRate: 64,
      htfMatrix: { monthly: '1-Inside', weekly: '1-Inside', daily: '1-Inside', fourHour: '1-Inside', oneHour: '1-Inside' },
      prevDayHigh: pdh,
      prevDayLow: pdl,
      fibLow: roundPrice(pdl, esConfig.tickSize),
      fibHigh: roundPrice(pdh, esConfig.tickSize),
      candles,
    });
  }

  // Session 7: ES Round Number Reversal
  {
    const pdh = roundPrice(esBase + esConfig.dailyAtr * 0.3, esConfig.tickSize);
    const pdl = roundPrice(esBase - esConfig.dailyAtr * 0.4, esConfig.tickSize);
    const roundLevel = roundPrice(Math.round(esBase / 10) * 10, esConfig.tickSize);
    const start = mkTime(9, 30, 48);
    const candles = generateSessionCandles(esBase, esConfig.dailyAtr, esConfig.tickSize, start, 54, 1.0, esConfig.dailyAtr * 0.06);
    for (let i = 22; i < 30; i++) {
      candles[i].high = roundPrice(roundLevel + 1, esConfig.tickSize);
      candles[i].close = roundPrice(roundLevel - 2, esConfig.tickSize);
    }
    for (let i = 30; i < 45; i++) {
      candles[i].close = roundPrice(candles[i - 1].close - 2, esConfig.tickSize);
    }
    sessions.push({
      id: 'es-round-rev', label: '2026-08-29 ES 10:45 Round Number Reversal', symbol: 'ES', date: '2026-08-29',
      timeLabel: '09:30 - 14:00 NY', pattern: '2u-2d Reversal', context: 'Round Number Magnet', winRate: 73,
      htfMatrix: { monthly: '2D-Down', weekly: '2D-Down', daily: '2D-Down', fourHour: '1-Inside', oneHour: '2U-Up' },
      prevDayHigh: pdh, prevDayLow: pdl, fibLow: roundPrice(pdl, esConfig.tickSize), fibHigh: roundPrice(pdh, esConfig.tickSize), candles,
    });
  }

  // Session 8: NQ Liquidity Sweep
  {
    const pdh = roundPrice(nqBase + nqConfig.dailyAtr * 0.35, nqConfig.tickSize);
    const pdl = roundPrice(nqBase - nqConfig.dailyAtr * 0.45, nqConfig.tickSize);
    const start = mkTime(9, 30, 42);
    const candles = generateSessionCandles(nqBase + nqConfig.dailyAtr * 0.1, nqConfig.dailyAtr, nqConfig.tickSize, start, 54, -3.0, nqConfig.dailyAtr * 0.09);
    for (let i = 14; i < 20; i++) {
      candles[i].low = roundPrice(pdl - 2, nqConfig.tickSize);
      candles[i].close = roundPrice(pdl + 5, nqConfig.tickSize);
    }
    for (let i = 20; i < 42; i++) {
      candles[i].close = roundPrice(candles[i - 1].close + 10, nqConfig.tickSize);
    }
    sessions.push({
      id: 'nq-liq-sweep', label: '2026-09-04 NQ 10:30 Liquidity Sweep Reversal', symbol: 'NQ', date: '2026-09-04',
      timeLabel: '09:30 - 14:00 NY', pattern: '2d-2u Reversal', context: 'Liquidity Sweep', winRate: 78,
      htfMatrix: { monthly: '2U-Up', weekly: '2U-Up', daily: '2U-Up', fourHour: '2U-Up', oneHour: '2D-Down' },
      prevDayHigh: pdh, prevDayLow: pdl, fibLow: roundPrice(pdl, nqConfig.tickSize), fibHigh: roundPrice(pdh, nqConfig.tickSize), candles,
    });
  }

  // Session 9: ES PDL Breakout
  {
    const pdh = roundPrice(esBase + esConfig.dailyAtr * 0.25, esConfig.tickSize);
    const pdl = roundPrice(esBase - esConfig.dailyAtr * 0.45, esConfig.tickSize);
    const start = mkTime(9, 30, 35);
    const candles = generateSessionCandles(esBase - esConfig.dailyAtr * 0.1, esConfig.dailyAtr, esConfig.tickSize, start, 54, -1.5, esConfig.dailyAtr * 0.06);
    for (let i = 25; i < 35; i++) {
      candles[i].close = roundPrice(candles[i - 1].close - 1.5, esConfig.tickSize);
    }
    for (let i = 35; i < 50; i++) {
      candles[i].close = roundPrice(candles[i - 1].close - 3, esConfig.tickSize);
      candles[i].low = roundPrice(candles[i].close - 2, esConfig.tickSize);
    }
    sessions.push({
      id: 'es-pdl-breakout', label: '2026-09-11 ES 13:30 PDL Breakout Extension', symbol: 'ES', date: '2026-09-11',
      timeLabel: '09:30 - 14:00 NY', pattern: 'PDL Breakout', context: 'Prev Day Low', winRate: 66,
      htfMatrix: { monthly: '2D-Down', weekly: '2D-Down', daily: '2D-Down', fourHour: '2D-Down', oneHour: '2D-Down' },
      prevDayHigh: pdh, prevDayLow: pdl, fibLow: roundPrice(pdl, esConfig.tickSize), fibHigh: roundPrice(pdh, esConfig.tickSize), candles,
    });
  }

  // Session 10: NQ 50% Equilibrium
  {
    const pdh = roundPrice(nqBase + nqConfig.dailyAtr * 0.4, nqConfig.tickSize);
    const pdl = roundPrice(nqBase - nqConfig.dailyAtr * 0.4, nqConfig.tickSize);
    const mid = roundPrice((pdh + pdl) / 2, nqConfig.tickSize);
    const start = mkTime(9, 30, 28);
    const candles = generateSessionCandles(mid, nqConfig.dailyAtr, nqConfig.tickSize, start, 54, 0, nqConfig.dailyAtr * 0.04);
    sessions.push({
      id: 'nq-eq-hold', label: '2026-09-18 NQ 11:30 50% Equilibrium Rotation', symbol: 'NQ', date: '2026-09-18',
      timeLabel: '09:30 - 14:00 NY', pattern: '50% Equilibrium', context: 'Fib Mid-Range', winRate: 62,
      htfMatrix: { monthly: '1-Inside', weekly: '1-Inside', daily: '1-Inside', fourHour: '1-Inside', oneHour: '1-Inside' },
      prevDayHigh: pdh, prevDayLow: pdl, fibLow: roundPrice(pdl, nqConfig.tickSize), fibHigh: roundPrice(pdh, nqConfig.tickSize), candles,
    });
  }

  // Session 11: ES Power Hour Reversal
  {
    const pdh = roundPrice(esBase + esConfig.dailyAtr * 0.45, esConfig.tickSize);
    const pdl = roundPrice(esBase - esConfig.dailyAtr * 0.25, esConfig.tickSize);
    const start = mkTime(9, 30, 20);
    const candles = generateSessionCandles(esBase + esConfig.dailyAtr * 0.15, esConfig.dailyAtr, esConfig.tickSize, start, 54, 2.0, esConfig.dailyAtr * 0.07);
    for (let i = 36; i < 42; i++) {
      candles[i].high = roundPrice(pdh + 1, esConfig.tickSize);
      candles[i].close = roundPrice(pdh - 1.5, esConfig.tickSize);
    }
    for (let i = 42; i < 52; i++) {
      candles[i].close = roundPrice(candles[i - 1].close - 2, esConfig.tickSize);
    }
    sessions.push({
      id: 'es-power-hour', label: '2026-09-26 ES 13:45 Power Hour Reversal', symbol: 'ES', date: '2026-09-26',
      timeLabel: '09:30 - 14:00 NY', pattern: '2u-2d Reversal', context: 'PDH Rejection', winRate: 74,
      htfMatrix: { monthly: '2D-Down', weekly: '2D-Down', daily: '2D-Down', fourHour: '2D-Down', oneHour: '2U-Up' },
      prevDayHigh: pdh, prevDayLow: pdl, fibLow: roundPrice(pdl, esConfig.tickSize), fibHigh: roundPrice(pdh, esConfig.tickSize), candles,
    });
  }

  // Session 12: NQ Round Number Reversal
  {
    const pdh = roundPrice(nqBase + nqConfig.dailyAtr * 0.3, nqConfig.tickSize);
    const pdl = roundPrice(nqBase - nqConfig.dailyAtr * 0.35, nqConfig.tickSize);
    const roundLevel = roundPrice(Math.round(nqBase / 50) * 50, nqConfig.tickSize);
    const start = mkTime(9, 30, 12);
    const candles = generateSessionCandles(nqBase + nqConfig.dailyAtr * 0.08, nqConfig.dailyAtr, nqConfig.tickSize, start, 54, -4.0, nqConfig.dailyAtr * 0.06);
    for (let i = 24; i < 32; i++) {
      candles[i].low = roundPrice(roundLevel - 3, nqConfig.tickSize);
      candles[i].close = roundPrice(roundLevel + 4, nqConfig.tickSize);
    }
    for (let i = 32; i < 48; i++) {
      candles[i].close = roundPrice(candles[i - 1].close + 8, nqConfig.tickSize);
    }
    sessions.push({
      id: 'nq-round-rev', label: '2026-10-04 NQ 12:15 Round Number Reversal', symbol: 'NQ', date: '2026-10-04',
      timeLabel: '09:30 - 14:00 NY', pattern: '2d-2u Reversal', context: 'Round Number Magnet', winRate: 71,
      htfMatrix: { monthly: '2U-Up', weekly: '2U-Up', daily: '2U-Up', fourHour: '1-Inside', oneHour: '2D-Down' },
      prevDayHigh: pdh, prevDayLow: pdl, fibLow: roundPrice(pdl, nqConfig.tickSize), fibHigh: roundPrice(pdh, nqConfig.tickSize), candles,
    });
  }

  return sessions;
}
