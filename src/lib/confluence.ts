import type {
  AssetSymbol,
  PriceData,
  CandleData,
  ConfluenceResult,
  ProbabilityResult,
  ProbabilityFactor,
  HtfStratMatrix,
  HtfCandleState,
  FtcAlignment,
  AtrBracket,
  OvernightEquilibrium,
  MaeGuardrail,
} from './types';
import { ASSET_CONFIGS, MAE_GUARDRAILS } from './assets';
import { getNytMinutes, getNytMinutesFromTimestamp } from './nytTime';
import { getMacroBias } from './stratDetector';

const TENSION_TRIGGER = 2.5;
const MACRO_GATE_TENSION_OVERRIDE = 3.0;

const FIB_SUPPORT_LEVELS = [0, 23.6, 50];
const FIB_RESISTANCE_LEVELS = [100, 78.6, 50];

const EDGE_WINDOWS = [
  { start: 9 * 60 + 45, end: 10 * 60 + 30, label: 'AM Reversal Window', winRate: 78 },
  { start: 13 * 60 + 30, end: 14 * 60, label: 'Power Hour Reversal', winRate: 74 },
];

const TIME_BOOST = 15;

function getEstMinutes(): number {
  return getNytMinutes();
}

function isEdgeWindowActive(): boolean {
  const m = getEstMinutes();
  return EDGE_WINDOWS.some((w) => m >= w.start && m < w.end);
}

function getFibPosition(price: PriceData): { level: number; distance: number } {
  const fibHigh = price.prevDayHigh > 0 ? price.prevDayHigh : price.dayHigh;
  const fibLow = price.prevDayLow > 0 ? price.prevDayLow : price.dayLow;
  const range = fibHigh - fibLow;
  if (range === 0) return { level: 50, distance: 0 };
  const position = ((price.price - fibLow) / range) * 100;
  let nearest = 0;
  let minDist = Math.abs(position - 0);
  for (const lvl of [0, 23.6, 50, 78.6, 100]) {
    const d = Math.abs(position - lvl);
    if (d < minDist) {
      minDist = d;
      nearest = lvl;
    }
  }
  return { level: nearest, distance: minDist };
}

function detectLiquiditySweep(
  candles: CandleData[],
  price: PriceData,
): { sweptHigh: boolean; sweptLow: boolean } {
  if (candles.length < 10) return { sweptHigh: false, sweptLow: false };
  const recent = candles.slice(-20);
  const swingHigh = Math.max(...recent.map((c) => c.high));
  const swingLow = Math.min(...recent.map((c) => c.low));
  const range = swingHigh - swingLow;
  if (range === 0) return { sweptHigh: false, sweptLow: false };
  const sweptHigh = price.price >= swingHigh - range * 0.005 && price.price <= swingHigh + range * 0.005;
  const sweptLow = price.price >= swingLow - range * 0.005 && price.price <= swingLow + range * 0.005;
  return { sweptHigh, sweptLow };
}

function detectStratPattern(
  candles: CandleData[],
): { pattern: string; isBullish2d2u: boolean; isBearish2u2d: boolean } {
  if (candles.length < 4) {
    return { pattern: 'Insufficient Data', isBullish2d2u: false, isBearish2u2d: false };
  }
  const recent = candles.slice(-4);
  const [c1, c2, c3, c4] = recent;
  const d1 = c2.close < c1.open;
  const d2 = c3.close < c2.open;
  const u1 = c2.close > c1.open;
  const u2 = c3.close > c2.open;
  const isBullish2d2u = d1 && d2 && c4.close > c3.open;
  const isBearish2u2d = u1 && u2 && c4.close < c3.open;
  return {
    pattern: isBullish2d2u
      ? '2d-2u Bullish Reversal'
      : isBearish2u2d
        ? '2u-2d Bearish Reversal'
        : 'No Strat Reversal',
    isBullish2d2u,
    isBearish2u2d,
  };
}

