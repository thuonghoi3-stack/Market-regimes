import { persistenceAvailable } from "@/lib/db";
import { UNIVERSE, displayTicker, type UniverseCoin } from "./universe";
import type { Candle, CoinRow, Direction, ExecutionRow, MarketSnapshot } from "./types";
import { calcAdx, logReturns, mean, meanPairwiseCorr, percentileRank, realizedVolAnn, smaSeries, stdev } from "./math";
import { persistMarketSnapshot } from "./persistence.server";

const BINANCE_FUTURES = "https://fapi.binance.com";
const BYBIT = "https://api.bybit.com";
const CACHE_TTL_MS = 60_000;
const FOUR_H_LIMIT = 500;
const FIVE_M_LIMIT = 320;
const EXECUTION_IDS = new Set(["BTC", "ETH", "SOL", "BNB", "LINK", "DOGE"]);
let cache: { at: number; data: MarketSnapshot } | null = null;

type Ticker = { symbol: string; lastPrice: string };
type MarketSource = {
  venue: string;
  tickers: () => Promise<Ticker[]>;
  bars: (symbol: string, interval: "4h" | "5m", limit: number) => Promise<Candle[]>;
};

type BybitResponse<T> = { retCode: number; retMsg: string; result?: T };
type BybitKlines = { list?: string[][] };
type BybitTickers = { list?: Array<{ symbol: string; lastPrice: string }> };

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return (await res.json()) as T;
  } finally { clearTimeout(timer); }
}

async function getBybit<T>(path: string): Promise<T> {
  const payload = await getJson<BybitResponse<T>>(`${BYBIT}${path}`);
  if (payload.retCode !== 0 || !payload.result) throw new Error(`Bybit ${payload.retCode}: ${payload.retMsg}`);
  return payload.result;
}

