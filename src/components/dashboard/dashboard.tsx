import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getMarketSnapshot } from "@/lib/market/api";
import { fmtNum, fmtPct, fmtPctPlain, fmtPrice, fmtTimeIct, fmtVol, pnlClass } from "@/lib/market/format";
import { GROUP_LABEL } from "@/lib/market/universe";
import { REGIME_TONE, TREND_LABEL } from "@/lib/market/labels";
import type { CoinRow, MarketSnapshot, RegimeId } from "@/lib/market/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Filter = "all" | "up" | "down" | "meme" | "defi" | "l1";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "up", label: "Uptrend" },
  { id: "down", label: "Downtrend" },
  { id: "l1", label: "L1" },
  { id: "defi", label: "DeFi" },
  { id: "meme", label: "Meme" },
];

function heatColor(ret: number): string {
  const mag = Math.min(1, Math.abs(ret) / 0.18);
  const token = ret >= 0 ? "var(--color-bull)" : "var(--color-bear)";
  return `color-mix(in oklab, ${token} ${Math.round(18 + mag * 62)}%, transparent)`;
}

function ScoreMeter({
  label,
  value,
  hint,
  bipolar,
}: {
  label: string;
  value: number;
  hint: string;
  bipolar?: boolean;
}) {
  const pct = bipolar ? (value + 1) / 2 : value;
  const left = `${Math.round(Math.min(100, Math.max(0, pct * 100)))}%`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-h-11 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted">{label}</span>
            <span className="font-mono text-xs tabular text-fg">
              {bipolar ? fmtNum(value, 2) : fmtPctPlain(value, 0)}
            </span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent"
              style={{ width: left }}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function Kpi({
  label,
  value,
  hint,
  signed,
}: {
  label: string;
  value: string;
  hint?: string;
  signed?: number;
}) {
  const inner = (
    <div className="flex min-h-16 flex-col justify-between gap-1 rounded-lg bg-surface-2 px-3 py-2.5">
      <span className="text-xs text-muted">{label}</span>
      <span
        className={cn(
          "font-mono text-base tabular tracking-tight",
          signed != null ? pnlClass(signed) : "text-fg",
        )}
      >
        {value}
      </span>
    </div>
  );
  if (!hint) return inner;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-fg px-2.5 py-2 text-xs text-bg">
      <div className="mb-1 text-bg/70">
        {typeof label === "number"
          ? new Date(label).toLocaleDateString("vi-VN")
          : label}
      </div>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 tabular">
          <span>{p.name}</span>
          <span>
            {p.name.includes("%") || p.name.includes("Vol") || p.name.includes("Corr")
              ? fmtPctPlain(Number(p.value), 0)
              : fmtNum(Number(p.value), 1)}
          </span>
        </div>
      ))}
    </div>
  );
}

function regimeBandFill(id: RegimeId): string {
  switch (id) {
    case "expansion":
      return "color-mix(in oklab, var(--color-bull) 14%, transparent)";
    case "euphoria":
      return "color-mix(in oklab, var(--color-warn) 16%, transparent)";
    case "compression":
      return "color-mix(in oklab, var(--color-accent) 10%, transparent)";
    case "distribution":
      return "color-mix(in oklab, var(--color-warn) 12%, transparent)";
    case "risk_off":
      return "color-mix(in oklab, var(--color-bear) 14%, transparent)";
    case "crisis":
      return "color-mix(in oklab, var(--color-bear) 22%, transparent)";
    default:
      return "transparent";
  }
}

function bandRanges(series: MarketSnapshot["series"]) {
  const ranges: Array<{ id: RegimeId; x1: number; x2: number }> = [];
  if (!series.t.length) return ranges;
  let start = 0;
  for (let i = 1; i <= series.regime.length; i++) {
    if (i === series.regime.length || series.regime[i] !== series.regime[start]) {
      const id = series.regime[start]!;
      ranges.push({
        id,
        x1: series.t[start]!,
        x2: series.t[Math.min(i, series.t.length - 1)]!,
      });
      start = i;
    }
  }
  return ranges;
}

function DashboardSkeleton() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-xs tracking-widest text-accent uppercase">
          Market state desk
        </p>
        <h1 className="text-3xl font-medium tracking-tight text-fg">REGIME</h1>
        <p className="text-sm text-muted">Đang tính regime từ rổ perp USDT…</p>
      </header>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </main>
  );
}

