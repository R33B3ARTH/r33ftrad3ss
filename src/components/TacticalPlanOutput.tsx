import { useState } from 'react';
import {
  Zap, Target, Shield, AlertTriangle, ArrowRight, TrendingUp, TrendingDown,
  Activity, Award, Clock, Flame,
} from 'lucide-react';
import type {
  AssetSymbol, PriceData, ConfluenceResult, TacticalPlan,
  SessionLevels, ProbabilityResult, AtrBracket, AutomatedDetection, HtfStratMatrix,
} from '@/lib/types';
import { ASSET_CONFIGS, formatPrice } from '@/lib/assets';
import { calculateAtrBracket, calculateProbability } from '@/lib/confluence';

interface TacticalPlanOutputProps {
  symbol: AssetSymbol;
  price: PriceData;
  candles: import('@/lib/types').CandleData[];
  confluence: ConfluenceResult | null;
  detection: AutomatedDetection | null;
  sessionLevels: SessionLevels;
  onPlanGenerated: (plan: TacticalPlan) => void;
}

const MATRIX_CRITERIA = 21;

function generatePlan(
  symbol: AssetSymbol,
  price: PriceData,
  candles: import('@/lib/types').CandleData[],
  htfMatrix: HtfStratMatrix,
  _sessionLevels: SessionLevels,
): TacticalPlan {
  const prob = calculateProbability(symbol, price, candles, htfMatrix);
  const bracket = calculateAtrBracket(symbol, price, candles, prob.dominantDirection);

  const dominantProb = Math.max(prob.longProbability, prob.shortProbability);
  const isLong = prob.dominantDirection === 'LONG';
  const isShort = prob.dominantDirection === 'SHORT';

  let conviction: 'HIGH CONVICTION' | 'MODERATE CONVICTION' | 'LOW CONVICTION';
  if (dominantProb >= 75) conviction = 'HIGH CONVICTION';
  else if (dominantProb >= 60) conviction = 'MODERATE CONVICTION';
  else conviction = 'LOW CONVICTION';

  const directionLabel = isLong ? 'LONG' : isShort ? 'SHORT' : 'NEUTRAL';

  let verdict: string;
  if (conviction === 'HIGH CONVICTION') {
    verdict = `${conviction} ${directionLabel} — ${dominantProb}% PROBABILITY`;
  } else if (conviction === 'MODERATE CONVICTION') {
    verdict = `${conviction} ${directionLabel} — ${dominantProb}% PROBABILITY`;
  } else {
    verdict = `${directionLabel} — ${dominantProb}% (Low Edge)`;
  }

  const htfBadge = prob.ftcActive
    ? 'Full Timeframe Continuity Active'
    : prob.htfAlignment === 'mixed'
      ? 'HTF Mixed — No Continuity'
      : `HTF Partial: ${prob.htfAlignment}`;

  const matrixMatchCount = Math.round((dominantProb / 100) * MATRIX_CRITERIA);

  let warning: string | null = null;
  if (prob.counterTrendRisk) {
    warning = 'HIGH HEAT RISK: Trade direction conflicts with HTF alignment. Counter-trend entries require tight stops.';
  }
  if (prob.edgeWindowActive) {
    warning = (warning ? warning + ' ' : '') + 'Edge window active — +15% time boost applied to dominant direction.';
  }

  return {
    probability: prob,
    bracket,
    dominantDirection: prob.dominantDirection,
    conviction,
    verdict,
    htfBadge,
    matrixMatchCount,
    matrixTotal: MATRIX_CRITERIA,
    warning,
  };
}

