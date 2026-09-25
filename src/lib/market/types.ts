import type { CoinGroup } from "./universe";

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type TrendTag = "up" | "down" | "range";

export type RegimeId =
  | "expansion"
  | "euphoria"
  | "compression"
  | "distribution"
  | "transition"
  | "risk_off"
  | "crisis";

export type CoinRow = {
  id: string;
  ticker: string;
  ccxt: string;
  symbol: string;
  group: CoinGroup;
  price: number;
  chg1d: number;
  chg7d: number;
  chg30d: number;
  vsBtc7d: number;
  rsi14: number;
  sma20Dist: number;
  sma50Dist: number;
  sma100Dist: number;
  aboveSma20: boolean;
  aboveSma50: boolean;
  aboveSma100: boolean;
  vol20d: number;
  beta60: number;
  adx14: number;
  plusDi: number;
  minusDi: number;
  trend: TrendTag;
  new20High: boolean;
  new20Low: boolean;
  funding: number | null;
};

export type RegimeDriver = {
  key: string;
  label: string;
  value: string;
  hint: string;
  polarity: "pos" | "neg" | "neu";
};

export type RegimeInfo = {
  id: RegimeId;
  label: string;
  labelVi: string;
  thesis: string;
  playbook: string[];
  confidence: number;
  drivers: RegimeDriver[];
};

export type MarketScores = {
  trend: number;
  vol: number;
  breadth: number;
  corr: number;
  crowding: number;
};

export type MarketKpis = {
  ew1d: number;
  ew7d: number;
  ew30d: number;
  btc1d: number;
  btc7d: number;
  btc30d: number;
  altVsBtc20: number;
  ew20: number;
  memeVsMajors7: number;
  pctAboveSma20: number;
  pctAboveSma50: number;
  pctAboveSma100: number;
  adv1d: number;
  dec1d: number;
  new20Highs: number;
  new20Lows: number;
  realizedVol20: number;
  parkinsonVol20: number;
  volPercentile: number;
  avgCorr20: number;
  avgFunding: number | null;
  adx: number;
  hurst: number;
  dispersion20: number;
  drawdown60: number;
  pctUptrend: number;
  pctRsiHot: number;
  pctRsiCold: number;
};

export type MarketSeries = {
  t: number[];
  ew: number[];
  btc: number[];
  breadthSma50: number[];
  vol20: number[];
  corr20: number[];
  regime: RegimeId[];
};

export type MarketSnapshot = {
  asOf: number;
  source: string;
  universe: number;
  listed: number;
  missing: string[];
  regime: RegimeInfo;
  scores: MarketScores;
  kpis: MarketKpis;
  series: MarketSeries;
  coins: CoinRow[];
};
