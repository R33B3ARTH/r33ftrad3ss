import { useEffect, useState } from 'react';
import { marketData, startAllFeeds, applyManualPrices } from '@/lib/marketData';
import type { Timeframe } from '@/lib/marketData';
import { ASSET_CONFIGS } from '@/lib/assets';
import { calculateConfluence } from '@/lib/confluence';
import { computeAutomatedDetection } from '@/lib/detectionEngine';
import type {
  AssetSymbol,
  PriceData,
  CandleData,
  UserPreferences,
  PriceSource,
  ConfluenceResult,
  SessionType,
  TacticalPlan,
  AutomatedDetection,
} from '@/lib/types';

import Header from '@/components/Header';
import TickerBar from '@/components/TickerBar';
import LivePriceBar from '@/components/LivePriceBar';
import PriceChart from '@/components/PriceChart';
import ConfluencePanel from '@/components/ConfluencePanel';
import ContextScenarioEngine from '@/components/ContextScenarioEngine';
import ConfluenceChecklist from '@/components/ConfluenceChecklist';
import TacticalPlanOutput from '@/components/TacticalPlanOutput';
import StrategySimulator from '@/components/StrategySimulator';
import TimeWindowAlarms from '@/components/TimeWindowAlarms';
import AlertBanner from '@/components/AlertBanner';
import SessionLiquidityWidget from '@/components/SessionLiquidityWidget';
import { CandlestickChart, ClipboardList, Brain, Play } from 'lucide-react';

interface DashboardProps {
  preferences: UserPreferences;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

type Tab = 'chart' | 'plan' | 'scenarios' | 'simulator';

const TABS: { id: Tab; label: string; icon: typeof CandlestickChart }[] = [
  { id: 'chart', label: 'Chart', icon: CandlestickChart },
  { id: 'plan', label: 'Plan', icon: ClipboardList },
  { id: 'scenarios', label: 'Scenarios', icon: Brain },
  { id: 'simulator', label: 'Simulator', icon: Play },
];

export default function Dashboard({ preferences, updatePreferences }: DashboardProps) {
  const [activeSymbol, setActiveSymbol] = useState<AssetSymbol>(preferences.default_asset);
  const [price, setPrice] = useState<PriceData | undefined>();
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [chartCandles, setChartCandles] = useState<CandleData[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>('10m');
  const [confluenceResult, setConfluenceResult] = useState<ConfluenceResult | null>(null);
  const [priceSource, setPriceSource] = useState<PriceSource>('live');
  const [activeTab, setActiveTab] = useState<Tab>('chart');
  const [session, setSession] = useState<SessionType>('RTH');
  const [newsKillSwitch, setNewsKillSwitch] = useState(false);
  const [detection, setDetection] = useState<AutomatedDetection | null>(null);
  const [, setTacticalPlan] = useState<TacticalPlan | null>(null);

  useEffect(() => {
    applyManualPrices(preferences);
  }, [preferences]);

  useEffect(() => {
    startAllFeeds();
    return () => marketData.stopAll();
  }, []);

  useEffect(() => {
    const unsubPrice = marketData.subscribePrice(activeSymbol, (p) => setPrice(p));
    const unsubCandles = marketData.subscribeCandles(activeSymbol, (c) => setCandles(c));
    return () => { unsubPrice(); unsubCandles(); };
  }, [activeSymbol]);

  useEffect(() => {
    const unsub = marketData.subscribeCandlesForTimeframe(activeSymbol, timeframe, (c) => setChartCandles(c));
    return () => unsub();
  }, [activeSymbol, timeframe]);

  useEffect(() => {
    const unsubSource = marketData.subscribeSource((s) => setPriceSource(s));
    return () => unsubSource();
  }, []);

  useEffect(() => {
    if (price && candles.length > 0) {
      const det = computeAutomatedDetection(activeSymbol, price, candles);
      setDetection(det);
      const result = calculateConfluence(activeSymbol, price, candles, det.htfMatrix);
      setConfluenceResult(result);
    }
  }, [price, candles, activeSymbol]);

  const threshold = preferences.confluence_threshold;
  const config = ASSET_CONFIGS[activeSymbol];

  if (!price) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-mono">Initializing market data...</p>
        </div>
      </div>
    );
  }

  const confluenceScore = Math.max(confluenceResult?.longProbability ?? 0, confluenceResult?.shortProbability ?? 0);
  const confluenceDirection = confluenceResult?.dominantDirection ?? 'NEUTRAL';

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

      <AlertBanner
        score={confluenceScore}
        symbol={activeSymbol}
        direction={confluenceDirection}
        targetPoints={config.pointTarget}
        threshold={threshold}
      />

      {/* Tab Content */}
      <div className="flex-1 p-3 max-w-[1600px] mx-auto w-full">
        {activeTab === 'chart' && (
          <div className="space-y-3">
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

        {activeTab === 'plan' && (
          <div className="space-y-3">
            {detection && <ConfluenceChecklist detection={detection} />}
            <TacticalPlanOutput
              symbol={activeSymbol}
              price={price}
              candles={candles}
              confluence={confluenceResult}
              detection={detection}
              sessionLevels={{ vah: null, val: null, poc: null, orh: null, orl: null, customLevels: [] }}
              onPlanGenerated={setTacticalPlan}
            />
            {/* Macro target summary */}
            <div className="bg-black border border-[#1a1a1a] rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Macro Target ({activeSymbol})</span>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  +{config.pointTarget} pts
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Macro Stop</span>
                <span className="text-sm font-mono font-bold text-rose-400">
                  -{config.pointStop} pts
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Risk:Reward</span>
                <span className="text-sm font-mono font-bold text-cyan-400">
                  1:{(config.pointTarget / config.pointStop).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scenarios' && (
          <div className="space-y-3">
            <ContextScenarioEngine
              symbol={activeSymbol}
              price={price}
              candles={candles}
              confluence={confluenceResult}
            />
          </div>
        )}

        {activeTab === 'simulator' && (
          <StrategySimulator activeSymbol={activeSymbol} />
        )}
      </div>

      {/* Bottom Tab Bar - Mobile First */}
      <div className="sticky bottom-0 bg-black border-t border-[#1a1a1a] px-2 py-1.5 flex items-center justify-around z-30">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${
                isActive
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <footer className="text-center text-[9px] text-slate-600 py-2 px-3 font-mono">
        R33F3R Terminal — For educational/research purposes only. Not financial advice.
      </footer>
    </div>
  );
}
