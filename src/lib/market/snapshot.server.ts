import {
  MAJOR_IDS,
  MEME_IDS,
  UNIVERSE,
  displayTicker,
  fundingCandidates,
  spotCandidates,
  type UniverseCoin,
} from "./universe";
import type {
  Candle,
  CoinRow,
  MarketKpis,
  MarketSnapshot,
  MarketSeries,
  RegimeId,
  TrendTag,
} from "./types";
import {
  alignCloses,
  betaVs,
  calcAdx,
  clamp,
  finite,
  hurstExponent,
  logReturns,
  maxDrawdown,
  mean,
  meanPairwiseCorr,
  parkinsonAnn,
  percentileRank,
  realizedVolAnn,
  rollingVolSeries,
  rsiWilder,
  simpleReturn,
  smaAt,
  smaSeries,
  stdev,
} from "./math";
import { buildScores, describeRegime } from "./regime";

const VISION = "https://data-api.binance.vision";
const BITGET = "https://api.bitget.com";
const KLINE_LIMIT = 180;
const CACHE_TTL_MS = 45_000;
const KLINE_TTL_MS = 8 * 60_000;
const STALE_MS = 2 * 24 * 60 * 60 * 1000;

type Ticker = {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
};

type CacheBox = { at: number; data: MarketSnapshot };
let snapshotCache: CacheBox | null = null;
const klineCache = new Map<string, { at: number; bars: Candle[] }>();

async function getJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]!, idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

async function loadTickers(): Promise<Map<string, Ticker>> {
  const raw = await getJson<
    Array<{
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
    }>
  >(`${VISION}/api/v3/ticker/24hr`, 12_000);
  const map = new Map<string, Ticker>();
  for (const row of raw) {
    if (!row.symbol.endsWith("USDT")) continue;
    map.set(row.symbol, {
      symbol: row.symbol,
      lastPrice: Number(row.lastPrice),
      priceChangePercent: Number(row.priceChangePercent),
    });
  }
  return map;
}

