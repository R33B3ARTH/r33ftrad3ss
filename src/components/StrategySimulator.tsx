import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, SkipForward, RotateCcw, Clock, TrendingUp, TrendingDown,
  Target, Shield, Zap, Award, AlertTriangle, Flame, ChevronDown, Bot,
  Layers, BarChart3, CheckSquare, Square, Loader2, Database, Trash2,
  Crosshair, Gauge, Activity, Download,
} from 'lucide-react';
import type { AssetSymbol, CandleData, PriceData, SniperProfile, SniperProfileId } from '@/lib/types';
import { formatPrice, getSniperProfilesForSymbol, getDefaultSniperProfile, SNIPER_PROFILES, MAE_GUARDRAILS } from '@/lib/assets';
import { calculateProbability, getProbabilityColor, getProbabilityBg, checkMaeGuardrail } from '@/lib/confluence';
import { generateReplaySessions, generateCurrentDaySession, type ReplaySession } from '@/lib/replaySessions';
import { getNytMinutesFromTimestamp, getNytDate } from '@/lib/nytTime';
import {
  runBatch, computeFactorBreakdown, loadLedgerHistory, clearLedger,
  type BatchResult, type FactorBreakdown, type LedgerTrade,
} from '@/lib/batchEngine';

const ALL_SESSIONS = generateReplaySessions();
const SPEEDS = [1, 2, 5, 10];
const BASE_INTERVAL_MS = 800;
const AUTO_EXECUTE_THRESHOLD = 100;

interface SimTrade {
  id: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  target: number;
  stop: number;
  entryBar: number;
  exitBar: number | null;
  exitPrice: number | null;
  result: 'win' | 'loss' | 'open';
  points: number;
  autoExecuted: boolean;
  sniperProfileId: SniperProfileId;
  mae: number;
  maeFlagged: boolean;
}

interface ToastMsg {
  id: number;
  text: string;
  direction: 'LONG' | 'SHORT';
}

interface StrategySimulatorProps {
  activeSymbol: AssetSymbol;
}

type SimView = 'replay' | 'tally';

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
    dayHigh, dayLow, dayOpen,
    volume: candle.volume, timestamp: candle.time, source: 'sim',
    prevDayHigh: session.prevDayHigh, prevDayLow: session.prevDayLow,
  };
}

function getEdgeWindowForMinute(m: number): { label: string; winRate: number } | null {
  if (m >= 9 * 60 + 45 && m < 10 * 60 + 30) return { label: 'AM Reversal Window', winRate: 78 };
  if (m >= 13 * 60 + 30 && m < 14 * 60) return { label: 'Power Hour Reversal', winRate: 74 };
  return null;
}

