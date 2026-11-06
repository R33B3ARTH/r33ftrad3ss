// Remove: import { HybridSpxEsCard } from '@/components/HybridSpxEsCard';
// Remove: import AlertBanner from '@/components/AlertBanner';

// Inside your Dashboard render return:
export default function Dashboard({ preferences, updatePreferences }: DashboardProps) {
  // ... existing hooks ...

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Header preferences={preferences} onUpdatePreferences={updatePreferences} />
      <TickerBar activeSymbol={activeSymbol} onSelect={setActiveSymbol} />
      <LivePriceBar
        activeSymbol={activeSymbol}
        price={price}
        source={priceSource}
        session={session}
        onSessionChange={setSession}
        newsKillSwitch={newsKillSwitch}
        onNewsKillSwitchToggle={() => setNewsKillSwitch((v) => !v)}
      />
      <TimeWindowAlarms />

      {/* AlertBanner removed per your request */}

      {/* Tab Content */}
      <div className="flex-1 p-3 max-w-[1600px] mx-auto w-full">
        {activeTab === 'chart' && (
          <div className="space-y-3">
            {/* Hybrid card removed from here */}

            <div className="bg-black border border-[#1a1a1a] rounded-xl p-3 h-[300px] sm:h-[400px] lg:h-[440px]">
              <PriceChart
                candles={chartCandles}
                symbol={activeSymbol}
                precision={config.precision}
                price={price}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
              />
            </div>
            
            {/* Individual ES / SPX price & ATR display footer */}
            <div className="bg-slate-950 border border-slate-900 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono text-slate-400">
              <div className="flex items-center gap-4">
                <span>ES: <strong className="text-emerald-400">{price.price.toFixed(2)}</strong></span>
                <span>SPX: <strong className="text-indigo-400">{(price.price - 36.5).toFixed(2)}</strong></span>
              </div>
              <div className="text-slate-500">
                Daily ATR: <span className="text-slate-300">{config.dailyAtr} pts</span>
              </div>
            </div>

            <SessionLiquidityWidget candles={candles} symbol={activeSymbol} precision={config.precision} />
            {detection && (
              <ConfluencePanel
                symbol={activeSymbol}
                price={price}
                candles={candles}
                threshold={threshold}
                htfMatrix={detection.htfMatrix}
                onSaveSetup={() => {}}
              />
            )}
          </div>
        )}
        {/* ... remaining tabs ... */}
      </div>
      {/* ... footer ... */}
    </div>
  );
}
