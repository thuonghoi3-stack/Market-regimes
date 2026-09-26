# Market Regime V2

## Purpose

Market Regime V2 is an independent market-observability system for crypto perpetual futures. It describes market conditions and execution conditions; it does not create trade signals, prescribe a strategy, or encode logic for a specific strategy.

The system has two primary layers:

```text
Market Regime 4H
  -> cross-market structure, participation, risk, and positioning

Execution Regime 5M
  -> per-instrument short-horizon execution conditions
```

A future macro layer may provide slower global context, but it is not required for V2 and must remain separate from the 4H market-regime classifier.

## Scope And Non-Goals

### In scope

- Venue-consistent linear perpetual market data.
- Cross-market 4H regime classification.
- Per-instrument 5M execution-regime classification.
- Point-in-time snapshots, historical state transitions, and research exports.
- Dashboard, read-only API, feed-health monitoring, and evidence for every state.
- Research validation of whether states describe distinct future market behavior.

### Out of scope

- Automated order placement or portfolio execution.
- Buy, sell, long, short, or position-size recommendations.
- Strategy-specific entry, exit, stop-loss, or risk-management rules.
- Treating a regime label or agreement score as a forecast probability.
- Mixing spot OHLCV from one exchange with perp funding or open interest from another exchange while presenting the result as a perpetual-futures regime.

## Design Principles

1. Regime is descriptive, not predictive. The output states what conditions currently exist and records the evidence.
2. Every historical state must be point-in-time correct. A state at time `t` can only use data available at or before the close of its source candle.
3. Market structure and execution conditions are separate problems. The 4H layer provides broad context; the 5M layer describes local tradability for each instrument.
4. Components are independent axes before they become a headline. A single opaque label must not hide a bullish but overheated or stressed environment.
5. Data provenance is part of the output. Every snapshot identifies venue, instrument type, timestamps, coverage, staleness, and model version.
6. State changes use hysteresis. Normal states require confirmation; hard stress or feed failures can activate immediately.
7. The system must be auditable. Store raw inputs or reproducible feature snapshots, model version, threshold configuration, state, transition reason, and data-quality information.

## Data Contract

### Venue Consistency

V2 must choose a configured linear-perpetual venue and use that venue consistently for an instrument's:

- OHLCV and mark/index price where applicable.
- Funding rate and funding history.
- Open interest and open-interest change.
- Volume and, if added, order-book and trade-flow data.

The dashboard must explicitly display the configured venue and instrument type. If a metric comes from another source, it must be labelled as an external overlay rather than being silently combined with venue-native features.

### Timeframes

| Layer | Source timeframe | Evaluation time | Use |
| --- | --- | --- | --- |
| Market regime | 4H | After a fully closed 4H candle | Cross-market structure and risk context |
| Execution regime | 5M | After a fully closed 5M candle | Per-instrument local conditions |
| Intrabar nowcast | Optional | While a candle is open | Display-only, never used for historical regime state |

All timestamps are UTC. The API must return both the source candle close time and the snapshot generation time.

### Minimum History

- 4H: at least 400 closed candles for stable long moving averages and rolling distributions.
- 5M: at least 2,000 closed candles for intraday baselines, session behavior, and rolling percentile calculations; retain more when storage permits.
- Rolling percentiles must be calculated only from observations preceding or including the evaluated bar. Do not calculate a percentile using the complete historical sample.

## Market Regime 4H

### Question Answered

"How is the perpetual-futures market operating at the cross-market level?"

The market regime is computed from a configured liquid basket and benchmark instruments. The universe may evolve, but all snapshots must store the exact universe and coverage used at that time.

### Regime Axes

The classifier returns independent axes instead of forcing all information into one label.

| Axis | Values | Description |
| --- | --- | --- |
| `direction` | `bull`, `neutral`, `bear` | Cross-market directional structure |
| `trend_quality` | `weak`, `developing`, `persistent` | Strength and persistence of the directional state |
| `breadth` | `narrow`, `healthy`, `broad` | Participation across the configured basket |
| `volatility` | `compressed`, `normal`, `elevated`, `extreme` | Relative 4H volatility state |
| `correlation` | `dispersed`, `normal`, `crowded` | Cross-asset co-movement and diversification condition |
| `positioning` | `light`, `balanced`, `crowded`, `unknown` | Funding, OI, basis, and derivatives context |
| `stress` | `none`, `rising`, `high` | Drawdown, volatility shock, correlation spike, and breadth failure |