function Loaded({ data }: { data: MarketSnapshot }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: keyof CoinRow; dir: "asc" | "desc" }>({
    key: "chg7d",
    dir: "desc",
  });
  const tone = REGIME_TONE[data.regime.id];

  const chartData = useMemo(
    () =>
      data.series.t.map((t, i) => ({
        t,
        Rổ: data.series.ew[i],
        BTC: data.series.btc[i],
        Breadth: data.series.breadthSma50[i],
        Vol: data.series.vol20[i],
        Corr: data.series.corr20[i],
      })),
    [data.series],
  );
  const bands = useMemo(() => bandRanges(data.series), [data.series]);

  const coins = useMemo(() => {
    const query = q.trim().toUpperCase();
    let rows = data.coins.filter((c) => {
      if (query && !c.ticker.includes(query) && !c.id.includes(query)) return false;
      if (filter === "up") return c.trend === "up";
      if (filter === "down") return c.trend === "down";
      if (filter === "meme" || filter === "defi" || filter === "l1") return c.group === filter;
      return true;
    });
    const { key, dir } = sort;
    rows = [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const an = typeof av === "number" ? av : String(av);
      const bn = typeof bv === "number" ? bv : String(bv);
      if (an < bn) return dir === "asc" ? -1 : 1;
      if (an > bn) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data.coins, q, filter, sort]);

  function toggleSort(key: keyof CoinRow) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" },
    );
  }

  const k = data.kpis;
  const s = data.scores;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 pb-16 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs tracking-widest text-accent uppercase">
            Market state desk
          </p>
          <h1 className="text-3xl font-medium tracking-tight text-fg md:text-4xl">
            REGIME
          </h1>
          <p className="max-w-xl text-sm text-muted">
            Regime rổ {data.listed}/{data.universe} perp USDT — trend, breadth, vol,
            correlation, Hurst, funding.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="tabular">{fmtTimeIct(data.asOf)} ICT</span>
          <span className="text-subtle">·</span>
          <span>{data.source}</span>
        </div>
      </header>

      <section className={cn("rounded-xl p-5 md:p-6", tone.bg)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("text-xs font-medium tracking-wide uppercase", tone.text)}>
                {data.regime.labelVi}
              </span>
              <Badge tone="default">{data.regime.label}</Badge>
            </div>
            <h2 className="max-w-2xl text-2xl font-medium tracking-tight text-fg md:text-3xl">
              {data.regime.thesis}
            </h2>
          </div>
          <div className="flex min-w-40 flex-col gap-2">
            <span className="text-xs text-muted">Độ tin cậy</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg/40">
                <div
                  className={cn("h-full rounded-full", tone.bar)}
                  style={{ width: `${Math.round(data.regime.confidence * 100)}%` }}
                />
              </div>
              <span className="font-mono text-sm tabular">
                {Math.round(data.regime.confidence * 100)}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <ScoreMeter
            label="Trend"
            value={s.trend}
            bipolar
            hint="Composite của % trên SMA, momentum rổ equal-weight và tỷ lệ uptrend."
          />
          <ScoreMeter
            label="Vol percentile"
            value={s.vol}
            hint="Vol 20 ngày của rổ so với 90 phiên. Cao = stress / euphoria."
          />
          <ScoreMeter
            label="Breadth SMA50"
            value={s.breadth}
            hint="Tỷ lệ coin đóng cửa trên SMA50. Đo sự đồng thuận, không phải giá BTC đơn lẻ."
          />
          <ScoreMeter
            label="Tương quan"
            value={s.corr}
            hint="Tương quan cặp trung bình 20D. Cao nghĩa là đa dạng hóa mất tác dụng."
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Rổ 1D" value={fmtPct(k.ew1d)} signed={k.ew1d} hint="Equal-weight 1 phiên." />
        <Kpi label="Rổ 7D" value={fmtPct(k.ew7d)} signed={k.ew7d} />
        <Kpi label="Rổ 30D" value={fmtPct(k.ew30d)} signed={k.ew30d} />
        <Kpi label="BTC 7D" value={fmtPct(k.btc7d)} signed={k.btc7d} />
        <Kpi
          label="Alt vs BTC 20D"
          value={fmtPct(k.altVsBtc20)}
          signed={k.altVsBtc20}
          hint="Rổ equal-weight trừ BTC — dương = alt season."
        />
        <Kpi
          label="Meme vs majors 7D"
          value={fmtPct(k.memeVsMajors7)}
          signed={k.memeVsMajors7}
        />
        <Kpi label="% trên SMA20" value={fmtPctPlain(k.pctAboveSma20)} />
        <Kpi label="% trên SMA50" value={fmtPctPlain(k.pctAboveSma50)} />
        <Kpi label="% trên SMA100" value={fmtPctPlain(k.pctAboveSma100)} />
        <Kpi
          label="Vol 20D ann."
          value={fmtVol(k.realizedVol20)}
          hint="Realized vol log-return, annualized 365."
        />
        <Kpi label="Hurst" value={fmtNum(k.hurst, 2)} hint=">0.55 xu hướng bền, <0.45 mean-revert." />
        <Kpi label="ADX TB" value={fmtNum(k.adx, 0)} hint="<18 range, >25 trend rõ." />
        <Kpi
          label="Funding 8h"
          value={
            k.avgFunding == null
              ? "—"
              : `${k.avgFunding >= 0 ? "+" : ""}${(k.avgFunding * 100).toFixed(3)}%`
          }
          hint="Funding perp trung bình — crowding."
        />
        <Kpi label="Drawdown 60D" value={fmtPct(k.drawdown60)} signed={k.drawdown60} />
        <Kpi
          label="Highs / Lows 20D"
          value={`${k.new20Highs} / ${k.new20Lows}`}
        />
        <Kpi
          label="Adv / Dec 1D"
          value={`${k.adv1d} / ${k.dec1d}`}
        />
        <Kpi
          label="Dispersion 7D"
          value={fmtPct(k.dispersion20)}
          hint="Độ lệch chuẩn lợi nhuận 7D giữa các coin. Cao = thị trường chọn lọc."
        />
        <Kpi label="% Uptrend" value={fmtPctPlain(k.pctUptrend)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-3 md:p-4 lg:col-span-2">
          <CardHeader className="px-2">
            <CardTitle>Rổ equal-weight vs BTC · 90D</CardTitle>
            <CardDescription>
              Nền màu là regime lịch sử (vol + trend + breadth). Chỉ số gốc = 100.
            </CardDescription>
          </CardHeader>
          <div className="h-72 w-full md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                {bands.map((b, i) => (
                  <ReferenceArea
                    key={`${b.id}-${i}`}
                    x1={b.x1}
                    x2={b.x2}
                    fill={regimeBandFill(b.id)}
                    fillOpacity={1}
                    ifOverflow="hidden"
                  />
                ))}
                <XAxis
                  dataKey="t"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
                  }
                  tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <ReTooltip content={<ChartTip />} />
                <Area
                  type="monotone"
                  dataKey="Rổ"
                  stroke="var(--color-accent)"
                  fill="color-mix(in oklab, var(--color-accent) 18%, transparent)"
                  strokeWidth={1.75}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="BTC"
                  stroke="var(--color-fg)"
                  strokeWidth={1.25}
                  dot={false}
                  strokeOpacity={0.7}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Playbook</CardTitle>
            <CardDescription>Hành động phù hợp regime hiện tại — không phải khuyến nghị đầu tư.</CardDescription>
          </CardHeader>
          <ol className="flex flex-col gap-3 text-sm text-fg/90">
            {data.regime.playbook.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="font-mono text-xs text-subtle tabular">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Separator className="my-4" />
          <p className="mb-2 text-xs tracking-wide text-muted uppercase">Drivers</p>
          <ul className="grid grid-cols-2 gap-2">
            {data.regime.drivers.map((d) => (
              <li key={d.key} className="rounded-md bg-surface-2 px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted">{d.label}</span>
                  <span
                    className={cn(
                      "font-mono text-xs tabular",
                      d.polarity === "pos"
                        ? "text-bull"
                        : d.polarity === "neg"
                          ? "text-bear"
                          : "text-fg",
                    )}
                  >
                    {d.value}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SparkCard
          title="Breadth % SMA50"
          data={chartData}
          dataKey="Breadth"
          format={(v) => fmtPctPlain(v)}
        />
        <SparkCard
          title="Vol percentile"
          data={chartData}
          dataKey="Vol"
          format={(v) => fmtPctPlain(v)}
        />
        <SparkCard
          title="Tương quan 20D"
          data={chartData}
          dataKey="Corr"
          format={(v) => fmtNum(v, 2)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Heatmap 7D</CardTitle>
          <CardDescription>
            Màu theo lợi nhuận 7 ngày. Nhấn để sắp bảng theo coin.
          </CardDescription>
        </CardHeader>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {data.coins.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setQ(c.ticker);
                setFilter("all");
              }}
              className="flex min-h-14 flex-col items-start justify-between rounded-md px-2 py-1.5 text-left transition-opacity hover:opacity-90"
              style={{ background: heatColor(c.chg7d) }}
            >
              <span className="text-xs font-medium text-fg">{c.ticker}</span>
              <span className={cn("font-mono text-xs tabular", pnlClass(c.chg7d))}>
                {fmtPct(c.chg7d, 1)}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-medium">Rổ coin</h3>
            <p className="text-xs text-muted">
              {coins.length} mã · sort {String(sort.key)} {sort.dir}
            </p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm ticker"
                className="pl-9 md:w-56"
                aria-label="Tìm ticker"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={filter === f.id ? "default" : "secondary"}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-t border-border">
                {(
                  [
                    ["ticker", "Coin"],
                    ["price", "Giá"],
                    ["chg1d", "1D"],
                    ["chg7d", "7D"],
                    ["chg30d", "30D"],
                    ["vsBtc7d", "vs BTC"],
                    ["rsi14", "RSI"],
                    ["sma50Dist", "Δ SMA50"],
                    ["vol20d", "Vol"],
                    ["beta60", "Beta"],
                    ["trend", "Trend"],
                    ["funding", "Fund"],
                  ] as Array<[keyof CoinRow, string]>
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      className="min-h-11 text-left"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coins.map((c) => (
                <tr key={c.id} className="border-t border-border/80">
                  <td className="sticky left-0 bg-surface px-3 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-medium">{c.ticker}</span>
                      <span className="text-xs text-subtle">{GROUP_LABEL[c.group]}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs tabular">{fmtPrice(c.price)}</td>
                  <PctCell v={c.chg1d} />
                  <PctCell v={c.chg7d} />
                  <PctCell v={c.chg30d} />
                  <PctCell v={c.vsBtc7d} />
                  <td className="px-3 py-2.5 font-mono text-xs tabular">{fmtNum(c.rsi14, 0)}</td>
                  <PctCell v={c.sma50Dist} />
                  <td className="px-3 py-2.5 font-mono text-xs tabular">{fmtVol(c.vol20d)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs tabular">{fmtNum(c.beta60, 2)}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      tone={c.trend === "up" ? "bull" : c.trend === "down" ? "bear" : "default"}
                    >
                      {TREND_LABEL[c.trend]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs tabular">
                    {c.funding == null
                      ? "—"
                      : `${(c.funding * 100).toFixed(3)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.missing.length > 0 ? (
          <p className="px-4 py-3 text-xs text-subtle">
            Không có data: {data.missing.join(", ")}
          </p>
        ) : null}
      </Card>
    </main>
  );
}

function PctCell({ v }: { v: number }) {
  const up = v > 0.0015;
  const down = v < -0.0015;
  return (
    <td className={cn("px-3 py-2.5 font-mono text-xs tabular", pnlClass(v))}>
      <span className="inline-flex items-center gap-0.5">
        {up ? <ArrowUpRight className="size-3" /> : down ? <ArrowDownRight className="size-3" /> : null}
        {fmtPct(v)}
      </span>
    </td>
  );
}

function SparkCard({
  title,
  data,
  dataKey,
  format,
}: {
  title: string;
  data: Array<Record<string, number>>;
  dataKey: string;
  format: (v: number) => string;
}) {
  const last = data.at(-1)?.[dataKey] ?? 0;
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="font-mono text-sm tabular">{format(last)}</span>
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const query = useQuery({
    queryKey: ["market-snapshot"],
    queryFn: () => getMarketSnapshot(),
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <DashboardSkeleton />;

  if (query.isError || !query.data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-start justify-center gap-4 px-6">
        <Activity className="size-8 text-bear" />
        <h1 className="text-2xl font-medium">Không tải được regime</h1>
        <p className="text-sm text-muted">
          {query.error instanceof Error
            ? query.error.message
            : "Nguồn giá tạm thời không phản hồi."}
        </p>
        <Button onClick={() => query.refetch()}>
          <RefreshCw className="size-4" />
          Thử lại
        </Button>
      </main>
    );
  }

  return (
    <div className="relative">
      <Loaded data={query.data} />
      <Button
        size="icon"
        variant="secondary"
        className="fixed right-4 bottom-4 z-20 shadow-border"
        onClick={() => query.refetch()}
        aria-label="Làm mới"
      >
        <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} />
      </Button>
    </div>
  );
}
