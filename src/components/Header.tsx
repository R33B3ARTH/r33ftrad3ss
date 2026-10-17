import { useEffect, useState } from 'react';
import { TrendingUp, Settings, X, Wifi, Edit, Clock } from 'lucide-react';
import type { AssetSymbol, UserPreferences } from '@/lib/types';
import { formatNytClock, getNytDateLabel } from '@/lib/nytTime';

interface HeaderProps {
  preferences: UserPreferences;
  onUpdatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

export default function Header({ preferences, onUpdatePreferences }: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [localPrefs, setLocalPrefs] = useState<UserPreferences>(preferences);
  const [saving, setSaving] = useState(false);
  const [nytTime, setNytTime] = useState(formatNytClock());
  const [nytDate, setNytDate] = useState(getNytDateLabel());

  useEffect(() => {
    setLocalPrefs(preferences);
  }, [preferences]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNytTime(formatNytClock());
      setNytDate(getNytDateLabel());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleSave() {
    setSaving(true);
    await onUpdatePreferences(localPrefs);
    setSaving(false);
    setShowSettings(false);
  }

  return (
    <>
      <header className="border-b border-[#1a1a1a] bg-black px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <TrendingUp className="w-5 h-5 text-emerald-100" />
          </div>
          <div>
            <h1 className="text-base font-mono font-bold text-emerald-400 tracking-wider" style={{ textShadow: '0 0 8px rgba(52, 211, 153, 0.5)' }}>
              R33F3R
            </h1>
            <p className="text-[10px] text-slate-500 font-mono">Futures Terminal</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <div className="text-right">
              <div className="font-mono font-bold text-emerald-400 tabular-nums text-sm leading-none">
                {nytTime}
              </div>
              <div className="text-[9px] text-slate-500 font-mono leading-none mt-0.5">
                {nytDate} NY
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-[#1a1a1a]/50 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-black border border-[#1a1a1a] rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto custom-scroll">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Price Source */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">
                  Price Data Source
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLocalPrefs({ ...localPrefs, price_source: 'live' })}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm border transition-all ${
                      localPrefs.price_source === 'live'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-black border-[#3a3a3c] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    Live API
                  </button>
                  <button
                    onClick={() => setLocalPrefs({ ...localPrefs, price_source: 'manual' })}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm border transition-all ${
                      localPrefs.price_source === 'manual'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                        : 'bg-black border-[#3a3a3c] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Manual
                  </button>
                </div>
              </div>

              {/* Manual Price Overrides */}
              {localPrefs.price_source === 'manual' && (
                <div className="space-y-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <p className="text-[10px] text-amber-400/80 uppercase tracking-wider">
                    Enter current prices to sync your ATR & Fib calculations
                  </p>
                  {(['ES', 'NQ'] as AssetSymbol[]).map((sym) => {
                    const key = `${sym.toLowerCase()}_manual_price` as keyof UserPreferences;
                    return (
                      <div key={sym}>
                        <label className="block text-xs text-slate-400 mb-1">
                          {sym} Price
                        </label>
                        <input
                          type="number"
                          value={localPrefs[key] as number ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLocalPrefs({
                              ...localPrefs,
                              [key]: val === '' ? null : Number(val),
                            } as UserPreferences)}
                          }
                          placeholder="Enter live price"
                          className="w-full bg-black border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-amber-500 focus:outline-none"
                          step="0.25"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">
                  Default Asset
                </label>
                <select
                  value={localPrefs.default_asset}
                  onChange={(e) => setLocalPrefs({ ...localPrefs, default_asset: e.target.value as AssetSymbol })}
                  className="w-full bg-black border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ES">ES - E-mini S&P 500</option>
                  <option value="NQ">NQ - E-mini Nasdaq-100</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">
                    ES Target (pts)
                  </label>
                  <input
                    type="number"
                    value={localPrefs.es_target_points}
                    onChange={(e) => setLocalPrefs({ ...localPrefs, es_target_points: Number(e.target.value) })}
                    className="w-full bg-black border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">
                    NQ Target (pts)
                  </label>
                  <input
                    type="number"
                    value={localPrefs.nq_target_points}
                    onChange={(e) => setLocalPrefs({ ...localPrefs, nq_target_points: Number(e.target.value) })}
                    className="w-full bg-black border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">
                  Confluence Alert Threshold: {localPrefs.confluence_threshold}%
                </label>
                <input
                  type="range"
                  min="50"
                  max="95"
                  value={localPrefs.confluence_threshold}
                  onChange={(e) => setLocalPrefs({ ...localPrefs, confluence_threshold: Number(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-5 bg-gradient-to-r from-emerald-500 to-emerald-400 text-white font-medium py-2.5 rounded-lg transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