The UI may generate a readable headline from these axes, for example:

```text
BULL / PERSISTENT / BROAD / ELEVATED VOL
Stress: RISING
```

A headline is presentation only. API consumers should use the independent axes, features, agreement, stability, and evidence.

### Core Feature Groups

#### Trend And Direction

- Benchmark and basket close relative to EMA50 and EMA200.
- EMA50 and EMA200 slope.
- 20-bar and 60-bar 4H return for benchmark, equal-weight basket, and sectors.
- ADX14, `+DI`, and `-DI` distribution across the basket.
- Trend persistence and higher-high/higher-low versus lower-low/lower-high participation.

#### Breadth And Participation

- Percentage of the basket above EMA20, EMA50, and EMA200.
- Percentage with EMA50 above EMA200.
- Advance/decline counts and their changes over 1, 3, and 6 bars.
- New 20-bar high/low counts.
- Sector-level breadth and leader participation.

#### Cross-Section And Rotation

- Equal-weight basket return relative to BTC or the configured benchmark.
- Sector rotation and relative strength.
- Cross-sectional return dispersion.
- Beta dispersion versus the benchmark.

#### Volatility, Correlation, And Stress

- Realized volatility over 20 and 60 bars.
- ATR percentile and ATR expansion.
- Volatility-of-volatility.
- Average pairwise rolling correlation and correlation change.
- 60-bar drawdown and downside semivolatility.
- Breadth deterioration rate and simultaneous volatility/correlation shocks.

#### Perpetual Positioning

- Funding level, rolling funding percentile, and funding z-score by instrument and basket.
- Open interest level and 4H/24H OI changes.
- Price/OI/funding divergence.
- Basis or premium where the configured venue exposes reliable data.

Positioning remains `unknown` when data is absent or stale. Missing data must never be converted to a neutral positioning signal.

### Market Regime Agreement, Breadth, And Stability

A market regime is valid only when it reflects agreement across many independent instruments, not a move in BTC, a single sector, or a few high-beta outliers.

The system must calculate consensus from the eligible universe after excluding stale, insufficient-history, and invalid instruments. It must expose both equal-weight and liquidity-weighted views, while the primary regime remains equal-weight so BTC and a few large contracts cannot silently dominate it.

Required consensus measures:

- `directionalBreadth`: percentage of eligible instruments whose 4H directional state agrees with the proposed market direction.
- `maBreadth`: percentage above/below EMA20, EMA50, and EMA200, plus EMA50/EMA200 alignment.
- `sectorBreadth`: share of configured sectors agreeing with the direction; one sector cannot establish a market-wide regime on its own.
- `trendBreadth`: share with confirming ADX/DI and local structure, not merely a close on one side of an EMA.
- `consensusStrength`: weighted combination of directional, MA, sector, and trend breadth.
- `dispersion`: cross-sectional dispersion, retained separately so broad agreement is not confused with all assets producing identical returns.

Suggested validity gates, to be calibrated only with point-in-time historical evidence:

| Proposed direction | Minimum directional breadth | Minimum sector breadth | Result when gate fails |
| --- | ---: | ---: | --- |
| `bull` or `bear` | 60% | 60% | downgrade to `neutral` or mark direction as `unconfirmed` |
| `persistent` trend quality | 70% | 70% | downgrade to `developing` |
| stress | no minimum | no minimum | may trigger from a broad volatility/correlation shock immediately |

The API must return the raw component values and the eligible counts. It must never report a broad bull or bear state while hiding that only a small number of pairs or one sector agree.

Do not expose a synthetic probability called "confidence." Instead expose:

- `agreement`: number or weighted share of independent feature groups supporting the current axis values.
- `coverage`: usable instruments divided by configured instruments, plus missing/stale identifiers.
- `stabilityBars`: number of consecutive 4H closed bars the state has persisted.
- `transitionRisk`: degree of conflict between the current state and worsening/improving breadth, volatility, correlation, or momentum.

### Relative Strength And Divergence Watchlists

