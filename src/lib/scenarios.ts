import type { AssetSymbol, PriceData, AtrRange, ScenarioAlert, CandleData } from './types';
import { ASSET_CONFIGS } from './assets';

export function calculateAtrRange(symbol: AssetSymbol, price: PriceData, customAtr?: number): AtrRange {
  const config = ASSET_CONFIGS[symbol];
  const atr = customAtr ?? config.dailyAtr;
  const currentPrice = price.price;

  const topSide = currentPrice + atr * 0.5;
  const bottomSide = currentPrice - atr * 0.5;
  const rangeHigh = price.dayHigh;
  const rangeLow = price.dayLow;

  const range = rangeHigh - rangeLow;
  const positionInRange = range > 0 ? ((currentPrice - rangeLow) / range) * 100 : 50;

  return {
    currentPrice,
    atr,
    topSide,
    bottomSide,
    rangeHigh,
    rangeLow,
    positionInRange: Math.max(0, Math.min(100, positionInRange)),
  };
}

let alertIdCounter = 0;

export function generateScenarioAlerts(
  symbol: AssetSymbol,
  price: PriceData,
  candles: CandleData[],
  confluenceScore: number,
): ScenarioAlert[] {
  const alerts: ScenarioAlert[] = [];
  const config = ASSET_CONFIGS[symbol];

  if (candles.length >= 10) {
    const recent = candles.slice(-20);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);
    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);

    const expanding = recent.length >= 5 &&
      Math.max(...recent.slice(-5).map((c) => c.high)) > Math.max(...recent.slice(-10, -5).map((c) => c.high)) &&
      Math.min(...recent.slice(-5).map((c) => c.low)) < Math.min(...recent.slice(-10, -5).map((c) => c.low));

    if (expanding) {
      alerts.push({
        id: `alert-${alertIdCounter++}`,
        type: 'pattern',
        title: 'Broadening Formation Detected',
        description: 'Price range expanding with higher highs and lower lows - volatility increasing, breakout imminent',
        severity: 'warning',
        timestamp: Date.now(),
      });
    }

    if (price.price >= swingHigh - config.tickSize * 2 && price.price <= swingHigh + config.tickSize * 4) {
      alerts.push({
        id: `alert-${alertIdCounter++}`,
        type: 'liquidity',
        title: 'Sell-Side Liquidity Tap',
        description: `Price testing swing high at ${swingHigh.toFixed(2)} - watch for reversal or breakout`,
        severity: 'warning',
        timestamp: Date.now(),
      });
    }

    if (price.price <= swingLow + config.tickSize * 2 && price.price >= swingLow - config.tickSize * 4) {
      alerts.push({
        id: `alert-${alertIdCounter++}`,
        type: 'liquidity',
        title: 'Buy-Side Liquidity Tap',
        description: `Price testing swing low at ${swingLow.toFixed(2)} - watch for reversal or breakdown`,
        severity: 'warning',
        timestamp: Date.now(),
      });
    }
  }

  const range = price.dayHigh - price.dayLow;
  if (range > 0) {
    const position = ((price.price - price.dayLow) / range) * 100;
    const fibLevels = [23.6, 50, 78.6];
    for (const level of fibLevels) {
      if (Math.abs(position - level) < 3) {
        alerts.push({
          id: `alert-${alertIdCounter++}`,
          type: 'fib',
          title: `Fibonacci ${level}% Confluence Zone`,
          description: `Price at ${level}% retracement of daily range - key reaction level`,
          severity: 'info',
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 10) {
    alerts.push({
      id: `alert-${alertIdCounter++}`,
      type: 'killzone',
      title: 'NY Kill Zone Active',
      description: 'New York kill zone (7:00-10:00 UTC) - highest probability entries window',
      severity: 'info',
      timestamp: Date.now(),
    });
  } else if (hour >= 2 && hour < 5) {
    alerts.push({
      id: `alert-${alertIdCounter++}`,
      type: 'killzone',
      title: 'London Kill Zone Active',
      description: 'London kill zone (2:00-5:00 UTC) - elevated volatility expected',
      severity: 'info',
      timestamp: Date.now(),
    });
  }

  if (confluenceScore >= 80) {
    alerts.push({
      id: `alert-${alertIdCounter++}`,
      type: 'pattern',
      title: `HIGH CONFLUENCE SETUP: ${confluenceScore}%`,
      description: `Multi-strategy confluence above 80% threshold - targeting ${config.pointTarget} points on ${symbol}`,
      severity: 'critical',
      timestamp: Date.now(),
    });
  }

  return alerts;
}
