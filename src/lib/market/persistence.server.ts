import { getSql } from "@/lib/db";
import type { Candle, MarketAxes, MarketSnapshot } from "./types";

type StoredSnapshot = { id: number; payload: unknown; bar_close_at: Date | string };
type StoredTransition = { axis: string; previous_value: string; current_value: string; changed_at: Date | string; drivers: unknown };

type RawBarSet = { instrumentId: string; bars: Candle[]; timeframe: "4h" | "5m" };

function json(value: unknown): string { return JSON.stringify(value); }
function parse<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}
function iso(value: Date | string): string { return new Date(value).toISOString(); }

const AXES: (keyof MarketAxes)[] = ["direction", "trendQuality", "breadth", "volatility", "correlation", "positioning", "stress"];

async function insertBars(sets: RawBarSet[], observedAt: string): Promise<void> {
  const sql = await getSql();
  for (const set of sets) {
    if (!set.bars.length) continue;
    const values: unknown[] = [];
    const rows = set.bars.map((bar, index) => {
      const offset = index * 10;
      values.push("Binance USD-M", set.instrumentId, set.timeframe, new Date(bar.t).toISOString(), bar.o, bar.h, bar.l, bar.c, bar.v, observedAt);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`;
    });
    await sql.query(`INSERT INTO market_raw_bars (venue, instrument_id, timeframe, bar_open_at, open, high, low, close, volume, observed_at) VALUES ${rows.join(",")} ON CONFLICT (venue, instrument_id, timeframe, bar_open_at) DO NOTHING`, values);
  }
}

export async function persistMarketSnapshot(snapshot: MarketSnapshot, rawBars: RawBarSet[]): Promise<{ stabilityBars: number }> {
  const sql = await getSql();
  const barCloseAt = new Date(snapshot.barCloseAt).toISOString();
  const capturedAt = new Date(snapshot.asOf).toISOString();
  const existing = await sql.query<{ id: number }>("SELECT id FROM market_regime_snapshots WHERE bar_close_at = $1 AND model_version = $2 AND venue = $3", [barCloseAt, snapshot.modelVersion, snapshot.venue]);
  let snapshotId = existing[0]?.id;

  if (!snapshotId) {
    const inserted = await sql.query<{ id: number }>("INSERT INTO market_regime_snapshots (bar_close_at, captured_at, model_version, venue, payload) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id", [barCloseAt, capturedAt, snapshot.modelVersion, snapshot.venue, json(snapshot)]);
    snapshotId = inserted[0]!.id;

    for (const coin of snapshot.coins) {
      await sql.query("INSERT INTO market_feature_snapshots (snapshot_id, instrument_id, timeframe, feature) VALUES ($1, $2, '4h', $3::jsonb) ON CONFLICT DO NOTHING", [snapshotId, coin.id, json(coin)]);
    }
    for (const execution of snapshot.execution) {
      await sql.query("INSERT INTO market_feature_snapshots (snapshot_id, instrument_id, timeframe, feature) VALUES ($1, $2, '5m', $3::jsonb) ON CONFLICT DO NOTHING", [snapshotId, execution.id, json(execution)]);
    }

    const previous = await sql.query<StoredSnapshot>("SELECT id, payload, bar_close_at FROM market_regime_snapshots WHERE model_version = $1 AND venue = $2 AND bar_close_at < $3 ORDER BY bar_close_at DESC LIMIT 1", [snapshot.modelVersion, snapshot.venue, barCloseAt]);
    const prior = previous[0] ? parse<MarketSnapshot>(previous[0].payload) : null;
    if (prior) {
      for (const axis of AXES) {
        const before = prior.axes[axis]; const after = snapshot.axes[axis];
        if (before === after) continue;
        await sql.query("INSERT INTO market_regime_transitions (snapshot_id, axis, previous_value, current_value, changed_at, drivers) VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT DO NOTHING", [snapshotId, axis, before, after, barCloseAt, json({ agreement: snapshot.consensus.agreement, transitionRisk: snapshot.consensus.transitionRisk })]);
      }
    }
  }

  // Execution is point-in-time at each closed 5M candle, independent of the 4H market snapshot.
  for (const execution of snapshot.execution) {
    await sql.query("INSERT INTO execution_regime_snapshots (instrument_id, bar_close_at, captured_at, model_version, venue, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT DO NOTHING", [execution.id, new Date(execution.barCloseAt).toISOString(), capturedAt, snapshot.modelVersion, snapshot.venue, json(execution)]);
  }
  await insertBars(rawBars, capturedAt);
  const recent = await sql.query<StoredSnapshot>("SELECT payload FROM market_regime_snapshots WHERE model_version = $1 AND venue = $2 ORDER BY bar_close_at DESC LIMIT 200", [snapshot.modelVersion, snapshot.venue]);
  const currentDirection = snapshot.axes.direction;
  let stabilityBars = 0;
  for (const row of recent) {
    if (parse<MarketSnapshot>(row.payload).axes.direction !== currentDirection) break;
    stabilityBars += 1;
  }
  snapshot.consensus.stabilityBars = stabilityBars;
  await sql.query("UPDATE market_regime_snapshots SET payload = $1::jsonb WHERE id = $2", [json(snapshot), snapshotId]);
  return { stabilityBars };
}

export type PersistedMarketHistory = {
  snapshots: Array<{ barCloseAt: string; axes: MarketAxes; consensus: MarketSnapshot["consensus"]; kpis: MarketSnapshot["kpis"] }>;
  transitions: Array<{ axis: string; previousValue: string; currentValue: string; changedAt: string; drivers: unknown }>;
};

export async function loadMarketHistory(limit = 180): Promise<PersistedMarketHistory> {
  const sql = await getSql();
  const [snapshots, transitions] = await Promise.all([
    sql.query<StoredSnapshot>("SELECT payload, bar_close_at FROM market_regime_snapshots ORDER BY bar_close_at DESC LIMIT $1", [limit]),
    sql.query<StoredTransition>("SELECT axis, previous_value, current_value, changed_at, drivers FROM market_regime_transitions ORDER BY changed_at DESC LIMIT $1", [limit]),
  ]);
  return {
    snapshots: snapshots.reverse().map((row) => {
      const snapshot = parse<MarketSnapshot>(row.payload);
      return { barCloseAt: iso(row.bar_close_at), axes: snapshot.axes, consensus: snapshot.consensus, kpis: snapshot.kpis };
    }),
    transitions: transitions.map((row) => ({ axis: row.axis, previousValue: row.previous_value, currentValue: row.current_value, changedAt: iso(row.changed_at), drivers: parse(row.drivers) })),
  };
}