function analyzeHtfMatrix(matrix: HtfStratMatrix): { alignment: FtcAlignment; ftcActive: boolean } {
  const bullishStates: HtfCandleState[] = ['2U-Up', '3-Outside'];
  const bearishStates: HtfCandleState[] = ['2D-Down', '3-Outside'];
  const allStates = [matrix.monthly, matrix.weekly, matrix.daily, matrix.fourHour, matrix.oneHour];
  const allBullish = allStates.every((s) => s === '2U-Up');
  const allBearish = allStates.every((s) => s === '2D-Down');
  if (allBullish) return { alignment: 'bullish', ftcActive: true };
  if (allBearish) return { alignment: 'bearish', ftcActive: true };
  const bullCount = allStates.filter((s) => bullishStates.includes(s)).length;
  const bearCount = allStates.filter((s) => bearishStates.includes(s)).length;
  if (bullCount >= 3 && bearCount === 0) return { alignment: 'bullish', ftcActive: false };
  if (bearCount >= 3 && bullCount === 0) return { alignment: 'bearish', ftcActive: false };
  return { alignment: 'mixed', ftcActive: false };
}

/**
 * Check if price is touching or sweeping a session extreme (ASH, ASL, LNH, LNL)
 * or a core Fib level (100% PDH, 78.6% OTE, 0% PDL).
 */
function isAtSessionExtremeOrCoreFib(
  price: PriceData,
  onEq: OvernightEquilibrium,
  candles: CandleData[],
): { atExtreme: boolean; level: string | null } {
  const config = ASSET_CONFIGS[price.symbol];
  const tick = config.tickSize;
  const tolerance = config.dailyAtr * 0.008;

  // Core Fib levels: 100% PDH, 0% PDL, 78.6% OTE
  const pdh = price.prevDayHigh;
  const pdl = price.prevDayLow;
  const range = pdh - pdl;
  const fib786 = pdl + range * 0.786;

  if (Math.abs(price.price - pdh) <= tolerance) return { atExtreme: true, level: '100% PDH' };
  if (Math.abs(price.price - pdl) <= tolerance) return { atExtreme: true, level: '0% PDL' };
  if (Math.abs(price.price - fib786) <= tolerance) return { atExtreme: true, level: '78.6% OTE' };

  // Session extremes: ASH, ASL, LNH, LNL
  const sessionCandles = candles.slice(-40);
  if (sessionCandles.length > 0) {
    const asiaCandles: CandleData[] = [];
    const londonCandles: CandleData[] = [];
    for (const c of sessionCandles) {
      const m = getNytMinutesFromTimestamp(c.time);
      if (m >= 18 * 60 || m < 3 * 60) asiaCandles.push(c);
      else if (m >= 3 * 60 && m < 9 * 60) londonCandles.push(c);
    }
    const ash = asiaCandles.length > 0 ? Math.max(...asiaCandles.map((c) => c.high)) : 0;
    const asl = asiaCandles.length > 0 ? Math.min(...asiaCandles.map((c) => c.low)) : 0;
    const lnh = londonCandles.length > 0 ? Math.max(...londonCandles.map((c) => c.high)) : 0;
    const lnl = londonCandles.length > 0 ? Math.min(...londonCandles.map((c) => c.low)) : 0;

    if (ash > 0 && Math.abs(price.price - ash) <= tolerance) return { atExtreme: true, level: 'ASH' };
    if (asl > 0 && Math.abs(price.price - asl) <= tolerance) return { atExtreme: true, level: 'ASL' };
    if (lnh > 0 && Math.abs(price.price - lnh) <= tolerance) return { atExtreme: true, level: 'LNH' };
    if (lnl > 0 && Math.abs(price.price - lnl) <= tolerance) return { atExtreme: true, level: 'LNL' };
  }

  return { atExtreme: false, level: null };
}

