import type {
  MarketKpis,
  MarketScores,
  RegimeDriver,
  RegimeId,
  RegimeInfo,
} from "./types";
import { clamp, finite, tanh } from "./math";

type Classified = {
  id: RegimeId;
  confidence: number;
};

function band(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp((value - lo) / (hi - lo), 0, 1);
}

export function buildScores(kpis: MarketKpis): MarketScores {
  const trend = clamp(
    0.28 * tanh((kpis.pctAboveSma20 - 0.5) * 2.4) +
      0.22 * tanh((kpis.pctAboveSma50 - 0.5) * 2.2) +
      0.12 * tanh((kpis.pctAboveSma100 - 0.5) * 2) +
      0.2 * tanh(kpis.ew20 / 0.12) +
      0.1 * (2 * kpis.pctUptrend - 1) +
      0.08 * tanh(kpis.ew7d / 0.06),
    -1,
    1,
  );

  const crowding = clamp(
    0.55 * tanh((kpis.avgFunding ?? 0) / 0.00025) +
      0.25 * tanh((kpis.pctRsiHot - kpis.pctRsiCold) * 2) +
      0.2 * tanh(kpis.ew7d / 0.08),
    -1,
    1,
  );

  return {
    trend: finite(trend),
    vol: clamp(kpis.volPercentile, 0, 1),
    breadth: clamp(kpis.pctAboveSma50, 0, 1),
    corr: clamp(kpis.avgCorr20, 0, 1),
    crowding: finite(crowding),
  };
}

