import type { AssetSymbol, CandleData, PriceData, HtfStratMatrix, SniperProfileId } from './types';
import { ASSET_CONFIGS, formatPrice, getDefaultSniperProfile } from './assets';
import { calculateProbability, checkMaeGuardrail } from './confluence';
import { getNytMinutesFromTimestamp } from './nytTime';
import { supabase } from './supabase';
import type { ReplaySession } from './replaySessions';

const AUTO_EXECUTE_THRESHOLD = 100;

export interface LedgerTrade {
  batchId: string;
  sessionId: string;
  sessionLabel: string;
  symbol: AssetSymbol;
  sessionDate: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  result: 'win' | 'loss';
  pointsCaptured: number;
  pnlDollars: number;
  autoExecuted: boolean;
  fibLevel: string | null;
  liquiditySession: 'Asia' | 'London' | 'NY' | null;
  pullbackDepth: number;
  edgeWindow: string | null;
  sniperProfileId: SniperProfileId;
  mae: number;
  maeFlagged: boolean;
  oteZone: string | null;
  tensionRatio: number;
  tensionTriggered: boolean;
}

export interface BatchResult {
  batchId: string;
  trades: LedgerTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPoints: number;
  totalPnl: number;
  bestSetup: string;
  maeFlaggedCount: number;
}

export interface FactorBreakdown {
  liquidity: {
    asia: { trades: number; wins: number; winRate: number; netPoints: number };
    london: { trades: number; wins: number; winRate: number; netPoints: number };
    ny: { trades: number; wins: number; winRate: number; netPoints: number };
  };
  pullback: {
    p0: { trades: number; wins: number; winRate: number; netPoints: number };
    p1: { trades: number; wins: number; winRate: number; netPoints: number };
    p2plus: { trades: number; wins: number; winRate: number; netPoints: number };
  };
  fib: Record<string, { trades: number; wins: number; winRate: number; netPoints: number }>;
}

interface BatchSimTrade {
  direction: 'LONG' | 'SHORT';
  entry: number;
  target: number;
  stop: number;
  entryBar: number;
  result: 'win' | 'loss' | 'open';
  points: number;
  fibLevel: string | null;
  liquiditySession: 'Asia' | 'London' | 'NY' | null;
  pullbackDepth: number;
  edgeWindow: string | null;
  sniperProfileId: SniperProfileId;
  mae: number;
  maeFlagged: boolean;
  oteZone: string | null;
  tensionRatio: number;
  tensionTriggered: boolean;
}

function buildPriceData(session: ReplaySession, candle: CandleData, idx: number): PriceData {
  const seenCandles = session.candles.slice(0, idx + 1);
  const dayHigh = Math.max(...seenCandles.map((c) => c.high));
  const dayLow = Math.min(...seenCandles.map((c) => c.low));
  const dayOpen = session.candles[0].open;
  return {
    symbol: session.symbol,
    price: candle.close,
    prevPrice: idx > 0 ? session.candles[idx - 1].close : candle.close,
    change: candle.close - dayOpen,
    changePercent: dayOpen > 0 ? ((candle.close - dayOpen) / dayOpen) * 100 : 0,
    dayHigh,
    dayLow,
    dayOpen,
    volume: candle.volume,
    timestamp: candle.time,
    source: 'sim',
    prevDayHigh: session.prevDayHigh,
    prevDayLow: session.prevDayLow,
  };
}

function getEdgeWindowLabel(m: number): string | null {
  if (m >= 9 * 60 + 45 && m < 10 * 60 + 30) return 'AM Reversal 09:45-10:30';
  if (m >= 13 * 60 + 30 && m < 14 * 60) return 'Power Hour 13:30-14:00';
  return null;
}

function getLiquiditySession(nytMinutes: number): 'Asia' | 'London' | 'NY' | null {
  if (nytMinutes >= 18 * 60 || nytMinutes < 3 * 60) return 'Asia';
  if (nytMinutes >= 3 * 60 && nytMinutes < 9 * 60) return 'London';
  if (nytMinutes >= 9 * 60 && nytMinutes < 16 * 60) return 'NY';
  return null;
}

function getFibLevel(session: ReplaySession, price: number): string | null {
  const range = session.fibHigh - session.fibLow;
  if (range === 0) return null;
  const threshold = range * 0.03;
  const levels: Record<string, number> = {
    '100% PDH': session.fibHigh,
    '78.6% OTE': session.fibLow + range * 0.786,
    '50% Equilibrium': session.fibLow + range * 0.5,
    '23.6%': session.fibLow + range * 0.236,
    '0% PDL': session.fibLow,
  };
  for (const [label, level] of Object.entries(levels)) {
    if (Math.abs(price - level) < threshold) return label;
  }
  return null;
}

