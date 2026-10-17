import { Zap, Activity, Layers3, Box, Radar } from 'lucide-react';
import type { AutomatedDetection, HtfCandleState } from '@/lib/types';

interface ConfluenceChecklistProps {
  detection: AutomatedDetection;
}

const STATE_STYLES: Record<HtfCandleState, string> = {
  '2U-Up': 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
  '2D-Down': 'bg-rose-500/20 border-rose-500/40 text-rose-400',
  '1-Inside': 'bg-violet-500/20 border-violet-500/40 text-violet-300',
  '3-Outside': 'bg-amber-500/20 border-amber-500/40 text-amber-400',
};

const HTF_ROWS: { key: keyof AutomatedDetection['htfMatrix']; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'daily', label: 'Daily' },
  { key: 'fourHour', label: '4-Hour' },
  { key: 'oneHour', label: '1-Hour' },
];

export default function ConfluenceChecklist({ detection }: ConfluenceChecklistProps) {
  const ftcBadge = detection.ftcActive
    ? { text: `FTC: ${detection.ftcAlignment.toUpperCase()}`, cls: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' }
    : detection.ftcAlignment !== 'mixed'
      ? { text: `Partial: ${detection.ftcAlignment.toUpperCase()}`, cls: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300' }
      : { text: 'HTF Mixed', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300' };

  const stratActive = detection.isBullish2d2u || detection.isBearish2u2d;
  const ictActive = detection.ictArray !== 'None';

  return (
    <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-slate-200">Automated Detection Engine</h3>
      </div>

      {/* Automated feed banner */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 mb-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
        <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
        <span className="text-[10px] text-emerald-300 font-bold tracking-wider uppercase">
          100% Automated Data Feed — Real-Time Compute
        </span>
      </div>

      {/* HTF STRAT Confluence Matrix — Read Only */}
      <div className="mb-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Layers3 className="w-3 h-3 text-violet-400" />
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">HTF STRAT Matrix</label>
          <span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold tracking-wide ${ftcBadge.cls}`}>
            {ftcBadge.text}
          </span>
        </div>
        <div className="space-y-1.5">
          {HTF_ROWS.map((tf) => {
            const state = detection.htfMatrix[tf.key];
            return (
              <div key={tf.key} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 w-12 flex-shrink-0">{tf.label}</span>
                <div className="flex-1 flex gap-1">
                  {(['1-Inside', '2U-Up', '2D-Down', '3-Outside'] as HtfCandleState[]).map((s) => (
                    <div
                      key={s}
                      className={`flex-1 text-[10px] px-1 py-1.5 rounded border text-center font-medium ${
                        state === s ? STATE_STYLES[s] : 'bg-black border-[#1a1a1a] text-slate-700'
                      }`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 15m Candle State */}
      <div className="mb-3">
        <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">15m Candle State</label>
        <div className="flex gap-1">
          {(['1-Inside', '2U-Up', '2D-Down', '3-Outside'] as HtfCandleState[]).map((s) => (
            <div
              key={s}
              className={`flex-1 text-[10px] px-1 py-1.5 rounded border text-center font-medium ${
                detection.fifteenMsState === s ? STATE_STYLES[s] : 'bg-black border-[#1a1a1a] text-slate-700'
              }`}
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Strat Pattern Detection */}
      <div className="mb-3">
        <label className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
          <Radar className="w-3 h-3" />
          Strat Reversal Pattern
        </label>
        <div className={`px-2.5 py-2 rounded-lg border ${
          stratActive
            ? detection.isBullish2d2u
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-rose-500/10 border-rose-500/30'
            : 'bg-black border-[#1a1a1a]'
        }`}>
          <span className={`text-xs font-bold ${
            stratActive
              ? detection.isBullish2d2u ? 'text-emerald-400' : 'text-rose-400'
              : 'text-slate-500'
          }`}>
            {detection.stratPattern}
          </span>
          {stratActive && (
            <span className="ml-2 text-[9px] text-slate-500">— auto-detected from 15m sequence</span>
          )}
        </div>
      </div>

      {/* ICT Array Detection */}
      <div className="mb-3">
        <label className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
          <Box className="w-3 h-3" />
          ICT Array Proximity
        </label>
        <div className={`px-2.5 py-2 rounded-lg border ${
          ictActive
            ? detection.priceInFvg
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-cyan-500/10 border-cyan-500/25'
            : 'bg-black border-[#1a1a1a]'
        }`}>
          <span className={`text-xs font-bold ${
            ictActive
              ? detection.priceInFvg ? 'text-emerald-400' : 'text-cyan-300'
              : 'text-slate-500'
          }`}>
            {detection.ictArray}
          </span>
          {ictActive && (
            <p className="text-[10px] text-slate-400 mt-0.5">{detection.ictDescription}</p>
          )}
          {detection.priceInFvg && (
            <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded border border-emerald-500/20 font-bold">
              PRICE INSIDE FVG
            </span>
          )}
          {detection.priceNearOb && !detection.priceInFvg && (
            <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-300 rounded border border-cyan-500/20 font-bold">
              ORDER BLOCK ZONE
            </span>
          )}
        </div>
      </div>

      {/* Lock indicator */}
      <div className="flex items-center justify-center gap-1.5 pt-1 border-t border-[#1a1a1a]/50">
        <span className="text-[9px] text-slate-600 uppercase tracking-wider">
          Locked — probabilities computed exclusively from live market data
        </span>
      </div>
    </div>
  );
}