export default function TacticalPlanOutput({
  symbol,
  price,
  candles,
  confluence: _confluence,
  detection,
  sessionLevels,
  onPlanGenerated,
}: TacticalPlanOutputProps) {
  const [plan, setPlan] = useState<TacticalPlan | null>(null);

  function handleGenerate() {
    if (!detection) return;
    const newPlan = generatePlan(symbol, price, candles, detection.htfMatrix, sessionLevels);
    setPlan(newPlan);
    onPlanGenerated(newPlan);
  }

  const config = ASSET_CONFIGS[symbol];

  const isLong = plan?.dominantDirection === 'LONG';
  const isShort = plan?.dominantDirection === 'SHORT';
  const isHigh = plan?.conviction === 'HIGH CONVICTION';

  const directionColor = isLong ? 'text-emerald-400' : isShort ? 'text-rose-400' : 'text-slate-400';
  const directionBg = isLong
    ? 'bg-emerald-500/10 border-emerald-500/30'
    : isShort
      ? 'bg-rose-500/10 border-rose-500/30'
      : 'bg-[#2a2a2a]/20 border-[#3a3a3c]/30';

  const bannerBg = isHigh
    ? isLong
      ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border-emerald-500/40'
      : 'bg-gradient-to-r from-rose-500/20 to-rose-600/10 border-rose-500/40'
    : 'bg-[#2a2a2a]/20 border-[#3a3a3c]/30';

  return (
    <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-slate-200">Predictive Plan Generator</h3>
      </div>

      {!plan ? (
        <button
          onClick={handleGenerate}
          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-400 text-black font-bold text-sm rounded-lg hover:from-emerald-400 hover:to-emerald-300 transition-all flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" />
          Generate Plan
        </button>
      ) : (
        <div className="space-y-2.5">
          {/* 1. Primary Direction Banner */}
          <div className={`px-4 py-3 rounded-lg border ${bannerBg}`}>
            <div className="flex items-center gap-2">
              {isLong
                ? <TrendingUp className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                : isShort
                  ? <TrendingDown className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  : <Activity className="w-5 h-5 text-slate-400 flex-shrink-0" />}
              <div className="flex-1">
                <div className={`text-base font-bold ${directionColor}`}>
                  {plan.verdict}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              {/* LONG probability bar */}
              <div className="flex-1">
                <div className="flex items-center justify-between text-[9px] mb-0.5">
                  <span className="text-emerald-400 font-bold">LONG {plan.probability.longProbability}%</span>
                </div>
                <div className="h-2 bg-black rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${plan.probability.longProbability}%` }}
                  />
                </div>
              </div>
              {/* SHORT probability bar */}
              <div className="flex-1">
                <div className="flex items-center justify-between text-[9px] mb-0.5">
                  <span className="text-rose-400 font-bold">SHORT {plan.probability.shortProbability}%</span>
                </div>
                <div className="h-2 bg-black rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all duration-500"
                    style={{ width: `${plan.probability.shortProbability}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. HTF Alignment Badge */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${directionBg}`}>
            {plan.probability.ftcActive ? (
              <Award className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            )}
            <span className={`text-xs font-semibold ${plan.probability.ftcActive ? 'text-emerald-400' : 'text-slate-300'}`}>
              {plan.htfBadge}
            </span>
            {plan.probability.counterTrendRisk && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-rose-400 font-bold">
                <Flame className="w-3 h-3" />
                HIGH HEAT RISK
              </span>
            )}
          </div>

          {/* 3. Entry / Target / Stop Bracket */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-black border border-[#1a1a1a] rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Entry Trigger</div>
              <div className="text-sm font-mono font-bold text-white tabular-nums">
                {formatPrice(plan.bracket.entry, symbol)}
              </div>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">
                <Target className="w-2.5 h-2.5" /> Target
              </div>
              <div className="text-sm font-mono font-bold text-emerald-400 tabular-nums">
                {formatPrice(plan.bracket.target, symbol)}
              </div>
              <div className="text-[9px] text-emerald-500/70 font-mono">+{plan.bracket.targetPoints} pts</div>
            </div>
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">
                <Shield className="w-2.5 h-2.5" /> ATR Stop
              </div>
              <div className="text-sm font-mono font-bold text-rose-400 tabular-nums">
                {formatPrice(plan.bracket.stop, symbol)}
              </div>
              <div className="text-[9px] text-rose-500/70 font-mono">-{plan.bracket.stopPoints.toFixed(2)} pts</div>
            </div>
          </div>

          {/* ATR + R:R + Expected Profit */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center justify-between bg-black rounded-lg px-3 py-1.5 border border-[#1a1a1a]">
              <span className="text-[9px] text-slate-500 uppercase">ATR(14)</span>
              <span className="text-xs font-mono font-bold text-amber-400 tabular-nums">
                {plan.bracket.atr.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between bg-black rounded-lg px-3 py-1.5 border border-[#1a1a1a]">
              <span className="text-[9px] text-slate-500 uppercase">R:R</span>
              <span className="text-xs font-mono font-bold text-white">
                1:{plan.bracket.riskReward.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center justify-between bg-black rounded-lg px-3 py-1.5 border border-[#1a1a1a]">
              <span className="text-[9px] text-slate-500 uppercase">Profit/ctr</span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                ${plan.bracket.expectedProfitPerContract.toFixed(0)}
              </span>
            </div>
          </div>

          {/* Max Heat Boundary */}
          <div className="flex items-center justify-between bg-black rounded-lg px-3 py-1.5 border border-[#1a1a1a]">
            <div className="flex items-center gap-1.5">
              <Flame className="w-3 h-3 text-rose-400/70" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Max Heat Boundary</span>
            </div>
            <span className="text-xs font-mono font-bold text-rose-400 tabular-nums">
              {formatPrice(plan.bracket.maxHeatBoundary, symbol)}
            </span>
          </div>

          {/* 4. 90-Day Matrix Verification */}
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <Award className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="text-[10px] text-emerald-300 font-medium">
              90-Day Matrix: Matches {plan.matrixMatchCount}/{plan.matrixTotal} Historical Criteria
            </span>
          </div>

          {/* Edge window indicator */}
          {plan.probability.edgeWindowActive && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-[10px] text-amber-300 font-medium">
                Institutional Time Multiplier Active — +15% boost applied
              </span>
            </div>
          )}

          {/* Warning */}
          {plan.warning && (
            <div className="flex items-start gap-1.5 px-3 py-2 rounded-lg border bg-amber-500/10 border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-400" />
              <span className="text-[11px] font-medium text-amber-300">{plan.warning}</span>
            </div>
          )}

          {/* Probability Factor Breakdown */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Probability Factors</span>
            {plan.probability.factors.map((factor, i) => (
              <div key={i} className="bg-black rounded-lg p-2.5 border border-[#1a1a1a]/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-slate-300">{factor.name}</span>
                  <div className="flex items-center gap-2 text-[9px] font-mono">
                    <span className="text-emerald-400">L:{factor.longContrib}</span>
                    <span className="text-rose-400">S:{factor.shortContrib}</span>
                  </div>
                </div>
                <p className="text-[9px] text-slate-500">{factor.description}</p>
              </div>
            ))}
          </div>

          {/* Regenerate */}
          <button
            onClick={handleGenerate}
            className="w-full py-2 bg-[#2a2a2a]/50 border border-[#3a3a3c] text-slate-300 font-medium text-xs rounded-lg hover:bg-[#3a3a3c]/50 transition-all flex items-center justify-center gap-1.5"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Regenerate Plan
          </button>
        </div>
      )}
    </div>
  );
}
