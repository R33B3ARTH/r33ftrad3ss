import { useState } from 'react';
import { Ruler, ArrowUp, ArrowDown, Target, Edit3, Check } from 'lucide-react';
import type { AssetSymbol, PriceData, AtrRange } from '@/lib/types';
import { calculateAtrRange } from '@/lib/scenarios';
import { ASSET_CONFIGS, formatPrice } from '@/lib/assets';

interface AtrMapperProps {
  symbol: AssetSymbol;
  price: PriceData;
}

export default function AtrMapper({ symbol, price }: AtrMapperProps) {
  const config = ASSET_CONFIGS[symbol];
  const [customAtr, setCustomAtr] = useState<number | null>(null);
  const [inputAtr, setInputAtr] = useState('');
  const [editing, setEditing] = useState(false);

  const atrRange: AtrRange = calculateAtrRange(symbol, price, customAtr ?? undefined);
  const positionPercent = atrRange.positionInRange;

  const topSidePercent = ((atrRange.topSide - atrRange.rangeLow) / (atrRange.rangeHigh - atrRange.rangeLow)) * 100;
  const bottomSidePercent = ((atrRange.bottomSide - atrRange.rangeLow) / (atrRange.rangeHigh - atrRange.rangeLow)) * 100;

  return (
    <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Ruler className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">ATR Range Mapper</h3>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={inputAtr}
                onChange={(e) => setInputAtr(e.target.value)}
                placeholder={config.dailyAtr.toString()}
                className="w-20 bg-black border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
                step="0.5"
              />
              <button
                onClick={() => {
                  const val = parseFloat(inputAtr);
                  if (!isNaN(val) && val > 0) setCustomAtr(val);
                  else setCustomAtr(null);
                  setEditing(false);
                }}
                className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setEditing(true); setInputAtr(customAtr?.toString() ?? ''); }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
            >
              <Edit3 className="w-3 h-3" />
              ATR: {atrRange.atr.toFixed(1)}
            </button>
          )}
        </div>
      </div>

      {/* Current Price */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 uppercase tracking-wider">Current Price</span>
        <span className="text-lg font-mono font-bold text-white tabular-nums">
          {formatPrice(atrRange.currentPrice, symbol)}
        </span>
      </div>

      {/* Range Bar */}
      <div className="relative mb-4">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1.5 font-mono">
          <span>L: {formatPrice(atrRange.rangeLow, symbol)}</span>
          <span>H: {formatPrice(atrRange.rangeHigh, symbol)}</span>
        </div>

        <div className="relative h-7 bg-black rounded-lg overflow-hidden border border-[#1a1a1a]">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 via-[#1a1a1a]/30 to-emerald-500/10" />

          {/* Bottom side marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-500/60"
            style={{ left: `${Math.max(0, Math.min(100, bottomSidePercent))}%` }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-amber-500 rounded-full" />
          </div>

          {/* Top side marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-500/60"
            style={{ left: `${Math.max(0, Math.min(100, topSidePercent))}%` }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-amber-500 rounded-full" />
          </div>

          {/* Current price indicator */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-cyan-400 shadow-lg shadow-cyan-400/50 transition-all duration-300"
            style={{ left: `${positionPercent}%`, transform: 'translateX(-50%)' }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-cyan-400 rounded-full animate-pulse" />
          </div>
        </div>

        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-amber-500/70 font-mono">BS: {formatPrice(atrRange.bottomSide, symbol)}</span>
          <span className="text-[10px] text-slate-500 font-mono">Pos: {positionPercent.toFixed(0)}%</span>
          <span className="text-[10px] text-amber-500/70 font-mono">TS: {formatPrice(atrRange.topSide, symbol)}</span>
        </div>
      </div>

      {/* Range Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">Top-Side Range</span>
          </div>
          <span className="text-base font-mono font-semibold text-emerald-300 tabular-nums">
            {formatPrice(atrRange.topSide, symbol)}
          </span>
          <div className="mt-2 h-1.5 bg-black rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(0, Math.min(100, topSidePercent))}%` }}
            />
          </div>
        </div>

        <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDown className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] text-rose-400 uppercase tracking-wider font-medium">Bottom-Side Range</span>
          </div>
          <span className="text-base font-mono font-semibold text-rose-300 tabular-nums">
            {formatPrice(atrRange.bottomSide, symbol)}
          </span>
          <div className="mt-2 h-1.5 bg-black rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-400 to-rose-600 rounded-full transition-all duration-500"
              style={{ width: `${100 - Math.max(0, Math.min(100, bottomSidePercent))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Target Info */}
      <div className="mt-3 flex items-center justify-between bg-black rounded-lg px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Point Target</span>
        </div>
        <span className="text-sm font-mono font-semibold text-cyan-400">
          {config.pointTarget} pts
        </span>
      </div>
    </div>
  );
}
