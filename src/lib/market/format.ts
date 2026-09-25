const ICT = "Asia/Ho_Chi_Minh";

export function fmtPct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${(x * 100).toFixed(digits)}%`;
}

export function fmtPctPlain(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000)
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (n >= 0.01) return n.toFixed(5);
  return n.toPrecision(4);
}

export function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function fmtVol(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

export function fmtTimeIct(ms: number): string {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: ICT,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

export function pnlClass(x: number): string {
  if (x > 0.0015) return "text-bull";
  if (x < -0.0015) return "text-bear";
  return "text-muted";
}
