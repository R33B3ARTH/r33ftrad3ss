export function classifyStratCandle(current: CandleData, prev: CandleData): '1-Inside' | '2-Up' | '2-Down' | '3-Outside' {
  if (!prev) return '2-Down';

  const inside = current.high <= prev.high && current.low >= prev.low;
  const outside = current.high > prev.high && current.low < prev.low;
  const up = current.high > prev.high && current.low >= prev.low;
  const down = current.low < prev.low && current.high <= prev.high;

  if (inside) return '1-Inside';
  if (outside) return '3-Outside';
  if (up) return '2-Up';
  if (down) return '2-Down';

  // Default fallback if overlapping extremes
  return current.close >= current.open ? '2-Up' : '2-Down';
}
