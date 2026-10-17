import { useEffect, useRef, useState, useMemo } from 'react';
import type { CandleData, PriceData, AssetSymbol } from '@/lib/types';
import type { Timeframe } from '@/lib/marketData';
import { ASSET_CONFIGS } from '@/lib/assets';
import { SESSION_COLORS, calculateSessionLiquidity, getActiveSession } from '@/lib/sessionLiquidity';
import { getGlobexSessionRange, calculateFibLevels } from '@/lib/fibCalc';

interface PriceChartProps {
  candles: CandleData[];
  symbol: AssetSymbol;
  precision: number;
  price: PriceData;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}

const TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '4h', '1D'];

function calculateAtr(candles: CandleData[], period: number): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export default function PriceChart({
  candles,
  symbol,
  precision,
  price,
  timeframe,
  onTimeframeChange,
}: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFibs, setShowFibs] = useState(true);
  const [showSessions, setShowSessions] = useState(true);
  const [showAtr, setShowAtr] = useState(true);

  const config = ASSET_CONFIGS[symbol];

  const sessionLiquidity = useMemo(
    () => calculateSessionLiquidity(candles),
    [candles],
  );

  const atrValue = useMemo(() => calculateAtr(candles.slice(-50), 14), [candles]);
  const activeSession = getActiveSession();

  const { pdh, pdl, fibLevels } = useMemo(() => {
    const { pdh, pdl, range } = getGlobexSessionRange(candles, price, config.tickSize);
    void range;
    const levels = calculateFibLevels(pdh, pdl, config.tickSize);
    return { pdh, pdl, fibLevels: levels };
  }, [candles, price, config.tickSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Pure jet black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 70, right: 76, bottom: 28, left: 8 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const visibleCandles = candles.slice(-50);
    const allPrices: number[] = visibleCandles.flatMap((c) => [c.high, c.low]);

    // Include all Fib levels in Y-axis range
    for (const fib of fibLevels) {
      allPrices.push(fib.price);
    }

    // Include session liquidity levels
    if (sessionLiquidity.asia) { allPrices.push(sessionLiquidity.asia.high, sessionLiquidity.asia.low); }
    if (sessionLiquidity.london) { allPrices.push(sessionLiquidity.london.high, sessionLiquidity.london.low); }
    if (sessionLiquidity.ny) { allPrices.push(sessionLiquidity.ny.high, sessionLiquidity.ny.low); }

    // Include ATR bands
    if (atrValue > 0) {
      allPrices.push(price.price + atrValue * 1.5, price.price - atrValue * 1.5);
    }

    // Include current price
    allPrices.push(price.price);

    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice || 1;
    // Generous padding so labels never clip
    const paddedMin = minPrice - priceRange * 0.12;
    const paddedMax = maxPrice + priceRange * 0.12;
    const paddedRange = paddedMax - paddedMin;

    const candleWidth = chartWidth / visibleCandles.length;
    const bodyWidth = Math.max(candleWidth * 0.6, 2);

    const priceToY = (p: number) => padding.top + ((paddedMax - p) / paddedRange) * chartHeight;

    // Grid lines — ultra-thin dark charcoal on pure black
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#3a3a3c';

    const gridCount = 6;
    for (let i = 0; i <= gridCount; i++) {
      const y = padding.top + (chartHeight / gridCount) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      const p = paddedMax - (paddedRange / gridCount) * i;
      // Right-aligned price badges on pure black right axis
      ctx.fillStyle = '#3a3a3c';
      ctx.textAlign = 'right';
      ctx.fillText(p.toFixed(precision), padding.left + chartWidth + padding.right - 4, y + 3);
      ctx.textAlign = 'left';
    }

    // Vertical grid lines
    ctx.strokeStyle = '#1a1a1a';
    const timeGridCount = 5;
    for (let i = 0; i <= timeGridCount; i++) {
      const x = padding.left + (chartWidth / timeGridCount) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }

    // Session liquidity lines — exact custom colors
    if (showSessions) {
      const drawSessionLine = (levelPrice: number, color: string, label: string) => {
        const y = priceToY(levelPrice);
        if (y < padding.top - 2 || y > padding.top + chartHeight + 2) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        ctx.fillStyle = color;
        ctx.font = '8px monospace';
        ctx.fillText(label, padding.left + 2, y - 2);
        ctx.textAlign = 'right';
        ctx.fillText(levelPrice.toFixed(precision), padding.left + chartWidth + padding.right - 4, y + 3);
        ctx.textAlign = 'left';
      };

      if (sessionLiquidity.asia) {
        drawSessionLine(sessionLiquidity.asia.high, SESSION_COLORS.asia.high, 'ASH');
        drawSessionLine(sessionLiquidity.asia.low, SESSION_COLORS.asia.low, 'ASL');
      }
      if (sessionLiquidity.london) {
        drawSessionLine(sessionLiquidity.london.high, SESSION_COLORS.london.high, 'LNH');
        drawSessionLine(sessionLiquidity.london.low, SESSION_COLORS.london.low, 'LNL');
      }
      if (sessionLiquidity.ny) {
        drawSessionLine(sessionLiquidity.ny.high, SESSION_COLORS.ny.high, 'NYH');
        drawSessionLine(sessionLiquidity.ny.low, SESSION_COLORS.ny.low, 'NYL');
      }
    }

    // ATR bands
    if (showAtr && atrValue > 0) {
      const upperBand = price.price + atrValue * 1.5;
      const lowerBand = price.price - atrValue * 1.5;
      const upperY = priceToY(upperBand);
      const lowerY = priceToY(lowerBand);

      ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, upperY);
      ctx.lineTo(padding.left + chartWidth, upperY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padding.left, lowerY);
      ctx.lineTo(padding.left + chartWidth, lowerY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#475569';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`ATR+1.5 ${upperBand.toFixed(precision)}`, padding.left + chartWidth + padding.right - 4, upperY + 3);
      ctx.fillText(`ATR-1.5 ${lowerBand.toFixed(precision)}`, padding.left + chartWidth + padding.right - 4, lowerY + 3);
      ctx.textAlign = 'left';
    }

    // Fib level lines — neon overlays with all 7 levels
    if (showFibs && pdh > pdl) {
      for (const fib of fibLevels) {
        const y = priceToY(fib.price);
        if (y < padding.top - 2 || y > padding.top + chartHeight + 2) continue;

        ctx.strokeStyle = fib.color;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.shadowColor = fib.color;
        ctx.shadowBlur = 4;
        ctx.fillStyle = fib.color;
        ctx.font = '9px monospace';
        ctx.fillText(fib.label, padding.left + 2, y - 2);
        ctx.textAlign = 'right';
        ctx.fillText(fib.price.toFixed(precision), padding.left + chartWidth + padding.right - 4, y + 3);
        ctx.textAlign = 'left';
        ctx.shadowBlur = 0;
      }
    }

    // Candles — ToS vibrant green/red
    visibleCandles.forEach((candle, i) => {
      const x = padding.left + i * candleWidth + candleWidth / 2;
      const openY = priceToY(candle.open);
      const closeY = priceToY(candle.close);
      const highY = priceToY(candle.high);
      const lowY = priceToY(candle.low);

      const isBull = candle.close >= candle.open;
      const color = isBull ? '#00c076' : '#ff3b30';
      const wickColor = isBull ? 'rgba(0, 192, 118, 0.7)' : 'rgba(255, 59, 48, 0.7)';

      ctx.strokeStyle = wickColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      ctx.fillStyle = color;
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
      ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    });

    // Current price line — cyan dashed
    const lastPrice = price.price;
    const lastY = priceToY(lastPrice);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, lastY);
    ctx.lineTo(padding.left + chartWidth, lastY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current price badge — right-aligned, cyan glow
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(padding.left + chartWidth, lastY - 9, padding.right - 4, 18);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(lastPrice.toFixed(precision), padding.left + chartWidth + padding.right - 6, lastY + 3);
    ctx.textAlign = 'left';

    // Symbol + ATR label
    ctx.fillStyle = '#3a3a3c';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${symbol}`, padding.left + 2, padding.top + chartHeight + 14);

    if (atrValue > 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(`ATR(14): ${atrValue.toFixed(precision)}`, padding.left + 40, padding.top + chartHeight + 14);
    }
  }, [candles, symbol, precision, price, showFibs, showSessions, showAtr, timeframe, sessionLiquidity, atrValue, fibLevels, pdh, pdl]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black">
      {/* Toolbar: two-row layout to prevent mobile overflow */}
      <div className="absolute top-0 left-0 right-0 z-10 flex flex-col gap-1 p-1.5 pointer-events-none">
        {/* Row 1: Timeframe selectors — horizontal scroll */}
        <div className="flex items-center gap-1 pointer-events-auto">
          <div className="flex items-center gap-0.5 bg-black border border-[#1a1a1a] rounded-md p-0.5 overflow-x-auto whitespace-nowrap max-w-[60vw] sm:max-w-[400px] no-scrollbar">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium font-mono ${
                  timeframe === tf
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        {/* Row 2: Toggle badges — right-aligned, separate row */}
        <div className="flex items-center gap-1 pointer-events-auto justify-end">
          <button
            onClick={() => setShowSessions((s) => !s)}
            className={`text-[9px] px-2 py-0.5 rounded border transition-colors font-mono ${
              showSessions
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-black border-[#1a1a1a] text-slate-500 hover:text-slate-300'
            }`}
          >
            Liq
          </button>
          <button
            onClick={() => setShowAtr((s) => !s)}
            className={`text-[9px] px-2 py-0.5 rounded border transition-colors font-mono ${
              showAtr
                ? 'bg-slate-500/15 border-slate-400/40 text-slate-300'
                : 'bg-black border-[#1a1a1a] text-slate-500 hover:text-slate-300'
            }`}
          >
            ATR
          </button>
          <button
            onClick={() => setShowFibs((s) => !s)}
            className={`text-[9px] px-2 py-0.5 rounded border transition-colors font-mono ${
              showFibs
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-black border-[#1a1a1a] text-slate-500 hover:text-slate-300'
            }`}
          >
            Fibs
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
