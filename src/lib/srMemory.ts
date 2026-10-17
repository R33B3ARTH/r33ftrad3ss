import type { AssetSymbol, PriceData, CandleData } from './types';
import { ASSET_CONFIGS } from './assets';
import { getEdgeStatForLevel, type EdgeStat } from './edgeStats';
import { getGlobexSessionRange, calculateFibLevels } from './fibCalc';

export interface SRLevel {
  price: number;
  type: 'resistance' | 'support' | 'magnet';
  touchCount: number;
  rejectionCount: number;
  avgReactionSize: number;
  lastTouchedAt: number;
  isRoundNumber: boolean;
  source: string;
  confluenceWith: string[];
  strength: 'strong' | 'moderate' | 'minor';
}

export type ScenarioStatus = 'active' | 'in_range' | 'watching_above' | 'watching_below';

export interface ScenarioBlueprint {
  level: SRLevel;
  status: ScenarioStatus;
  distancePoints: number;
  distancePercent: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  priceMemory: string;
  ifHolds: { action: string; target: number; targetLabel: string; macroTarget: number };
  ifBreaks: { action: string; target: number; targetLabel: string; macroTarget: number };
  confluenceScore: number;
  edgeStat: EdgeStat | null;
}

interface SRAnalysis {
  levels: SRLevel[];
  scenarios: ScenarioBlueprint[];
}

function isRoundNumber(price: number, tickSize: number): boolean {
  const whole = Math.round(price);
  if (Math.abs(price - whole) < tickSize * 2) return true;
  if (Math.abs(price - whole - 0.5) < tickSize * 2) return true;
  if (Math.abs(price - Math.round(price / 10) * 10) < tickSize * 4) return true;
  if (Math.abs(price - Math.round(price / 50) * 50) < tickSize * 8) return true;
  if (Math.abs(price - Math.round(price / 100) * 100) < tickSize * 16) return true;
  return false;
}

function clusterPrices(prices: number[], tolerance: number): number[][] {
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: number[][] = [];
  let current: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i] - sorted[i - 1]) < tolerance) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

function detectSwingLevels(candles: CandleData[]): { highs: { price: number; index: number }[]; lows: { price: number; index: number }[] } {
  const highs: { price: number; index: number }[] = [];
  const lows: { price: number; index: number }[] = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (c.high > candles[i - 1].high && c.high > candles[i - 2].high &&
        c.high > candles[i + 1].high && c.high > candles[i + 2].high) {
      highs.push({ price: c.high, index: i });
    }
    if (c.low < candles[i - 1].low && c.low < candles[i - 2].low &&
        c.low < candles[i + 1].low && c.low < candles[i + 2].low) {
      lows.push({ price: c.low, index: i });
    }
  }

  return { highs, lows };
}

function measureReactionSize(candles: CandleData[], index: number, isHigh: boolean): number {
  const lookforward = Math.min(5, candles.length - index - 1);
  if (lookforward <= 0) return 0;

  const level = isHigh ? candles[index].high : candles[index].low;
  let maxReaction = 0;

  for (let j = index + 1; j <= index + lookforward; j++) {
    if (isHigh) {
      const reaction = level - candles[j].low;
      if (reaction > maxReaction) maxReaction = reaction;
    } else {
      const reaction = candles[j].high - level;
      if (reaction > maxReaction) maxReaction = reaction;
    }
  }

  return maxReaction;
}

function buildPriceMemory(level: SRLevel, symbol: AssetSymbol): string {
  const config = ASSET_CONFIGS[symbol];
  const parts: string[] = [];

  if (level.touchCount > 0 && level.rejectionCount > 0) {
    parts.push(`tested ${level.touchCount}x with ${level.rejectionCount} rejection${level.rejectionCount > 1 ? 's' : ''}`);
  } else if (level.touchCount > 0) {
    parts.push(`tested ${level.touchCount}x`);
  }

  if (level.avgReactionSize > 0) {
    parts.push(`avg ${level.avgReactionSize.toFixed(config.precision)}pt reaction`);
  }

  if (level.isRoundNumber) {
    parts.push('round-number magnet');
  }

  if (level.confluenceWith.length > 0) {
    parts.push(`confluence with ${level.confluenceWith.join(', ')}`);
  }

  if (level.source.startsWith('Prev Day')) {
    parts.push('untested today');
  }

  if (level.source.startsWith('Fib 100%')) {
    parts.push('full range extension target');
  }

  return parts.length > 0 ? parts.join(' · ') : `${level.source} — pending first test`;
}