function countPullbacks(candles: CandleData[], entryBar: number, direction: 'LONG' | 'SHORT'): number {
  if (entryBar < 3) return 0;
  const start = Math.max(0, entryBar - 10);
  const slice = candles.slice(start, entryBar);
  let pullbacks = 0;
  let prevSwing = slice[0].close;
  for (let i = 1; i < slice.length; i++) {
    if (direction === 'LONG') {
      if (slice[i].low < prevSwing && slice[i].close > slice[i].low) {
        pullbacks++;
        prevSwing = slice[i].close;
      }
    } else {
      if (slice[i].high > prevSwing && slice[i].close < slice[i].high) {
        pullbacks++;
        prevSwing = slice[i].close;
      }
    }
  }
  return Math.min(pullbacks, 2);
}

function runSingleSession(session: ReplaySession): BatchSimTrade[] {
  const profile = getDefaultSniperProfile(session.symbol);
  const simTrades: BatchSimTrade[] = [];
  let hasOpen = false;
  let lastAutoBar = -1;

  for (let bar = 1; bar < session.candles.length; bar++) {
    const candle = session.candles[bar];
    const priceData = buildPriceData(session, candle, bar);
    const seenCandles = session.candles.slice(0, bar + 1);

    // Check exits first + track MAE
    for (const t of simTrades) {
      if (t.result !== 'open') continue;
      const currentAdverse = t.direction === 'LONG'
        ? Math.max(0, t.entry - candle.low)
        : Math.max(0, candle.high - t.entry);
      t.mae = Math.max(t.mae, currentAdverse);
      const maeCheck = checkMaeGuardrail(session.symbol, t.mae);
      t.maeFlagged = maeCheck.exceeded;

      let exited = false;
      let exitPrice = 0;
      if (t.direction === 'LONG') {
        if (candle.high >= t.target) { exited = true; exitPrice = t.target; }
        else if (candle.low <= t.stop) { exited = true; exitPrice = t.stop; }
      } else {
        if (candle.low <= t.target) { exited = true; exitPrice = t.target; }
        else if (candle.high >= t.stop) { exited = true; exitPrice = t.stop; }
      }
      if (exited) {
        const raw = t.direction === 'LONG' ? exitPrice - t.entry : t.entry - exitPrice;
        t.result = raw > 0 ? 'win' : 'loss';
        t.points = Math.round(Math.abs(raw) * 100) / 100;
      }
    }

    hasOpen = simTrades.some((t) => t.result === 'open');
    if (hasOpen) continue;
    if (lastAutoBar === bar) continue;

    const prob = calculateProbability(session.symbol, priceData, seenCandles, session.htfMatrix);
    let autoDir: 'LONG' | 'SHORT' | null = null;
    if (prob.longProbability >= AUTO_EXECUTE_THRESHOLD) autoDir = 'LONG';
    else if (prob.shortProbability >= AUTO_EXECUTE_THRESHOLD) autoDir = 'SHORT';

    if (autoDir) {
      const entry = candle.close;
      const target = autoDir === 'LONG' ? entry + profile.targetPoints : entry - profile.targetPoints;
      const stop = autoDir === 'LONG' ? entry - profile.stopPoints : entry + profile.stopPoints;
      const nytMin = getNytMinutesFromTimestamp(candle.time);
      simTrades.push({
        direction: autoDir,
        entry,
        target,
        stop,
        entryBar: bar,
        result: 'open',
        points: 0,
        fibLevel: getFibLevel(session, entry),
        liquiditySession: getLiquiditySession(nytMin),
        pullbackDepth: countPullbacks(session.candles, bar, autoDir),
        edgeWindow: getEdgeWindowLabel(nytMin),
        sniperProfileId: profile.id,
        mae: 0,
        maeFlagged: false,
        oteZone: prob.oteZone,
        tensionRatio: prob.tensionRatio,
        tensionTriggered: prob.tensionTriggered,
      });
      lastAutoBar = bar;
      hasOpen = true;
    }
  }

  // Close any remaining open trades at last bar close
  const lastCandle = session.candles[session.candles.length - 1];
  for (const t of simTrades) {
    if (t.result !== 'open') continue;
    const exitPrice = lastCandle.close;
    const raw = t.direction === 'LONG' ? exitPrice - t.entry : t.entry - exitPrice;
    t.result = raw > 0 ? 'win' : 'loss';
    t.points = Math.round(Math.abs(raw) * 100) / 100;
  }

  return simTrades;
}

