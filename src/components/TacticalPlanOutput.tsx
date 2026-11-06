export default function TacticalPlanOutput({
  symbol,
  price,
  candles,
  confluence: _confluence,
  detection,
  sessionLevels,
  onPlanGenerated,
}: TacticalPlanOutputProps) {
  const [plan, setPlan] = useState<TacticalPlan | null>(null);

  // Safety guard against missing or uninitialized data
  if (!detection || !price || !candles || candles.length === 0) {
    return (
      <div className="bg-black border border-[#1a1a1a] rounded-xl p-4 text-center">
        <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
        <p className="text-[11px] font-mono text-slate-400">Waiting for live data feed & detection matrix...</p>
      </div>
    );
  }

  function handleGenerate() {
    if (!detection) return;
    const newPlan = generatePlan(symbol, price, candles, detection.htfMatrix, sessionLevels);
    setPlan(newPlan);
    onPlanGenerated(newPlan);
  }

  // ... rest of your component remains unchanged ...
