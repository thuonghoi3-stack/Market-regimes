import type { MarketSnapshot } from "./types";
import { snapshotMeta, type PublicApiResponse } from "./public-contracts";

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
} as const;

export function snapshotResponse<T>(snapshot: MarketSnapshot, data: T): Response {
  const body: PublicApiResponse<T> = {
    data,
    meta: snapshotMeta(snapshot),
  };
  return Response.json(body, { headers: JSON_HEADERS });
}

export function snapshotErrorResponse(): Response {
  return Response.json(
    {
      error: {
        code: "MARKET_DATA_UNAVAILABLE",
        message: "Market snapshot is temporarily unavailable.",
      },
    },
    { status: 503, headers: JSON_HEADERS },
  );
}