function findBestSetup(trades: LedgerTrade[]): string {
  const setupMap: Record<string, { wins: number; total: number; points: number }> = {};
  for (const t of trades) {
    let setupKey = 'Unknown';
    if (t.edgeWindow) setupKey = t.edgeWindow;
    else if (t.fibLevel) setupKey = `Fib ${t.fibLevel}`;
    else if (t.liquiditySession) setupKey = `${t.liquiditySession} Liquidity`;
    if (!setupMap[setupKey]) setupMap[setupKey] = { wins: 0, total: 0, points: 0 };
    setupMap[setupKey].total++;
    if (t.result === 'win') setupMap[setupKey].wins++;
    setupMap[setupKey].points += t.pnlDollars > 0 ? t.pointsCaptured : -t.pointsCaptured;
  }
  let best = 'N/A';
  let bestScore = -Infinity;
  for (const [key, val] of Object.entries(setupMap)) {
    if (val.total < 1) continue;
    const wr = val.wins / val.total;
    const score = wr * 100 + val.points * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = `${key} (${((val.wins / val.total) * 100).toFixed(0)}% WR, ${val.total} trades)`;
    }
  }
  return best;
}

export function computeFactorBreakdown(trades: LedgerTrade[]): FactorBreakdown {
  const mk = () => ({ trades: 0, wins: 0, winRate: 0, netPoints: 0 });
  const bd: FactorBreakdown = {
    liquidity: { asia: mk(), london: mk(), ny: mk() },
    pullback: { p0: mk(), p1: mk(), p2plus: mk() },
    fib: {},
  };

  for (const t of trades) {
    // Liquidity
    if (t.liquiditySession === 'Asia') {
      bd.liquidity.asia.trades++;
      if (t.result === 'win') bd.liquidity.asia.wins++;
      bd.liquidity.asia.netPoints += t.pnlDollars > 0 ? t.pointsCaptured : -t.pointsCaptured;
    } else if (t.liquiditySession === 'London') {
      bd.liquidity.london.trades++;
      if (t.result === 'win') bd.liquidity.london.wins++;
      bd.liquidity.london.netPoints += t.pnlDollars > 0 ? t.pointsCaptured : -t.pointsCaptured;
    } else if (t.liquiditySession === 'NY') {
      bd.liquidity.ny.trades++;
      if (t.result === 'win') bd.liquidity.ny.wins++;
      bd.liquidity.ny.netPoints += t.pnlDollars > 0 ? t.pointsCaptured : -t.pointsCaptured;
    }

    // Pullback
    if (t.pullbackDepth === 0) {
      bd.pullback.p0.trades++;
      if (t.result === 'win') bd.pullback.p0.wins++;
      bd.pullback.p0.netPoints += t.pnlDollars > 0 ? t.pointsCaptured : -t.pointsCaptured;
    } else if (t.pullbackDepth === 1) {
      bd.pullback.p1.trades++;
      if (t.result === 'win') bd.pullback.p1.wins++;
      bd.pullback.p1.netPoints += t.pnlDollars > 0 ? t.pointsCaptured : -t.pointsCaptured;
    } else {
      bd.pullback.p2plus.trades++;
      if (t.result === 'win') bd.pullback.p2plus.wins++;
      bd.pullback.p2plus.netPoints += t.pnlDollars > 0 ? t.pointsCaptured : -t.pointsCaptured;
    }

    // Fib
    if (t.fibLevel) {
      if (!bd.fib[t.fibLevel]) bd.fib[t.fibLevel] = mk();
      bd.fib[t.fibLevel].trades++;
      if (t.result === 'win') bd.fib[t.fibLevel].wins++;
      bd.fib[t.fibLevel].netPoints += t.pnlDollars > 0 ? t.pointsCaptured : -t.pointsCaptured;
    }
  }

  for (const key of ['asia', 'london', 'ny'] as const) {
    const v = bd.liquidity[key];
    v.winRate = v.trades > 0 ? (v.wins / v.trades) * 100 : 0;
  }
  for (const key of ['p0', 'p1', 'p2plus'] as const) {
    const v = bd.pullback[key];
    v.winRate = v.trades > 0 ? (v.wins / v.trades) * 100 : 0;
  }
  for (const v of Object.values(bd.fib)) {
    v.winRate = v.trades > 0 ? (v.wins / v.trades) * 100 : 0;
  }

  return bd;
}