function checkFibHit(session: ReplaySession, price: number): string | null {
  const range = session.fibHigh - session.fibLow;
  if (range === 0) return null;
  const threshold = range * 0.02;
  const levels: [number, string][] = [
    [session.fibLow, 'Fib 0% (Session Low)'],
    [session.fibLow + range * 0.236, 'Fib 23.6%'],
    [session.fibLow + range * 0.5, 'Fib 50% (Equilibrium)'],
    [session.fibLow + range * 0.786, 'Fib 78.6%'],
    [session.fibHigh, 'Fib 100% (Session High)'],
  ];
  for (const [lvl, label] of levels) {
    if (Math.abs(price - lvl) < threshold) return label;
  }
  return null;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const header = rows[0].join(',');
  const body = rows.slice(1).map((r) => r.map((c) => {
    const needsQuote = c.includes(',') || c.includes('"') || c.includes('\n');
    return needsQuote ? `"${c.replace(/"/g, '""')}"` : c;
  }).join(',')).join('\n');
  const csv = `${header}\n${body}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatReplayClock(timestamp: number): string {
  const nyt = getNytDate(new Date(timestamp));
  return `${nyt.getHours().toString().padStart(2, '0')}:${nyt.getMinutes().toString().padStart(2, '0')}`;
}

export default function StrategySimulator({ activeSymbol }: StrategySimulatorProps) {
  const symbolSessions = useMemo(
    () => ALL_SESSIONS.filter((s) => s.symbol === activeSymbol),
    [activeSymbol],
  );
  const currentDaySession = useMemo(() => generateCurrentDaySession(activeSymbol), [activeSymbol]);

  const allSessions = useMemo(() => [currentDaySession, ...symbolSessions], [currentDaySession, symbolSessions]);

  const [simView, setSimView] = useState<SimView>('replay');
  const [sessionIdx, setSessionIdx] = useState(0);
  const session = allSessions[sessionIdx] ?? allSessions[0];

  const [currentBar, setCurrentBar] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [trades, setTrades] = useState<SimTrade[]>([]);
  const [tradeCounter, setTradeCounter] = useState(0);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [alertType, setAlertType] = useState<'fib' | 'edge' | 'none' | 'mae'>('none');
  const [autoExecute, setAutoExecute] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [lastAutoBar, setLastAutoBar] = useState(-1);
  const [sniperProfileId, setSniperProfileId] = useState<SniperProfileId>(getDefaultSniperProfile(activeSymbol).id);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastCounter = useRef(0);

  // Cooldown locks: track consecutive losses per direction for the current session
  const [longCooldown, setLongCooldown] = useState(false);
  const [shortCooldown, setShortCooldown] = useState(false);
  const [last15mSweepBar, setLast15mSweepBar] = useState(-1);

  // Tally view state
  const [selectedDayIds, setSelectedDayIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [ledgerHistory, setLedgerHistory] = useState<LedgerTrade[]>([]);
  const [factorBd, setFactorBd] = useState<FactorBreakdown | null>(null);

  // Reset when session or symbol changes
  useEffect(() => {
    setCurrentBar(0);
    setIsPlaying(false);
    setTrades([]);
    setTradeCounter(0);
    setAlertMsg(null);
    setAlertType('none');
    setLastAutoBar(-1);
    setToasts([]);
    setSniperProfileId(getDefaultSniperProfile(activeSymbol).id);
    setLongCooldown(false);
    setShortCooldown(false);
    setLast15mSweepBar(-1);
  }, [sessionIdx, activeSymbol]);

  // Playback timer
  useEffect(() => {
    if (isPlaying && currentBar < session.candles.length - 1) {
      intervalRef.current = setInterval(() => {
        setCurrentBar((b) => {
          if (b >= session.candles.length - 1) { setIsPlaying(false); return b; }
          return b + 1;
        });
      }, BASE_INTERVAL_MS / speed);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    } else {
      setIsPlaying(false);
    }
  }, [isPlaying, speed, currentBar, session.candles.length]);

  // Exit check + MAE tracking
  useEffect(() => {
    if (currentBar === 0) return;
    const candle = session.candles[currentBar];
    if (!candle) return;
    setTrades((prev) => prev.map((t) => {
      if (t.result !== 'open') return t;

      // Track MAE (max adverse excursion)
      const currentAdverse = t.direction === 'LONG'
        ? Math.max(0, t.entry - candle.low)
        : Math.max(0, candle.high - t.entry);
      const newMae = Math.max(t.mae, currentAdverse);
      const maeCheck = checkMaeGuardrail(session.symbol, newMae);
      const maeFlagged = maeCheck.exceeded;

      let exited = false; let exitPrice = 0;
      if (t.direction === 'LONG') {
        if (candle.high >= t.target) { exited = true; exitPrice = t.target; }
        else if (candle.low <= t.stop) { exited = true; exitPrice = t.stop; }
      } else {
        if (candle.low <= t.target) { exited = true; exitPrice = t.target; }
        else if (candle.high >= t.stop) { exited = true; exitPrice = t.stop; }
      }
      if (exited) {
        const raw = t.direction === 'LONG' ? exitPrice - t.entry : t.entry - exitPrice;
        return { ...t, exitBar: currentBar, exitPrice, result: raw > 0 ? 'win' as const : 'loss' as const, points: Math.round(Math.abs(raw) * 100) / 100, mae: newMae, maeFlagged };
      }
      return { ...t, mae: newMae, maeFlagged };
    }));
  }, [currentBar, session]);

  const liveData = useMemo(() => {
    if (currentBar === 0 || !session) return null;
    const candle = session.candles[currentBar];
    const priceData = buildPriceData(session, candle, currentBar);
    const seenCandles = session.candles.slice(0, currentBar + 1);
    const prob = calculateProbability(activeSymbol, priceData, seenCandles, session.htfMatrix);
    return { candle, priceData, prob };
  }, [currentBar, session, activeSymbol]);

  useEffect(() => {
    if (!liveData) return;
    const nytMin = getNytMinutesFromTimestamp(liveData.candle.time);
    const edgeWin = getEdgeWindowForMinute(nytMin);
    const fibHit = checkFibHit(session, liveData.candle.close);

    // Check MAE flags on open trades
    const maeFlagged = trades.some((t) => t.maeFlagged && t.result === 'open');
    if (maeFlagged) {
      const guardrail = MAE_GUARDRAILS[activeSymbol];
      setAlertMsg(`High Drawdown Risk — Widen Exhaustion Wick (MAE guardrail: median ${guardrail.median}pt / 80th ${guardrail.p80}pt)`);
      setAlertType('mae');
    } else if (edgeWin) {
      setAlertMsg(`${edgeWin.label} ACTIVE — ${edgeWin.winRate}% historical win rate`);
      setAlertType('edge');
    } else if (fibHit) {
      setAlertMsg(`Price at ${fibHit} — key reaction zone`);
      setAlertType('fib');
    } else {
      setAlertMsg(null);
      setAlertType('none');
    }
  }, [liveData, session, trades, activeSymbol]);

  // Check for 2-consecutive-loss cooldown and 15m sweep reset
  useEffect(() => {
    if (currentBar === 0) return;
    const autoLosses = trades.filter((t) => t.autoExecuted && t.result === 'loss');
    // Count consecutive losses in LONG direction
    const longLosses = autoLosses.filter((t) => t.direction === 'LONG');
    const shortLosses = autoLosses.filter((t) => t.direction === 'SHORT');

    // Check for 2 consecutive losses in the same direction
    if (longLosses.length >= 2 && !longCooldown) {
      const recent = longLosses.slice(-2);
      if (recent[0].exitBar !== null && recent[1].exitBar !== null &&
          recent[0].exitBar < (recent[1].exitBar ?? 0)) {
        setLongCooldown(true);
      }
    }
    if (shortLosses.length >= 2 && !shortCooldown) {
      const recent = shortLosses.slice(-2);
      if (recent[0].exitBar !== null && recent[1].exitBar !== null &&
          recent[0].exitBar < (recent[1].exitBar ?? 0)) {
        setShortCooldown(true);
      }
    }

    // Reset cooldown when a new 15m session sweep occurs (detected as a liquidity sweep candle)
    const candle = session.candles[currentBar];
    if (candle && currentBar >= 3) {
      const seenCandles = session.candles.slice(0, currentBar + 1);
      const recentHigh = Math.max(...seenCandles.slice(-6).map((c) => c.high));
      const recentLow = Math.min(...seenCandles.slice(-6).map((c) => c.low));
      const range = recentHigh - recentLow;
      if (range > 0) {
        const sweptHigh = candle.high >= recentHigh - range * 0.005;
        const sweptLow = candle.low <= recentLow + range * 0.005;
        if ((sweptHigh || sweptLow) && currentBar !== last15mSweepBar) {
          setLast15mSweepBar(currentBar);
          setLongCooldown(false);
          setShortCooldown(false);
        }
      }
    }
  }, [currentBar, trades, session, longCooldown, shortCooldown, last15mSweepBar]);

  // Auto-execute
  useEffect(() => {
    if (!autoExecute || !liveData || currentBar === 0) return;
    const hasOpen = trades.some((t) => t.result === 'open');
    if (hasOpen || lastAutoBar === currentBar) return;

    // Tension Edge Strict Filter: require tension >= 2.5 and at session extreme/core fib
    if (!liveData.prob.tensionTriggered) return;
    if (liveData.prob.midRangeBlocked) return;

    let autoDir: 'LONG' | 'SHORT' | null = null;
    if (liveData.prob.longProbability >= AUTO_EXECUTE_THRESHOLD) autoDir = 'LONG';
    else if (liveData.prob.shortProbability >= AUTO_EXECUTE_THRESHOLD) autoDir = 'SHORT';

    // Macro Gate: block counter-trend if macro continuation and tension < 3.0
    if (autoDir && liveData.prob.macroBlocked === autoDir) return;

    // Cooldown lock: block auto-execute for this direction if in cooldown
    if (autoDir === 'LONG' && longCooldown) return;
    if (autoDir === 'SHORT' && shortCooldown) return;

    if (autoDir) {
      const profile = SNIPER_PROFILES[sniperProfileId];
      const entry = liveData.candle.close;
      const target = autoDir === 'LONG' ? entry + profile.targetPoints : entry - profile.targetPoints;
      const stop = autoDir === 'LONG' ? entry - profile.stopPoints : entry + profile.stopPoints;
      const id = tradeCounter + 1;
      setTradeCounter(id);
      setLastAutoBar(currentBar);
      setTrades((prev) => [...prev, { id, direction: autoDir, entry, target, stop, entryBar: currentBar, exitBar: null, exitPrice: null, result: 'open', points: 0, autoExecuted: true, sniperProfileId: profile.id, mae: 0, maeFlagged: false }]);
      const toastId = ++toastCounter.current;
      setToasts((prev) => [...prev, { id: toastId, text: `AUTO-${autoDir} ${profile.label} @ ${formatPrice(entry, activeSymbol)} | TP: ${formatPrice(target, activeSymbol)} | SL: ${formatPrice(stop, activeSymbol)}`, direction: autoDir }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 3500);
    }
  }, [liveData, autoExecute, currentBar, trades, lastAutoBar, tradeCounter, activeSymbol, sniperProfileId]);

  // Scorecard
  const closedTrades = trades.filter((t) => t.result !== 'open');
  const wins = closedTrades.filter((t) => t.result === 'win');
  const losses = closedTrades.filter((t) => t.result === 'loss');
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  const grossWinPoints = wins.reduce((s, t) => s + t.points, 0);
  const grossLossPoints = losses.reduce((s, t) => s + t.points, 0);
  const netPoints = grossWinPoints - grossLossPoints;
  const dollarPerPoint = activeSymbol === 'ES' ? 50 : 20;
  const totalPnl = netPoints * dollarPerPoint;
  const autoClosed = closedTrades.filter((t) => t.autoExecuted);
  const autoWins = autoClosed.filter((t) => t.result === 'win');
  const autoWinRate = autoClosed.length > 0 ? (autoWins.length / autoClosed.length) * 100 : 0;
  const autoNetPoints = autoWins.reduce((s, t) => s + t.points, 0) - autoClosed.filter((t) => t.result === 'loss').reduce((s, t) => s + t.points, 0);
  const autoPnl = autoNetPoints * dollarPerPoint;
  const manualClosed = closedTrades.filter((t) => !t.autoExecuted);
  const manualWins = manualClosed.filter((t) => t.result === 'win');
  const manualWinRate = manualClosed.length > 0 ? (manualWins.length / manualClosed.length) * 100 : 0;
  const manualNetPoints = manualWins.reduce((s, t) => s + t.points, 0) - manualClosed.filter((t) => t.result === 'loss').reduce((s, t) => s + t.points, 0);
  const manualPnl = manualNetPoints * dollarPerPoint;

  function executeTrade(direction: 'LONG' | 'SHORT') {
    if (!liveData || currentBar === 0) return;
    const profile = SNIPER_PROFILES[sniperProfileId];
    const entry = liveData.candle.close;
    const target = direction === 'LONG' ? entry + profile.targetPoints : entry - profile.targetPoints;
    const stop = direction === 'LONG' ? entry - profile.stopPoints : entry + profile.stopPoints;
    const id = tradeCounter + 1;
    setTradeCounter(id);
    setTrades((prev) => [...prev, { id, direction, entry, target, stop, entryBar: currentBar, exitBar: null, exitPrice: null, result: 'open', points: 0, autoExecuted: false, sniperProfileId: profile.id, mae: 0, maeFlagged: false }]);
  }

  function handlePlay() {
    if (currentBar >= session.candles.length - 1) { setCurrentBar(0); setTrades([]); setTradeCounter(0); setLastAutoBar(-1); }
    setIsPlaying(true);
  }
  function handlePause() { setIsPlaying(false); }
  function handleStep() { if (currentBar < session.candles.length - 1) setCurrentBar((b) => b + 1); }
  function handleReset() { setIsPlaying(false); setCurrentBar(0); setTrades([]); setTradeCounter(0); setLastAutoBar(-1); setToasts([]); setLongCooldown(false); setShortCooldown(false); setLast15mSweepBar(-1); }
  function handleSessionChange(idx: number) { setSessionIdx(idx); }

  // Batch tally functions
  async function handleRunBatch() {
    setBatchRunning(true);
    try {
      const ids = selectedDayIds.size > 0 ? [...selectedDayIds] : null;
      const result = await runBatch(allSessions, ids);
      setBatchResult(result);
      setFactorBd(computeFactorBreakdown(result.trades));
      const history = await loadLedgerHistory();
      setLedgerHistory(history);
    } catch (e) {
      console.error('Batch run failed:', e);
    }
    setBatchRunning(false);
  }

  async function handleLoadHistory() {
    const history = await loadLedgerHistory();
    setLedgerHistory(history);
    if (history.length > 0) {
      setFactorBd(computeFactorBreakdown(history));
    }
  }

  async function handleClearLedger() {
    await clearLedger();
    setLedgerHistory([]);
    setBatchResult(null);
    setFactorBd(null);
  }

  function toggleDaySelection(id: string) {
    setSelectedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (simView === 'tally') handleLoadHistory();
  }, [simView]);

  if (!session) {
    return <div className="bg-black border border-[#1a1a1a] rounded-xl p-8 text-center"><p className="text-sm text-slate-500">No replay sessions available for {activeSymbol}</p></div>;
  }

  const progress = (currentBar / (session.candles.length - 1)) * 100;
  const hasOpenTrade = trades.some((t) => t.result === 'open');
  const replayClock = currentBar > 0 ? formatReplayClock(session.candles[currentBar].time) : '--:--';
  const isCurrentDay = session.id.endsWith('-current-day');

  // View toggle (rendered before early return so TS doesn't narrow the type)
  const viewToggle = (
    <div className="flex items-center gap-1 bg-black border border-[#1a1a1a] rounded-xl p-1">
      <button onClick={() => setSimView('replay')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${simView === 'replay' ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
        <Play className="w-3.5 h-3.5" /> Replay Engine
      </button>
      <button onClick={() => setSimView('tally')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${simView === 'tally' ? 'bg-violet-500/15 text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}>
        <Layers className="w-3.5 h-3.5" /> Multi-Day Master Tally
      </button>
    </div>
  );

  // Tally view
  if (simView === 'tally') {
    return (
      <div className="space-y-3">
        {viewToggle}
        <TallyView
          activeSymbol={activeSymbol}
          allSessions={allSessions}
          selectedDayIds={selectedDayIds}
          toggleDaySelection={toggleDaySelection}
          batchRunning={batchRunning}
          batchResult={batchResult}
          factorBd={factorBd}
          ledgerHistory={ledgerHistory}
          onRunBatch={handleRunBatch}
          onLoadHistory={handleLoadHistory}
          onClearLedger={handleClearLedger}
          onBackToReplay={() => setSimView('replay')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 space-y-2 pointer-events-none">
          {toasts.map((toast) => (
            <div key={toast.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg ${toast.direction === 'LONG' ? 'bg-emerald-500/20 border-emerald-500/50 shadow-emerald-500/20' : 'bg-rose-500/20 border-rose-500/50 shadow-rose-500/20'}`}>
              <Zap className={`w-4 h-4 ${toast.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`} />
              <span className={`text-sm font-bold font-mono ${toast.direction === 'LONG' ? 'text-emerald-300' : 'text-rose-300'}`}>{toast.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* View Toggle */}
      {viewToggle}

      {/* Session Selector */}
      <div className="bg-black border border-[#1a1a1a] rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Award className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">Strategy Simulator & Replay Engine</h3>
          <span className="ml-auto text-[9px] text-slate-600 font-mono uppercase tracking-wider">90-Day Edge Matrix</span>
        </div>
        <div className="relative">
          <select value={sessionIdx} onChange={(e) => handleSessionChange(Number(e.target.value))} className="w-full bg-black border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none appearance-none cursor-pointer">
            {allSessions.map((s, i) => (
              <option key={s.id} value={i}>
                {s.label}{s.pattern !== 'Live Session Replay' ? ` — ${s.pattern} (${s.winRate}% WR)` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${isCurrentDay ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>{session.pattern}</span>
          <span className="text-[10px] px-2 py-0.5 bg-violet-500/10 border border-violet-500/30 text-violet-300 rounded font-mono">{session.context}</span>
          {!isCurrentDay && <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded font-mono font-bold">{session.winRate}% WR</span>}
          <span className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] text-slate-400 rounded font-mono">{session.timeLabel}</span>
        </div>
      </div>

      {/* Replay Control Bar */}
      <div className="bg-black border border-[#1a1a1a] rounded-xl p-3">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={isPlaying ? handlePause : handlePlay} className={`flex items-center justify-center w-10 h-10 rounded-lg border transition-all ${isPlaying ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25'}`}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={handleStep} disabled={currentBar >= session.candles.length - 1} className="flex items-center justify-center w-10 h-10 rounded-lg border bg-[#1a1a1a]/50 border-[#2a2a2a] text-slate-300 hover:text-emerald-400 hover:border-emerald-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
            <SkipForward className="w-4 h-4" />
          </button>
          <button onClick={handleReset} className="flex items-center justify-center w-10 h-10 rounded-lg border bg-[#1a1a1a]/50 border-[#2a2a2a] text-slate-300 hover:text-rose-400 hover:border-rose-500/30 transition-all">
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 ml-1">
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`text-[10px] px-2 py-1.5 rounded border font-mono font-bold transition-all ${speed === s ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-black border-[#2a2a2a] text-slate-500 hover:text-slate-300'}`}>{s}x</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1a1a1a]/50 border border-[#2a2a2a] rounded-lg">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-sm font-mono font-bold text-emerald-400 tabular-nums">{replayClock}</span>
            <span className="text-[9px] text-slate-500">NY</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-600 font-mono">Bar {currentBar}/{session.candles.length - 1}</span>
          <input type="range" min={0} max={session.candles.length - 1} value={currentBar} onChange={(e) => setCurrentBar(Number(e.target.value))} className="flex-1 accent-emerald-500" />
          <span className="text-[9px] text-slate-600 font-mono">{progress.toFixed(0)}%</span>
        </div>
      </div>

      {/* Alert Banner */}
      {alertMsg && currentBar > 0 && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${alertType === 'edge' ? 'bg-rose-500/10 border-rose-500/30' : alertType === 'mae' ? 'bg-orange-500/10 border-orange-500/40' : 'bg-amber-500/10 border-amber-500/30'}`}>
          <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${alertType === 'edge' ? 'text-rose-400' : alertType === 'mae' ? 'text-orange-400' : 'text-amber-400'}`} />
          <span className={`text-xs font-bold ${alertType === 'edge' ? 'text-rose-300' : alertType === 'mae' ? 'text-orange-300' : 'text-amber-300'}`}>{alertMsg}</span>
          {alertType === 'edge' && <Zap className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
          {alertType === 'mae' && <Activity className="w-3.5 h-3.5 text-orange-400 ml-auto" />}
        </div>
      )}

      {/* Live Probabilities */}
      {liveData && (
        <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">Live Probability Engine</h3>
            <span className="text-[9px] text-slate-600 font-mono ml-auto">Replay Bar {currentBar}</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Long</span>
                {autoExecute && liveData.prob.longProbability >= AUTO_EXECUTE_THRESHOLD && !hasOpenTrade && <span className="text-[8px] px-1 py-0.5 bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 rounded font-bold animate-pulse">AUTO-TRIGGER</span>}
              </div>
              <div className={`text-3xl font-bold font-mono ${getProbabilityColor(liveData.prob.longProbability)} tabular-nums`}>{liveData.prob.longProbability}<span className="text-base text-slate-600">%</span></div>
              <div className="mt-1 h-2 bg-black rounded-full overflow-hidden border border-[#1a1a1a]"><div className={`h-full rounded-full transition-all duration-300 ${getProbabilityBg(liveData.prob.longProbability)}`} style={{ width: `${liveData.prob.longProbability}%` }} /></div>
            </div>
            <div className="w-px h-16 bg-[#1a1a1a]" />
            <div className="flex-1 text-right">
              <div className="flex items-center justify-end gap-1.5 mb-1">
                {autoExecute && liveData.prob.shortProbability >= AUTO_EXECUTE_THRESHOLD && !hasOpenTrade && <span className="text-[8px] px-1 py-0.5 bg-rose-500/30 border border-rose-500/50 text-rose-300 rounded font-bold animate-pulse">AUTO-TRIGGER</span>}
                <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Short</span>
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className={`text-3xl font-bold font-mono ${getProbabilityColor(liveData.prob.shortProbability)} tabular-nums`}>{liveData.prob.shortProbability}<span className="text-base text-slate-600">%</span></div>
              <div className="mt-1 h-2 bg-black rounded-full overflow-hidden border border-[#1a1a1a]"><div className={`h-full rounded-full transition-all duration-300 ml-auto ${getProbabilityBg(liveData.prob.shortProbability)}`} style={{ width: `${liveData.prob.shortProbability}%` }} /></div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5"><span className="text-[10px] text-slate-500 uppercase">Price</span><span className="text-sm font-mono font-bold text-white tabular-nums">{formatPrice(liveData.candle.close, activeSymbol)}</span></div>
            <div className="flex items-center gap-1.5"><span className="text-[10px] text-slate-500 uppercase">PDH</span><span className="text-[10px] font-mono text-violet-300">{formatPrice(session.prevDayHigh, activeSymbol)}</span></div>
            <div className="flex items-center gap-1.5"><span className="text-[10px] text-slate-500 uppercase">PDL</span><span className="text-[10px] font-mono text-violet-300">{formatPrice(session.prevDayLow, activeSymbol)}</span></div>
            {liveData.prob.edgeWindowActive && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded font-bold">EDGE WINDOW +15%</span>}
            {liveData.prob.ftcActive && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded font-bold">FTC {liveData.prob.htfAlignment.toUpperCase()}</span>}
          </div>
          {/* OTE & Tension */}
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] text-slate-500 uppercase">ON_EQ</span>
              <span className="text-[10px] font-mono font-bold text-cyan-400">{formatPrice(liveData.prob.overnightEq, activeSymbol)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-slate-400" />
              <span className="text-[9px] text-slate-500 uppercase">Tension</span>
              <span className={`text-[10px] font-mono font-bold tabular-nums ${liveData.prob.tensionTriggered ? 'text-rose-400' : 'text-slate-400'}`}>{liveData.prob.tensionRatio.toFixed(2)}x{liveData.prob.tensionTriggered ? ' TRIGGER' : ''}</span>
            </div>
            {liveData.prob.oteZone && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${liveData.prob.oteZone === 'Discount OTE' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'}`}>
                {liveData.prob.oteZone === 'Discount OTE' ? 'DISCOUNT OTE — LONGS' : 'PREMIUM OTE — SHORTS'}
              </span>
            )}
          </div>
          {/* Mini chart */}
          <div className="mt-3 h-20 flex items-end gap-px overflow-hidden">
            {session.candles.slice(Math.max(0, currentBar - 30), currentBar + 1).map((c, i, arr) => {
              const chartHigh = Math.max(...arr.map((x) => x.high));
              const chartLow = Math.min(...arr.map((x) => x.low));
              const chartRange = chartHigh - chartLow || 1;
              const isUp = c.close >= c.open;
              const bodyTop = ((chartHigh - Math.max(c.open, c.close)) / chartRange) * 100;
              const bodyHeight = Math.max(2, (Math.abs(c.close - c.open) / chartRange) * 100);
              const wickTop = ((chartHigh - c.high) / chartRange) * 100;
              const wickBot = ((chartHigh - c.low) / chartRange) * 100;
              return (
                <div key={i} className="flex-1 relative h-full" style={{ minWidth: 2 }}>
                  <div className="absolute left-1/2 -translate-x-1/2 w-px bg-slate-700" style={{ top: `${wickTop}%`, height: `${wickBot - wickTop}%` }} />
                  <div className={`absolute left-1/2 -translate-x-1/2 w-full rounded-sm ${isUp ? 'bg-emerald-500' : 'bg-rose-500'} ${i === arr.length - 1 ? 'ring-1 ring-emerald-400/50' : ''}`} style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Execution Panel */}
      <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Crosshair className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">Sniper Execution</h3>
          {hasOpenTrade && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded font-bold animate-pulse">POSITION OPEN</span>}
          <button onClick={() => setAutoExecute((v) => !v)} className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${autoExecute ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-black border-[#2a2a2a] text-slate-500 hover:text-slate-300'}`}>
            <Bot className={`w-3.5 h-3.5 ${autoExecute ? 'text-emerald-400' : 'text-slate-500'}`} />
            <Zap className="w-3 h-3" />
            Auto-Execute at {AUTO_EXECUTE_THRESHOLD}%
            <span className={`ml-1 w-7 h-3.5 rounded-full transition-all relative ${autoExecute ? 'bg-emerald-500' : 'bg-[#2a2a2a]'}`}><span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${autoExecute ? 'left-3.5' : 'left-0.5'}`} /></span>
          </button>
        </div>
        {autoExecute && (
          <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <Bot className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-[11px] text-emerald-300 font-medium">Auto-Execute armed — monitoring for {AUTO_EXECUTE_THRESHOLD}% LONG or SHORT probability signal with {SNIPER_PROFILES[sniperProfileId].label}</span>
          </div>
        )}
        {/* Sniper Profile Selector */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Bracket Profile:</span>
          {getSniperProfilesForSymbol(activeSymbol).map((p) => (
            <button key={p.id} onClick={() => setSniperProfileId(p.id)} className={`text-[10px] px-2.5 py-1.5 rounded border font-mono font-bold transition-all ${sniperProfileId === p.id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-black border-[#2a2a2a] text-slate-500 hover:text-slate-300'}`}>
              {p.label} | SL {p.stopPoints}pt TP {p.targetPoints}pt
            </button>
          ))}
        </div>
        {/* Profile detail */}
        <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg flex-wrap text-[10px] font-mono">
          <span className="text-slate-500">Entry Sweep:</span><span className="text-cyan-400 font-bold">±{SNIPER_PROFILES[sniperProfileId].entrySweep}pt</span>
          <span className="text-slate-500">Risk:</span><span className="text-rose-400 font-bold">${SNIPER_PROFILES[sniperProfileId].totalRisk}</span>
          <span className="text-slate-500">Reward:</span><span className="text-emerald-400 font-bold">${SNIPER_PROFILES[sniperProfileId].totalReward}</span>
          <span className="text-slate-500">R:R:</span><span className="text-amber-400 font-bold">1:{SNIPER_PROFILES[sniperProfileId].riskReward.toFixed(2)}</span>
          <span className="text-slate-500">Contracts:</span><span className="text-white font-bold">{SNIPER_PROFILES[sniperProfileId].contracts}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => executeTrade('LONG')} disabled={currentBar === 0 || hasOpenTrade} className="flex items-center justify-center gap-2 py-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-bold text-sm rounded-lg hover:bg-emerald-500/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
            <TrendingUp className="w-4 h-4" /> BUY LONG (+{SNIPER_PROFILES[sniperProfileId].targetPoints} pts)
          </button>
          <button onClick={() => executeTrade('SHORT')} disabled={currentBar === 0 || hasOpenTrade} className="flex items-center justify-center gap-2 py-3 bg-rose-500/15 border border-rose-500/40 text-rose-400 font-bold text-sm rounded-lg hover:bg-rose-500/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
            <TrendingDown className="w-4 h-4" /> SELL SHORT (-{SNIPER_PROFILES[sniperProfileId].targetPoints} pts)
          </button>
        </div>
        {trades.length > 0 && (
          <div className="space-y-1.5">
            {trades.slice(-5).map((t) => (
              <div key={t.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${t.result === 'open' ? 'bg-amber-500/5 border-amber-500/20' : t.result === 'win' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                <span className={`text-[10px] font-bold ${t.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.direction}</span>
                {t.autoExecuted && <span className="text-[8px] px-1 py-0.5 bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded font-bold">AUTO</span>}
                <span className="text-[8px] px-1 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] text-slate-400 rounded font-mono">{t.sniperProfileId}</span>
                <span className="text-[10px] font-mono text-slate-400">@ {formatPrice(t.entry, activeSymbol)}</span>
                <div className="flex items-center gap-1 text-[9px] text-slate-500"><Target className="w-2.5 h-2.5 text-emerald-400/70" />{formatPrice(t.target, activeSymbol)}</div>
                <div className="flex items-center gap-1 text-[9px] text-slate-500"><Shield className="w-2.5 h-2.5 text-rose-400/70" />{formatPrice(t.stop, activeSymbol)}</div>
                {t.mae > 0 && <span className={`text-[8px] font-mono font-bold ${t.maeFlagged ? 'text-orange-400' : 'text-slate-500'}`}>MAE {t.mae.toFixed(1)}pt</span>}
                <span className="ml-auto text-[10px] font-mono font-bold">
                  {t.result === 'open' && <span className="text-amber-400">OPEN</span>}
                  {t.result === 'win' && <span className="text-emerald-400">+{t.points.toFixed(2)} pts</span>}
                  {t.result === 'loss' && <span className="text-rose-400">-{t.points.toFixed(2)} pts</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scorecard */}
      <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">Replay Scorecard</h3>
          <button
            onClick={() => {
              const rows: string[][] = [['Direction', 'Auto', 'Profile', 'Entry', 'Target', 'Stop', 'Result', 'Points', 'MAE', 'MAE Flagged']];
              for (const t of closedTrades) {
                rows.push([t.direction, t.autoExecuted ? 'Yes' : 'No', t.sniperProfileId, t.entry.toFixed(2), t.target.toFixed(2), t.stop.toFixed(2), t.result, t.points.toFixed(2), t.mae.toFixed(1), t.maeFlagged ? 'Yes' : 'No']);
              }
              downloadCsv(`replay-trades-${session.id}-${Date.now()}.csv`, rows);
            }}
            disabled={closedTrades.length === 0}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-black border border-[#2a2a2a] text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 rounded-lg text-[10px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download className="w-3 h-3" /> Export CSV
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-black border border-[#1a1a1a] rounded-lg p-2 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Total Trades</div><div className="text-lg font-mono font-bold text-white tabular-nums">{closedTrades.length}</div></div>
          <div className="bg-black border border-[#1a1a1a] rounded-lg p-2 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Win Rate</div><div className={`text-lg font-mono font-bold tabular-nums ${winRate >= 60 ? 'text-emerald-400' : winRate > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{closedTrades.length > 0 ? `${winRate.toFixed(0)}%` : '--'}</div></div>
          <div className="bg-black border border-[#1a1a1a] rounded-lg p-2 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Net Pts</div><div className={`text-lg font-mono font-bold tabular-nums ${netPoints > 0 ? 'text-emerald-400' : netPoints < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{closedTrades.length > 0 ? `${netPoints > 0 ? '+' : ''}${netPoints.toFixed(1)}` : '--'}</div></div>
          <div className="bg-black border border-[#1a1a1a] rounded-lg p-2 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">P&L</div><div className={`text-lg font-mono font-bold tabular-nums ${totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{closedTrades.length > 0 ? `${totalPnl > 0 ? '+' : ''}${Math.abs(totalPnl).toFixed(0)}` : '--'}</div></div>
        </div>
        {/* MAE Guardrail */}
        {closedTrades.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg">
            <Activity className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">MAE Guardrail</span>
            <span className="text-[10px] font-mono text-slate-400">Median {MAE_GUARDRAILS[activeSymbol].median}pt</span>
            <span className="text-[10px] font-mono text-slate-400">/ 80th {MAE_GUARDRAILS[activeSymbol].p80}pt</span>
            {(() => {
              const flagged = closedTrades.filter((t) => t.maeFlagged);
              if (flagged.length === 0) return <span className="text-[10px] font-mono font-bold text-emerald-400 ml-auto">All trades within guardrails</span>;
              return <span className="text-[10px] font-mono font-bold text-orange-400 ml-auto">{flagged.length} trade{flagged.length > 1 ? 's' : ''} flagged — High Drawdown Risk</span>;
            })()}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2"><Bot className="w-3 h-3 text-violet-400" /><span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">Auto-Executed Signals</span></div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="text-center"><div className="text-[8px] text-slate-500 uppercase">Trades</div><div className="text-sm font-mono font-bold text-white tabular-nums">{autoClosed.length}</div></div>
              <div className="text-center"><div className="text-[8px] text-slate-500 uppercase">Win Rate</div><div className={`text-sm font-mono font-bold tabular-nums ${autoWinRate >= 60 ? 'text-emerald-400' : autoWinRate > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{autoClosed.length > 0 ? `${autoWinRate.toFixed(0)}%` : '--'}</div></div>
              <div className="text-center"><div className="text-[8px] text-slate-500 uppercase">Net P&L</div><div className={`text-sm font-mono font-bold tabular-nums ${autoPnl > 0 ? 'text-emerald-400' : autoPnl < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{autoClosed.length > 0 ? `${autoPnl > 0 ? '+' : ''}$${Math.abs(autoPnl).toFixed(0)}` : '--'}</div></div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-violet-500/10"><span className="text-[8px] text-slate-500">Pts Captured</span><span className={`text-[10px] font-mono font-bold ${autoNetPoints > 0 ? 'text-emerald-400' : autoNetPoints < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{autoClosed.length > 0 ? `${autoNetPoints > 0 ? '+' : ''}${autoNetPoints.toFixed(1)}` : '--'}</span></div>
          </div>
          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2"><Zap className="w-3 h-3 text-cyan-400" /><span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">Manual Trades</span></div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="text-center"><div className="text-[8px] text-slate-500 uppercase">Trades</div><div className="text-sm font-mono font-bold text-white tabular-nums">{manualClosed.length}</div></div>
              <div className="text-center"><div className="text-[8px] text-slate-500 uppercase">Win Rate</div><div className={`text-sm font-mono font-bold tabular-nums ${manualWinRate >= 60 ? 'text-emerald-400' : manualWinRate > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{manualClosed.length > 0 ? `${manualWinRate.toFixed(0)}%` : '--'}</div></div>
              <div className="text-center"><div className="text-[8px] text-slate-500 uppercase">Net P&L</div><div className={`text-sm font-mono font-bold tabular-nums ${manualPnl > 0 ? 'text-emerald-400' : manualPnl < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{manualClosed.length > 0 ? `${manualPnl > 0 ? '+' : ''}$${Math.abs(manualPnl).toFixed(0)}` : '--'}</div></div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-cyan-500/10"><span className="text-[8px] text-slate-500">Pts Captured</span><span className={`text-[10px] font-mono font-bold ${manualNetPoints > 0 ? 'text-emerald-400' : manualNetPoints < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{manualClosed.length > 0 ? `${manualNetPoints > 0 ? '+' : ''}${manualNetPoints.toFixed(1)}` : '--'}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-4 pt-2 border-t border-[#1a1a1a]">
          <div className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-emerald-400" /><span className="text-[10px] text-slate-500 font-mono">Wins</span><span className="text-xs font-mono font-bold text-emerald-400">{wins.length}</span><span className="text-[9px] text-slate-600">({grossWinPoints.toFixed(1)} pts)</span></div>
          <div className="flex items-center gap-1.5"><TrendingDown className="w-3 h-3 text-rose-400" /><span className="text-[10px] text-slate-500 font-mono">Losses</span><span className="text-xs font-mono font-bold text-rose-400">{losses.length}</span><span className="text-[9px] text-slate-600">({grossLossPoints.toFixed(1)} pts)</span></div>
          <div className="ml-auto flex items-center gap-1.5"><Flame className="w-3 h-3 text-amber-400" /><span className="text-[10px] text-slate-500 font-mono">${dollarPerPoint}/pt {activeSymbol}</span></div>
        </div>
      </div>
    </div>
  );
}

// ===== Tally View Component =====

interface TallyViewProps {
  activeSymbol: AssetSymbol;
  allSessions: ReplaySession[];
  selectedDayIds: Set<string>;
  toggleDaySelection: (id: string) => void;
  batchRunning: boolean;
  batchResult: BatchResult | null;
  factorBd: FactorBreakdown | null;
  ledgerHistory: LedgerTrade[];
  onRunBatch: () => void;
  onLoadHistory: () => void;
  onClearLedger: () => void;
  onBackToReplay: () => void;
}

function TallyView({
  activeSymbol, allSessions, selectedDayIds, toggleDaySelection,
  batchRunning, batchResult, factorBd, ledgerHistory,
  onRunBatch, onClearLedger, onBackToReplay,
}: TallyViewProps) {
  const symbolSessions = allSessions.filter((s) => s.symbol === activeSymbol && !s.id.endsWith('-current-day'));
  const dollarPerPoint = activeSymbol === 'ES' ? 50 : 20;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-black border border-[#1a1a1a] rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-slate-200">Multi-Day Master Tally Ledger</h3>
          <button onClick={onBackToReplay} className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-black border border-[#2a2a2a] text-slate-400 hover:text-emerald-400 rounded-lg text-[10px] font-bold transition-all">
            <Play className="w-3 h-3" /> Back to Replay
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Select individual days or run all 90-Day Matrix sessions in batch. Auto-execution fires at 100% probability for each session programmatically.</p>

        {/* Day selection grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3">
          {symbolSessions.map((s) => {
            const selected = selectedDayIds.has(s.id);
            return (
              <button key={s.id} onClick={() => toggleDaySelection(s.id)} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all ${selected ? 'bg-violet-500/10 border-violet-500/30' : 'bg-black border-[#1a1a1a] hover:border-[#2a2a2a]'}`}>
                {selected ? <CheckSquare className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" /> : <Square className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-mono text-slate-300 truncate">{s.label}</div>
                  <div className="text-[8px] text-slate-600">{s.pattern} — {s.winRate}% WR</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Batch controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onRunBatch} disabled={batchRunning} className="flex items-center gap-1.5 px-4 py-2 bg-violet-500/15 border border-violet-500/40 text-violet-400 font-bold text-xs rounded-lg hover:bg-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {batchRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {batchRunning ? 'Running Batch...' : selectedDayIds.size > 0 ? `Run ${selectedDayIds.size} Selected Day${selectedDayIds.size > 1 ? 's' : ''}` : 'Run All 90-Day Matrix Days in Batch'}
          </button>
          <button onClick={onClearLedger} className="flex items-center gap-1.5 px-3 py-2 bg-black border border-[#2a2a2a] text-slate-500 hover:text-rose-400 hover:border-rose-500/30 font-bold text-xs rounded-lg transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Clear Ledger
          </button>
          <div className="ml-auto flex items-center gap-1.5 text-[9px] text-slate-600 font-mono">
            <Database className="w-3 h-3" />
            {ledgerHistory.length} trades in persistent ledger
          </div>
        </div>
      </div>

      {/* Master Scorecard */}
      {batchResult && (
        <div className="bg-black border border-violet-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-slate-200">Master Scorecard — Batch Result</h3>
            <span className="text-[9px] text-slate-600 font-mono ml-auto">{batchResult.batchId}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="bg-black border border-[#1a1a1a] rounded-lg p-2 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Total Trades</div><div className="text-lg font-mono font-bold text-white tabular-nums">{batchResult.totalTrades}</div></div>
            <div className="bg-black border border-[#1a1a1a] rounded-lg p-2 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Master Win Rate</div><div className={`text-lg font-mono font-bold tabular-nums ${batchResult.winRate >= 60 ? 'text-emerald-400' : batchResult.winRate > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{batchResult.totalTrades > 0 ? `${batchResult.winRate.toFixed(0)}%` : '--'}</div></div>
            <div className="bg-black border border-[#1a1a1a] rounded-lg p-2 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Total Pts ({activeSymbol})</div><div className={`text-lg font-mono font-bold tabular-nums ${batchResult.netPoints > 0 ? 'text-emerald-400' : batchResult.netPoints < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{batchResult.totalTrades > 0 ? `${batchResult.netPoints > 0 ? '+' : ''}${batchResult.netPoints.toFixed(1)}` : '--'}</div></div>
            <div className="bg-black border border-[#1a1a1a] rounded-lg p-2 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Net P&L</div><div className={`text-lg font-mono font-bold tabular-nums ${batchResult.totalPnl > 0 ? 'text-emerald-400' : batchResult.totalPnl < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{batchResult.totalTrades > 0 ? `${batchResult.totalPnl > 0 ? '+' : ''}$${Math.abs(batchResult.totalPnl).toFixed(0)}` : '--'}</div></div>
          </div>
          {/* Best setup */}
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Best Performing Setup</span>
            <span className="text-xs font-mono font-bold text-emerald-400 ml-auto">{batchResult.bestSetup}</span>
          </div>
          {/* Wins/losses */}
          <div className="flex items-center gap-4 mt-3 pt-2 border-t border-[#1a1a1a]">
            <div className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-emerald-400" /><span className="text-[10px] text-slate-500 font-mono">Wins</span><span className="text-xs font-mono font-bold text-emerald-400">{batchResult.wins}</span></div>
            <div className="flex items-center gap-1.5"><TrendingDown className="w-3 h-3 text-rose-400" /><span className="text-[10px] text-slate-500 font-mono">Losses</span><span className="text-xs font-mono font-bold text-rose-400">{batchResult.losses}</span></div>
            <div className="ml-auto flex items-center gap-1.5"><Flame className="w-3 h-3 text-amber-400" /><span className="text-[10px] text-slate-500 font-mono">${dollarPerPoint}/pt {activeSymbol}</span></div>
          </div>
        </div>
      )}

      {/* Advanced Factor Breakdown */}
      {factorBd && (batchResult || ledgerHistory.length > 0) && (
        <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-200">Advanced Factor Breakdown</h3>
          </div>

          {/* Liquidity Sweeps */}
          <div className="mb-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-bold">Session Liquidity Sweeps</div>
            <div className="grid grid-cols-3 gap-2">
              {([['asia', 'Asia H/L', factorBd.liquidity.asia], ['london', 'London H/L', factorBd.liquidity.london], ['ny', 'NY H/L', factorBd.liquidity.ny]] as const).map(([key, label, data]) => (
                <div key={key} className="bg-black border border-[#1a1a1a] rounded-lg p-2.5">
                  <div className="text-[10px] font-bold text-slate-300 mb-1">{label}</div>
                  <div className="flex items-center justify-between text-[9px]"><span className="text-slate-500">Trades</span><span className="font-mono font-bold text-white tabular-nums">{data.trades}</span></div>
                  <div className="flex items-center justify-between text-[9px]"><span className="text-slate-500">Win Rate</span><span className={`font-mono font-bold tabular-nums ${data.winRate >= 60 ? 'text-emerald-400' : data.winRate > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{data.trades > 0 ? `${data.winRate.toFixed(0)}%` : '--'}</span></div>
                  <div className="flex items-center justify-between text-[9px]"><span className="text-slate-500">Net Pts</span><span className={`font-mono font-bold tabular-nums ${data.netPoints > 0 ? 'text-emerald-400' : data.netPoints < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{data.trades > 0 ? `${data.netPoints > 0 ? '+' : ''}${data.netPoints.toFixed(1)}` : '--'}</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* Pullback Depth */}
          <div className="mb-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-bold">Pullback Depth</div>
            <div className="grid grid-cols-3 gap-2">
              {([['p0', '0 Pullback', factorBd.pullback.p0], ['p1', '1 Pullback', factorBd.pullback.p1], ['p2plus', '2+ Pullbacks', factorBd.pullback.p2plus]] as const).map(([key, label, data]) => (
                <div key={key} className="bg-black border border-[#1a1a1a] rounded-lg p-2.5">
                  <div className="text-[10px] font-bold text-slate-300 mb-1">{label}</div>
                  <div className="flex items-center justify-between text-[9px]"><span className="text-slate-500">Trades</span><span className="font-mono font-bold text-white tabular-nums">{data.trades}</span></div>
                  <div className="flex items-center justify-between text-[9px]"><span className="text-slate-500">Win Rate</span><span className={`font-mono font-bold tabular-nums ${data.winRate >= 60 ? 'text-emerald-400' : data.winRate > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{data.trades > 0 ? `${data.winRate.toFixed(0)}%` : '--'}</span></div>
                  <div className="flex items-center justify-between text-[9px]"><span className="text-slate-500">Net Pts</span><span className={`font-mono font-bold tabular-nums ${data.netPoints > 0 ? 'text-emerald-400' : data.netPoints < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{data.trades > 0 ? `${data.netPoints > 0 ? '+' : ''}${data.netPoints.toFixed(1)}` : '--'}</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* Fib Level Accuracy */}
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-bold">Fib Level Accuracy</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(factorBd.fib).sort(([, a], [, b]) => b.trades - a.trades).map(([label, data]) => (
                <div key={label} className="bg-black border border-[#1a1a1a] rounded-lg p-2.5">
                  <div className="text-[10px] font-bold text-slate-300 mb-1">{label}</div>
                  <div className="flex items-center justify-between text-[9px]"><span className="text-slate-500">Trades</span><span className="font-mono font-bold text-white tabular-nums">{data.trades}</span></div>
                  <div className="flex items-center justify-between text-[9px]"><span className="text-slate-500">Win Rate</span><span className={`font-mono font-bold tabular-nums ${data.winRate >= 60 ? 'text-emerald-400' : data.winRate > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{data.trades > 0 ? `${data.winRate.toFixed(0)}%` : '--'}</span></div>
                  <div className="flex items-center justify-between text-[9px]"><span className="text-slate-500">Net Pts</span><span className={`font-mono font-bold tabular-nums ${data.netPoints > 0 ? 'text-emerald-400' : data.netPoints < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{data.trades > 0 ? `${data.netPoints > 0 ? '+' : ''}${data.netPoints.toFixed(1)}` : '--'}</span></div>
                </div>
              ))}
              {Object.keys(factorBd.fib).length === 0 && (
                <div className="col-span-full text-center py-4 text-[10px] text-slate-600">No Fib-level entries recorded in this batch</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent trades from ledger */}
      {ledgerHistory.length > 0 && (
        <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-200">Persistent Ledger — Recent Trades</h3>
            <span className="text-[9px] text-slate-600 font-mono">{ledgerHistory.length} total</span>
            <button
              onClick={() => {
                const rows: string[][] = [['Batch ID', 'Session', 'Symbol', 'Date', 'Direction', 'Entry', 'Target', 'Stop', 'Result', 'Points', 'P&L $', 'Auto', 'Profile', 'MAE', 'MAE Flagged', 'OTE Zone', 'Tension', 'Tension Triggered', 'Fib Level', 'Liquidity Session', 'Pullback Depth', 'Edge Window']];
                for (const t of ledgerHistory) {
                  rows.push([t.batchId, t.sessionLabel, t.symbol, t.sessionDate, t.direction, t.entryPrice.toFixed(2), t.targetPrice.toFixed(2), t.stopPrice.toFixed(2), t.result, t.pointsCaptured.toFixed(2), t.pnlDollars.toFixed(0), t.autoExecuted ? 'Yes' : 'No', t.sniperProfileId, t.mae.toFixed(1), t.maeFlagged ? 'Yes' : 'No', t.oteZone ?? '', t.tensionRatio.toFixed(2), t.tensionTriggered ? 'Yes' : 'No', t.fibLevel ?? '', t.liquiditySession ?? '', String(t.pullbackDepth), t.edgeWindow ?? '']);
                }
                downloadCsv(`master-ledger-${Date.now()}.csv`, rows);
              }}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-black border border-[#2a2a2a] text-slate-400 hover:text-violet-400 hover:border-violet-500/30 rounded-lg text-[10px] font-bold transition-all"
            >
              <Download className="w-3 h-3" /> Export All
            </button>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {ledgerHistory.slice(0, 20).map((t, i) => (
              <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] ${t.result === 'win' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                <span className={`font-bold ${t.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.direction}</span>
                <span className="font-mono text-slate-400">{t.sessionLabel}</span>
                {t.edgeWindow && <span className="text-[8px] px-1 py-0.5 bg-amber-500/15 text-amber-400 rounded font-bold">{t.edgeWindow}</span>}
                {t.fibLevel && <span className="text-[8px] px-1 py-0.5 bg-violet-500/15 text-violet-300 rounded font-bold">{t.fibLevel}</span>}
                <span className="ml-auto font-mono font-bold">
                  {t.result === 'win' ? <span className="text-emerald-400">+{t.pointsCaptured.toFixed(1)} pts</span> : <span className="text-rose-400">-{t.pointsCaptured.toFixed(1)} pts</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!batchResult && ledgerHistory.length === 0 && (
        <div className="bg-black border border-[#1a1a1a] rounded-xl p-8 text-center">
          <Layers className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No batch results yet. Select days above or click "Run All" to start.</p>
        </div>
      )}
    </div>
  );
}
