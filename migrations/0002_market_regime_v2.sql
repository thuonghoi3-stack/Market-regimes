CREATE TABLE market_regime_snapshots (
  id BIGSERIAL PRIMARY KEY,
  bar_close_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  model_version TEXT NOT NULL,
  venue TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bar_close_at, model_version, venue)
);

CREATE INDEX market_regime_snapshots_bar_close_at_idx
  ON market_regime_snapshots (bar_close_at DESC);

CREATE TABLE market_feature_snapshots (
  snapshot_id BIGINT NOT NULL REFERENCES market_regime_snapshots(id) ON DELETE CASCADE,
  instrument_id TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  feature JSONB NOT NULL,
  PRIMARY KEY (snapshot_id, instrument_id, timeframe)
);

CREATE INDEX market_feature_snapshots_instrument_idx
  ON market_feature_snapshots (instrument_id, timeframe, snapshot_id DESC);

CREATE TABLE execution_regime_snapshots (
  id BIGSERIAL PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  bar_close_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  model_version TEXT NOT NULL,
  venue TEXT NOT NULL,
  payload JSONB NOT NULL,
  UNIQUE (instrument_id, bar_close_at, model_version, venue)
);

CREATE INDEX execution_regime_snapshots_bar_close_at_idx
  ON execution_regime_snapshots (bar_close_at DESC, instrument_id);

CREATE TABLE market_raw_bars (
  venue TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  bar_open_at TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (venue, instrument_id, timeframe, bar_open_at)
);

CREATE INDEX market_raw_bars_instrument_idx
  ON market_raw_bars (instrument_id, timeframe, bar_open_at DESC);

CREATE TABLE market_regime_transitions (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES market_regime_snapshots(id) ON DELETE CASCADE,
  axis TEXT NOT NULL,
  previous_value TEXT NOT NULL,
  current_value TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL,
  drivers JSONB NOT NULL,
  UNIQUE (snapshot_id, axis)
);

CREATE INDEX market_regime_transitions_axis_idx
  ON market_regime_transitions (axis, changed_at DESC);
