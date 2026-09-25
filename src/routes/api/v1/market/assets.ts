import { createFileRoute } from "@tanstack/react-router";
import { assetsData } from "@/lib/market/public-contracts";
import { snapshotErrorResponse, snapshotResponse } from "@/lib/market/api-response.server";

export const Route = createFileRoute("/api/v1/market/assets")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { buildSnapshot } = await import("@/lib/market/snapshot.server");
          const snapshot = await buildSnapshot();
          return snapshotResponse(snapshot, assetsData(snapshot));
        } catch {
          return snapshotErrorResponse();
        }
      },
    },
  },
});
