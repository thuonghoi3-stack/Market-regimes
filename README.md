# Market Regime

Market Regime is a local-first crypto market monitoring dashboard and read-only JSON API. It collects daily USDT market data for a fixed basket of liquid crypto assets, calculates cross-market indicators, classifies the current market regime, and exposes the same snapshot to the web interface and other local applications.

The project is designed for research and situational awareness, not automated execution or investment advice.

## What It Does

- Tracks a fixed universe of 57 crypto assets across BTC, majors, L1, DeFi, meme, gaming, and infrastructure groups.
- Fetches spot ticker and daily candle data from Binance public data APIs.
- Fetches current perpetual-futures funding data from Bitget.
- Calculates per-asset returns, relative strength, RSI, moving-average distance, volatility, beta, ADX/DI, trend state, and funding.
- Builds market-wide breadth, volatility, correlation, dispersion, drawdown, funding, and trend metrics.
- Classifies the market into `expansion`, `euphoria`, `compression`, `distribution`, `transition`, `risk_off`, or `crisis`.
- Displays the result in a React dashboard with historical charts, market KPIs, and a filterable asset table.
- Provides four local JSON endpoints so another app, script, or service can read the same market snapshot.

## Data Flow

```text
Binance ticker + 1d klines      Bitget funding
             |                       |
             +----------+------------+
                        v
         src/lib/market/snapshot.server.ts
                        |
                        v
              MarketSnapshot (shared model)
                 |                 |
                 v                 v
          React dashboard     Local REST-style API
```

`buildSnapshot()` is the single source of truth. The dashboard calls it through the internal TanStack Start server function, while the public local routes map only the fields required by each endpoint. This keeps the displayed data and API output consistent.

## Project Structure

```text
src/
  components/dashboard/        Dashboard UI, charts, filters, and asset table
  lib/market/
    universe.ts                Fixed asset universe and groups
    snapshot.server.ts         Data retrieval, cache, indicators, and snapshot assembly
    math.ts                    Technical/statistical calculations
    regime.ts                  Score construction and regime classification
    types.ts                   Internal MarketSnapshot model
    api.ts                     Internal server function used by the dashboard
    public-contracts.ts        Public API DTO mapping and metadata
    api-response.server.ts     JSON response and error helpers
  routes/
    index.tsx                  Dashboard route
    api/v1/market/             Local read-only market endpoints
  routeTree.gen.ts             Generated TanStack route tree; do not edit manually
scripts/                       Development, migration, preview, and validation utilities
```

## Indicators And Regimes

The snapshot combines individual-asset and market-wide signals.

| Area                          | Examples                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Returns and relative strength | 1d/7d/30d return, 7d performance versus BTC, equal-weight basket performance  |
| Trend                         | SMA20/SMA50/SMA100 distance, percentage above moving averages, ADX, +DI/-DI   |
| Momentum                      | RSI-14, 20-day highs and lows                                                 |
| Risk                          | 20-day realized volatility, Parkinson volatility, 60-day drawdown, dispersion |
| Cross-market behavior         | Average 20-day correlation, breadth, advance/decline counts                   |
| Positioning proxy             | Current Bitget perpetual funding and average funding                          |

The regime classifier produces a label, Vietnamese label, confidence, interpretation (`thesis`), suggested research playbook, and drivers. It is a heuristic market-state model, not a price forecast or trading recommendation.

## Requirements

- Node.js 22 or newer is recommended.
- npm.
- Internet access to Binance public data and Bitget public funding endpoints.

No exchange API key is required for market data.

## Run Locally

```bash
npm ci
npm run dev
```

Open the dashboard at:

```text
http://localhost:8080/
```

The current `dev` script binds Vite to `0.0.0.0`, which can expose the development server to reachable LAN or Tailscale interfaces. The API has no authentication in this local-first version. Do not expose it to an untrusted network. To bind only to the current machine, run:

```bash
node scripts/with-app-env.mjs vite dev --host 127.0.0.1 --port 8080
```

## Local API v1

All API routes are read-only `GET` endpoints. They return JSON with a stable envelope:

```json
{
  "data": {},
  "meta": {
    "apiVersion": "v1",
    "asOf": "2026-09-25T22:15:40.084Z",
    "source": "Binance · Bitget funding",
    "universe": 57,
    "listed": 54,
    "missing": ["EOS", "LRC", "MKR"]
  }
}
```

`asOf` is the server timestamp for the shared snapshot. `listed` and `missing` report actual source coverage, so clients should not assume every asset in the configured universe is available at every refresh.

| Endpoint                      | Purpose                           | `data` contents                    |
| ----------------------------- | --------------------------------- | ---------------------------------- |
| `GET /api/v1/market/regime`   | Current market regime and scoring | `regime`, `scores`                 |
| `GET /api/v1/market/overview` | Compact market-wide view          | reduced `regime`, `scores`, `kpis` |
| `GET /api/v1/market/assets`   | Per-asset indicator table         | `items` (`CoinRow[]`)              |
| `GET /api/v1/market/history`  | In-memory daily history           | `interval`, `windowDays`, `series` |

Examples:

```bash
curl http://localhost:8080/api/v1/market/regime
curl http://localhost:8080/api/v1/market/overview
curl http://localhost:8080/api/v1/market/assets
curl http://localhost:8080/api/v1/market/history
```

### Data Conventions

- Return and distance fields are decimal ratios. For example, `0.012` means `+1.2%`, and `-0.035` means `-3.5%`.
- Timestamps in `meta.asOf` are ISO 8601 UTC strings. Historical `series.t` values are Unix milliseconds.
- `/market/history` currently returns the latest in-memory daily window, normally up to 90 points. It is not a persistent historical database or a backtesting dataset.
- Responses use `Cache-Control: no-store`. The server itself retains a snapshot cache for 45 seconds and a per-symbol kline cache for 8 minutes to reduce repeated upstream requests during local use.
- If the snapshot cannot be built because an upstream source fails, API routes return HTTP `503` with JSON error data.

## Useful Scripts

```bash
npm run dev             # Start the development server on port 8080
npm run build           # Build the app, then run database migrations
npm run build:dev       # Build using development mode
npm run preview         # Serve a built app locally
npm run preview:stop    # Stop the managed preview server
npm test                # Run the project test suite
npm run lint            # Run ESLint across the repository
npm run typecheck       # Run TypeScript without emitting files
npm run format          # Format files with Prettier
```

## Configuration

Copy `.env.example` to `.env` only when the optional authentication/platform integration needs configuration. Market-data retrieval itself uses public upstream endpoints and does not need secrets.

```bash
cp .env.example .env
```

Never commit `.env` files or real OAuth credentials.

## Current Scope And Limitations

- The asset universe is fixed in `src/lib/market/universe.ts`; it is not user-configurable from the UI or API.
- The API is intentionally local and unauthenticated. Add authentication, rate limiting, and a shared cache before exposing it publicly.
- Funding is a current per-asset value from Bitget; the project does not yet expose open interest or a funding history curve.
- Order-book depth, macro data such as DXY/rates, and persistent historical snapshots are not implemented.
- Binance or Bitget outages, symbol changes, and incomplete market coverage can cause missing assets or a `503` response.
- Market regime output is analytical context only. Validate any strategy separately with suitable data, fees, slippage, and out-of-sample testing.

## Technology

- React 19 and TypeScript
- TanStack Start, TanStack Router, and TanStack Query
- Vite and Nitro
- Tailwind CSS and Radix UI
- Recharts
- Binance public market-data API and Bitget public funding API

## Development Notes

`src/routeTree.gen.ts` is generated by the TanStack router plugin when routes change. Commit its generated update with route additions, but do not hand-edit it.
