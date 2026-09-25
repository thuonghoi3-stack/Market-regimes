import type { CoinRow, MarketSnapshot } from "./types";

export type PublicApiMeta = {
  apiVersion: "v1";
  asOf: string;
  source: string;
  universe: number;
  listed: number;
  missing: string[];
};

export type PublicApiResponse<T> = {
  data: T;
  meta: PublicApiMeta;
};

export function snapshotMeta(snapshot: MarketSnapshot): PublicApiMeta {
  return {
    apiVersion: "v1",
    asOf: new Date(snapshot.asOf).toISOString(),
    source: snapshot.source,
    universe: snapshot.universe,
    listed: snapshot.listed,
    missing: snapshot.missing,
  };
}

export function regimeData(snapshot: MarketSnapshot) {
  return {
    regime: snapshot.regime,
    scores: snapshot.scores,
  };
}

export function overviewData(snapshot: MarketSnapshot) {
  return {
    regime: {
      id: snapshot.regime.id,
      label: snapshot.regime.label,
      labelVi: snapshot.regime.labelVi,
      confidence: snapshot.regime.confidence,
    },
    scores: snapshot.scores,
    kpis: snapshot.kpis,
  };
}

export function assetsData(snapshot: MarketSnapshot): { items: CoinRow[] } {
  return { items: snapshot.coins };
}

export function historyData(snapshot: MarketSnapshot) {
  return {
    interval: "1d" as const,
    windowDays: snapshot.series.t.length,
    series: snapshot.series,
  };
}
