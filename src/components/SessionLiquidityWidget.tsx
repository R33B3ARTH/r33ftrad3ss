import { useMemo } from 'react';
import { Globe } from 'lucide-react';
import type { AssetSymbol, CandleData } from '@/lib/types';
import { calculateSessionLiquidity, getActiveSession, SESSION_COLORS } from '@/lib/sessionLiquidity';
import { formatPrice } from '@/lib/assets';

interface SessionLiquidityWidgetProps {
  candles: CandleData[];
  symbol: AssetSymbol;
  precision: number;
}

export default function SessionLiquidityWidget({ candles, symbol, precision }: SessionLiquidityWidgetProps) {
  const liquidity = useMemo(() => calculateSessionLiquidity(candles), [candles]);
  const activeSession = useMemo(() => getActiveSession(), [candles]);

  const sessions = [
    {
      key: 'asia' as const,
      label: 'Asia',
      time: '18:00-03:00 NY',
      range: liquidity.asia,
      colors: SESSION_COLORS.asia,
      isActive: activeSession === 'asia',
      hasStarted: activeSession === 'asia' || activeSession === 'london' || activeSession === 'ny',
    },
    {
      key: 'london' as const,
      label: 'London',
      time: '03:00-09:30 NY',
      range: liquidity.london,
      colors: SESSION_COLORS.london,
      isActive: activeSession === 'london',
      hasStarted: activeSession === 'london' || activeSession === 'ny',
    },
    {
      key: 'ny' as const,
      label: 'NY RTH',
      time: '09:30-16:15 NY',
      range: liquidity.ny,
      colors: SESSION_COLORS.ny,
      isActive: activeSession === 'ny',
      hasStarted: activeSession === 'ny',
    },
  ];

  return (
    <div className="bg-black border border-[#1a1a1a] rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-3.5 h-3.5 text-slate-500" />
        <h3 className="text-[11px] font-semibold text-slate-300 font-mono uppercase tracking-wider">Session Liquidity</h3>
        <span className="text-[9px] text-slate-600 font-mono ml-auto">Time-gated - resets 18:00 NY</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {sessions.map((s) => {
          const hasData = s.range !== null;
          const showLevels = s.hasStarted && hasData;

          return (
            <div
              key={s.key}
              className={`rounded-lg border p-2 transition-all ${
                s.isActive
                  ? 'border-[#3a3a3c]/50 bg-[#1a1a1a]/20'
                  : s.hasStarted
                    ? 'border-[#2a2a2a] bg-black'
                    : 'border-[#1a1a1a] bg-black opacity-60'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.colors.high, boxShadow: s.isActive ? `0 0 4px ${s.colors.high}` : 'none' }}
                />
                <span className="text-[10px] font-mono font-bold text-slate-300">{s.label}</span>
                {s.isActive && (
                  <span className="text-[8px] text-emerald-400 font-mono animate-pulse ml-auto">LIVE</span>
                )}
                {!s.hasStarted && (
                  <span className="text-[8px] text-slate-600 font-mono ml-auto">PENDING</span>
                )}
              </div>

              <div className="text-[8px] text-slate-600 font-mono mb-1.5">{s.time}</div>

              {showLevels ? (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold" style={{ color: s.colors.high }}>
                      {s.key === 'asia' ? 'ASH' : s.key === 'london' ? 'LNH' : 'NYH'}
                    </span>
                    <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: s.colors.high }}>
                      {formatPrice(s.range!.high, symbol)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold" style={{ color: s.colors.low }}>
                      {s.key === 'asia' ? 'ASL' : s.key === 'london' ? 'LNL' : 'NYL'}
                    </span>
                    <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: s.colors.low }}>
                      {formatPrice(s.range!.low, symbol)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5 border-t border-[#1a1a1a]">
                    <span className="text-[8px] text-slate-600 font-mono">Range</span>
                    <span className="text-[9px] font-mono tabular-nums text-slate-400">
                      {(s.range!.high - s.range!.low).toFixed(precision)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-[9px] text-slate-600 font-mono text-center py-1.5">
                  {!s.hasStarted ? 'Pending' : s.isActive ? 'Building...' : 'Waiting'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