export function calculateOvernightEquilibrium(
  candles: CandleData[],
  currentPrice: number,
  fallbackAtr: number,
): OvernightEquilibrium {
  const atr = calculateLiveAtr(candles, 14, fallbackAtr);

  const asiaCandles: CandleData[] = [];
  const londonCandles: CandleData[] = [];
  for (const c of candles) {
    const m = getNytMinutesFromTimestamp(c.time);
    if (m >= 18 * 60 || m < 3 * 60) asiaCandles.push(c);
    else if (m >= 3 * 60 && m < 9 * 60) londonCandles.push(c);
  }

  const asiaHigh = asiaCandles.length > 0 ? Math.max(...asiaCandles.map((c) => c.high)) : 0;
  const asiaLow = asiaCandles.length > 0 ? Math.min(...asiaCandles.map((c) => c.low)) : 0;
  const londonHigh = londonCandles.length > 0 ? Math.max(...londonCandles.map((c) => c.high)) : 0;
  const londonLow = londonCandles.length > 0 ? Math.min(...londonCandles.map((c) => c.low)) : 0;

  const onHigh = Math.max(asiaHigh, londonHigh);
  const onLow = Math.min(asiaLow, londonLow);
  const onEq = (onHigh + onLow) / 2;
  const range = onHigh - onLow;

  const premiumOteLow = onLow + range * 0.618;
  const premiumOteHigh = onLow + range * 0.786;
  const discountOteLow = onHigh - range * 0.786;
  const discountOteHigh = onHigh - range * 0.618;

  const tensionRatio = atr > 0 ? Math.abs(currentPrice - onEq) / atr : 0;
  const tensionTriggered = tensionRatio >= TENSION_TRIGGER;

  const priceInPremiumOte = currentPrice >= premiumOteLow && currentPrice <= premiumOteHigh;
  const priceInDiscountOte = currentPrice >= discountOteLow && currentPrice <= discountOteHigh;

  return {
    onEq,
    onHigh,
    onLow,
    range,
    premiumOteLow,
    premiumOteHigh,
    discountOteLow,
    discountOteHigh,
    tensionRatio,
    tensionTriggered,
    priceInPremiumOte,
    priceInDiscountOte,
    atr,
  };
}