async function loadFunding(): Promise<Map<string, number>> {
  try {
    const raw = await getJson<{
      data?: Array<{ symbol: string; fundingRate: string }>;
    }>(`${BITGET}/api/v2/mix/market/current-fund-rate?productType=USDT-FUTURES`);
    const map = new Map<string, number>();
    for (const row of raw.data ?? []) {
      const v = Number(row.fundingRate);
      if (Number.isFinite(v)) map.set(row.symbol, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const bars: Candle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const t = Number(row[0]);
    const o = Number(row[1]);
    const h = Number(row[2]);
    const l = Number(row[3]);
    const c = Number(row[4]);
    const v = Number(row[5]);
    if (![t, o, h, l, c].every(Number.isFinite)) continue;
    bars.push({ t, o, h, l, c, v: finite(v) });
  }
  return bars;
}

async function loadKlines(symbol: string): Promise<Candle[]> {
  const hit = klineCache.get(symbol);
  if (hit && Date.now() - hit.at < KLINE_TTL_MS) return hit.bars;
  const raw = await getJson<unknown>(
    `${VISION}/api/v3/klines?symbol=${symbol}&interval=1d&limit=${KLINE_LIMIT}`,
  );
  const bars = parseKlines(raw);
  if (bars.length) klineCache.set(symbol, { at: Date.now(), bars });
  return bars;
}

function resolveSymbol(
  coin: UniverseCoin,
  tickers: Map<string, Ticker>,
): string | null {
  for (const s of spotCandidates(coin.id)) {
    if (tickers.has(s)) return s;
  }
  return null;
}

function pickFunding(id: string, funding: Map<string, number>): number | null {
  for (const s of fundingCandidates(id)) {
    const v = funding.get(s);
    if (v != null) return v;
  }
  return null;
}

function trendTag(
  above50: boolean,
  adx: number,
  plusDi: number,
  minusDi: number,
): TrendTag {
  if (adx >= 18 && plusDi > minusDi && above50) return "up";
  if (adx >= 18 && minusDi > plusDi && !above50) return "down";
  return "range";
}

function equalWeightIndex(closeMatrix: number[][]): number[] {
  const nCoins = closeMatrix.length;
  const nDays = closeMatrix[0]?.length ?? 0;
  const idx = new Array<number>(nDays).fill(100);
  if (nCoins === 0 || nDays === 0) return idx;
  for (let t = 1; t < nDays; t++) {
    let r = 0;
    let count = 0;
    for (let i = 0; i < nCoins; i++) {
      const prev = closeMatrix[i]![t - 1]!;
      const cur = closeMatrix[i]![t]!;
      if (prev > 0 && cur > 0 && Number.isFinite(prev) && Number.isFinite(cur)) {
        r += cur / prev - 1;
        count += 1;
      }
    }
    const next = idx[t - 1]! * (1 + (count ? r / count : 0));
    idx[t] = finite(next, idx[t - 1]!);
  }
  return idx;
}

function rollingScores(
  ew: number[],
  breadth: Array<number | null>,
  vol: number[],
  corr: number[],
  volStart: number,
): RegimeId[] {
  const out: RegimeId[] = [];
  const n = ew.length;
  for (let i = 0; i < n; i++) {
    const b = breadth[i] ?? 0.5;
    const look = Math.min(30, i);
    const eNow = ew[i]!;
    const ePrev = ew[i - look] ?? eNow;
    const mom = ePrev > 0 ? eNow / ePrev - 1 : 0;
    const v = vol[Math.max(0, i - volStart)] ?? vol.at(-1) ?? 0.5;
    const c = corr[i] ?? 0.4;
    const trend = clamp(0.55 * Math.tanh(mom / 0.1) + 0.45 * (2 * b - 1), -1, 1);
    let id: RegimeId = "transition";
    if (v > 0.78 && trend < -0.15 && c > 0.52) id = "crisis";
    else if (trend > 0.35 && v < 0.55 && b > 0.55) id = "expansion";
    else if (trend > 0.28 && v >= 0.55) id = "euphoria";
    else if (trend < -0.32) id = "risk_off";
    else if (Math.abs(trend) < 0.22 && v < 0.4) id = "compression";
    else if (trend > 0 && b < 0.45) id = "distribution";
    out.push(id);
  }
  return out;
}

export async function buildSnapshot(): Promise<MarketSnapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < CACHE_TTL_MS) {
    return snapshotCache.data;
  }

  const [tickers, funding] = await Promise.all([loadTickers(), loadFunding()]);

  const resolved: Array<{
    coin: UniverseCoin;
    symbol: string;
    ticker: Ticker;
  }> = [];
  const missing: string[] = [];
  for (const coin of UNIVERSE) {
    const symbol = resolveSymbol(coin, tickers);
    const ticker = symbol ? tickers.get(symbol) : undefined;
    if (!symbol || !ticker) {
      missing.push(coin.id);
      continue;
    }
    resolved.push({ coin, symbol, ticker });
  }

  const klines = await mapPool(resolved, 12, async (row) => {
    try {
      const bars = await loadKlines(row.symbol);
      const last = bars.at(-1);
      if (last && row.ticker.lastPrice > 0) {
        return [
          ...bars.slice(0, -1),
          { ...last, c: row.ticker.lastPrice },
        ];
      }
      return bars;
    } catch {
      return [] as Candle[];
    }
  });

  const usable: Array<{
    coin: UniverseCoin;
    symbol: string;
    ticker: Ticker;
    bars: Candle[];
  }> = [];
  for (let i = 0; i < resolved.length; i++) {
    const bars = klines[i] ?? [];
    const lastTs = bars.at(-1)?.t ?? 0;
    if (bars.length < 40 || Date.now() - lastTs > STALE_MS) {
      missing.push(resolved[i]!.coin.id);
      continue;
    }
    usable.push({ ...resolved[i]!, bars });
  }

  if (usable.length < 8) {
    throw new Error("Không lấy đủ dữ liệu nến để xác định regime.");
  }

  const aligned = alignCloses(usable.map((u) => u.bars));
  const closeMatrix = aligned.closes;
  const nDays = aligned.t.length;
  const ew = equalWeightIndex(closeMatrix);
  const btcIdx = usable.findIndex((u) => u.coin.id === "BTC");
  const btcCloses = (btcIdx >= 0 ? usable[btcIdx]!.bars : usable[0]!.bars).map(
    (b) => b.c,
  );
  const btcAligned =
    btcIdx >= 0 && closeMatrix[btcIdx] ? closeMatrix[btcIdx]! : btcCloses;
  const btcNorm: number[] = [];
  const btc0 = btcAligned[0] || 1;
  for (const c of btcAligned) btcNorm.push((100 * c) / btc0);

  const retMatrix: number[][] = closeMatrix.map((row) => {
    const r = new Array<number>(nDays).fill(0);
    for (let t = 1; t < nDays; t++) {
      const prev = row[t - 1]!;
      const cur = row[t]!;
      r[t] = prev > 0 ? Math.log(cur / prev) : 0;
    }
    return r;
  });

  const sma50ByCoin = closeMatrix.map((row) => smaSeries(row, 50));
  const breadthSma50: number[] = aligned.t.map((_, t) => {
    let n = 0;
    let hit = 0;
    for (let i = 0; i < closeMatrix.length; i++) {
      const sma = sma50ByCoin[i]![t];
      const px = closeMatrix[i]![t];
      if (sma != null && sma > 0 && px != null) {
        n += 1;
        if (px > sma) hit += 1;
      }
    }
    return n ? hit / n : 0.5;
  });

  const ewRets = logReturns(ew);
  const volSeries = rollingVolSeries(ewRets, 20);
  const corr20: number[] = aligned.t.map(() => 0);
  const corrLook = 20;
  for (let t = corrLook; t < nDays; t++) {
    corr20[t] = meanPairwiseCorr(retMatrix, t - corrLook + 1, corrLook);
  }
  let lastCorr = 0;
  for (let t = 0; t < nDays; t++) {
    if (corr20[t]) lastCorr = corr20[t]!;
    else corr20[t] = lastCorr;
  }

  const volStart = nDays - volSeries.length;
  const padVol = Array.from({ length: nDays }, (_, i) => {
    const v = volSeries[i - volStart];
    return v ?? volSeries[0] ?? 0;
  });

  const btcRets = logReturns(btcCloses);
  const ew20 = simpleReturn(ew, Math.min(20, ew.length - 1));

  const coins: CoinRow[] = usable.map((u) => {
    const closes = u.bars.map((b) => b.c);
    const rets = logReturns(closes);
    const sma20 = smaAt(closes, 20);
    const sma50 = smaAt(closes, 50);
    const sma100 = smaAt(closes, 100);
    const last = closes.at(-1) ?? u.ticker.lastPrice;
    const adx = calcAdx(u.bars, 14);
    const above50 = sma50 != null && last > sma50;
    const slice20 = u.bars.slice(-20);
    const hi20 = Math.max(...slice20.map((b) => b.h));
    const lo20 = Math.min(...slice20.map((b) => b.l));
    const chg7d = simpleReturn(closes, 7);
    const btc7 = simpleReturn(btcCloses, 7);
    return {
      id: u.coin.id,
      ticker: displayTicker(u.coin.id),
      ccxt: u.coin.ccxt,
      symbol: u.symbol,
      group: u.coin.group,
      price: last,
      chg1d: simpleReturn(closes, 1),
      chg7d,
      chg30d: simpleReturn(closes, 30),
      vsBtc7d: chg7d - btc7,
      rsi14: rsiWilder(closes, 14),
      sma20Dist: sma20 ? last / sma20 - 1 : 0,
      sma50Dist: sma50 ? last / sma50 - 1 : 0,
      sma100Dist: sma100 ? last / sma100 - 1 : 0,
      aboveSma20: sma20 != null && last > sma20,
      aboveSma50: above50,
      aboveSma100: sma100 != null && last > sma100,
      vol20d: realizedVolAnn(rets, 20),
      beta60: betaVs(rets, btcRets),
      adx14: adx.adx,
      plusDi: adx.plusDi,
      minusDi: adx.minusDi,
      trend: trendTag(above50, adx.adx, adx.plusDi, adx.minusDi),
      new20High: last >= hi20 * 0.999,
      new20Low: last <= lo20 * 1.001,
      funding: pickFunding(u.coin.id, funding),
    };
  });

  const n = coins.length;
  const pct = (pred: (c: CoinRow) => boolean) =>
    n ? coins.filter(pred).length / n : 0;

  const fundingVals = coins
    .map((c) => c.funding)
    .filter((v): v is number => v != null);
  const meme = coins.filter((c) => MEME_IDS.has(c.id));
  const majors = coins.filter((c) => MAJOR_IDS.has(c.id));

  const kpis: MarketKpis = {
    ew1d: simpleReturn(ew, 1),
    ew7d: simpleReturn(ew, 7),
    ew30d: simpleReturn(ew, 30),
    btc1d: simpleReturn(btcCloses, 1),
    btc7d: simpleReturn(btcCloses, 7),
    btc30d: simpleReturn(btcCloses, 30),
    altVsBtc20: ew20 - simpleReturn(btcCloses, Math.min(20, btcCloses.length - 1)),
    ew20,
    memeVsMajors7:
      (meme.length ? mean(meme.map((c) => c.chg7d)) : 0) -
      (majors.length ? mean(majors.map((c) => c.chg7d)) : 0),
    pctAboveSma20: pct((c) => c.aboveSma20),
    pctAboveSma50: pct((c) => c.aboveSma50),
    pctAboveSma100: pct((c) => c.aboveSma100),
    adv1d: coins.filter((c) => c.chg1d > 0).length,
    dec1d: coins.filter((c) => c.chg1d < 0).length,
    new20Highs: coins.filter((c) => c.new20High).length,
    new20Lows: coins.filter((c) => c.new20Low).length,
    realizedVol20: realizedVolAnn(ewRets, 20),
    parkinsonVol20: parkinsonAnn(
      // synthetic EW high/low is not available; use mean Parkinson of members
      usable[btcIdx >= 0 ? btcIdx : 0]!.bars,
      20,
    ),
    volPercentile: percentileRank(volSeries, volSeries.at(-1) ?? 0),
    avgCorr20: corr20.at(-1) ?? 0,
    avgFunding: fundingVals.length ? mean(fundingVals) : null,
    adx: mean(coins.map((c) => c.adx14)),
    hurst: hurstExponent(ewRets.slice(-90)),
    dispersion20: stdev(coins.map((c) => c.chg7d)),
    drawdown60: maxDrawdown(ew, 60),
    pctUptrend: pct((c) => c.trend === "up"),
    pctRsiHot: pct((c) => c.rsi14 >= 70),
    pctRsiCold: pct((c) => c.rsi14 <= 30),
  };

  // Better Parkinson: average across coins
  kpis.parkinsonVol20 = mean(
    usable.map((u) => parkinsonAnn(u.bars, 20)),
  );

  const scores = buildScores(kpis);
  const regime = describeRegime(scores, kpis);

  const sliceFrom = Math.max(0, nDays - 90);
  const series: MarketSeries = {
    t: aligned.t.slice(sliceFrom),
    ew: ew.slice(sliceFrom),
    btc: btcNorm.slice(sliceFrom),
    breadthSma50: breadthSma50.slice(sliceFrom),
    vol20: padVol.slice(sliceFrom),
    corr20: corr20.slice(sliceFrom),
    regime: rollingScores(ew, breadthSma50, padVol, corr20, 0).slice(sliceFrom),
  };

  // Recompute historical vol percentile series for the chart (0-1)
  const volPctSeries = padVol.map((v) => percentileRank(volSeries, v));
  series.vol20 = volPctSeries.slice(sliceFrom);
  series.regime = rollingScores(
    ew,
    breadthSma50,
    volPctSeries,
    corr20,
    0,
  ).slice(sliceFrom);

  const data: MarketSnapshot = {
    asOf: Date.now(),
    source: "Binance · Bitget funding",
    universe: UNIVERSE.length,
    listed: coins.length,
    missing: [...new Set(missing)],
    regime,
    scores,
    kpis,
    series,
    coins: coins.sort((a, b) => a.ticker.localeCompare(b.ticker)),
  };

  snapshotCache = { at: Date.now(), data };
  return data;
}
