import { createFileRoute } from "@tanstack/react-router";
import { overviewData } from "@/lib/market/public-contracts";
import { snapshotErrorResponse, snapshotResponse } from "@/lib/market/api-response.server";

export const Route = createFileRoute("/api/v1/market/overview")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { buildSnapshot } = await import("@/lib/market/snapshot.server");
          const snapshot = await buildSnapshot();
          return snapshotResponse(snapshot, overviewData(snapshot));
        } catch {
          return snapshotErrorResponse();
        }
      },
    },
  },
});