The dashboard must maintain a dedicated cross-sectional watchlist for instruments that are materially stronger or weaker than the confirmed market regime. This is an opportunity-discovery and monitoring surface, not an instruction to trade.

Each eligible instrument receives point-in-time relative-strength and divergence metrics against both the equal-weight basket and the benchmark:

- Relative return over 1, 3, 6, 20, and 60 closed 4H bars.
- Relative return beta-adjusted to the benchmark where enough history exists.
- Relative trend alignment: price versus EMA50/EMA200, EMA slope, ADX/DI, and local high/low structure relative to the market state.
- Relative breadth context: whether the instrument's sector confirms or contradicts the broader basket.
- Relative volatility and liquidity: ATR/realized-vol percentile, volume, funding/OI availability, and stale-data status.
- Persistence: consecutive 4H bars in the relative-strength or relative-weakness cohort.

Classify instruments using neutral descriptive cohorts:

| Cohort | Definition | Dashboard purpose |
| --- | --- | --- |
| `market_leader` | Stronger relative return and stronger trend quality while the instrument agrees with market direction | Identify persistent leaders during a confirmed broad regime |
| `emerging_leader` | Relative strength and participation improving for a configurable number of closed 4H bars | Surface early leadership changes before they become crowded |
| `positive_divergence` | Instrument remains structurally strong while the confirmed market is neutral or bear, with adequate liquidity and persistence | Identify resilience and potential rotation candidates |
| `negative_divergence` | Instrument remains structurally weak while the confirmed market is neutral or bull | Identify relative fragility and failed participation |
| `sector_outlier` | Instrument diverges from both its sector and the broad basket | Flag idiosyncratic behavior requiring inspection |
| `unconfirmed_outlier` | Large relative move without sufficient volume, liquidity, persistence, or data coverage | Keep visible but prevent it from being presented as durable leadership |

The labels `market_leader`, `emerging_leader`, and `positive_divergence` are not forecasts and do not promise large returns. Their role is to direct research attention toward pairs with unusual relative strength, broad-market disagreement, and verified data quality.

For each watchlist row, display the supporting evidence: relative-return ranks, 4H trend state, sector/basket breadth, persistence, volatility state, liquidity quality, funding/OI context, and reasons an outlier is unconfirmed. Do not rank a pair solely by its latest percentage gain.

## Execution Regime 5M

### Question Answered

"What are the local execution conditions for this instrument now?"

The execution regime is computed separately for each configured perpetual instrument. It must not be aggregated into a market-wide entry signal and must not override the 4H market state.

### Execution Axes

| Axis | Values | Description |
| --- | --- | --- |
| `local_structure` | `uptrend`, `downtrend`, `range`, `breakout`, `reversal` | Local price structure |
| `location` | `value`, `mid_range`, `extended` | Location relative to VWAP, EMAs, and local range, normalized by ATR |
| `momentum` | `weak`, `aligned`, `exhausting` | Directional persistence and exhaustion characteristics |
| `volatility_state` | `compressed`, `tradable`, `expanding`, `shock` | Local 5M volatility condition |
| `liquidity_quality` | `good`, `thin`, `stressed`, `unknown` | Spread, depth, volume, and abnormal execution risk |
| `flow` | `accumulation`, `neutral`, `distribution`, `unknown` | Price/volume/OI context; optional until reliable data exists |
| `execution_quality` | `clean`, `conditional`, `avoid` | Neutral summary of local market quality |

Example presentation:

```text
SOLUSDT Linear Perpetual / 5M
Structure: breakout
Location: extended
Volatility: expanding
Liquidity: good
Execution quality: conditional
Evidence: 2.1 ATR above VWAP, relative volume elevated, upper-wick ratio rising.
```

The dashboard describes the condition. It does not say whether to buy, sell, hold, or size an order.

### Core Feature Groups

#### Price Location And Structure

- Session VWAP and optional anchored VWAP.
- EMA20 and EMA50 on 5M; 15M and 1H context may be displayed separately.
- Distance to VWAP and EMA normalized by ATR.
- 12/24/48-bar range position and breakout confirmation based on close, not wick only.
- Higher-high/higher-low and lower-low/lower-high structure.
- ADX14 and DI direction.

#### Volatility And Candle Quality

