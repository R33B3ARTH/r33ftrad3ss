import { useEffect, useState } from 'react';
import { Zap, X } from 'lucide-react';

interface AlertBannerProps {
  score: number;
  symbol: string;
  direction: string;
  targetPoints: number;
  threshold: number;
}

export default function AlertBanner({ score, symbol, direction, targetPoints, threshold }: AlertBannerProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (score >= threshold && !dismissed) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [score, threshold, dismissed]);

  useEffect(() => {
    if (score < threshold) {
      setDismissed(false);
    }
  }, [score, threshold]);

  if (!visible) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 animate-slide-down">
      <div className="bg-gradient-to-r from-emerald-500/90 to-emerald-600/90 backdrop-blur-sm border border-emerald-400/50 rounded-xl px-5 py-3 shadow-2xl shadow-emerald-500/30 flex items-center gap-3">
        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">
            HIGH CONFLUENCE SETUP: {score}% on {symbol}
          </p>
          <p className="text-xs text-white/80">
            {direction} signal - Targeting {targetPoints} points
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 text-white/70 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
