import type { RegimeId, TrendTag } from "./types";
import type { CoinGroup } from "./universe";

export const REGIME_TONE: Record<
  RegimeId,
  { bar: string; text: string; bg: string }
> = {
  expansion: { bar: "bg-bull", text: "text-bull", bg: "bg-bull/12" },
  euphoria: { bar: "bg-warn", text: "text-warn", bg: "bg-warn/12" },
  compression: { bar: "bg-accent", text: "text-accent", bg: "bg-accent/12" },
  distribution: { bar: "bg-warn", text: "text-warn", bg: "bg-warn/12" },
  transition: { bar: "bg-muted", text: "text-muted", bg: "bg-surface-2" },
  risk_off: { bar: "bg-bear", text: "text-bear", bg: "bg-bear/12" },
  crisis: { bar: "bg-bear", text: "text-bear", bg: "bg-bear/18" },
};

export const TREND_LABEL: Record<TrendTag, string> = {
  up: "Uptrend",
  down: "Downtrend",
  range: "Range",
};

export const GROUP_ORDER: CoinGroup[] = [
  "btc",
  "majors",
  "l1",
  "defi",
  "infra",
  "meme",
  "gaming",
  "other",
];
