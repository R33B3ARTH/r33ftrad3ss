import type { AssetSymbol, AssetConfig, SniperProfile, SniperProfileId, MaeGuardrail } from './types';

export const ASSET_CONFIGS: Record<AssetSymbol, AssetConfig> = {
  ES: {
    symbol: 'ES',
    name: 'ES',
    fullName: 'E-mini S&P 500 Futures',
    basePrice: 7865.0,
    tickSize: 0.25,
    tickValue: 12.50,
    dailyAtr: 65.0,
    pointTarget: 20,
    pointStop: 10,
    precision: 2,
  },
  NQ: {
    symbol: 'NQ',
    name: 'NQ',
    fullName: 'E-mini Nasdaq-100 Futures',
    basePrice: 22450.0,
    tickSize: 0.25,
    tickValue: 5.00,
    dailyAtr: 250.0,
    pointTarget: 100,
    pointStop: 50,
    precision: 2,
  },
};

export const ASSET_LIST: AssetSymbol[] = ['ES', 'NQ'];

export const YAHOO_SYMBOLS: Record<AssetSymbol, string> = {
  ES: 'ES=F',
  NQ: 'NQ=F',
};

export function formatPrice(price: number, symbol: AssetSymbol): string {
  const config = ASSET_CONFIGS[symbol];
  return price.toLocaleString('en-US', {
    minimumFractionDigits: config.precision,
    maximumFractionDigits: config.precision,
  });
}

export function getAssetConfig(symbol: AssetSymbol): AssetConfig {
  return ASSET_CONFIGS[symbol];
}

export const SNIPER_PROFILES: Record<SniperProfileId, SniperProfile> = {
  ES_4pt: {
    id: 'ES_4pt',
    label: 'ES Sniper ±4pt',
    symbol: 'ES',
    entrySweep: 4,
    stopPoints: 8,
    targetPoints: 20,
    contracts: 2,
    totalRisk: 800,
    totalReward: 2000,
    riskReward: 2.5,
  },
  ES_6pt: {
    id: 'ES_6pt',
    label: 'ES Defensive ±6pt',
    symbol: 'ES',
    entrySweep: 6,
    stopPoints: 10,
    targetPoints: 20,
    contracts: 2,
    totalRisk: 1000,
    totalReward: 2000,
    riskReward: 2.0,
  },
  NQ_60pt: {
    id: 'NQ_60pt',
    label: 'NQ Exhaustion ±60pt',
    symbol: 'NQ',
    entrySweep: 60,
    stopPoints: 30,
    targetPoints: 50,
    contracts: 2,
    totalRisk: 1200,
    totalReward: 2000,
    riskReward: 1.67,
  },
};

export const MAE_GUARDRAILS: Record<AssetSymbol, MaeGuardrail> = {
  ES: { median: 12.50, p80: 25.50 },
  NQ: { median: 77.38, p80: 127.10 },
};

export function getSniperProfilesForSymbol(symbol: AssetSymbol): SniperProfile[] {
  return Object.values(SNIPER_PROFILES).filter((p) => p.symbol === symbol);
}

export function getDefaultSniperProfile(symbol: AssetSymbol): SniperProfile {
  if (symbol === 'ES') return SNIPER_PROFILES.ES_4pt;
  return SNIPER_PROFILES.NQ_60pt;
}
