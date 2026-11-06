import React, { useEffect, useState } from 'react';
import { marketData } from '@/lib/marketData';
import { generateHybridHeikinAshiCandles } from '@/lib/hybridEngine';
import type { PriceData, CandleData } from '@/lib/types';

export const HybridSpxEsCard: React.FC = () => {
  const [esPrice, setEsPrice] = useState<PriceData | null>(null);
  const [spxPrice, setSpxPrice] = useState<PriceData | null>(null);
  const [esCandles, setEsCandles] = useState<CandleData[]>([]);
  const [spxCandles, setSpxCandles] = useState<CandleData[]>([]);
  const [haHybridCandles, setHaHybridCandles] = useState<CandleData[]>([]);

  useEffect(() => {
    marketData.start('ES');
    marketData.start('SPX');

    const unsubEsPrice = marketData.subscribePrice('ES', setEsPrice);
    const unsubSpxPrice = marketData.subscribePrice('SPX', setSpxPrice);
    const unsubEsCandles = marketData.subscribeCandles('ES', setEsCandles);
    const unsubSpxCandles = marketData.subscribeCandles('SPX', setSpxCandles);

    return () => {
      unsubEsPrice();
      unsubSpxPrice();
      unsubEsCandles();
      unsubSpxCandles();
    };
  }, []);

  useEffect(() => {
    if (esCandles.length > 0) {
      const hybridHA = generateHybridHeikinAshiCandles(esCandles, spxCandles);
      setHaHybridCandles(hybridHA);
    }
  }, [esCandles, spxCandles]);

  if (!esPrice || !spxPrice) {
    return (
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-400">
        Loading SPX/ES Hybrid Feed...
      </div>
    );
  }

  const basis = esPrice.price - spxPrice.price;
  const latestHa = haHybridCandles[haHybridCandles.length - 1];

  return (
    <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 text-white shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-lg font-bold tracking-wide text-indigo-400">
            HYBRID SPX / ES (HEIKIN ASHI)
          </h3>
          <span className="text-xs text-slate-400">Continuous Gap-Free Feed</span>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-300">
            Basis: <span className={basis >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{basis.toFixed(2)} pts</span>
          </div>
          {latestHa && (
            <div className="text-xs font-mono text-indigo-300 mt-0.5">
              HA Close: {latestHa.close.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
          <div className="text-xs text-slate-500 uppercase font-medium">ES Futures</div>
          <div className="text-emerald-400 font-mono text-sm mt-1">{esPrice.price.toFixed(2)}</div>
        </div>
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
          <div className="text-xs text-slate-500 uppercase font-medium">SPX Cash</div>
          <div className="text-indigo-300 font-mono text-sm mt-1">{spxPrice.price.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-400">
        <div>Active HA Array: <span className="text-white font-mono">{haHybridCandles.length} Candles</span></div>
        <div className="text-emerald-400 mt-1">✓ Overnight cash gaps bridged via ES futures offset</div>
      </div>
    </div>
  );
};
