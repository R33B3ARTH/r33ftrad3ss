import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Wifi, WifiOff, Edit } from 'lucide-react';
import type { AssetSymbol, PriceData, PriceSource } from '@/lib/types';
import { ASSET_LIST, ASSET_CONFIGS, formatPrice } from '@/lib/assets';
import { marketData } from '@/lib/marketData';

interface TickerBarProps {
  activeSymbol: AssetSymbol;
  onSelect: (symbol: AssetSymbol) => void;
}

interface TickerEntry {
  price: PriceData | undefined;
  flash: 'up' | 'down' | null;
}

const SOURCE_CONFIG: Record<PriceSource, { label: string; color: string; icon: typeof Activity }> = {
  live: { label: 'LIVE', color: 'text-emerald-400', icon: Activity },
  manual: { label: 'MANUAL', color: 'text-amber-400', icon: Edit },
  sim: { label: 'SIM', color: 'text-slate-500', icon: WifiOff },
};

export default function TickerBar({ activeSymbol, onSelect }: TickerBarProps) {
  const [tickers, setTickers] = useState<Record<AssetSymbol, TickerEntry>>({
    ES: { price: undefined, flash: null },
    NQ: { price: undefined, flash: null },
  });
  const [source, setSource] = useState<PriceSource>('live');

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    ASSET_LIST.forEach((symbol) => {
      const unsub = marketData.subscribePrice(symbol, (price) => {
        setTickers((prev) => {
          const prevPrice = prev[symbol]?.price;
          const flash = prevPrice
            ? price.price > prevPrice.price
              ? 'up' as const
              : price.price < prevPrice.price
                ? 'down' as const
                : prev[symbol].flash
            : null;

          return {
            ...prev,
            [symbol]: { price, flash },
          };
        });
      });
      unsubs.push(unsub);
    });

    const unsubSource = marketData.subscribeSource((s) => setSource(s));
    unsubs.push(unsubSource);

    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!tickers[activeSymbol].flash) return;
    const timer = setTimeout(() => {
      setTickers((prev) => ({
        ...prev,
        [activeSymbol]: { ...prev[activeSymbol], flash: null },
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [tickers, activeSymbol]);

  const srcCfg = SOURCE_CONFIG[source];
  const SourceIcon = srcCfg.icon;

  return (
    <div className="border-b border-[#1a1a1a] bg-black">
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto">
        {ASSET_LIST.map((symbol) => {
          const entry = tickers[symbol];
          const price = entry?.price;
          const config = ASSET_CONFIGS[symbol];
          const isActive = symbol === activeSymbol;
          const isUp = (price?.change ?? 0) >= 0;
          const flashClass = entry?.flash === 'up'
            ? 'bg-emerald-500/10'
            : entry?.flash === 'down'
              ? 'bg-rose-500/10'
              : '';

          return (
            <button
              key={symbol}
              onClick={() => onSelect(symbol)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all border ${
                isActive
                  ? 'bg-[#1a1a1a]/60 border-emerald-500/40'
                  : 'bg-transparent border-transparent hover:bg-[#1a1a1a]/40'
              } ${flashClass}`}
            >
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${isActive ? 'text-cyan-400' : 'text-slate-300'}`}>
                    {symbol}
                  </span>
                  {isActive && (
                    <span className={`flex items-center gap-1 text-[10px] ${srcCfg.color}`}>
                      <SourceIcon className={`w-3 h-3 ${source === 'live' ? 'animate-pulse' : ''}`} />
                      {srcCfg.label}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">{config.fullName}</span>
              </div>

              {price && (
                <div className="flex flex-col items-end ml-2">
                  <span className={`text-sm font-mono font-semibold tabular-nums transition-colors ${
                    entry?.flash === 'up' ? 'text-emerald-300' : entry?.flash === 'down' ? 'text-rose-300' : 'text-slate-200'
                  }`}>
                    {formatPrice(price.price, symbol)}
                  </span>
                  <span className={`text-[10px] font-mono tabular-nums flex items-center gap-0.5 ${
                    isUp ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {isUp ? '+' : ''}{price.change.toFixed(2)}
                  </span>
                </div>
              )}
            </button>
          );
        })}

        {/* Data source badge */}
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1 text-[10px] hidden sm:flex">
          {source === 'live' ? (
            <Wifi className={`w-3 h-3 ${srcCfg.color} animate-pulse`} />
          ) : (
            <SourceIcon className={`w-3 h-3 ${srcCfg.color}`} />
          )}
          <span className={srcCfg.color}>
            {source === 'live' ? 'Live Feed' : source === 'manual' ? 'Manual Override' : 'Simulated'}
          </span>
        </div>
      </div>
    </div>
  );
}