- ATR14 and point-in-time ATR percentile.
- ATR expansion over 3, 6, and 12 bars.
- 5M realized volatility and volatility-of-volatility.
- Candle body-to-range ratio.
- Close location value and upper/lower wick ratios.
- Return anomaly and abnormal range detection.

#### Volume, Liquidity, And Flow

- Relative volume against 20- and 50-bar baselines.
- Volume-price confirmation and volume concentration.
- Venue-native bid-ask spread, top-of-book depth, and order-book imbalance when available.
- Trade aggressor, CVD, liquidation, OI change, and funding context only when data quality is verified.

Microstructure features are an enhancement. V2 must operate with OHLCV and venue-native derivatives data before relying on order-book or trade-flow feeds.

### Execution State Hysteresis

- Normal 5M state changes require 2 to 3 fully closed 5M candles of confirmation.
- `liquidity_quality = stressed`, `volatility_state = shock`, or a material feed-health failure can activate immediately.
- Each transition records the prior state, closed-bar timestamp, primary triggering features, and transition severity.

## Classifier Architecture

### Feature Pipeline

```text
Venue-native raw market data
  -> validated closed bars and derivatives snapshots
  -> point-in-time per-instrument features
  -> cross-market 4H aggregate features
  -> independent state axes
  -> hysteresis and transition events
  -> dashboard, API, alerts, and research exports
```

### Versioning

Every stored output must include:

- `modelVersion`.
- Feature schema version.
- Threshold/configuration version.
- Venue and instrument type.
- Universe version and actual coverage.
- Source candle close time and snapshot time.

Changing a formula, threshold, universe, or data source creates a new version. Historical results must remain reproducible under the original version.

### Hard Guards

- Reject or flag a source candle that is still open.
- Reject a feature window with insufficient history.
- Mark feeds stale after a configured maximum delay.
- Do not impute funding, OI, spread, or depth as neutral values.
- Do not calculate historical percentiles, z-scores, or labels with future observations.
- Do not classify a historical period from the current universe without recording survivorship and coverage limitations.

## Persistence

The existing in-memory short history is insufficient for V2. Persist point-in-time data.

### Required Records

1. Raw or reproducible normalized 5M and 4H OHLCV data.
2. Funding and OI snapshots with their source timestamps.
3. Per-instrument 5M feature snapshots and execution states.
4. Cross-market 4H feature snapshots and market-regime axes.
5. State transitions with prior state, trigger evidence, and severity.
6. Feed-health events, missing symbols, and staleness events.

### Retention

- Retain normalized raw 5M data for at least 90 to 180 days.
- Retain aggregate 4H and 5M feature/state snapshots longer-term for transition analysis and research.
- Retain configuration/model versions indefinitely while referenced by stored snapshots.

## API Contract

The API remains read-only. Responses should be explicit about time, validity, and provenance.

### Required Metadata

```json
{
  "asOf": "2026-09-26T00:00:00.000Z",
  "barCloseAt": "2026-09-26T00:00:00.000Z",
  "timeframe": "4h",
  "venue": "configured-linear-perpetual-venue",
  "instrumentType": "linear_perpetual",
  "isClosed": true,
  "modelVersion": "v2.0.0",
  "coverage": {
    "configured": 57,
    "usable": 54,
    "missing": ["EXAMPLE"],
    "stale": []
  },
  "stalenessMs": 0
}
```

### Suggested Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v2/market/regime-4h` | Current 4H market axes, evidence, agreement, stability, and transition risk |
| `GET /api/v2/market/history-4h` | Point-in-time historical 4H states and aggregates |
| `GET /api/v2/execution/5m` | Current 5M execution board for all covered instruments |
| `GET /api/v2/execution/5m/:symbol` | Instrument detail, evidence, and execution-state history |
| `GET /api/v2/feed-health` | Venue status, coverage, lag, and missing-data diagnostics |
| `GET /api/v2/research/export` | Versioned point-in-time data export for offline research |

## Dashboard Information Architecture

### Global Header

- Configured venue and `linear perpetual` instrument designation.
- Current market coverage, missing instruments, and feed health.
- Last fully closed 4H bar and last fully closed 5M bar.
- Model and feature version.
- Clear distinction between closed-bar state and optional intrabar nowcast.

### Market Regime 4H Board

