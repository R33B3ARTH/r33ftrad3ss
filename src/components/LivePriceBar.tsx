import { useEffect, useState } from 'react';
import { Activity, Edit, RefreshCw, Zap, Calendar, Newspaper, Flag } from 'lucide-react';
import type { AssetSymbol, PriceData, PriceSource, SessionType } from '@/lib/types';
import { ASSET_CONFIGS, formatPrice } from '@/lib/assets';
import { marketData } from '@/lib/marketData';

interface LivePriceBarProps {
  activeSymbol: AssetSymbol;
  price: PriceData | undefined;
  source: PriceSource;
  session: SessionType;
  onSessionChange: (s: SessionType) => void;
  newsKillSwitch: boolean;
  onNewsKillSwitchToggle: () => void;
}

const SESSIONS: SessionType[] = ['RTH', 'Pre-Market', 'Power Hour'];

export default function LivePriceBar({
  activeSymbol,
  price,
  source,
  session,
  onSessionChange,
  newsKillSwitch,
  onNewsKillSwitchToggle,
}: LivePriceBarProps) {
  const [syncValue, setSyncValue] = useState('');
  const [synced, setSynced] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [, setTick] = useState(0);

  const [resyncing, setResyncing] = useState(false);

  useEffect(() => {
    setLastUpdate(Date.now());
  }, [price?.price]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  function handleForceResync() {
    setResyncing(true);
    marketData.forceResync();
    setLastUpdate(Date.now());
    setTimeout(() => setResyncing(false), 1200);
  }

  function handleSync() {
    const val = parseFloat(syncValue);
    if (isNaN(val) || val <= 0) return;
    marketData.quickSyncPrice(activeSymbol, val);
    setSynced(true);
    setTimeout(() => setSynced(false), 1500);
    setSyncValue('');
  }

  const isLive = source === 'live';
  const isManual = source === 'manual';

  const statusColor = isLive ? 'text-emerald-400' : isManual ? 'text-amber-400' : 'text-slate-500';
  const statusBg = isLive ? 'bg-emerald-500/10 border-emerald-500/30' : isManual ? 'bg-amber-500/10 border-amber-500/30' : 'bg-[#2a2a2a]/20 border-[#3a3a3c]/30';
  const statusText = isLive ? 'LIVE: STREAMING' : isManual ? 'MANUAL SYNC' : 'SIMULATED';
  const dotColor = isLive ? 'bg-emerald-500' : isManual ? 'bg-amber-500' : 'bg-[#3a3a3c]';

  const config = ASSET_CONFIGS[activeSymbol];
  const secsAgo = Math.floor((Date.now() - lastUpdate) / 1000);

  return (
    <div className="border-b border-[#1a1a1a] bg-black">
      {/* Row 1: Status + Price + Sync */}
      <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold tracking-wider ${statusBg} ${statusColor}`}>
          <span className={`w-2 h-2 rounded-full ${dotColor} ${isLive ? 'animate-pulse' : ''}`} />
          {statusText}
        </div>

        {price && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{activeSymbol}</span>
            <span className="text-sm font-mono font-bold text-white tabular-nums">
              {formatPrice(price.price, activeSymbol)}
            </span>
            <span className={`text-[10px] font-mono tabular-nums ${price.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {price.change >= 0 ? '+' : ''}{price.change.toFixed(2)}
            </span>
          </div>
        )}

        {isLive && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <RefreshCw className={`w-2.5 h-2.5 ${resyncing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{resyncing ? 'Syncing...' : `${secsAgo}s ago`}</span>
          </div>
        )}

        <button
          onClick={handleForceResync}
          disabled={resyncing}
          className="flex items-center gap-1 text-[10px] px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded font-bold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          title="Purge cached data and fetch latest live tick"
        >
          <RefreshCw className={`w-3 h-3 ${resyncing ? 'animate-spin' : ''}`} />
          Force Resync
        </button>

        {price && price.prevDayHigh > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-300 rounded border border-violet-500/20">PDH {formatPrice(price.prevDayHigh, activeSymbol)}</span>
            <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-300 rounded border border-violet-500/20">PDL {formatPrice(price.prevDayLow, activeSymbol)}</span>
          </div>
        )}

        {/* Sync input */}
        <div className="ml-auto flex items-center gap-1.5">
          {synced ? (
            <div className="flex items-center gap-1 text-[10px] text-emerald-400 px-2 py-1">
              <Zap className="w-3 h-3" />
              Synced!
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <Edit className="w-3 h-3" />
                <span className="hidden sm:inline">Sync Offset:</span>
              </div>
              <input
                type="number"
                value={syncValue}
                onChange={(e) => setSyncValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSync()}
                placeholder={price ? price.price.toFixed(config.precision) : 'Price'}
                className="w-24 bg-black border border-[#2a2a2a] rounded px-2 py-1 text-[11px] text-white font-mono focus:border-emerald-500 focus:outline-none tabular-nums"
                step={config.tickSize}
              />
              <button
                onClick={handleSync}
                disabled={!syncValue}
                className="text-[10px] px-2.5 py-1 bg-emerald-500 text-black font-bold rounded hover:bg-emerald-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Sync
              </button>
            </>
          )}
        </div>
      </div>

      {/* Row 2: Session Selector + News Kill-Switch */}
      <div className="px-3 pb-1.5 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-slate-500" />
          {SESSIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSessionChange(s)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors font-medium ${
                session === s
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={onNewsKillSwitchToggle}
          className={`ml-auto flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold border transition-all ${
            newsKillSwitch
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
          }`}
        >
          <Flag className="w-3 h-3" />
          {newsKillSwitch ? 'NEWS KILLED' : 'NEWS ACTIVE'}
        </button>
      </div>
    </div>
  );
}
