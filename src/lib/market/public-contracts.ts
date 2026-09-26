import type { CoinRow, MarketSnapshot } from "./types";

export type PublicApiMeta = {
  apiVersion: "v2";
  asOf: string;
  barCloseAt: string;
  timeframe: "4h";
  venue: string;
  instrumentType: "linear_perpetual";
  modelVersion: string;
  universe: number;
  listed: number;
  missing: string[];
};

export type PublicApiResponse<T> = { data: T; meta: PublicApiMeta };

export function snapshotMeta(snapshot: MarketSnapshot): PublicApiMeta {
  return { apiVersion: "v2", asOf: new Date(snapshot.asOf).toISOString(), barCloseAt: new Date(snapshot.barCloseAt).toISOString(), timeframe: "4h", venue: snapshot.venue, instrumentType: "linear_perpetual", modelVersion: snapshot.modelVersion, universe: snapshot.universe, listed: snapshot.listed, missing: snapshot.missing };
}

export function regimeData(snapshot: MarketSnapshot) { return { axes: snapshot.axes, consensus: snapshot.consensus, kpis: snapshot.kpis }; }
export function overviewData(snapshot: MarketSnapshot) { return { axes: snapshot.axes, consensus: snapshot.consensus, kpis: snapshot.kpis, execution: snapshot.execution }; }
export function assetsData(snapshot: MarketSnapshot): { items: CoinRow[] } { return { items: snapshot.coins }; }
export function historyData(snapshot: MarketSnapshot) { return { interval: "4h" as const, bars: snapshot.series.t.length, series: snapshot.series }; }
