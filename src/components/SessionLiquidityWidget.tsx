import { useMemo } from 'react';
import { Layers, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { AssetSymbol, CandleData } from '@/lib/types';
import { ASSET_CONFIGS, formatPrice } from '@/lib/assets';

interface SessionLiquidityWidgetProps {
  symbol: AssetSymbol;
  candles: CandleData[];
}

interface SessionRange {
  name: string;
  timeRange: string;
  color: string;
  borderColor: string;
  dotColor: string;
  high: number | null;
  low: number | null;
  range: number | null;
  isActive: boolean;
}

export default function SessionLiquidityWidget({ symbol, candles }: SessionLiquidityWidgetProps) {
  const sessions = useMemo(() => {
    if (!candles || candles.length === 0) {
      return [];
    }

    // Filter candles strictly for the current calendar day (NY Time)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayCandles = candles.filter((c) => c.time >= startOfDay);
    const evalCandles = todayCandles.length > 0 ? todayCandles : candles.slice(-50);

    // Session time windows in NY Time (hours)
    // Asia: 18:00 (prev day) - 03:00 NY
    // London: 03:00 - 09:30 NY
    // NY RTH: 09:30 - 16:15 NY
    const getSessionCandles = (startHour: number, endHour: number) => {
      return evalCandles.filter((c) => {
        const d = new Date(c.time);
        const hour = d.getHours() + d.getMinutes() / 60;
        if (startHour > endHour) {
          return hour >= startHour || hour < endHour;
        }
        return hour >= startHour && hour < endHour;
      });
    };

    const calculateRange = (sessionCandles: CandleData[]) => {
      if (sessionCandles.length === 0) return { high: null, low: null, range: null };
      let high = -Infinity;
      let low = Infinity;
      sessionCandles.forEach((c) => {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
      });
      return { high, low, range: high - low };
    };

    const asiaCandles = getSessionCandles(18, 3);
    const londonCandles = getSessionCandles(3, 9.5);
    const nyCandles = getSessionCandles(9.5, 16.25);

    const asia = calculateRange(asiaCandles);
    const london = calculateRange(londonCandles);
    const ny = calculateRange(nyCandles);

    const currentHour = now.getHours() + now.getMinutes() / 60;

    const sessionList: SessionRange[] = [
      {
        name: 'Asia',
        timeRange: '18:00-03:00 NY',
        color: 'text-amber-400',
        borderColor: 'border-amber-500/40',
        dotColor: '#eab308', // Yellow dotted line mapping
        high: asia.high,
        low: asia.low,
        range: asia.range,
        isActive: currentHour >= 18 || currentHour < 3,
      },
      {
        name: 'London',
        timeRange: '03:00-09:30 NY',
        color: 'text-blue-400',
        borderColor: 'border-blue-500/40',
        dotColor: '#3b82f6', // Blue dotted line mapping
        high: london.high,
        low: london.low,
        range: london.range,
        isActive: currentHour >= 3 && currentHour < 9.5,
      },
      {
        name: 'NY RTH',
        timeRange: '09:30-16:15 NY',
        color: 'text-orange-400',
        borderColor: 'border-orange-500/40',
        dotColor: '#f97316', // Orange dotted line mapping
        high: ny.high,
        low: ny.low,
        range: ny.range,
        isActive: currentHour >= 9.5 && currentHour < 16.25,
      },
    ];

    return sessionList;
  }, [candles]);

  return (
    <div className="bg-black border border-[#1a1a1a] rounded-xl p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Session Liquidity</h3>
        </div>
        <span className="text-[9px] font-mono text-slate-500">Time-gated resets 18:00 NY</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {sessions.map((s) => (
          <div
            key={s.name}
            className={`bg-black border rounded-lg p-2 ${
              s.isActive ? s.borderColor : 'border-[#1a1a1a]'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: s.dotColor }}
                />
                <span className={`text-[11px] font-bold ${s.color}`}>{s.name}</span>
              </div>
              {s.isActive && (
                <span className="text-[8px] px-1 py-0.2 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30 font-mono font-bold animate-pulse">
                  LIVE
                </span>
              )}
            </div>

            <div className="text-[8px] font-mono text-slate-500 mb-2">{s.timeRange}</div>

            <div className="space-y-1 font-mono text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-0.5">
                  <ArrowUpRight className="w-2.5 h-2.5 text-emerald-400" />
                  {s.name.charAt(0)}H
                </span>
                <span className="text-slate-200 font-bold tabular-nums">
                  {s.high !== null ? formatPrice(s.high, symbol) : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-0.5">
                  <ArrowDownRight className="w-2.5 h-2.5 text-rose-400" />
                  {s.name.charAt(0)}L
                </span>
                <span className="text-slate-200 font-bold tabular-nums">
                  {s.low !== null ? formatPrice(s.low, symbol) : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a]">
                <span className="text-slate-600 text-[8px]">Range</span>
                <span className="text-amber-400 font-bold text-[9px] tabular-nums">
                  {s.range !== null ? s.range.toFixed(2) : '--'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
