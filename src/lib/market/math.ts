import type { Candle } from "./types";

export function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: number[], ddof = 1): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let v = 0;
  for (const x of xs) v += (x - m) * (x - m);
  return Math.sqrt(v / Math.max(1, xs.length - ddof));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function tanh(x: number): number {
  if (x > 8) return 1;
  if (x < -8) return -1;
  const e = Math.exp(2 * x);
  return (e - 1) / (e + 1);
}

export function logReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1]!;
    const b = closes[i]!;
    r.push(a > 0 && b > 0 ? Math.log(b / a) : 0);
  }
  return r;
}

export function simpleReturn(closes: number[], bars: number): number {
  if (closes.length <= bars) return 0;
  const prev = closes[closes.length - 1 - bars]!;
  const last = closes[closes.length - 1]!;
  if (prev <= 0) return 0;
  return last / prev - 1;
}

export function smaAt(values: number[], n: number): number | null {
  if (values.length < n || n <= 0) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i]!;
  return s / n;
}

export function smaSeries(values: number[], n: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (n <= 0) return out;
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i]!;
    if (i >= n) s -= values[i - n]!;
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function realizedVolAnn(logRets: number[], n = 20): number {
  const slice = logRets.slice(-n);
  if (slice.length < 5) return 0;
  return stdev(slice) * Math.sqrt(365);
}

export function rollingVolSeries(logRets: number[], n = 20): number[] {
  const out: number[] = [];
  for (let i = n; i <= logRets.length; i++) {
    out.push(stdev(logRets.slice(i - n, i)) * Math.sqrt(365));
  }
  return out;
}

export function parkinsonAnn(candles: Candle[], n = 20): number {
  const slice = candles.slice(-n);
  if (!slice.length) return 0;
  const factor = 1 / (4 * Math.log(2));
  let s = 0;
  let count = 0;
  for (const c of slice) {
    if (c.h > 0 && c.l > 0) {
      const x = Math.log(c.h / c.l);
      s += x * x;
      count += 1;
    }
  }
  if (!count) return 0;
  return Math.sqrt((factor * s) / count) * Math.sqrt(365);
}

export function percentileRank(sample: number[], value: number): number {
  if (!sample.length) return 0.5;
  let count = 0;
  for (const x of sample) if (x <= value) count += 1;
  return count / sample.length;
}

export function rsiWilder(closes: number[], n = 14): number {
  if (closes.length < n + 1) return 50;
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i]! - closes[i - 1]!);
  }
  let avgG = 0;
  let avgL = 0;
  for (let i = 0; i < n; i++) {
    const d = changes[i]!;
    if (d >= 0) avgG += d;
    else avgL -= d;
  }
  avgG /= n;
  avgL /= n;
  for (let i = n; i < changes.length; i++) {
    const d = changes[i]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (n - 1) + g) / n;
    avgL = (avgL * (n - 1) + l) / n;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

export function betaVs(asset: number[], market: number[]): number {
  const n = Math.min(asset.length, market.length);
  if (n < 12) return 1;
  const a = asset.slice(-n);
  const m = market.slice(-n);
  const ma = mean(a);
  const mm = mean(m);
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i]! - ma) * (m[i]! - mm);
    varM += (m[i]! - mm) * (m[i]! - mm);
  }
  return varM < 1e-14 ? 1 : cov / varM;
}

export function calcAdx(
  candles: Candle[],
  n = 14,
): { adx: number; plusDi: number; minusDi: number } {
  if (candles.length < n + 2) return { adx: 0, plusDi: 0, minusDi: 0 };
  const tr: number[] = [];
  const pdm: number[] = [];
  const mdm: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    const highDiff = cur.h - prev.h;
    const lowDiff = prev.l - cur.l;
    tr.push(
      Math.max(
        cur.h - cur.l,
        Math.abs(cur.h - prev.c),
        Math.abs(cur.l - prev.c),
      ),
    );
    pdm.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    mdm.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
  }
  const smooth = (arr: number[]): number[] => {
    const out: number[] = [];
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      if (i < n) {
        s += arr[i]!;
        if (i === n - 1) out.push(s);
      } else {
        s = s - s / n + arr[i]!;
        out.push(s);
      }
    }
    return out;
  };
  const str = smooth(tr);
  const sp = smooth(pdm);
  const sm = smooth(mdm);
  const dx: number[] = [];
  const plus: number[] = [];
  const minus: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const pdi = str[i] === 0 ? 0 : (100 * sp[i]!) / str[i]!;
    const mdi = str[i] === 0 ? 0 : (100 * sm[i]!) / str[i]!;
    plus.push(pdi);
    minus.push(mdi);
    const den = pdi + mdi;
    dx.push(den === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / den);
  }
  if (dx.length < n) {
    return {
      adx: 0,
      plusDi: plus.at(-1) ?? 0,
      minusDi: minus.at(-1) ?? 0,
    };
  }
  let adx = dx.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < dx.length; i++) {
    adx = (adx * (n - 1) + dx[i]!) / n;
  }
  return {
    adx: finite(adx),
    plusDi: finite(plus.at(-1) ?? 0),
    minusDi: finite(minus.at(-1) ?? 0),
  };
}

