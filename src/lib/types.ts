export type AssetSymbol = 'ES' | 'NQ';

export interface AssetConfig {
  symbol: AssetSymbol;
  name: string;
  fullName: string;
  basePrice: number;
  tickSize: number;
  tickValue: number;
  dailyAtr: number;
  pointTarget: number;
  pointStop: number;
  precision: number;
}

export type PriceSource = 'live' | 'manual' | 'sim';

export interface PriceData {
  symbol: AssetSymbol;
  price: number;
  prevPrice: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  volume: number;
  timestamp: number;
  source: PriceSource;
  prevDayHigh: number;
  prevDayLow: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type HtfCandleState = '1-Inside' | '2U-Up' | '2D-Down' | '3-Outside';

export interface HtfStratMatrix {
  monthly: HtfCandleState;
  weekly: HtfCandleState;
  daily: HtfCandleState;
  fourHour: HtfCandleState;
  oneHour: HtfCandleState;
}

export type FtcAlignment = 'bullish' | 'bearish' | 'mixed';

export interface ProbabilityFactor {
  name: string;
  longContrib: number;
  shortContrib: number;
  description: string;
}

export interface ProbabilityResult {
  longProbability: number;
  shortProbability: number;
  dominantDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  edgeWindowActive: boolean;
  timeBoostApplied: boolean;
  factors: ProbabilityFactor[];
  htfAlignment: FtcAlignment;
  ftcActive: boolean;
  counterTrendRisk: boolean;
  tensionRatio: number;
  tensionTriggered: boolean;
  oteZone: 'Premium OTE' | 'Discount OTE' | 'Equilibrium' | null;
  overnightEq: number;
  macroBlocked: 'LONG' | 'SHORT' | null;
  midRangeBlocked: boolean;
  atExtremeLevel: string | null;
}

export interface AtrBracket {
  atr: number;
  stopPoints: number;
  targetPoints: number;
  entry: number;
  target: number;
  stop: number;
  riskReward: number;
  maxHeatBoundary: number;
  expectedProfitPerContract: number;
}

export interface ProbabilityPlan {
  probability: ProbabilityResult;
  bracket: AtrBracket;
  dominantDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  conviction: 'HIGH CONVICTION' | 'MODERATE CONVICTION' | 'LOW CONVICTION';
  verdict: string;
  htfBadge: string;
  matrixMatchCount: number;
  matrixTotal: number;
  warning: string | null;
}

export interface ConfluenceResult {
  longProbability: number;
  shortProbability: number;
  dominantDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  edgeWindowActive: boolean;
  timeBoostApplied: boolean;
  factors: ProbabilityFactor[];
  htfAlignment: FtcAlignment;
  ftcActive: boolean;
  counterTrendRisk: boolean;
  tensionRatio: number;
  tensionTriggered: boolean;
  oteZone: 'Premium OTE' | 'Discount OTE' | 'Equilibrium' | null;
  overnightEq: number;
  macroBlocked: 'LONG' | 'SHORT' | null;
  midRangeBlocked: boolean;
  atExtremeLevel: string | null;
}

export interface TacticalPlan {
  probability: ProbabilityResult;
  bracket: AtrBracket;
  dominantDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  conviction: 'HIGH CONVICTION' | 'MODERATE CONVICTION' | 'LOW CONVICTION';
  verdict: string;
  htfBadge: string;
  matrixMatchCount: number;
  matrixTotal: number;
  warning: string | null;
}

export interface AtrRange {
  currentPrice: number;
  atr: number;
  topSide: number;
  bottomSide: number;
  rangeHigh: number;
  rangeLow: number;
  positionInRange: number;
}

export interface ScenarioAlert {
  id: string;
  type: 'pattern' | 'liquidity' | 'fib' | 'killzone' | 'news';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
}

export interface UserPreferences {
  default_asset: AssetSymbol;
  es_target_points: number;
  nq_target_points: number;
  confluence_threshold: number;
  price_source: 'live' | 'manual';
  es_manual_price: number | null;
  nq_manual_price: number | null;
}

export interface SessionLevels {
  vah: number | null;
  val: number | null;
  poc: number | null;
  orh: number | null;
  orl: number | null;
  customLevels: number[];
}

export type HtfStratBias = 'Bullish' | 'Bearish' | 'Choppy';
export type IctArrayProximity = 'FVG 5m' | 'FVG 15m' | 'Order Block' | 'Mid-Range' | 'None';
export type CandlePattern = '2-1-2 Continuation' | '3-2-2 Reversal' | 'Inside Bar' | 'None';
export type PullbackType = '0' | '1' | '2+';

export interface TradeChecklist {
  htfStrat: HtfStratBias;
  ictArray: IctArrayProximity;
  candlePattern: CandlePattern;
  pullback: PullbackType;
  htfMatrix: HtfStratMatrix;
}

export type SessionType = 'RTH' | 'Pre-Market' | 'Power Hour';

export interface AutomatedDetection {
  htfMatrix: HtfStratMatrix;
  ftcAlignment: FtcAlignment;
  ftcActive: boolean;
  fifteenMsState: HtfCandleState;
  stratPattern: string;
  isBullish2d2u: boolean;
  isBearish2u2d: boolean;
  ictArray: string;
  ictDescription: string;
  priceInFvg: boolean;
  priceNearOb: boolean;
}

export interface SavedSetup {
  id: string;
  asset: AssetSymbol;
  probability_score: number;
  direction: 'LONG' | 'SHORT';
  htf_alignment: string;
  notes: string | null;
  created_at: string;
}

export type SniperProfileId = 'ES_4pt' | 'ES_6pt' | 'NQ_60pt';

export interface SniperProfile {
  id: SniperProfileId;
  label: string;
  symbol: AssetSymbol;
  entrySweep: number;
  stopPoints: number;
  targetPoints: number;
  contracts: number;
  totalRisk: number;
  totalReward: number;
  riskReward: number;
}

export interface MaeGuardrail {
  median: number;
  p80: number;
}

export interface OvernightEquilibrium {
  onEq: number;
  onHigh: number;
  onLow: number;
  range: number;
  premiumOteLow: number;
  premiumOteHigh: number;
  discountOteLow: number;
  discountOteHigh: number;
  tensionRatio: number;
  tensionTriggered: boolean;
  priceInPremiumOte: boolean;
  priceInDiscountOte: boolean;
  atr: number;
}