export function analyzeSRLevels(
  symbol: AssetSymbol,
  price: PriceData,
  candles: CandleData[],
): SRAnalysis {
  const config = ASSET_CONFIGS[symbol];
  const tolerance = config.dailyAtr * 0.03;
  const levels: SRLevel[] = [];

  if (candles.length < 10) {
    return { levels, scenarios: [] };
  }

  // 1. Detect swing highs/lows
  const { highs, lows } = detectSwingLevels(candles);

  // Cluster swing highs into resistance levels
  const highClusters = clusterPrices(highs.map((h) => h.price), tolerance);
  for (const cluster of highClusters) {
    if (cluster.length < 1) continue;
    const avgPrice = cluster.reduce((a, b) => a + b, 0) / cluster.length;
    const matchingIndices = highs.filter((h) => cluster.includes(h.price)).map((h) => h.index);
    const rejectionCount = matchingIndices.filter((idx) => measureReactionSize(candles, idx, true) > config.dailyAtr * 0.05).length;
    const reactions = matchingIndices.map((idx) => measureReactionSize(candles, idx, true)).filter((r) => r > 0);
    const avgReaction = reactions.length > 0 ? reactions.reduce((a, b) => a + b, 0) / reactions.length : 0;

    levels.push({
      price: avgPrice,
      type: 'resistance',
      touchCount: cluster.length,
      rejectionCount,
      avgReactionSize: avgReaction,
      lastTouchedAt: candles[matchingIndices[matchingIndices.length - 1]]?.time ?? Date.now(),
      isRoundNumber: isRoundNumber(avgPrice, config.tickSize),
      source: 'Swing High',
      confluenceWith: [],
      strength: cluster.length >= 3 ? 'strong' : cluster.length >= 2 ? 'moderate' : 'minor',
    });
  }

  // Cluster swing lows into support levels
  const lowClusters = clusterPrices(lows.map((l) => l.price), tolerance);
  for (const cluster of lowClusters) {
    if (cluster.length < 1) continue;
    const avgPrice = cluster.reduce((a, b) => a + b, 0) / cluster.length;
    const matchingIndices = lows.filter((l) => cluster.includes(l.price)).map((l) => l.index);
    const rejectionCount = matchingIndices.filter((idx) => measureReactionSize(candles, idx, false) > config.dailyAtr * 0.05).length;
    const reactions = matchingIndices.map((idx) => measureReactionSize(candles, idx, false)).filter((r) => r > 0);
    const avgReaction = reactions.length > 0 ? reactions.reduce((a, b) => a + b, 0) / reactions.length : 0;

    levels.push({
      price: avgPrice,
      type: 'support',
      touchCount: cluster.length,
      rejectionCount,
      avgReactionSize: avgReaction,
      lastTouchedAt: candles[matchingIndices[matchingIndices.length - 1]]?.time ?? Date.now(),
      isRoundNumber: isRoundNumber(avgPrice, config.tickSize),
      source: 'Swing Low',
      confluenceWith: [],
      strength: cluster.length >= 3 ? 'strong' : cluster.length >= 2 ? 'moderate' : 'minor',
    });
  }

  // 2. Add Previous Day High/Low as key levels
  if (price.prevDayHigh > 0) {
    levels.push({
      price: price.prevDayHigh,
      type: 'resistance',
      touchCount: 1,
      rejectionCount: 0,
      avgReactionSize: 0,
      lastTouchedAt: 0,
      isRoundNumber: isRoundNumber(price.prevDayHigh, config.tickSize),
      source: 'Prev Day High',
      confluenceWith: [],
      strength: 'strong',
    });
  }
  if (price.prevDayLow > 0) {
    levels.push({
      price: price.prevDayLow,
      type: 'support',
      touchCount: 1,
      rejectionCount: 0,
      avgReactionSize: 0,
      lastTouchedAt: 0,
      isRoundNumber: isRoundNumber(price.prevDayLow, config.tickSize),
      source: 'Prev Day Low',
      confluenceWith: [],
      strength: 'strong',
    });
  }

  // 3. Add Fib levels anchored to Globex PDH/PDL (6:00 PM EST session open)
  const { pdh, pdl } = getGlobexSessionRange(candles, price, config.tickSize);
  const fibLevels = calculateFibLevels(pdh, pdl, config.tickSize);
  for (const fib of fibLevels) {
    const pct = fib.pct;
    levels.push({
      price: fib.price,
      type: pct < 50 ? 'support' : pct > 50 ? 'resistance' : 'magnet',
      touchCount: 0,
      rejectionCount: 0,
      avgReactionSize: 0,
      lastTouchedAt: 0,
      isRoundNumber: isRoundNumber(fib.price, config.tickSize),
      source: `Fib ${fib.label}`,
      confluenceWith: [],
      strength: pct === 0 || pct === 100 ? 'strong' : pct === 50 || pct === 78.6 ? 'moderate' : 'minor',
    });
  }

  // 4. Add daily open as magnet
  if (price.dayOpen > 0) {
    levels.push({
      price: price.dayOpen,
      type: 'magnet',
      touchCount: 0,
      rejectionCount: 0,
      avgReactionSize: 0,
      lastTouchedAt: 0,
      isRoundNumber: isRoundNumber(price.dayOpen, config.tickSize),
      source: 'Daily Open',
      confluenceWith: [],
      strength: 'moderate',
    });
  }

  // 5. Merge nearby levels and detect confluences
  const mergedLevels: SRLevel[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < levels.length; i++) {
    if (usedIndices.has(i)) continue;
    const base = { ...levels[i], confluenceWith: [] as string[] };
    for (let j = i + 1; j < levels.length; j++) {
      if (usedIndices.has(j)) continue;
      if (Math.abs(levels[i].price - levels[j].price) < tolerance) {
        base.confluenceWith.push(levels[j].source);
        base.touchCount += levels[j].touchCount;
        base.rejectionCount += levels[j].rejectionCount;
        if (levels[j].avgReactionSize > base.avgReactionSize) {
          base.avgReactionSize = levels[j].avgReactionSize;
        }
        if (levels[j].strength === 'strong') base.strength = 'strong';
        usedIndices.add(j);
      }
    }
    mergedLevels.push(base);
    usedIndices.add(i);
  }

  // 6. Generate PROACTIVE scenario blueprints for ALL key levels
  const currentPrice = price.price;
  const activeThreshold = config.dailyAtr * 0.08;
  const inRangeThreshold = config.dailyAtr * 0.2;
  const scenarios: ScenarioBlueprint[] = [];

  // Only keep the most significant levels (top 8 by strength/touches)
  const rankedLevels = mergedLevels
    .map((l) => ({
      level: l,
      rank: (l.strength === 'strong' ? 30 : l.strength === 'moderate' ? 15 : 5) +
            l.touchCount * 5 + l.rejectionCount * 4 +
            (l.source.startsWith('Prev Day') ? 20 : 0) +
            (l.source.startsWith('Fib 100%') ? 15 : 0) +
            (l.source.startsWith('Fib 0%') ? 15 : 0) +
            (l.source.startsWith('Fib 50%') ? 10 : 0) +
            (l.source.startsWith('Fib 78.6%') ? 8 : 0) +
            l.confluenceWith.length * 6,
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 8)
    .map((x) => x.level);

  for (const level of rankedLevels) {
    const distance = level.price - currentPrice;
    const absDistance = Math.abs(distance);

    // Determine proactive status
    let status: ScenarioStatus;
    if (absDistance < activeThreshold) status = 'active';
    else if (absDistance < inRangeThreshold) status = 'in_range';
    else if (distance > 0) status = 'watching_above';
    else status = 'watching_below';

    const isAbove = level.price > currentPrice;
    const isResistance = level.type === 'resistance' || (level.type === 'magnet' && isAbove);
    const isSupport = level.type === 'support' || (level.type === 'magnet' && !isAbove);

    // Find next structural target levels
    const otherLevels = rankedLevels.filter((l) => l !== level).sort((a, b) => a.price - b.price);
    const aboveTargets = otherLevels.filter((l) => l.price > level.price);
    const belowTargets = otherLevels.filter((l) => l.price < level.price).reverse();

    const nextResistance = aboveTargets[0];
    const nextSupport = belowTargets[0];

    // Macro targets: +20 pts ES / +100 pts NQ from the level itself
    const macroTarget = config.pointTarget;

    // IF HOLDS: rotation toward next structural level, or macro target if none
    const holdTarget = isResistance
      ? (nextSupport?.price ?? level.price - macroTarget)
      : (nextResistance?.price ?? level.price + macroTarget);
    const holdLabel = isResistance
      ? (nextSupport ? nextSupport.source : `-${macroTarget}pt target`)
      : (nextResistance ? nextResistance.source : `+${macroTarget}pt target`);

    // IF BREAKS: extension toward next level beyond, or macro target projection
    const breakTarget = isResistance
      ? (aboveTargets[1]?.price ?? level.price + macroTarget)
      : (belowTargets[1]?.price ?? level.price - macroTarget);
    const breakLabel = isResistance
      ? (aboveTargets[1] ? aboveTargets[1].source : `+${macroTarget}pt extension`)
      : (belowTargets[1] ? belowTargets[1].source : `-${macroTarget}pt extension`);

    const direction = isResistance ? 'bearish' : isSupport ? 'bullish' : 'neutral';

    // Confluence score
    let confluenceScore = 35;
    confluenceScore += Math.min(level.touchCount * 8, 24);
    confluenceScore += Math.min(level.rejectionCount * 10, 20);
    if (level.isRoundNumber) confluenceScore += 8;
    if (level.confluenceWith.length > 0) confluenceScore += level.confluenceWith.length * 6;
    if (level.strength === 'strong') confluenceScore += 10;
    if (level.source.startsWith('Prev Day')) confluenceScore += 8;
    if (level.source.startsWith('Fib 100%') || level.source.startsWith('Fib 0%')) confluenceScore += 5;
    // Bonus for levels that are close enough to act on soon
    if (status === 'active') confluenceScore += 10;
    else if (status === 'in_range') confluenceScore += 5;
    confluenceScore = Math.min(confluenceScore, 95);

    const priceMemory = buildPriceMemory(level, symbol);

    const edgeStat = getEdgeStatForLevel(
      symbol, level.source, isResistance, level.isRoundNumber,
      level.confluenceWith.length > 0, level.confluenceWith,
    );

    // Boost confluence score if we have a strong historical edge
    if (edgeStat && edgeStat.winRate >= 75) confluenceScore += 5;
    confluenceScore = Math.min(confluenceScore, 95);

    scenarios.push({
      level,
      status,
      distancePoints: distance,
      distancePercent: absDistance > 0 ? (absDistance / currentPrice) * 100 : 0,
      direction,
      priceMemory,
      ifHolds: {
        action: isResistance ? 'Expect rotation down toward' : 'Expect bounce up toward',
        target: holdTarget,
        targetLabel: holdLabel,
        macroTarget,
      },
      ifBreaks: {
        action: isResistance ? 'Look for breakout extension toward' : 'Look for breakdown extension toward',
        target: breakTarget,
        targetLabel: breakLabel,
        macroTarget,
      },
      confluenceScore,
      edgeStat,
    });
  }

  // Sort: active first, then in_range, then by absolute distance
  const statusOrder: Record<ScenarioStatus, number> = { active: 0, in_range: 1, watching_above: 2, watching_below: 3 };
  scenarios.sort((a, b) => {
    const sDiff = statusOrder[a.status] - statusOrder[b.status];
    if (sDiff !== 0) return sDiff;
    return Math.abs(a.distancePoints) - Math.abs(b.distancePoints);
  });

  return { levels: mergedLevels, scenarios };
}