- Axis-based market-state display: direction, trend quality, breadth, volatility, correlation, positioning, and stress.
- Agreement, stability, coverage, and transition-risk cards.
- BTC/benchmark context, equal-weight basket, alt relative performance, sector rotation, and breadth matrix.
- Historical point-in-time state timeline with transition markers and evidence.

### Execution Regime 5M Board

- Instrument table or heatmap with local structure, location, momentum, volatility, liquidity, flow, execution quality, and data freshness.
- Filters by state and sector, not by trading action.
- Instrument drawer with 4H context, 5M state history, feature values, and trigger evidence.
- Distinct visual treatment for `unknown`, stale, and degraded data so absence of data is never read as a benign state.

### Alerts

Alerts describe state changes and data conditions:

- 4H direction, breadth, volatility, correlation, positioning, or stress transition.
- Breadth collapse or recovery.
- Volatility/correlation shock.
- 5M execution-quality transition for an instrument.
- Stale data, partial coverage, failed funding/OI feed, or venue degradation.

## Research Validation

V2 must be validated as a descriptive classifier before anyone relies on it as context.

### Validation Questions

- Do 4H state combinations separate the distribution of forward 4H, 24H, and multi-day returns?
- Do they separate future realized volatility, drawdown, correlation, dispersion, and tail-risk measures?
- Does the 5M execution state distinguish subsequent range, volatility, slippage proxy, and adverse excursion characteristics?
- Are transitions more informative than static states?
- Are results stable across rolling periods, market eras, assets, and changes in basket coverage?

### Methodological Requirements

- Use only point-in-time states with closed source candles.
- Purge overlapping horizons where needed and report sample size per state.
- Report coverage, missing data, and universe changes for each analysis window.
- Keep descriptive validation separate from any downstream strategy backtest.
- Do not use force-exit artifacts, strategy PnL, or a particular strategy's rules as the definition of regime quality.

## Delivery Phases

### Phase 1: Foundation

- Choose and configure one venue-native linear-perpetual data source.
- Implement closed-bar ingestion for 4H and 5M OHLCV, funding, and OI.
- Add persistence, data-quality checks, instrument coverage, and versioned snapshot schema.

### Phase 2: Feature Engines

- Build point-in-time 4H market features and 5M per-instrument execution features.
- Implement rolling distributions without lookahead.
- Add feature-level availability and staleness flags.

### Phase 3: State Engines

- Implement independent market axes and execution axes.
- Add agreement, stability, transition risk, hysteresis, and transition evidence.
- Keep classifier configuration versioned and testable.

### Phase 4: API And Dashboard

- Build V2 read-only endpoints.
- Replace the daily spot/perp-mixed presentation with explicit 4H market and 5M execution views.
- Build feed-health, instrument-detail, transition-history, and alert surfaces.

### Phase 5: Research And Calibration

- Accumulate sufficient point-in-time history.
- Run descriptive forward-outcome analysis by state and transition.
- Calibrate or simplify thresholds only through documented out-of-sample validation.
- Add a macro overlay only as an independent later module.

## Migration From V1

V1 remains useful as a dashboard prototype, but its daily classifier must not be relabelled as V2 without replacing its assumptions.

V2 replaces the following V1 constraints:

- Daily spot-price basket becomes venue-consistent linear-perpetual 4H and 5M data.
- A single daily market label becomes independent 4H market axes.
- Current funding snapshot becomes a time-aligned derivatives feature set with explicit availability.
- In-memory chart history becomes persisted point-in-time snapshots.
- A single heuristic "confidence" becomes agreement, coverage, stability, and transition risk.
- Simplified historical chart labels become the same point-in-time classifier used for current states.

## Acceptance Criteria

V2 is ready for research use when all of the following are true:

1. All displayed historical labels are reproducible point-in-time without future-data leakage.
2. Every displayed data-derived state identifies venue, timeframe, source bar close, model version, coverage, and staleness.
3. 4H market state and 5M execution state are stored and queryable independently.
4. Normal regime transitions use hysteresis; stress and feed-health exceptions are explicitly documented.
5. Missing derivatives or microstructure data produces `unknown` or degraded status, not a misleading neutral score.
6. The dashboard contains no implicit buy/sell recommendation or strategy-specific decision rule.
7. Historical exports support independent research on forward returns, volatility, adverse excursions, and state transitions.