export function calculateProbability(
  symbol: AssetSymbol,
  price: PriceData,
  candles: CandleData[],
  htfMatrix: HtfStratMatrix,
): ProbabilityResult {
  const factors: ProbabilityFactor[] = [];

  let longScore = 0;
  let shortScore = 0;

  // 0. Rubber Band Tension & OTE
  const config = ASSET_CONFIGS[symbol];
  const onEq = calculateOvernightEquilibrium(candles, price.price, config.dailyAtr);
  let tensionLong = 0;
  let tensionShort = 0;
  let oteZone: 'Premium OTE' | 'Discount OTE' | 'Equilibrium' | null = null;

  if (onEq.priceInDiscountOte) {
    oteZone = 'Discount OTE';
    tensionLong = 15;
  } else if (onEq.priceInPremiumOte) {
    oteZone = 'Premium OTE';
    tensionShort = 15;
  }

  if (onEq.tensionTriggered) {
    if (price.price > onEq.onEq) {
      tensionShort += 10;
    } else {
      tensionLong += 10;
    }
  }

  longScore += tensionLong;
  shortScore += tensionShort;
  factors.push({
    name: onEq.tensionTriggered
      ? `Tension Ratio ${onEq.tensionRatio.toFixed(2)} (TRIGGERED >= ${TENSION_TRIGGER})`
      : `Tension Ratio ${onEq.tensionRatio.toFixed(2)} (below ${TENSION_TRIGGER})`,
    longContrib: tensionLong,
    shortContrib: tensionShort,
    description: oteZone
      ? `${oteZone} active — ${onEq.priceInDiscountOte ? 'discount zone for longs' : 'premium zone for shorts'}. Tension ${onEq.tensionRatio.toFixed(2)}x ATR from ON_EQ.`
        : `Price ${onEq.tensionRatio.toFixed(2)}x ATR from overnight equilibrium. No OTE zone active.`,
  });

  // 1. Fibonacci Support/Resistance
  const fib = getFibPosition(price);
  let fibLong = 0;
  let fibShort = 0;
  if (fib.distance < 5) {
    if (FIB_SUPPORT_LEVELS.includes(fib.level)) {
      fibLong = 25;
    }
    if (FIB_RESISTANCE_LEVELS.includes(fib.level)) {
      fibShort = 25;
    }
    if (fib.level === 50) {
      fibLong = 12;
      fibShort = 12;
    }
  }
  longScore += fibLong;
  shortScore += fibShort;
  factors.push({
    name: `Fib ${fib.level}% (${fib.distance.toFixed(1)}% away)`,
    longContrib: fibLong,
    shortContrib: fibShort,
    description: fibLong > fibShort
      ? `Price near Fib support at ${fib.level}% — bullish reaction zone`
      : fibShort > fibLong
        ? `Price near Fib resistance at ${fib.level}% — bearish reaction zone`
        : `Price near equilibrium Fib ${fib.level}%`,
  });

  // 2. Liquidity Sweeps (ASL/ASH/LNL/LNH/NYL/NYH)
  const sweep = detectLiquiditySweep(candles, price);
  let sweepLong = 0;
  let sweepShort = 0;
  if (sweep.sweptLow) {
    sweepLong = 20;
  }
  if (sweep.sweptHigh) {
    sweepShort = 20;
  }
  longScore += sweepLong;
  shortScore += sweepShort;
  factors.push({
    name: sweep.sweptLow
      ? 'Session Low Sweep (Buy-side Liquidity)'
      : sweep.sweptHigh
        ? 'Session High Sweep (Sell-side Liquidity)'
        : 'No Active Liquidity Sweep',
    longContrib: sweepLong,
    shortContrib: sweepShort,
    description: sweep.sweptLow
      ? 'Price swept session low liquidity — reversal long probable'
      : sweep.sweptHigh
        ? 'Price swept session high liquidity — reversal short probable'
        : 'Price not at key liquidity pool',
  });

  // 3. Strat 2d-2u / 2u-2d patterns (15m)
  const strat = detectStratPattern(candles);
  let stratLong = 0;
  let stratShort = 0;
  if (strat.isBullish2d2u) stratLong = 20;
  if (strat.isBearish2u2d) stratShort = 20;
  longScore += stratLong;
  shortScore += stratShort;
  factors.push({
    name: strat.pattern,
    longContrib: stratLong,
    shortContrib: stratShort,
    description: strat.isBullish2d2u
      ? '15m 2-down-2-up bullish reversal pattern confirmed'
      : strat.isBearish2u2d
        ? '15m 2-up-2-down bearish reversal pattern confirmed'
        : 'No confirmed 15m Strat reversal pattern',
  });

  // 4. HTF STRAT Continuity (5 timeframes)
  const htf = analyzeHtfMatrix(htfMatrix);
  let htfLong = 0;
  let htfShort = 0;
  if (htf.alignment === 'bullish') {
    htfLong = htf.ftcActive ? 30 : 18;
  } else if (htf.alignment === 'bearish') {
    htfShort = htf.ftcActive ? 30 : 18;
  }
  longScore += htfLong;
  shortScore += htfShort;
  factors.push({
    name: htf.ftcActive
      ? `Full Timeframe Continuity (${htf.alignment.toUpperCase()}) — 5TF`
      : htf.alignment === 'mixed'
        ? 'HTF Mixed — No Continuity (5TF)'
        : `HTF Partial Alignment (${htf.alignment}) — 5TF`,
    longContrib: htfLong,
    shortContrib: htfShort,
    description: htf.ftcActive
      ? `Monthly + Weekly + Daily + 4H + 1H all aligned ${htf.alignment} — maximum continuity`
      : htf.alignment === 'mixed'
        ? 'HTF timeframes conflict across 5 timeframes — no directional edge from continuity'
        : `3+ of 5 HTF timeframes aligned ${htf.alignment}`,
  });

  // 4b. Strict Macro Gate — Monthly/Weekly continuation penalty
  const macro = getMacroBias(htfMatrix);
  let macroBlocked: 'LONG' | 'SHORT' | null = null;
  if (macro.strongContinuation) {
    if (macro.direction === 'bullish') {
      // Counter-trend SHORTS penalized/blocked unless tension > 3.0
      if (onEq.tensionRatio < MACRO_GATE_TENSION_OVERRIDE) {
        shortScore = Math.round(shortScore * 0.3);
        macroBlocked = 'SHORT';
      }
    } else if (macro.direction === 'bearish') {
      if (onEq.tensionRatio < MACRO_GATE_TENSION_OVERRIDE) {
        longScore = Math.round(longScore * 0.3);
        macroBlocked = 'LONG';
      }
    }
  }
  factors.push({
    name: macro.strongContinuation
      ? `Macro Gate: ${macro.direction.toUpperCase()} continuation — ${macroBlocked ? `${macroBlocked} BLOCKED` : 'tension override active'}`
      : macro.direction !== 'neutral'
        ? `Macro Gate: Weak ${macro.direction} bias — no block`
        : 'Macro Gate: Neutral — no restriction',
    longContrib: 0,
    shortContrib: 0,
    description: macro.strongContinuation
      ? `Monthly + Weekly in strong ${macro.direction} continuation. Counter-trend entries blocked unless tension >= ${MACRO_GATE_TENSION_OVERRIDE}x (current: ${onEq.tensionRatio.toFixed(2)}x).`
      : 'No strict macro gate active.',
  });

  // 4c. Session Extreme / Core Fib Level requirement
  const extremeCheck = isAtSessionExtremeOrCoreFib(price, onEq, candles);
  let midRangeBlock = false;
  if (!extremeCheck.atExtreme) {
    // Price is in mid-range — reduce both scores to filter out mid-range entries
    longScore = Math.round(longScore * 0.5);
    shortScore = Math.round(shortScore * 0.5);
    midRangeBlock = true;
  }
  factors.push({
    name: extremeCheck.atExtreme
      ? `Session Extreme / Core Fib: ${extremeCheck.level} — VALID`
      : 'Mid-Range Position — ENTRY FILTERED',
    longContrib: 0,
    shortContrib: 0,
    description: extremeCheck.atExtreme
      ? `Price touching/sweeping ${extremeCheck.level} — valid entry zone.`
      : 'Price floating in mid-range between equilibrium and session levels — entries filtered for tension edge accuracy.',
  });

  // Normalize to percentages (max possible raw = 120 per side)
  const maxRaw = 120;
  let longProb = Math.min(100, (longScore / maxRaw) * 100);
  let shortProb = Math.min(100, (shortScore / maxRaw) * 100);

  // Ensure they sum to 100
  const total = longProb + shortProb;
  if (total > 0) {
    longProb = (longProb / total) * 100;
    shortProb = (shortProb / total) * 100;
  } else {
    longProb = 50;
    shortProb = 50;
  }

  // 5. Institutional Time Multiplier
  const edgeActive = isEdgeWindowActive();
  let timeBoost = false;
  if (edgeActive) {
    const dominantIsLong = longProb > shortProb;
    if (dominantIsLong) {
      longProb = Math.min(100, longProb + TIME_BOOST);
      shortProb = Math.max(0, shortProb - TIME_BOOST);
    } else {
      shortProb = Math.min(100, shortProb + TIME_BOOST);
      longProb = Math.max(0, longProb - TIME_BOOST);
    }
    timeBoost = true;
  }

  longProb = Math.round(longProb);
  shortProb = Math.round(shortProb);

  const diff = Math.abs(longProb - shortProb);
  let dominantDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  if (diff < 8) dominantDirection = 'NEUTRAL';
  else if (longProb > shortProb) dominantDirection = 'LONG';
  else dominantDirection = 'SHORT';

  const counterTrendRisk =
    (dominantDirection === 'LONG' && htf.alignment === 'bearish') ||
    (dominantDirection === 'SHORT' && htf.alignment === 'bullish');

  return {
    longProbability: longProb,
    shortProbability: shortProb,
    dominantDirection,
    edgeWindowActive: edgeActive,
    timeBoostApplied: timeBoost,
    factors,
    htfAlignment: htf.alignment,
    ftcActive: htf.ftcActive,
    counterTrendRisk,
    tensionRatio: onEq.tensionRatio,
    tensionTriggered: onEq.tensionTriggered,
    oteZone,
    overnightEq: onEq.onEq,
    macroBlocked,
    midRangeBlocked: midRangeBlock,
    atExtremeLevel: extremeCheck.level,
  };
}

