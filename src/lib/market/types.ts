import type { CoinGroup } from "./universe";

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Direction = "bull" | "neutral" | "bear";
export type TrendQuality = "weak" | "developing" | "persistent";
export type BreadthState = "narrow" | "healthy" | "broad";
export type VolatilityState = "compressed" | "normal" | "elevated" | "extreme";
export type CorrelationState = "dispersed" | "normal" | "crowded";
export type StressState = "none" | "rising" | "high";
export type ExecutionQuality = "clean" | "conditional" | "avoid";
export type LocalStructure = "uptrend" | "downtrend" | "range" | "breakout" | "reversal";
export type LocationState = "value" | "mid_range" | "extended";

export type MarketAxes = {
  direction: Direction;
  trendQuality: TrendQuality;
  breadth: BreadthState;
  volatility: VolatilityState;
  correlation: CorrelationState;
  positioning: "light" | "balanced" | "crowded" | "unknown";
  stress: StressState;
};

export type Consensus = {
  directionalBreadth: number;
  maBreadth: number;
  sectorBreadth: number;
  trendBreadth: number;
  consensusStrength: number;
  eligible: number;
  sectorsEligible: number;
  sectorsAligned: number;
  agreement: number;
  stabilityBars: number;
  transitionRisk: number;
};

export type MarketKpis = {
  basketReturn20: number;
  basketReturn60: number;
  btcReturn20: number;
  altVsBtc20: number;
  ema50Breadth: number;
  ema200Breadth: number;
  trendBreadth: number;
  realizedVol20: number;
  volPercentile: number;
  avgCorr20: number;
  drawdown60: number;
  avgFunding: number | null;
  dispersion20: number;
};

export type CoinRow = {
  id: string;
  ticker: string;
  symbol: string;
  group: CoinGroup;
  price: number;
  ret4h: number;
  ret20: number;
  relative20: number;
  relative60: number;
  ema50Dist: number;
  ema200Dist: number;
  adx14: number;
  trend: "up" | "down" | "range";
  funding: number | null;
  cohort: "market_leader" | "emerging_leader" | "positive_divergence" | "negative_divergence" | "sector_outlier" | "unconfirmed_outlier" | "market_aligned";
  persistenceBars: number;
};

export type ExecutionRow = {
  id: string;
  ticker: string;
  barCloseAt: number;
  localStructure: LocalStructure;
  location: LocationState;
  volatility: "compressed" | "tradable" | "expanding" | "shock";
  liquidity: "good" | "thin" | "unknown";
  quality: ExecutionQuality;
  atrPercentile: number;
  relativeVolume: number;
  vwapDistanceAtr: number;
  evidence: string[];
};

export type MarketSeries = { t: number[]; basket: number[]; btc: number[]; breadth: number[]; vol: number[]; direction: Direction[] };

export type MarketSnapshot = {
  asOf: number;
  barCloseAt: number;
  source: string;
  venue: string;
  universe: number;
  listed: number;
  missing: string[];
  modelVersion: string;
  axes: MarketAxes;
  consensus: Consensus;
  kpis: MarketKpis;
  series: MarketSeries;
  coins: CoinRow[];
  execution: ExecutionRow[];
};
