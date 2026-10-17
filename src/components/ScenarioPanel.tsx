import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Layers,
  Droplets,
  Clock,
  Newspaper,
  Zap,
} from 'lucide-react';
import type { AssetSymbol, PriceData, CandleData, ScenarioAlert } from '@/lib/types';
import { generateScenarioAlerts } from '@/lib/scenarios';

interface ScenarioPanelProps {
  symbol: AssetSymbol;
  price: PriceData;
  candles: CandleData[];
  confluenceScore: number;
}

const TYPE_ICONS = {
  pattern: <Layers className="w-3.5 h-3.5" />,
  liquidity: <Droplets className="w-3.5 h-3.5" />,
  fib: <Layers className="w-3.5 h-3.5" />,
  killzone: <Clock className="w-3.5 h-3.5" />,
  news: <Newspaper className="w-3.5 h-3.5" />,
};

const SEVERITY_STYLES = {
  info: {
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/5',
    icon: 'text-blue-400',
    text: 'text-blue-300',
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    icon: 'text-amber-400',
    text: 'text-amber-300',
  },
  critical: {
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    icon: 'text-emerald-400',
    text: 'text-emerald-300',
  },
};

export default function ScenarioPanel({ symbol, price, candles, confluenceScore }: ScenarioPanelProps) {
  const [alerts, setAlerts] = useState<ScenarioAlert[]>([]);
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newAlerts = generateScenarioAlerts(symbol, price, candles, confluenceScore);
    const currentIds = new Set(alerts.map((a) => a.id));
    const freshIds = new Set(newAlerts.filter((a) => !currentIds.has(a.id)).map((a) => a.id));

    if (freshIds.size > 0) {
      setNewAlertIds(freshIds);
      const timer = setTimeout(() => setNewAlertIds(new Set()), 1000);
      setAlerts(newAlerts);
      return () => clearTimeout(timer);
    }
    setAlerts(newAlerts);
  }, [price, candles, symbol, confluenceScore]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-200">Scenario Highlighter</h3>
        </div>
        <span className="text-[10px] text-slate-500">
          {alerts.length} active
        </span>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scroll">
        {alerts.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500">
            No active scenarios detected
          </div>
        ) : (
          alerts.map((alert) => {
            const style = SEVERITY_STYLES[alert.severity];
            const isNew = newAlertIds.has(alert.id);

            return (
              <div
                key={alert.id}
                className={`${style.bg} ${style.border} border rounded-lg p-3 transition-all ${
                  isNew ? 'ring-2 ring-cyan-400/30 animate-pulse' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 ${style.icon}`}>
                    {alert.severity === 'critical' ? <Zap className="w-3.5 h-3.5" /> : TYPE_ICONS[alert.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold ${style.text}`}>
                        {alert.title}
                      </span>
                      {alert.severity === 'critical' && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-medium uppercase">
                          Alert
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {alert.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
