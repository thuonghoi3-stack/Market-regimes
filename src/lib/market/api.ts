import { createServerFn } from "@tanstack/react-start";
import type { MarketSnapshot } from "./types";

export const getMarketSnapshot = createServerFn({ method: "POST" }).handler(
  async (): Promise<MarketSnapshot> => {
    const { buildSnapshot } = await import("./snapshot.server");
    return buildSnapshot();
  },
);
