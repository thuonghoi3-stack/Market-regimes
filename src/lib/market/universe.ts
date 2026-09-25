export type CoinGroup =
  | "btc"
  | "majors"
  | "l1"
  | "defi"
  | "meme"
  | "gaming"
  | "infra"
  | "other";

export type UniverseCoin = {
  id: string;
  ccxt: string;
  group: CoinGroup;
};

/** Exact basket from the request (USDT-M perp ids). */
export const UNIVERSE: UniverseCoin[] = [
  { id: "1000BONK", ccxt: "1000BONK/USDT:USDT", group: "meme" },
  { id: "1000FLOKI", ccxt: "1000FLOKI/USDT:USDT", group: "meme" },
  { id: "1000PEPE", ccxt: "1000PEPE/USDT:USDT", group: "meme" },
  { id: "1000SHIB", ccxt: "1000SHIB/USDT:USDT", group: "meme" },
  { id: "AAVE", ccxt: "AAVE/USDT:USDT", group: "defi" },
  { id: "ADA", ccxt: "ADA/USDT:USDT", group: "l1" },
  { id: "ALGO", ccxt: "ALGO/USDT:USDT", group: "l1" },
  { id: "APT", ccxt: "APT/USDT:USDT", group: "l1" },
  { id: "AR", ccxt: "AR/USDT:USDT", group: "infra" },
  { id: "ARB", ccxt: "ARB/USDT:USDT", group: "l1" },
  { id: "ATOM", ccxt: "ATOM/USDT:USDT", group: "l1" },
  { id: "AVAX", ccxt: "AVAX/USDT:USDT", group: "l1" },
  { id: "AXS", ccxt: "AXS/USDT:USDT", group: "gaming" },
  { id: "BCH", ccxt: "BCH/USDT:USDT", group: "majors" },
  { id: "BLUR", ccxt: "BLUR/USDT:USDT", group: "gaming" },
  { id: "BOME", ccxt: "BOME/USDT:USDT", group: "meme" },
  { id: "BTC", ccxt: "BTC/USDT:USDT", group: "btc" },
  { id: "CELO", ccxt: "CELO/USDT:USDT", group: "l1" },
  { id: "CELR", ccxt: "CELR/USDT:USDT", group: "infra" },
  { id: "CFX", ccxt: "CFX/USDT:USDT", group: "l1" },
  { id: "CHZ", ccxt: "CHZ/USDT:USDT", group: "gaming" },
  { id: "COMP", ccxt: "COMP/USDT:USDT", group: "defi" },
  { id: "CRV", ccxt: "CRV/USDT:USDT", group: "defi" },
  { id: "DOGE", ccxt: "DOGE/USDT:USDT", group: "meme" },
  { id: "DOT", ccxt: "DOT/USDT:USDT", group: "l1" },
  { id: "DYDX", ccxt: "DYDX/USDT:USDT", group: "defi" },
  { id: "EGLD", ccxt: "EGLD/USDT:USDT", group: "l1" },
  { id: "ENA", ccxt: "ENA/USDT:USDT", group: "defi" },
  { id: "ENJ", ccxt: "ENJ/USDT:USDT", group: "gaming" },
  { id: "EOS", ccxt: "EOS/USDT:USDT", group: "l1" },
  { id: "ETC", ccxt: "ETC/USDT:USDT", group: "majors" },
  { id: "ETH", ccxt: "ETH/USDT:USDT", group: "majors" },
  { id: "FET", ccxt: "FET/USDT:USDT", group: "infra" },
  { id: "FIL", ccxt: "FIL/USDT:USDT", group: "infra" },
  { id: "FLOW", ccxt: "FLOW/USDT:USDT", group: "l1" },
  { id: "GALA", ccxt: "GALA/USDT:USDT", group: "gaming" },
  { id: "GMT", ccxt: "GMT/USDT:USDT", group: "gaming" },
  { id: "GMX", ccxt: "GMX/USDT:USDT", group: "defi" },
  { id: "GRT", ccxt: "GRT/USDT:USDT", group: "infra" },
  { id: "HBAR", ccxt: "HBAR/USDT:USDT", group: "l1" },
  { id: "ICP", ccxt: "ICP/USDT:USDT", group: "l1" },
  { id: "IMX", ccxt: "IMX/USDT:USDT", group: "gaming" },
  { id: "INJ", ccxt: "INJ/USDT:USDT", group: "l1" },
  { id: "IOST", ccxt: "IOST/USDT:USDT", group: "l1" },
  { id: "IOTA", ccxt: "IOTA/USDT:USDT", group: "l1" },
  { id: "JUP", ccxt: "JUP/USDT:USDT", group: "defi" },
  { id: "KAVA", ccxt: "KAVA/USDT:USDT", group: "defi" },
  { id: "LDO", ccxt: "LDO/USDT:USDT", group: "defi" },
  { id: "LINK", ccxt: "LINK/USDT:USDT", group: "infra" },
  { id: "LRC", ccxt: "LRC/USDT:USDT", group: "defi" },
  { id: "LTC", ccxt: "LTC/USDT:USDT", group: "majors" },
  { id: "MAGIC", ccxt: "MAGIC/USDT:USDT", group: "gaming" },
  { id: "MANA", ccxt: "MANA/USDT:USDT", group: "gaming" },
  { id: "MATIC", ccxt: "MATIC/USDT:USDT", group: "l1" },
  { id: "MINA", ccxt: "MINA/USDT:USDT", group: "l1" },
  { id: "MKR", ccxt: "MKR/USDT:USDT", group: "defi" },
  { id: "NEAR", ccxt: "NEAR/USDT:USDT", group: "l1" },
];

export const GROUP_LABEL: Record<CoinGroup, string> = {
  btc: "BTC",
  majors: "Majors",
  l1: "L1",
  defi: "DeFi",
  meme: "Meme",
  gaming: "Gaming",
  infra: "Infra",
  other: "Other",
};

export const MEME_IDS = new Set(
  UNIVERSE.filter((c) => c.group === "meme").map((c) => c.id),
);

export const MAJOR_IDS = new Set(
  UNIVERSE.filter((c) => c.group === "majors" || c.group === "btc").map(
    (c) => c.id,
  ),
);

export function displayTicker(id: string): string {
  return id.startsWith("1000") ? id.slice(4) : id === "MATIC" ? "POL" : id;
}

export function spotCandidates(id: string): string[] {
  if (id === "MATIC") return ["POLUSDT", "MATICUSDT"];
  const out = [`${id}USDT`];
  if (id.startsWith("1000")) out.push(`${id.slice(4)}USDT`);
  if (id === "RENDER") out.push("RNDRUSDT");
  return out;
}

export function fundingCandidates(id: string): string[] {
  return spotCandidates(id);
}