function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) * (xs[i]! - mx);
  }
  return den === 0 ? 0 : num / den;
}

/** Hurst exponent via rescaled range. >0.55 persistent, <0.45 mean-reverting. */
export function hurstExponent(returns: number[]): number {
  const n = returns.length;
  if (n < 32) return 0.5;
  const sizes = [8, 16, 32, 64].filter((s) => s * 2 <= n);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const size of sizes) {
    const rsVals: number[] = [];
    for (let start = 0; start + size <= n; start += size) {
      const slice = returns.slice(start, start + size);
      const m = mean(slice);
      let cum = 0;
      let minC = 0;
      let maxC = 0;
      let varS = 0;
      for (const v of slice) {
        const adj = v - m;
        cum += adj;
        varS += adj * adj;
        if (cum < minC) minC = cum;
        if (cum > maxC) maxC = cum;
      }
      const R = maxC - minC;
      const S = Math.sqrt(varS / size);
      if (S > 1e-12) rsVals.push(R / S);
    }
    if (rsVals.length) {
      xs.push(Math.log(size));
      ys.push(Math.log(mean(rsVals)));
    }
  }
  if (xs.length < 2) return 0.5;
  return clamp(slope(xs, ys), 0, 1);
}

export function meanPairwiseCorr(
  matrix: number[][],
  start: number,
  len: number,
): number {
  const n = matrix.length;
  if (n < 2 || len < 5) return 0;
  const means = new Array<number>(n).fill(0);
  const stds = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const row = matrix[i]!;
    let s = 0;
    for (let t = start; t < start + len; t++) s += row[t] ?? 0;
    means[i] = s / len;
    let v = 0;
    for (let t = start; t < start + len; t++) {
      const d = (row[t] ?? 0) - means[i]!;
      v += d * d;
    }
    stds[i] = Math.sqrt(v);
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (stds[i]! < 1e-12) continue;
    const ri = matrix[i]!;
    for (let j = i + 1; j < n; j++) {
      if (stds[j]! < 1e-12) continue;
      const rj = matrix[j]!;
      let cov = 0;
      for (let t = start; t < start + len; t++) {
        cov += ((ri[t] ?? 0) - means[i]!) * ((rj[t] ?? 0) - means[j]!);
      }
      sum += cov / (stds[i]! * stds[j]!);
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

export function maxDrawdown(closes: number[], lookback: number): number {
  const slice = closes.slice(-lookback);
  if (slice.length < 2) return 0;
  let peak = slice[0]!;
  let dd = 0;
  for (const x of slice) {
    if (x > peak) peak = x;
    if (peak > 0) dd = Math.min(dd, x / peak - 1);
  }
  return dd;
}

export function alignCloses(
  series: Array<{ t: number; c: number }[]>,
): { t: number[]; closes: number[][] } {
  if (!series.length) return { t: [], closes: [] };
  const maps = series.map((s) => {
    const m = new Map<number, number>();
    for (const bar of s) m.set(bar.t, bar.c);
    return m;
  });
  const counts = new Map<number, number>();
  for (const m of maps) {
    for (const t of m.keys()) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const need = Math.max(1, Math.floor(series.length * 0.7));
  const t = [...counts.entries()]
    .filter(([, n]) => n >= need)
    .map(([ts]) => ts)
    .sort((a, b) => a - b);
  const closes = maps.map((m) => {
    const row: number[] = [];
    let last = Number.NaN;
    for (const ts of t) {
      const v = m.get(ts);
      if (v != null) {
        last = v;
        row.push(v);
      } else {
        row.push(last);
      }
    }
    return row;
  });
  const liveCloses = closes.filter((row) => row.some(Number.isFinite));
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    let finiteCount = 0;
    for (const row of liveCloses) {
      if (Number.isFinite(row[i])) finiteCount += 1;
    }
    if (finiteCount >= Math.max(2, Math.ceil(liveCloses.length * 0.5))) {
      start = i;
      break;
    }
    start = i + 1;
  }
  return {
    t: t.slice(start),
    closes: liveCloses.map((row) => {
      const sliced = row.slice(start);
      let last = sliced.find((v) => Number.isFinite(v)) ?? 0;
      return sliced.map((v) => {
        if (Number.isFinite(v)) {
          last = v;
          return v;
        }
        return last;
      });
    }),
  };
}