export async function runBatch(
  sessions: ReplaySession[],
  selectedSessionIds: string[] | null,
): Promise<BatchResult> {
  const toRun = selectedSessionIds
    ? sessions.filter((s) => selectedSessionIds.includes(s.id))
    : sessions;

  const batchId = `batch_${Date.now()}`;
  const ledgerTrades: LedgerTrade[] = [];

  for (const session of toRun) {
    const dollarPerPoint = session.symbol === 'ES' ? 50 : 20;
    const simTrades = runSingleSession(session);

    for (const t of simTrades) {
      if (t.result === 'open') continue;
      const pnl = (t.result === 'win' ? t.points : -t.points) * dollarPerPoint;
      ledgerTrades.push({
        batchId,
        sessionId: session.id,
        sessionLabel: session.label,
        symbol: session.symbol,
        sessionDate: session.date,
        direction: t.direction,
        entryPrice: t.entry,
        targetPrice: t.target,
        stopPrice: t.stop,
        result: t.result,
        pointsCaptured: t.points,
        pnlDollars: pnl,
        autoExecuted: true,
        fibLevel: t.fibLevel,
        liquiditySession: t.liquiditySession,
        pullbackDepth: t.pullbackDepth,
        edgeWindow: t.edgeWindow,
        sniperProfileId: t.sniperProfileId,
        mae: t.mae,
        maeFlagged: t.maeFlagged,
        oteZone: t.oteZone,
        tensionRatio: t.tensionRatio,
        tensionTriggered: t.tensionTriggered,
      });
    }
  }

  // Persist to Supabase
  if (ledgerTrades.length > 0) {
    const rows = ledgerTrades.map((t) => ({
      batch_id: t.batchId,
      session_id: t.sessionId,
      session_label: t.sessionLabel,
      symbol: t.symbol,
      session_date: t.sessionDate,
      direction: t.direction,
      entry_price: t.entryPrice,
      target_price: t.targetPrice,
      stop_price: t.stopPrice,
      result: t.result,
      points_captured: t.pointsCaptured,
      pnl_dollars: t.pnlDollars,
      auto_executed: t.autoExecuted,
      fib_level: t.fibLevel,
      liquidity_session: t.liquiditySession,
      pullback_depth: t.pullbackDepth,
      edge_window: t.edgeWindow,
      sniper_profile_id: t.sniperProfileId,
      mae: t.mae,
      mae_flagged: t.maeFlagged,
      ote_zone: t.oteZone,
      tension_ratio: t.tensionRatio,
      tension_triggered: t.tensionTriggered,
    }));
    const { error } = await supabase.from('master_tally_ledger').insert(rows);
    if (error) {
      console.error('Failed to persist batch to ledger:', error.message);
    }
  }

  const wins = ledgerTrades.filter((t) => t.result === 'win');
  const losses = ledgerTrades.filter((t) => t.result === 'loss');
  const netPoints = wins.reduce((s, t) => s + t.pointsCaptured, 0) - losses.reduce((s, t) => s + t.pointsCaptured, 0);

  return {
    batchId,
    trades: ledgerTrades,
    totalTrades: ledgerTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: ledgerTrades.length > 0 ? (wins.length / ledgerTrades.length) * 100 : 0,
    netPoints,
    totalPnl: netPoints * (toRun[0] ? (toRun[0].symbol === 'ES' ? 50 : 20) : 50),
    bestSetup: findBestSetup(ledgerTrades),
    maeFlaggedCount: ledgerTrades.filter((t) => t.maeFlagged).length,
  };
}

export async function loadLedgerHistory(): Promise<LedgerTrade[]> {
  const { data, error } = await supabase
    .from('master_tally_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data.map((r) => ({
    batchId: r.batch_id,
    sessionId: r.session_id,
    sessionLabel: r.session_label,
    symbol: r.symbol as AssetSymbol,
    sessionDate: r.session_date,
    direction: r.direction as 'LONG' | 'SHORT',
    entryPrice: Number(r.entry_price),
    targetPrice: Number(r.target_price),
    stopPrice: Number(r.stop_price),
    result: r.result as 'win' | 'loss',
    pointsCaptured: Number(r.points_captured),
    pnlDollars: Number(r.pnl_dollars),
    autoExecuted: r.auto_executed,
    fibLevel: r.fib_level,
    liquiditySession: r.liquidity_session as 'Asia' | 'London' | 'NY' | null,
    pullbackDepth: r.pullback_depth,
    edgeWindow: r.edge_window,
    sniperProfileId: (r.sniper_profile_id ?? 'ES_4pt') as SniperProfileId,
    mae: Number(r.mae ?? 0),
    maeFlagged: Boolean(r.mae_flagged),
    oteZone: r.ote_zone ?? null,
    tensionRatio: Number(r.tension_ratio ?? 0),
    tensionTriggered: Boolean(r.tension_triggered),
  }));
}

export async function clearLedger(): Promise<void> {
  await supabase.from('master_tally_ledger').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

export { formatPrice, getNytMinutesFromTimestamp };
export type { ReplaySession, HtfStratMatrix, CandleData };
