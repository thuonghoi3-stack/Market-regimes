import { createFileRoute } from "@tanstack/react-router";
import { historyData, snapshotMeta } from "@/lib/market/public-contracts";
import { snapshotErrorResponse } from "@/lib/market/api-response.server";

export const Route = createFileRoute("/api/v1/market/history")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { buildSnapshot } = await import("@/lib/market/snapshot.server");
          const { persistenceAvailable } = await import("@/lib/db");
          const snapshot = await buildSnapshot();
          const persisted = persistenceAvailable
            ? await (await import("@/lib/market/persistence.server")).loadMarketHistory()
            : { snapshots: [], transitions: [] };
          return Response.json({ data: { ...historyData(snapshot), persisted }, meta: snapshotMeta(snapshot) });
        } catch {
          return snapshotErrorResponse();
        }
      },
    },
  },
});
