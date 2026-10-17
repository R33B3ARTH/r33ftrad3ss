import { useState, useEffect } from 'react';
import { Layers, Plus, X, Save } from 'lucide-react';
import type { AssetSymbol, SessionLevels } from '@/lib/types';

interface SessionLevelsInputProps {
  symbol: AssetSymbol;
  levels: SessionLevels;
  onSave: (levels: SessionLevels) => void;
}

const STORAGE_KEY_PREFIX = 'apex_session_levels_';

export function loadSessionLevels(symbol: AssetSymbol): SessionLevels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + symbol);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        vah: parsed.vah ?? null,
        val: parsed.val ?? null,
        poc: parsed.poc ?? null,
        orh: parsed.orh ?? null,
        orl: parsed.orl ?? null,
        customLevels: parsed.customLevels ?? [],
      };
    }
  } catch { /* ignore */ }
  return { vah: null, val: null, poc: null, orh: null, orl: null, customLevels: [] };
}

export function saveSessionLevels(symbol: AssetSymbol, levels: SessionLevels) {
  localStorage.setItem(STORAGE_KEY_PREFIX + symbol, JSON.stringify(levels));
}

export default function SessionLevelsInput({ symbol, levels, onSave }: SessionLevelsInputProps) {
  const [local, setLocal] = useState<SessionLevels>(levels);
  const [newLevel, setNewLevel] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocal(levels);
  }, [levels, symbol]);

  function update(field: keyof SessionLevels, value: string) {
    const num = value === '' ? null : parseFloat(value);
    setLocal((prev) => ({ ...prev, [field]: num }));
  }

  function addCustomLevel() {
    const val = parseFloat(newLevel);
    if (isNaN(val)) return;
    setLocal((prev) => ({ ...prev, customLevels: [...prev.customLevels, val].sort((a, b) => a - b) }));
    setNewLevel('');
  }

  function removeCustomLevel(idx: number) {
    setLocal((prev) => ({ ...prev, customLevels: prev.customLevels.filter((_, i) => i !== idx) }));
  }

  function handleSave() {
    saveSessionLevels(symbol, local);
    onSave(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const fields: { key: keyof SessionLevels; label: string; placeholder: string }[] = [
    { key: 'vah', label: 'Prior VAH', placeholder: 'Value Area High' },
    { key: 'val', label: 'Prior VAL', placeholder: 'Value Area Low' },
    { key: 'poc', label: 'POC', placeholder: 'Point of Control' },
    { key: 'orh', label: 'ORH', placeholder: "Today's OR High" },
    { key: 'orl', label: 'ORL', placeholder: "Today's OR Low" },
  ];

  return (
    <div className="bg-black border border-[#1a1a1a] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Session Levels</h3>
          <span className="text-[9px] text-slate-600">({symbol})</span>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-all ${
            saved
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
          }`}
        >
          {saved ? 'Saved!' : (<><Save className="w-3 h-3" /> Save</>)}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{field.label}</label>
            <input
              type="number"
              value={local[field.key] as number ?? ''}
              onChange={(e) => update(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full bg-black border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none tabular-nums"
            />
          </div>
        ))}
      </div>

      {/* Custom S&R / Magnet levels */}
      <div>
        <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Key S&amp;R / Magnet Levels</label>
        <div className="flex gap-1 mb-2">
          <input
            type="number"
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomLevel()}
            placeholder="e.g. 7850"
            className="flex-1 bg-black border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none tabular-nums"
          />
          <button
            onClick={addCustomLevel}
            disabled={!newLevel}
            className="flex items-center gap-0.5 text-[10px] px-2 py-1 bg-[#2a2a2a]/50 border border-[#3a3a3c] text-slate-300 rounded hover:bg-[#3a3a3c]/50 transition-colors disabled:opacity-30"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {local.customLevels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {local.customLevels.map((lvl, idx) => (
              <span
                key={idx}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-black border border-[#2a2a2a] rounded font-mono text-slate-300 tabular-nums"
              >
                {lvl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <button
                  onClick={() => removeCustomLevel(idx)}
                  className="text-slate-600 hover:text-rose-400"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