const binanceSource: MarketSource = {
  venue: "Binance USD-M",
  tickers: () => getJson<Ticker[]>(`${BINANCE_FUTURES}/fapi/v1/ticker/price`),
  bars: async (symbol, interval, limit) => parseBars(await getJson<unknown>(
    `${BINANCE_FUTURES}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  )).slice(0, -1),
};

const bybitSource: MarketSource = {
  venue: "Bybit linear perpetual",
  tickers: async () => {
    const { list = [] } = await getBybit<BybitTickers>("/v5/market/tickers?category=linear");
    return list;
  },
  bars: async (symbol, interval, limit) => {
    const bybitInterval = interval === "4h" ? "240" : "5";
    const { list = [] } = await getBybit<BybitKlines>(
      `/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`,
    );
    // Bybit returns newest-first; normalize to ascending and exclude the live candle.
    return parseBars(list.reverse()).slice(0, -1);
  },
};

async function selectMarketSource(): Promise<{ source: MarketSource; tickers: Ticker[] }> {
  try {
    return { source: binanceSource, tickers: await binanceSource.tickers() };
  } catch (binanceError) {
    try {
      return { source: bybitSource, tickers: await bybitSource.tickers() };
    } catch (bybitError) {
      throw new Error(`Market data unavailable: Binance=${String(binanceError)}; Bybit=${String(bybitError)}`);
    }
  }
}

function parseBars(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): Candle[] => {
    if (!Array.isArray(r) || r.length < 6) return [];
    const [t, o, h, l, c, v] = r.map(Number);
    return [t, o, h, l, c, v].every(Number.isFinite) ? [{ t, o, h, l, c, v }] : [];
  });
}

async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; result[i] = await fn(items[i]!); }
  }));
  return result;
}

function symbolFor(coin: UniverseCoin, tickers: Set<string>): string | null {
  const ids = coin.id === "MATIC" ? ["POL", "MATIC"] : coin.id.startsWith("1000") ? [coin.id, coin.id.slice(4)] : [coin.id];
  return ids.map((id) => `${id}USDT`).find((symbol) => tickers.has(symbol)) ?? null;
}

function ema(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const alpha = 2 / (n + 1);
  let value = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (const x of values.slice(n)) value = alpha * x + (1 - alpha) * value;
  return value;
}

function ret(values: number[], bars: number): number {
  const prev = values.at(-1 - bars); const last = values.at(-1);
  return prev && last ? last / prev - 1 : 0;
}

function classifyDirection(breadth: number, basketRet: number): Direction {
  if (breadth >= 0.6 && basketRet > 0) return "bull";
  if (breadth <= 0.4 && basketRet < 0) return "bear";
  return "neutral";
}

function buildExecution(id: string, ticker: string, bars: Candle[]): ExecutionRow {
  const closes = bars.map((b) => b.c); const last = closes.at(-1) ?? 0;
  const ranges = bars.slice(-14).map((b) => b.h - b.l);
  const atr = mean(ranges) || 1;
  const atrSamples = bars.slice(14).map((_, i) => mean(bars.slice(i, i + 14).map((b) => b.h - b.l)));
  const atrPct = percentileRank(atrSamples, atr);
  const volBase = mean(bars.slice(-50, -1).map((b) => b.v)) || 1;
  const relativeVolume = (bars.at(-1)?.v ?? 0) / volBase;
  const session = bars.slice(-288);
  const vwapDen = session.reduce((s, b) => s + b.v, 0) || 1;
  const vwap = session.reduce((s, b) => s + ((b.h + b.l + b.c) / 3) * b.v, 0) / vwapDen;
  const vwapDistanceAtr = (last - vwap) / atr;
  const adx = calcAdx(bars, 14);
  const priorHigh = Math.max(...bars.slice(-25, -1).map((b) => b.h));
  const localStructure = last > priorHigh && relativeVolume > 1.2 ? "breakout" : adx.adx >= 20 && adx.plusDi > adx.minusDi ? "uptrend" : adx.adx >= 20 && adx.minusDi > adx.plusDi ? "downtrend" : "range";
  const location = Math.abs(vwapDistanceAtr) <= 0.8 ? "value" : Math.abs(vwapDistanceAtr) > 2 ? "extended" : "mid_range";
  const volatility = atrPct > 0.95 ? "shock" : atrPct > 0.75 ? "expanding" : atrPct < 0.25 ? "compressed" : "tradable";
  const quality = volatility === "shock" || location === "extended" ? "avoid" : (relativeVolume >= 0.7 && volatility === "tradable") ? "clean" : "conditional";
  const evidence = [`${localStructure} 5M`, `VWAP ${vwapDistanceAtr.toFixed(1)} ATR`, `RVOL ${relativeVolume.toFixed(1)}x`, `ATR pct ${(atrPct * 100).toFixed(0)}%`];
  return { id, ticker, barCloseAt: bars.at(-1)!.t + 5 * 60 * 1000, localStructure, location, volatility, liquidity: relativeVolume < 0.35 ? "thin" : "good", quality, atrPercentile: atrPct, relativeVolume, vwapDistanceAtr, evidence };
}

export async function buildSnapshot(): Promise<MarketSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    if (persistenceAvailable) await persistMarketSnapshot(cache.data, []);
    return cache.data;
  }
  const { source, tickers } = await selectMarketSource();
  const symbols = new Set(tickers.map((x) => x.symbol));
  const resolved = UNIVERSE.flatMap((coin) => { const symbol = symbolFor(coin, symbols); return symbol ? [{ coin, symbol }] : []; });
  const missing = UNIVERSE.filter((coin) => !resolved.some((x) => x.coin.id === coin.id)).map((coin) => coin.id);
  const fourH = await pooled(resolved, 10, async ({ symbol }) => {
    try { return await source.bars(symbol, "4h", FOUR_H_LIMIT); } catch { return []; }
  });
  const usable = resolved.flatMap((row, i) => fourH[i]!.length >= 250 ? [{ ...row, bars: fourH[i]! }] : []);
  missing.push(...resolved.filter((_, i) => fourH[i]!.length < 250).map((x) => x.coin.id));
  if (usable.length < 8) throw new Error("Không đủ 4H perpetual candles để tính regime.");
  const common = Math.min(...usable.map((x) => x.bars.length));
  const rows = usable.map((x) => ({ ...x, bars: x.bars.slice(-common) }));
  const closes = rows.map((x) => x.bars.map((b) => b.c));
  const returns = closes.map(logReturns);
  const basket: number[] = [100];
  for (let i = 1; i < common; i++) basket.push(basket[i - 1]! * (1 + mean(closes.map((c) => c[i]! / c[i - 1]! - 1))));
  const btcIndex = rows.findIndex((x) => x.coin.id === "BTC");
  const btc = closes[btcIndex >= 0 ? btcIndex : 0]!;
  const btcNorm = btc.map((x) => 100 * x / btc[0]!);
  const features = rows.map((row, i) => {
    const c = closes[i]!; const e50 = ema(c, 50) ?? c.at(-1)!; const e200 = ema(c, 200) ?? c.at(-1)!; const adx = calcAdx(row.bars, 14);
    const trend = c.at(-1)! > e50 && adx.plusDi > adx.minusDi ? "up" as const : c.at(-1)! < e50 && adx.minusDi > adx.plusDi ? "down" as const : "range" as const;
    return { ...row, closes: c, e50, e200, adx, trend, ret4h: ret(c, 1), ret20: ret(c, 20), ret60: ret(c, 60) };
  });
  const ema50Breadth = mean(features.map((x) => x.closes.at(-1)! > x.e50 ? 1 : 0));
  const ema200Breadth = mean(features.map((x) => x.closes.at(-1)! > x.e200 ? 1 : 0));
  const basketRet20 = ret(basket, 20); const direction = classifyDirection(ema50Breadth, basketRet20);
  const directionalBreadth = mean(features.map((x) => direction === "bull" ? x.trend === "up" ? 1 : 0 : direction === "bear" ? x.trend === "down" ? 1 : 0 : x.trend === "range" ? 1 : 0));
  const groups = [...new Set(features.map((x) => x.coin.group))];
  const sectorsAligned = groups.filter((group) => {
    const section = features.filter((x) => x.coin.group === group);
    return mean(section.map((x) => direction === "bull" ? x.trend === "up" ? 1 : 0 : direction === "bear" ? x.trend === "down" ? 1 : 0 : x.trend === "range" ? 1 : 0)) >= 0.5;
  }).length;
  const sectorBreadth = sectorsAligned / groups.length;
  const trendBreadth = mean(features.map((x) => x.adx.adx >= 18 && (direction === "bull" ? x.adx.plusDi > x.adx.minusDi : direction === "bear" ? x.adx.minusDi > x.adx.plusDi : true) ? 1 : 0));
  const consensusStrength = mean([directionalBreadth, ema50Breadth, sectorBreadth, trendBreadth]);
  const basketRets = logReturns(basket); const vol = realizedVolAnn(basketRets, 20);
  const rollingVol = basketRets.slice(20).map((_, i) => realizedVolAnn(basketRets.slice(i, i + 20), 20));
  const volPercentile = percentileRank(rollingVol, vol);
  const corr = meanPairwiseCorr(returns, returns[0]!.length - 20, 20);
  const peak = Math.max(...basket.slice(-60)); const drawdown = basket.at(-1)! / peak - 1;
  const stress: "none" | "rising" | "high" = volPercentile > 0.9 && corr > 0.55 ? "high" : volPercentile > 0.75 || drawdown < -0.1 ? "rising" : "none";
  const cohorts: CoinRow[] = features.map((x) => {
    const relative20 = x.ret20 - basketRet20; const relative60 = x.ret60 - ret(basket, 60);
    const strong = relative20 > 0.06 && x.trend === "up"; const weak = relative20 < -0.06 && x.trend === "down";
    const cohort = strong && direction === "bull" ? "market_leader" : strong && direction !== "bull" ? "positive_divergence" : weak && direction === "bull" ? "negative_divergence" : Math.abs(relative20) > 0.1 ? "sector_outlier" : "market_aligned";
    return { id: x.coin.id, ticker: displayTicker(x.coin.id), symbol: x.symbol, group: x.coin.group, price: x.closes.at(-1)!, ret4h: x.ret4h, ret20: x.ret20, relative20, relative60, ema50Dist: x.closes.at(-1)! / x.e50 - 1, ema200Dist: x.closes.at(-1)! / x.e200 - 1, adx14: x.adx.adx, trend: x.trend, funding: null, cohort, persistenceBars: strong || weak ? 1 : 0 };
  });
  const executionSeeds = features.filter((x) => EXECUTION_IDS.has(x.coin.id));
  const fiveM = await pooled(executionSeeds, 6, async (x) => {
    try { return await source.bars(x.symbol, "5m", FIVE_M_LIMIT); } catch { return []; }
  });
  const execution = executionSeeds.flatMap((x, i) => fiveM[i]!.length >= 100 ? [buildExecution(x.coin.id, displayTicker(x.coin.id), fiveM[i]!)] : []);
  const axes = { direction, trendQuality: consensusStrength >= 0.7 ? "persistent" as const : consensusStrength >= 0.55 ? "developing" as const : "weak" as const, breadth: ema50Breadth >= 0.7 ? "broad" as const : ema50Breadth >= 0.5 ? "healthy" as const : "narrow" as const, volatility: volPercentile > 0.9 ? "extreme" as const : volPercentile > 0.7 ? "elevated" as const : volPercentile < 0.3 ? "compressed" as const : "normal" as const, correlation: corr > 0.6 ? "crowded" as const : corr < 0.3 ? "dispersed" as const : "normal" as const, positioning: "unknown" as const, stress };
  const recent = basket.slice(-90); const scale = recent[0] || 1;
  const data: MarketSnapshot = { asOf: Date.now(), barCloseAt: rows[0]!.bars.at(-1)!.t + 4 * 60 * 60 * 1000, source: `${source.venue} perpetual`, venue: source.venue, universe: UNIVERSE.length, listed: rows.length, missing: [...new Set(missing)], modelVersion: "v2.0.0-prototype", axes, consensus: { directionalBreadth, maBreadth: mean([ema50Breadth, ema200Breadth]), sectorBreadth, trendBreadth, consensusStrength, eligible: rows.length, sectorsEligible: groups.length, sectorsAligned, agreement: consensusStrength, stabilityBars: 1, transitionRisk: mean([volPercentile, 1 - directionalBreadth]) }, kpis: { basketReturn20: basketRet20, basketReturn60: ret(basket, 60), btcReturn20: ret(btc, 20), altVsBtc20: basketRet20 - ret(btc, 20), ema50Breadth, ema200Breadth, trendBreadth, realizedVol20: vol, volPercentile, avgCorr20: corr, drawdown60: drawdown, avgFunding: null, dispersion20: stdev(features.map((x) => x.ret20)) }, series: { t: rows[0]!.bars.slice(-90).map((b) => b.t), basket: recent.map((x) => 100 * x / scale), btc: btcNorm.slice(-90), breadth: Array.from({ length: 90 }, (_, i) => mean(closes.map((c) => c[c.length - 90 + i]! > (smaSeries(c, 50)[c.length - 90 + i] ?? Infinity) ? 1 : 0))), vol: Array.from({ length: 90 }, () => volPercentile), direction: Array.from({ length: 90 }, () => direction) }, coins: cohorts.sort((a, b) => b.relative20 - a.relative20), execution };
  const rawBars = [
    ...rows.map((row) => ({ instrumentId: row.coin.id, timeframe: "4h" as const, bars: row.bars })),
    ...executionSeeds.map((row, index) => ({ instrumentId: row.coin.id, timeframe: "5m" as const, bars: fiveM[index] ?? [] })),
  ];
  if (persistenceAvailable) {
    const persisted = await persistMarketSnapshot(data, rawBars);
    data.consensus.stabilityBars = persisted.stabilityBars;
  }
  cache = { at: Date.now(), data }; return data;
}