export function calculateAtrBracket(
  symbol: AssetSymbol,
  price: PriceData,
  candles: CandleData[],
  direction: 'LONG' | 'SHORT' | 'NEUTRAL',
): AtrBracket {
  const config = ASSET_CONFIGS[symbol];

  const atr = calculateLiveAtr(candles, 14, config.dailyAtr);
  const stopPoints = Math.round(atr * 1.5 / config.tickSize) * config.tickSize;
  const targetPoints = config.pointTarget;
  const entry = price.price;
  const isLong = direction !== 'SHORT';
  const target = isLong ? entry + targetPoints : entry - targetPoints;
  const stop = isLong ? entry - stopPoints : entry + stopPoints;
  const riskReward = targetPoints / stopPoints;
  const maxHeatBoundary = stop;
  const expectedProfitPerContract = targetPoints * config.tickValue / config.tickSize;

  return {
    atr,
    stopPoints,
    targetPoints,
    entry,
    target,
    stop,
    riskReward,
    maxHeatBoundary,
    expectedProfitPerContract,
  };
}

function calculateLiveAtr(candles: CandleData[], period: number, fallback: number): number {
  if (candles.length < period + 1) return fallback;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    trueRanges.push(tr);
  }
  const slice = trueRanges.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
  return avg > 0 ? avg : fallback;
}