function classify(scores: MarketScores, kpis: MarketKpis): Classified {
  const { trend, vol, breadth, corr, crowding } = scores;
  const dd = kpis.drawdown60;
  const adx = kpis.adx;
  const highLow =
    kpis.new20Highs + kpis.new20Lows === 0
      ? 0
      : (kpis.new20Highs - kpis.new20Lows) /
        Math.max(1, kpis.new20Highs + kpis.new20Lows);

  const crisisScore =
    0.35 * band(vol, 0.7, 0.95) +
    0.25 * band(-trend, 0.15, 0.7) +
    0.2 * band(corr, 0.48, 0.75) +
    0.2 * band(-dd, 0.08, 0.22);

  const expansionScore =
    0.34 * band(trend, 0.2, 0.75) +
    0.22 * band(breadth, 0.52, 0.82) +
    0.18 * (1 - band(vol, 0.45, 0.8)) +
    0.14 * band(highLow, 0, 0.7) +
    0.12 * band(adx, 16, 32);

  const euphoriaScore =
    0.3 * band(trend, 0.18, 0.7) +
    0.28 * band(vol, 0.52, 0.88) +
    0.22 * band(crowding, 0.15, 0.75) +
    0.2 * band(kpis.pctRsiHot, 0.18, 0.45);

  const compressionScore =
    0.32 * (1 - Math.abs(trend)) +
    0.28 * (1 - band(vol, 0.28, 0.55)) +
    0.2 * band(20 - adx, 0, 10) +
    0.2 * (1 - band(Math.abs(highLow), 0.25, 0.8));

  const riskOffScore =
    0.4 * band(-trend, 0.2, 0.75) +
    0.22 * band(1 - breadth, 0.45, 0.85) +
    0.2 * band(-highLow, 0, 0.7) +
    0.18 * band(adx, 16, 34);

  const distributionScore =
    0.28 * band(trend, -0.05, 0.35) +
    0.26 * band(0.55 - breadth, 0, 0.3) +
    0.22 * band(-dd, -0.02, 0.08) +
    0.12 * band(kpis.pctAboveSma100 - kpis.pctAboveSma20, 0, 0.25) +
    0.12 * band(vol, 0.35, 0.7);

  const ranked: Array<[RegimeId, number]> = [
    ["crisis", crisisScore],
    ["expansion", expansionScore],
    ["euphoria", euphoriaScore],
    ["compression", compressionScore],
    ["risk_off", riskOffScore],
    ["distribution", distributionScore],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  const [bestId, best] = ranked[0]!;
  const second = ranked[1]?.[1] ?? 0;

  if (best < 0.46) {
    return {
      id: "transition",
      confidence: clamp(0.35 + (0.46 - best), 0.35, 0.62),
    };
  }

  if (crisisScore >= 0.62 && vol > 0.78 && trend < -0.12) {
    return {
      id: "crisis",
      confidence: clamp(0.55 + crisisScore * 0.4, 0.55, 0.94),
    };
  }

  return {
    id: bestId,
    confidence: clamp(
      0.48 + (best - second) * 0.9 + (best - 0.46) * 0.4,
      0.48,
      0.93,
    ),
  };
}

const COPY: Record<
  RegimeId,
  { label: string; labelVi: string; thesis: string; playbook: string[] }
> = {
  expansion: {
    label: "Expansion",
    labelVi: "Tăng đồng thuận",
    thesis:
      "Xu hướng tăng có bề rộng, biến động chưa nóng. Beta dương và dip của coin trên SMA50 thường được mua.",
    playbook: [
      "Ưu tiên trend-follow chiều tăng, thêm khi pullback về SMA20/50 còn giữ.",
      "Alts beta cao thường outperform BTC trong pha này.",
      "Tránh short mean-reversion; fade breakout dễ bị cuốn.",
      "Giữ kỷ luật trailing — expansion có thể chuyển Euphoria khi vol và funding dâng.",
    ],
  },
  euphoria: {
    label: "Euphoria",
    labelVi: "Tăng nóng",
    thesis:
      "Giá tăng kèm vol cao, RSI nóng và funding dương. Đám đông đã vào — phần thưởng lệch về quản trị rủi ro.",
    playbook: [
      "Không đuổi breakout FOMO; chỉ pyramiding vị thế đã có lãi.",
      "Giảm leverage, siết size — liquidation cascade dễ xuất hiện.",
      "Canh divergence breadth (ít coin làm đỉnh mới) như tín hiệu phân phối.",
      "Hedge bằng short beta cao hoặc giảm alt exposure về BTC.",
    ],
  },
  compression: {
    label: "Compression",
    labelVi: "Tích lũy",
    thesis:
      "Vol thấp, ADX yếu, tín hiệu lẫn. Thị trường đang nén năng lượng — breakout sau compression thường bền.",
    playbook: [
      "Mean-reversion intra-range; fade cực RSI, không phá cấu trúc.",
      "Size nhỏ, chờ ADX thoát vùng dưới 18 và vol percentile rời đáy.",
      "Breakout kèm breadth (phần trăm trên SMA20 nhảy) mới được follow.",
      "Tránh overtrade; edge nằm ở kiên nhẫn, không phải tần suất.",
    ],
  },
  distribution: {
    label: "Distribution",
    labelVi: "Phân phối",
    thesis:
      "Giá còn cao nhưng bề rộng yếu đi. Ít coin dẫn dắt — thị trường hẹp, rủi ro đảo chiều tăng.",
    playbook: [
      "Không mua đuổi alt yếu dưới SMA20 trong khi BTC đứng.",
      "Ưu tiên coin còn breadth; cắt những mã mất SMA50.",
      "Tăng tỷ trọng BTC/cash, giảm beta rổ.",
      "Chờ xác nhận: vol tăng kèm corr tăng thường mở risk-off.",
    ],
  },
  transition: {
    label: "Transition",
    labelVi: "Chuyển pha",
    thesis:
      "Các trục trend, vol, breadth, corr chưa cùng hướng. Regime chưa ổn định — ưu tiên quan sát.",
    playbook: [
      "Giảm size, tránh thesis lớn cho đến khi 3/4 trục đồng thuận.",
      "Trade tactical thay vì position theo tuần.",
      "Theo dõi breadth 5 phiên và vol percentile làm bộ lọc.",
      "Không biến nhiễu thành tín hiệu: chờ ADX và Hurst rõ hơn.",
    ],
  },
  risk_off: {
    label: "Risk-off",
    labelVi: "Giảm đồng thuận",
    thesis:
      "Xu hướng giảm lan rộng. Alt thường underperform BTC. Trend-follow chiều xuống có edge hơn bắt đáy.",
    playbook: [
      "Ưu tiên short/hedge theo SMA20/50; bounce là giảm vị thế long.",
      "Cắt alt beta cao trước — meme và gaming thường dẫn sóng xuống.",
      "Cash/BTC defensive; không bắt dao khi breadth dưới 30%.",
      "Đảo chiều chỉ khi vol percentile hạ và phần trăm trên SMA20 phục hồi bền.",
    ],
  },
  crisis: {
    label: "Crisis",
    labelVi: "Khủng hoảng",
    thesis:
      "Vol cực đoan, tương quan nhảy, drawdown sâu. Đa dạng hóa mất tác dụng — đây là regime giải chấp.",
    playbook: [
      "Hạ leverage về gần 0. Ưu tiên sống sót, không phải bắt đáy.",
      "Correlation spike: hedge 1–2 chân (BTC/ETH) thay vì rổ rộng.",
      "Mean-reversion sớm rất đắt; chờ vol-of-vol hạ.",
      "Tái vào lệnh chỉ khi corr và vol percentile cùng hạ, breadth tạo đáy.",
    ],
  },
};

function driver(
  key: string,
  label: string,
  value: string,
  hint: string,
  polarity: RegimeDriver["polarity"],
): RegimeDriver {
  return { key, label, value, hint, polarity };
}

function pct(n: number, d = 0): string {
  return `${(n * 100).toFixed(d)}%`;
}

function signedPct(n: number, d = 1): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(d)}%`;
}

export function describeRegime(
  scores: MarketScores,
  kpis: MarketKpis,
): RegimeInfo {
  const { id, confidence } = classify(scores, kpis);
  const copy = COPY[id];
  const drivers: RegimeDriver[] = [
    driver(
      "trend",
      "Trend",
      scores.trend.toFixed(2),
      "Tổng hợp phần trăm trên SMA, momentum rổ và tỷ lệ uptrend.",
      scores.trend > 0.15 ? "pos" : scores.trend < -0.15 ? "neg" : "neu",
    ),
    driver(
      "vol",
      "Vol percentile",
      pct(scores.vol),
      "Vol 20D của rổ so với 90 phiên gần nhất.",
      scores.vol > 0.7 ? "neg" : scores.vol < 0.35 ? "pos" : "neu",
    ),
    driver(
      "breadth",
      "Breadth SMA50",
      pct(kpis.pctAboveSma50),
      "Tỷ lệ coin đóng cửa trên SMA50 — đo sự đồng thuận.",
      kpis.pctAboveSma50 > 0.55 ? "pos" : kpis.pctAboveSma50 < 0.4 ? "neg" : "neu",
    ),
    driver(
      "corr",
      "Tương quan",
      kpis.avgCorr20.toFixed(2),
      "Hệ số tương quan cặp trung bình 20D. Cao = risk-on/off chung.",
      kpis.avgCorr20 > 0.55 ? "neg" : kpis.avgCorr20 < 0.32 ? "pos" : "neu",
    ),
    driver(
      "hurst",
      "Hurst",
      kpis.hurst.toFixed(2),
      "Trên 0.55 xu hướng bền, dưới 0.45 mean-revert.",
      kpis.hurst > 0.55 ? "pos" : "neu",
    ),
    driver(
      "adx",
      "ADX rổ",
      kpis.adx.toFixed(0),
      "Dưới 18 range, trên 25 trend rõ.",
      kpis.adx > 25 ? "pos" : "neu",
    ),
    driver(
      "dd",
      "Drawdown 60D",
      signedPct(kpis.drawdown60),
      "Độ sâu dưới đỉnh 60 phiên của chỉ số equal-weight.",
      kpis.drawdown60 < -0.12 ? "neg" : kpis.drawdown60 > -0.04 ? "pos" : "neu",
    ),
    driver(
      "fund",
      "Funding TB",
      kpis.avgFunding == null
        ? "—"
        : `${kpis.avgFunding >= 0 ? "+" : ""}${(kpis.avgFunding * 100).toFixed(3)}%`,
      "Funding perp 8h trung bình — proxy cho crowding.",
      Math.abs(kpis.avgFunding ?? 0) > 0.0003 ? "neg" : "neu",
    ),
  ];

  return {
    id,
    label: copy.label,
    labelVi: copy.labelVi,
    thesis: copy.thesis,
    playbook: copy.playbook,
    confidence,
    drivers,
  };
}
