import { useEffect, useState, useMemo } from 'react';
import {
  Brain, AlertTriangle, TrendingUp, TrendingDown, Target,
  ArrowUpRight, ArrowDownRight, Layers, Crosshair, Eye, Radar, Award, BarChart3,
} from 'lucide-react';
import type { AssetSymbol, PriceData, CandleData, ConfluenceResult } from '@/lib/types';
import { analyzeSRLevels, type ScenarioBlueprint, type ScenarioStatus } from '@/lib/srMemory';
import { RESEARCH_META } from '@/lib/edgeStats';
import { ASSET_CONFIGS, formatPrice } from '@/lib/assets';

interface ContextScenarioEngineProps {
  symbol: AssetSymbol;
  price: PriceData;
  candles: CandleData[];
  confluence: ConfluenceResult | null;
}

const STATUS_CONFIG: Record<ScenarioStatus, { label: string; badge: string; icon: typeof Crosshair }> = {
  active: { label: 'ACTIVE — PRICE AT LEVEL', badge: 'bg-rose-500/25 text-rose-300 border-rose-500/50', icon: Crosshair },
  in_range: { label: 'IN RANGE', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: Target },
  watching_above: { label: 'WATCH ABOVE', badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', icon: Eye },
  watching_below: { label: 'WATCH BELOW', badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', icon: Eye },
};

export default function ContextScenarioEngine({ symbol, price, candles, confluence }: ContextScenarioEngineProps) {
  const [scenarios, setScenarios] = useState<ScenarioBlueprint[]>([]);
  const [activeLevelCount, setActiveLevelCount] = useState(0);

  const config = ASSET_CONFIGS[symbol];

  const analysis = useMemo(() => {
    if (candles.length < 10) return null;
    return analyzeSRLevels(symbol, price, candles);
  }, [symbol, price, candles]);

  useEffect(() => {
    if (analysis) {
      setScenarios(analysis.scenarios);
      setActiveLevelCount(analysis.levels.length);
    } else {
      setScenarios([]);
      setActiveLevelCount(0);
    }
  }, [analysis]);

  const regimeColor = confluence?.dominantDirection === 'LONG'
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : confluence?.dominantDirection === 'SHORT'
      ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
      : 'text-amber-400 bg-amber-500/10 border-amber-500/30';

  return (
    <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Context &amp; Scenario Engine</h3>
          <span className="text-[9px] text-slate-600 uppercase tracking-wider hidden sm:inline">Predictive</span>
        </div>
        <div className="flex items-center gap-1.5">
          {confluence && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold tracking-wide ${regimeColor}`}>
              {confluence?.dominantDirection ?? 'NEUTRAL'} {(confluence?.longProbability ?? 0).toFixed(0)}L / {(confluence?.shortProbability ?? 0).toFixed(0)}S
            </span>
          )}
          <span className="text-[10px] text-slate-500">{activeLevelCount} lvls</span>
        </div>
      </div>

      {/* Current price context bar */}
      <div className="flex items-center justify-between mb-3 px-2.5 py-1.5 bg-black rounded-lg border border-[#1a1a1a]/50">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Live</span>
          <span className="text-sm font-mono font-bold text-white tabular-nums">
            {formatPrice(price.price, symbol)}
          </span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          {config.pointTarget}pt target / {config.pointStop}pt stop
        </span>
      </div>

      {/* Scenarios */}
      <div className="space-y-2.5 max-h-[550px] overflow-y-auto custom-scroll">
        {scenarios.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-500">
              {candles.length < 10
                ? 'Building price memory — need more candle data...'
                : 'No key levels mapped yet. Monitoring...'}
            </p>
          </div>
        ) : (
          scenarios.map((scenario, i) => {
            const level = scenario.level;
            const isResistance = level.type === 'resistance' || (level.type === 'magnet' && level.price > price.price);
            const isBullish = scenario.direction === 'bullish';
            const isBearish = scenario.direction === 'bearish';
            const statusCfg = STATUS_CONFIG[scenario.status];
            const StatusIcon = statusCfg.icon;
            const isActive = scenario.status === 'active';

            const strengthBadge = level.strength === 'strong'
              ? { text: 'STRONG', cls: 'text-emerald-400' }
              : level.strength === 'moderate'
                ? { text: 'MODERATE', cls: 'text-cyan-400' }
                : { text: 'MINOR', cls: 'text-slate-500' };

            const distAbs = Math.abs(scenario.distancePoints);
            const distDir = scenario.distancePoints > 0 ? 'above' : 'below';
            const distColor = isActive
              ? 'text-rose-400'
              : scenario.status === 'in_range'
                ? 'text-amber-400'
                : 'text-slate-400';

            return (
              <div
                key={`${level.price.toFixed(2)}-${i}`}
                className={`bg-black border rounded-lg p-3 transition-all ${
                  isActive
                    ? 'border-rose-500/40 shadow-lg shadow-rose-500/5 ring-1 ring-rose-500/10'
                    : scenario.status === 'in_range'
                      ? 'border-amber-500/20'
                      : 'border-[#1a1a1a]/50'
                }`}
              >
                {/* Status badge + Level header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border font-bold tracking-wide ${statusCfg.badge}`}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {statusCfg.label}
                    </span>
                    <span className="text-sm font-mono font-bold text-white tabular-nums">
                      {formatPrice(level.price, symbol)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono tabular-nums ${distColor}`}>
                      {distAbs > 0 ? `${distAbs.toFixed(config.precision)}pts ${distDir}` : 'AT PRICE'}
                    </span>
                    <span className={`text-[9px] font-bold ${strengthBadge.cls}`}>{strengthBadge.text}</span>
                  </div>
                </div>

                {/* Level type + price memory */}
                <div className="flex items-start gap-1.5 mb-2">
                  <AlertTriangle className={`w-3 h-3 flex-shrink-0 mt-0.5 ${isActive ? 'text-rose-400' : 'text-amber-400/70'}`} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-[10px] font-medium ${isResistance ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isResistance ? 'Resistance' : 'Support'}
                      {level.type === 'magnet' && ' / Magnet'}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">— {scenario.priceMemory}</span>
                  </div>
                </div>

                {/* Confluence tags */}
                {level.confluenceWith.length > 0 && (
                  <div className="flex items-center gap-1 mb-2 flex-wrap">
                    <Layers className="w-3 h-3 text-violet-400 flex-shrink-0" />
                    {level.confluenceWith.map((conf, idx) => (
                      <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-violet-500/10 text-violet-300 rounded border border-violet-500/20">
                        {conf}
                      </span>
                    ))}
                  </div>
                )}

                {/* Historical Edge stats badge */}
                {scenario.edgeStat && (
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <div className={`flex items-center gap-1 px-2 py-1 rounded border ${
                      scenario.edgeStat.winRate >= 75
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : scenario.edgeStat.winRate >= 70
                          ? 'bg-cyan-500/10 border-cyan-500/25'
                          : 'bg-amber-500/10 border-amber-500/25'
                    }`}>
                      <Award className={`w-3 h-3 ${
                        scenario.edgeStat.winRate >= 75 ? 'text-emerald-400' :
                        scenario.edgeStat.winRate >= 70 ? 'text-cyan-400' : 'text-amber-400'
                      }`} />
                      <span className={`text-[10px] font-mono font-bold tabular-nums ${
                        scenario.edgeStat.winRate >= 75 ? 'text-emerald-300' :
                        scenario.edgeStat.winRate >= 70 ? 'text-cyan-300' : 'text-amber-300'
                      }`}>
                        {scenario.edgeStat.winRate}% WR
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        n={scenario.edgeStat.sampleSize}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded border border-[#2a2a2a]/50 bg-[#1a1a1a]/20">
                      <BarChart3 className="w-3 h-3 text-slate-400" />
                      <span className="text-[9px] text-slate-400 font-medium">
                        {scenario.edgeStat.pattern}
                      </span>
                      <span className="text-[9px] text-slate-600">@ {scenario.edgeStat.context}</span>
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono">
                      avg {scenario.edgeStat.avgMove.toFixed(1)}pts
                    </span>
                  </div>
                )}

                {/* If-Then blueprints with macro targets */}
                <div className="space-y-1.5 mt-2">
                  {/* IF holds */}
                  <div className={`flex items-start gap-1.5 px-2 py-1.5 rounded border ${
                    isBullish ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-rose-500/5 border-rose-500/15'
                  }`}>
                    <div className={`mt-0.5 ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isBullish ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-slate-400">IF holds: </span>
                      <span className={`text-[10px] font-medium ${isBullish ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {scenario.ifHolds.action}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-cyan-300 tabular-nums ml-1">
                        {formatPrice(scenario.ifHolds.target, symbol)}
                      </span>
                      <span className="text-[9px] text-slate-500 ml-1">
                        ({scenario.ifHolds.targetLabel})
                      </span>
                    </div>
                  </div>

                  {/* IF breaks */}
                  <div className="flex items-start gap-1.5 px-2 py-1.5 rounded border border-amber-500/15 bg-amber-500/5">
                    <div className="mt-0.5 text-amber-400">
                      {isResistance ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-slate-400">IF breaks w/ volume: </span>
                      <span className="text-[10px] font-medium text-amber-300">
                        {scenario.ifBreaks.action}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-amber-300 tabular-nums ml-1">
                        {formatPrice(scenario.ifBreaks.target, symbol)}
                      </span>
                      <span className="text-[9px] text-slate-500 ml-1">
                        ({scenario.ifBreaks.targetLabel})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pre-filled macro target */}
                <div className="flex items-center gap-2 mt-2 px-2 py-1 bg-black rounded border border-[#1a1a1a]/50">
                  <Target className="w-3 h-3 text-emerald-400/70 flex-shrink-0" />
                  <span className="text-[9px] text-slate-500">Macro target</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 tabular-nums ml-auto">
                    +{scenario.ifHolds.macroTarget} pts {symbol}
                  </span>
                </div>

                {/* Confluence score bar */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[9px] text-slate-500">Zone Score</span>
                  <div className="flex-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        scenario.confluenceScore >= 75 ? 'bg-emerald-500' :
                        scenario.confluenceScore >= 55 ? 'bg-cyan-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${scenario.confluenceScore}%` }}
                    />
                  </div>
                  <span className={`text-[9px] font-mono font-bold tabular-nums ${
                    scenario.confluenceScore >= 75 ? 'text-emerald-400' :
                    scenario.confluenceScore >= 55 ? 'text-cyan-400' : 'text-amber-400'
                  }`}>
                    {scenario.confluenceScore}
                  </span>
                </div>

                {/* Source tag */}
                <div className="mt-1.5">
                  <span className="text-[9px] text-slate-600">
                    {level.source}
                    {level.confluenceWith.length > 0 && ` + ${level.confluenceWith.join(', ')}`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-[#1a1a1a]/50">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[9px] text-slate-600">
            Predictive engine · {scenarios.length} mapped zones · {scenarios.filter(s => s.status === 'active').length} active
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 px-2 py-1 bg-black rounded border border-[#1a1a1a]/50">
          <Award className="w-3 h-3 text-emerald-400/70" />
          <span className="text-[9px] text-slate-500">
            90-day research: {RESEARCH_META.totalSamples} samples · avg {RESEARCH_META.avgWinRate}% WR · best: {RESEARCH_META.bestPattern} ({RESEARCH_META.bestWinRate}%)
          </span>
        </div>
      </div>
    </div>
  );
}