export function calculateConfluence(
  symbol: AssetSymbol,
  price: PriceData,
  candles: CandleData[],
  htfMatrix: HtfStratMatrix,
): ConfluenceResult {
  const prob = calculateProbability(symbol, price, candles, htfMatrix);
  return prob;
}

export function getProbabilityColor(prob: number): string {
  if (prob >= 75) return 'text-emerald-400';
  if (prob >= 60) return 'text-amber-400';
  if (prob >= 45) return 'text-orange-400';
  return 'text-rose-400';
}

export function getProbabilityBg(prob: number): string {
  if (prob >= 75) return 'bg-emerald-500';
  if (prob >= 60) return 'bg-amber-500';
  if (prob >= 45) return 'bg-orange-500';
  return 'bg-rose-500';
}

export function checkMaeGuardrail(
  symbol: AssetSymbol,
  adverseExcursion: number,
): { exceeded: boolean; severity: 'ok' | 'median' | 'p80'; guardrail: MaeGuardrail; message: string } {
  const guardrail = MAE_GUARDRAILS[symbol];
  if (adverseExcursion >= guardrail.p80) {
    return {
      exceeded: true,
      severity: 'p80',
      guardrail,
      message: `High Drawdown Risk — Widen Exhaustion Wick (MAE ${adverseExcursion.toFixed(1)}pt exceeds 80th percentile ${guardrail.p80}pt)`,
    };
  }
  if (adverseExcursion >= guardrail.median) {
    return {
      exceeded: true,
      severity: 'median',
      guardrail,
      message: `Elevated Drawdown — MAE ${adverseExcursion.toFixed(1)}pt exceeds median ${guardrail.median}pt`,
    };
  }
  return {
    exceeded: false,
    severity: 'ok',
    guardrail,
    message: '',
  };
}
