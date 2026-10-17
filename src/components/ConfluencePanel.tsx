import { useEffect, useState } from 'react';
import { Zap, TrendingUp, TrendingDown, Minus, Gauge, Clock } from 'lucide-react';
import type { AssetSymbol, PriceData, CandleData, ConfluenceResult, HtfStratMatrix } from '@/lib/types';
import { calculateProbability, getProbabilityColor, getProbabilityBg } from '@/lib/confluence';

interface ConfluencePanelProps {
  symbol: AssetSymbol;
  price: PriceData;
  candles: CandleData[];
  threshold: number;
  htfMatrix: HtfStratMatrix;
  onSaveSetup: () => void;
}

export default function ConfluencePanel({ symbol, price, candles, threshold, htfMatrix, onSaveSetup }: ConfluencePanelProps) {
  const [result, setResult] = useState<ConfluenceResult | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const newResult = calculateProbability(symbol, price, candles, htfMatrix);
    setResult(newResult);
    const dominant = Math.max(newResult.longProbability, newResult.shortProbability);
    if (dominant >= threshold) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 600);
      return () => clearTimeout(timer);
    }
  }, [price, candles, symbol, threshold, htfMatrix]);

  if (!result) return null;

  const dominantProb = Math.max(result.longProbability, result.shortProbability);
  const isHighConfluence = dominantProb >= threshold;

  const directionIcon = result.dominantDirection === 'LONG'
    ? <TrendingUp className="w-4 h-4 text-emerald-400" />
    : result.dominantDirection === 'SHORT'
      ? <TrendingDown className="w-4 h-4 text-rose-400" />
      : <Minus className="w-4 h-4 text-slate-400" />;

  const directionBg = result.dominantDirection === 'LONG'
    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
    : result.dominantDirection === 'SHORT'
      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
      : 'bg-[#2a2a2a]/30 border-[#3a3a3c]/30 text-slate-400';

  return (
    <div className={`bg-black border rounded-xl p-4 transition-all ${
      isHighConfluence ? 'border-emerald-500/40 shadow-lg shadow-emerald-500/10' : 'border-[#1a1a1a]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">Predictive Probability Engine</h3>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium ${directionBg}`}>
          {directionIcon}
          {result.dominantDirection}
        </div>
      </div>

      {/* Dual Probability Display */}
      <div className="flex items-center gap-3 mb-4">
        {/* LONG side */}
        <div className={`flex-1 ${pulse && result.dominantDirection === 'LONG' ? 'animate-pulse' : ''}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Long</span>
          </div>
          <div className={`text-3xl font-bold font-mono ${getProbabilityColor(result.longProbability)} tabular-nums`}>
            {result.longProbability}<span className="text-base text-slate-600">%</span>
          </div>
          <div className="mt-1 h-2 bg-black rounded-full overflow-hidden border border-[#1a1a1a]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getProbabilityBg(result.longProbability)}`}
              style={{ width: `${result.longProbability}%` }}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-16 bg-[#1a1a1a]" />

        {/* SHORT side */}
        <div className={`flex-1 text-right ${pulse && result.dominantDirection === 'SHORT' ? 'animate-pulse' : ''}`}>
          <div className="flex items-center justify-end gap-1.5 mb-1">
            <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Short</span>
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className={`text-3xl font-bold font-mono ${getProbabilityColor(result.shortProbability)} tabular-nums`}>
            {result.shortProbability}<span className="text-base text-slate-600">%</span>
          </div>
          <div className="mt-1 h-2 bg-black rounded-full overflow-hidden border border-[#1a1a1a]">
            <div
              className={`h-full rounded-full transition-all duration-500 ml-auto ${getProbabilityBg(result.shortProbability)}`}
              style={{ width: `${result.shortProbability}%` }}
            />
          </div>
        </div>
      </div>

      {/* Edge window + FTC badges */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {result.edgeWindowActive && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] font-bold">
            <Clock className="w-3 h-3" />
            EDGE WINDOW +15%
          </div>
        )}
        {result.ftcActive && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
            FTC: {result.htfAlignment.toUpperCase()}
          </div>
        )}
        {result.counterTrendRisk && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-400 text-[10px] font-bold">
            COUNTER-TREND RISK
          </div>
        )}
        {isHighConfluence && (
          <button
            onClick={onSaveSetup}
            className="ml-auto text-[10px] px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
          >
            <Zap className="w-3 h-3" />
            Save Setup
          </button>
        )}
      </div>

      {/* Probability Factor Breakdown */}
      <div className="space-y-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Probability Factors</span>
        {result.factors.map((factor, i) => (
          <div key={i} className="bg-black rounded-lg p-2.5 border border-[#1a1a1a]/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-300">{factor.name}</span>
              <div className="flex items-center gap-2 text-[9px] font-mono">
                <span className={factor.longContrib > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                  L:{factor.longContrib}
                </span>
                <span className={factor.shortContrib > 0 ? 'text-rose-400 font-bold' : 'text-slate-600'}>
                  S:{factor.shortContrib}
                </span>
              </div>
            </div>
            <div className="flex gap-1 h-1">
              <div className="flex-1 bg-black rounded-full overflow-hidden border border-[#1a1a1a]">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${(factor.longContrib / 25) * 100}%` }}
                />
              </div>
              <div className="flex-1 bg-black rounded-full overflow-hidden border border-[#1a1a1a]">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-300 ml-auto"
                  style={{ width: `${(factor.shortContrib / 25) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{factor.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
