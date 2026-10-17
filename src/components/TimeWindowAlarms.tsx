import { useEffect, useState } from 'react';
import { Clock, Zap, BellRing, AlertTriangle } from 'lucide-react';
import { getNytMinutes, formatNytClock, getNytDate } from '@/lib/nytTime';

interface TimeWindow {
  start: { h: number; m: number };
  end: { h: number; m: number };
  label: string;
  description: string;
  edgePattern: string;
  winRate: number;
}

const EDGE_WINDOWS: TimeWindow[] = [
  {
    start: { h: 9, m: 45 },
    end: { h: 10, m: 30 },
    label: 'AM Reversal Window',
    description: 'Highest-confluence reversal window — 2d-2u / 2u-2d Strat setups at Fib & liquidity boundaries',
    edgePattern: '2d-2u / 2u-2d at Fib',
    winRate: 78,
  },
  {
    start: { h: 13, m: 30 },
    end: { h: 14, m: 0 },
    label: 'Power Hour Reversal',
    description: 'Secondary reversal window — liquidity sweeps and PDH/PDL rejections with above-average edge',
    edgePattern: 'Liquidity Sweep Reversal',
    winRate: 74,
  },
];

function toMinutes(t: { h: number; m: number }): number {
  return t.h * 60 + t.m;
}

export default function TimeWindowAlarms() {
  const [nyMinutes, setNyMinutes] = useState(getNytMinutes());
  const [nyClock, setNyClock] = useState(formatNytClock());
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setNyMinutes(getNytMinutes());
      setNyClock(formatNytClock());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const estMinutes = nyMinutes;

  const activeWindow = EDGE_WINDOWS.find((w) => {
    const startMin = toMinutes(w.start);
    const endMin = toMinutes(w.end);
    return estMinutes >= startMin && estMinutes < endMin;
  });

  const nextWindow = EDGE_WINDOWS
    .filter((w) => toMinutes(w.start) > estMinutes)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))[0];

  // Pulse animation when in an active window
  useEffect(() => {
    if (activeWindow) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 600);
      return () => clearTimeout(timer);
    }
    setPulse(false);
  }, [activeWindow, nyMinutes]);

  if (activeWindow) {
    const endMin = toMinutes(activeWindow.end);
    const minsLeft = endMin - estMinutes;
    return (
      <div
        className={`px-3 py-2.5 border-b border-rose-500/30 bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-amber-500/10 ${
          pulse ? 'ring-1 ring-rose-500/20' : ''
        }`}
      >
        <div className="flex items-center gap-2 max-w-[1600px] mx-auto flex-wrap">
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/30 border border-rose-500/50 ${pulse ? 'animate-pulse' : ''}`}>
            <BellRing className="w-3.5 h-3.5 text-rose-300" />
            <span className="text-[10px] font-bold text-rose-200 tracking-wider uppercase">EDGE WINDOW ACTIVE</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-mono font-bold text-white tabular-nums">{nyClock} NY</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-amber-300">{activeWindow.label}</span>
            <span className="text-[10px] text-slate-400">· {activeWindow.edgePattern}</span>
          </div>

          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30">
            <Zap className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-mono font-bold text-emerald-300">{activeWindow.winRate}% WR</span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            <span className="text-xs font-bold text-rose-300">
              {minsLeft} min left — PREP ENTRIES NOW
            </span>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 max-w-[1600px] mx-auto">
          {activeWindow.description}
        </p>
      </div>
    );
  }

  // Idle state — show clock and next window
  const nextStartStr = nextWindow
    ? `${nextWindow.start.h}:${nextWindow.start.m.toString().padStart(2, '0')} EST`
    : 'Tomorrow';

  return (
    <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-black">
      <div className="flex items-center gap-2 max-w-[1600px] mx-auto flex-wrap">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.3 text-slate-500" />
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">{nyClock} NY</span>
        </div>

        <div className="flex items-center gap-1.5">
          {EDGE_WINDOWS.map((w, i) => {
            const startMin = toMinutes(w.start);
            const endMin = toMinutes(w.end);
            const isPast = estMinutes >= endMin;
            const isUpcoming = estMinutes < startMin;

            return (
              <div
                key={i}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${
                  isPast
                    ? 'border-[#1a1a1a] text-slate-600 bg-[#1a1a1a]/10'
                    : isUpcoming
                      ? 'border-[#2a2a2a] text-slate-400 bg-[#1a1a1a]/20'
                      : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isPast ? 'bg-[#3a3a3c]' : isUpcoming ? 'bg-emerald-500/60' : 'bg-emerald-500 animate-pulse'
                }`} />
                {w.start.h}:{w.start.m.toString().padStart(2, '0')}–{w.end.h}:{w.end.m.toString().padStart(2, '0')}
                <span className="text-slate-600 hidden sm:inline">{w.label}</span>
              </div>
            );
          })}
        </div>

        {nextWindow && (
          <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
            <span>Next edge window:</span>
            <span className="font-mono font-bold text-cyan-400">{nextStartStr}</span>
            <span className="text-slate-600 hidden sm:inline">({nextWindow.winRate}% WR)</span>
          </div>
        )}
      </div>
    </div>
  );
}
