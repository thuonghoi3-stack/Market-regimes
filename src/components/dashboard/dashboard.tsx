import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getMarketSnapshot } from "@/lib/market/api";
import { fmtNum, fmtPct, fmtTimeIct, fmtVol, pnlClass } from "@/lib/market/format";
import { GROUP_LABEL } from "@/lib/market/universe";
import type { MarketSnapshot } from "@/lib/market/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-lg bg-surface-2 px-3 py-2.5"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-mono text-base tabular text-fg">{value}</p>{note ? <p className="mt-1 text-xs text-subtle">{note}</p> : null}</div>;
}

function State({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-border/70 py-2 text-sm"><span className="text-muted">{label}</span><Badge tone={value === "bull" || value === "broad" || value === "persistent" || value === "none" || value === "clean" ? "bull" : value === "bear" || value === "high" || value === "extreme" || value === "avoid" ? "bear" : "default"}>{value}</Badge></div>;
}

function DashboardBody({ data }: { data: MarketSnapshot }) {
  const chart = useMemo(() => data.series.t.map((t, i) => ({ t, Basket: data.series.basket[i], BTC: data.series.btc[i], Breadth: data.series.breadth[i] })), [data]);
  const leaders = data.coins.filter((c) => ["market_leader", "emerging_leader", "positive_divergence"].includes(c.cohort));
  const divergences = data.coins.filter((c) => ["positive_divergence", "negative_divergence", "sector_outlier"].includes(c.cohort));
  const a = data.axes; const c = data.consensus; const k = data.kpis;
  return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 px-4 py-6 pb-16 md:px-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono text-xs tracking-widest text-accent uppercase">Market observability · V2 prototype</p><h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">REGIME 4H / EXECUTION 5M</h1><p className="mt-2 text-sm text-muted">Venue-consistent Binance USD-M linear perpetual data. States are descriptive, not trade instructions.</p></div>
      <div className="text-right text-xs text-muted"><p>4H closed: {fmtTimeIct(data.barCloseAt)} ICT</p><p>{data.listed}/{data.universe} eligible · {data.modelVersion}</p></div>
    </header>

    <section className="rounded-xl border border-border bg-surface p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs tracking-widest text-accent uppercase">Confirmed market state</p><h2 className="mt-2 text-2xl font-medium md:text-3xl">{a.direction.toUpperCase()} / {a.trendQuality.toUpperCase()} / {a.breadth.toUpperCase()}</h2><p className="mt-2 text-sm text-muted">A broad direction requires multi-pair and multi-sector agreement; otherwise it is downgraded or remains neutral.</p></div><div className="min-w-48"><State label="Stress" value={a.stress}/><State label="Volatility" value={a.volatility}/><State label="Correlation" value={a.correlation}/></div></div>
      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Consensus strength" value={fmtPct(c.consensusStrength)} note={`${c.eligible} pairs / ${c.sectorsAligned}/${c.sectorsEligible} sectors`}/><Metric label="Directional breadth" value={fmtPct(c.directionalBreadth)}/><Metric label="MA breadth" value={fmtPct(c.maBreadth)}/><Metric label="Trend breadth" value={fmtPct(c.trendBreadth)}/></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-3"><Card className="p-4 lg:col-span-2"><CardHeader className="px-0"><CardTitle>4H basket vs BTC</CardTitle><CardDescription>Closed-bar history. Basket is equal-weight; breadth is calculated across the eligible universe.</CardDescription></CardHeader><div className="h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart}><CartesianGrid stroke="var(--color-border)" vertical={false}/><XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} tick={{ fill: "var(--color-subtle)", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: "var(--color-subtle)", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="Basket" stroke="var(--color-accent)" fill="color-mix(in oklab, var(--color-accent) 18%, transparent)"/><Line type="monotone" dataKey="BTC" stroke="var(--color-fg)" dot={false}/></ComposedChart></ResponsiveContainer></div></Card>
      <Card><CardHeader><CardTitle>4H risk context</CardTitle><CardDescription>Independent axes, not a probability score.</CardDescription></CardHeader><div className="grid gap-2"><Metric label="Basket 20 bars" value={fmtPct(k.basketReturn20)}/><Metric label="Alt vs BTC 20 bars" value={fmtPct(k.altVsBtc20)}/><Metric label="Realized vol" value={fmtVol(k.realizedVol20)}/><Metric label="Vol percentile" value={fmtPct(k.volPercentile)}/><Metric label="Average correlation" value={fmtNum(k.avgCorr20, 2)}/><Metric label="Drawdown 60 bars" value={fmtPct(k.drawdown60)}/></div></Card></section>

    <section className="grid gap-4 lg:grid-cols-2"><Watchlist title="Leaders & resilience" subtitle="Strong versus the equal-weight market with trend confirmation. Research attention, not a forecast." rows={leaders}/><Watchlist title="Divergence watch" subtitle="Pairs moving against the confirmed broad market or sector. Inspect persistence and liquidity." rows={divergences}/></section>

    <Card className="overflow-hidden"><CardHeader><CardTitle>Execution regime · 5M</CardTitle><CardDescription>Per-instrument local conditions. This board does not issue an entry or position-sizing command.</CardDescription></CardHeader><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-border text-xs text-muted"><tr><th className="px-4 py-2">Pair</th><th>Structure</th><th>Location</th><th>Vol</th><th>Quality</th><th>RVOL</th><th>VWAP distance</th><th className="pr-4">Evidence</th></tr></thead><tbody>{data.execution.map((x) => <tr key={x.id} className="border-b border-border/70"><td className="px-4 py-3 font-medium">{x.ticker}</td><td>{x.localStructure}</td><td>{x.location}</td><td>{x.volatility}</td><td><Badge tone={x.quality === "clean" ? "bull" : x.quality === "avoid" ? "bear" : "default"}>{x.quality}</Badge></td><td className="font-mono">{x.relativeVolume.toFixed(1)}x</td><td className="font-mono">{x.vwapDistanceAtr.toFixed(1)} ATR</td><td className="pr-4 text-xs text-muted">{x.evidence.join(" · ")}</td></tr>)}</tbody></table></div></Card>
  </main>;
}

function Watchlist({ title, subtitle, rows }: { title: string; subtitle: string; rows: MarketSnapshot["coins"] }) {
  return <Card className="overflow-hidden"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{subtitle}</CardDescription></CardHeader><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-y border-border text-xs text-muted"><tr><th className="px-4 py-2">Pair</th><th>Group</th><th>20-bar</th><th>vs basket</th><th>Trend</th><th className="pr-4">Cohort</th></tr></thead><tbody>{rows.length ? rows.map((x) => <tr key={x.id} className="border-b border-border/70"><td className="px-4 py-3 font-medium">{x.ticker}</td><td className="text-muted">{GROUP_LABEL[x.group]}</td><td className={cn("font-mono", pnlClass(x.ret20))}>{fmtPct(x.ret20)}</td><td className={cn("font-mono", pnlClass(x.relative20))}>{fmtPct(x.relative20)}</td><td>{x.trend}</td><td className="pr-4"><Badge tone={x.cohort === "negative_divergence" ? "bear" : "bull"}>{x.cohort}</Badge></td></tr>) : <tr><td colSpan={6} className="px-4 py-5 text-muted">Không có outlier đạt điều kiện hiện tại.</td></tr>}</tbody></table></div></Card>;
}

export function Dashboard() {
  const query = useQuery({ queryKey: ["market-regime-v2"], queryFn: () => getMarketSnapshot(), refetchInterval: 60_000 });
  if (query.isLoading) return <main className="grid min-h-screen place-items-center text-muted">Đang tính 4H market / 5M execution regime…</main>;
  if (query.isError || !query.data) return <main className="mx-auto flex min-h-screen max-w-lg flex-col items-start justify-center gap-4 px-6"><Activity className="size-8 text-bear"/><h1 className="text-2xl font-medium">Không tải được regime</h1><p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "Nguồn dữ liệu không phản hồi."}</p><Button onClick={() => query.refetch()}><RefreshCw className="size-4"/>Thử lại</Button></main>;
  return <div className="relative"><DashboardBody data={query.data}/><Button size="icon" variant="secondary" className="fixed right-4 bottom-4" onClick={() => query.refetch()} aria-label="Làm mới"><RefreshCw className={cn("size-4", query.isFetching && "animate-spin")}/></Button></div>;
}
