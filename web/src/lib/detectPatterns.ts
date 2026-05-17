import type { ChartCandle } from '@/components/charts/CandlestickChart';

/* ── 단봉 캔들 패턴 ── */
export interface CandlePattern {
  time: string;
  type: string;
  nameKo: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  candleIndex: number;
  description: string;
}

export function detectCandlePatterns(candles: ChartCandle[]): CandlePattern[] {
  const results: CandlePattern[] = [];
  const n = candles.length;

  for (let i = 2; i < n; i++) {
    const c  = candles[i];
    const p  = candles[i - 1];
    const pp = candles[i - 2];

    const body        = Math.abs(c.close - c.open);
    const range       = c.high - c.low;
    if (range < 0.001) continue;

    const upperShadow = c.high - Math.max(c.open, c.close);
    const lowerShadow = Math.min(c.open, c.close) - c.low;
    const isBull = c.close >= c.open;
    const isBear = c.close < c.open;

    // 도지: 몸통이 전체 범위의 10% 미만
    if (body / range < 0.10) {
      results.push({
        time: c.time, type: 'doji', nameKo: '도지',
        signal: 'neutral', candleIndex: i,
        description: '시가≈종가 — 매수·매도 균형. 다음 캔들 방향이 핵심 확인 신호.',
      });
      continue;
    }

    // 망치형: 아래 꼬리 > 2×몸통, 위 꼬리 < 몸통, 양봉
    if (lowerShadow > body * 2 && upperShadow < body && isBull) {
      results.push({
        time: c.time, type: 'hammer', nameKo: '망치형',
        signal: 'bullish', candleIndex: i,
        description: '하락 후 강한 매수세 유입 — 하단 지지 확인, 상승 반전 가능성.',
      });
      continue;
    }

    // 슈팅스타: 위 꼬리 > 2×몸통, 아래 꼬리 < 몸통×0.5, 음봉
    if (upperShadow > body * 2 && lowerShadow < body * 0.5 && isBear) {
      results.push({
        time: c.time, type: 'shooting_star', nameKo: '슈팅스타',
        signal: 'bearish', candleIndex: i,
        description: '상승 후 매도세 우위 — 상단 저항 확인, 하락 반전 신호.',
      });
      continue;
    }

    // 역망치형: 위 꼬리 > 2×몸통, 아래 꼬리 작음, 양봉
    if (upperShadow > body * 2 && lowerShadow < body * 0.5 && isBull) {
      results.push({
        time: c.time, type: 'inv_hammer', nameKo: '역망치형',
        signal: 'bullish', candleIndex: i,
        description: '하락 후 상단 시도 — 다음 캔들 확인 후 반전 여부 판단.',
      });
      continue;
    }

    // 상승장악형: 전봉 음봉, 현봉 양봉이 전봉 몸통을 완전히 포함
    if (p.close < p.open && isBull && c.open <= p.close && c.close >= p.open) {
      results.push({
        time: c.time, type: 'bullish_engulf', nameKo: '상승장악형',
        signal: 'bullish', candleIndex: i,
        description: '전일 하락 봉을 완전히 감싸는 상승 봉 — 강한 매수세 유입.',
      });
      continue;
    }

    // 하락장악형: 전봉 양봉, 현봉 음봉이 전봉 몸통을 완전히 포함
    if (p.close > p.open && isBear && c.open >= p.close && c.close <= p.open) {
      results.push({
        time: c.time, type: 'bearish_engulf', nameKo: '하락장악형',
        signal: 'bearish', candleIndex: i,
        description: '전일 상승 봉을 완전히 감싸는 하락 봉 — 강한 매도세 유입.',
      });
      continue;
    }

    // 샛별형 (3봉 상승 반전): 음봉 → 소형봉 → 양봉(전봉 중간 이상)
    const ppBody = Math.abs(pp.close - pp.open);
    const pBody  = Math.abs(p.close  - p.open);
    if (
      pp.close < pp.open &&
      pBody < ppBody * 0.35 &&
      isBull && c.close > (pp.open + pp.close) / 2
    ) {
      results.push({
        time: c.time, type: 'morning_star', nameKo: '샛별형',
        signal: 'bullish', candleIndex: i,
        description: '3봉 하락 반전 — 음봉→소형봉→강한 양봉. 바닥 전환 신호.',
      });
      continue;
    }

    // 석별형 (3봉 하락 반전): 양봉 → 소형봉 → 음봉(전봉 중간 이하)
    if (
      pp.close > pp.open &&
      pBody < ppBody * 0.35 &&
      isBear && c.close < (pp.open + pp.close) / 2
    ) {
      results.push({
        time: c.time, type: 'evening_star', nameKo: '석별형',
        signal: 'bearish', candleIndex: i,
        description: '3봉 상승 반전 — 양봉→소형봉→강한 음봉. 천장 전환 신호.',
      });
    }
  }

  // 최근 30봉 이내 패턴만 반환
  return results.filter(p => p.candleIndex >= n - 30);
}

export interface PatternPoint {
  time: string;
  price: number;
  candleIndex: number;
}

export interface DetectedPattern {
  type: string;
  nameKo: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;   // 0–1
  points: PatternPoint[]; // 패턴 구조선을 잇는 핵심 고저점
  necklinePrice?: number;
  necklineStart?: string;
  necklineEnd?: string;
  description: string;
  startIndex: number;
  endIndex: number;
}

/* ── 파라미터 ── */
const LB       = 4;     // 피벗 탐색 룩백
const PTOL     = 0.035; // 동일 레벨 허용 오차 (3.5%)
const MIN_GAP  = 8;     // 패턴 내 최소 캔들 간격

/* ── 피벗 탐색 ── */
function pivHigh(candles: ChartCandle[], lb = LB): PatternPoint[] {
  const out: PatternPoint[] = [];
  for (let i = lb; i < candles.length - lb; i++) {
    const h = candles[i].high;
    let ok = true;
    for (let j = i - lb; j <= i + lb && ok; j++) {
      if (j !== i && candles[j].high >= h) ok = false;
    }
    if (ok) out.push({ time: candles[i].time, price: h, candleIndex: i });
  }
  return out;
}

function pivLow(candles: ChartCandle[], lb = LB): PatternPoint[] {
  const out: PatternPoint[] = [];
  for (let i = lb; i < candles.length - lb; i++) {
    const l = candles[i].low;
    let ok = true;
    for (let j = i - lb; j <= i + lb && ok; j++) {
      if (j !== i && candles[j].low <= l) ok = false;
    }
    if (ok) out.push({ time: candles[i].time, price: l, candleIndex: i });
  }
  return out;
}

function near(a: number, b: number, tol = PTOL) {
  return Math.abs(a - b) / Math.max(a, b) < tol;
}

function fmt(p: number) { return p >= 1000 ? p.toFixed(0) : p.toFixed(2); }

/* ── 쌍바닥 (W) ── */
function dblBottom(lows: PatternPoint[], highs: PatternPoint[], candles: ChartCandle[]): DetectedPattern[] {
  const out: DetectedPattern[] = [];
  for (let i = 0; i < lows.length - 1; i++) {
    const l1 = lows[i], l2 = lows[i + 1];
    if (l2.candleIndex - l1.candleIndex < MIN_GAP) continue;
    if (!near(l1.price, l2.price, 0.04)) continue;
    const bh = highs.filter(h => h.candleIndex > l1.candleIndex && h.candleIndex < l2.candleIndex);
    if (!bh.length) continue;
    const neck = bh.reduce((a, b) => a.price > b.price ? a : b);
    const avg = (l1.price + l2.price) / 2;
    if ((neck.price - avg) / avg < 0.02) continue;
    const diff = Math.abs(l1.price - l2.price) / l1.price;
    const conf = Math.min(0.95, 0.58 + 0.27 * (1 - diff / 0.04) + 0.1 * Math.min(1, (neck.price - avg) / avg / 0.06));
    const endIdx = Math.min(l2.candleIndex + 10, candles.length - 1);
    out.push({
      type: 'double_bottom', nameKo: '쌍바닥 (W)', signal: 'bullish', confidence: conf,
      points: [l1, neck, l2],
      necklinePrice: neck.price, necklineStart: l1.time, necklineEnd: candles[endIdx].time,
      description: `쌍바닥 감지 — 저점 ${fmt(avg)} 부근 두 번 지지. 네크라인 ${fmt(neck.price)} 돌파 시 상승 전환 신호.`,
      startIndex: l1.candleIndex, endIndex: l2.candleIndex,
    });
  }
  return out;
}

/* ── 더블탑 (M) ── */
function dblTop(highs: PatternPoint[], lows: PatternPoint[], candles: ChartCandle[]): DetectedPattern[] {
  const out: DetectedPattern[] = [];
  for (let i = 0; i < highs.length - 1; i++) {
    const h1 = highs[i], h2 = highs[i + 1];
    if (h2.candleIndex - h1.candleIndex < MIN_GAP) continue;
    if (!near(h1.price, h2.price, 0.04)) continue;
    const bl = lows.filter(l => l.candleIndex > h1.candleIndex && l.candleIndex < h2.candleIndex);
    if (!bl.length) continue;
    const neck = bl.reduce((a, b) => a.price < b.price ? a : b);
    const avg = (h1.price + h2.price) / 2;
    if ((avg - neck.price) / avg < 0.02) continue;
    const diff = Math.abs(h1.price - h2.price) / h1.price;
    const conf = Math.min(0.95, 0.58 + 0.27 * (1 - diff / 0.04) + 0.1 * Math.min(1, (avg - neck.price) / avg / 0.06));
    const endIdx = Math.min(h2.candleIndex + 10, candles.length - 1);
    out.push({
      type: 'double_top', nameKo: '더블탑 (M)', signal: 'bearish', confidence: conf,
      points: [h1, neck, h2],
      necklinePrice: neck.price, necklineStart: h1.time, necklineEnd: candles[endIdx].time,
      description: `더블탑 감지 — 고점 ${fmt(avg)} 부근 두 번 저항. 네크라인 ${fmt(neck.price)} 이탈 시 하락 전환 신호.`,
      startIndex: h1.candleIndex, endIndex: h2.candleIndex,
    });
  }
  return out;
}

/* ── 헤드 앤 숄더 ── */
function hns(highs: PatternPoint[], lows: PatternPoint[], candles: ChartCandle[]): DetectedPattern[] {
  const out: DetectedPattern[] = [];
  for (let i = 0; i < highs.length - 2; i++) {
    const ls = highs[i], hd = highs[i + 1], rs = highs[i + 2];
    if (hd.price <= ls.price || hd.price <= rs.price) continue;
    if (!near(ls.price, rs.price, 0.06)) continue;
    if (hd.candleIndex - ls.candleIndex < 5 || rs.candleIndex - hd.candleIndex < 5) continue;
    const lt = lows.filter(l => l.candleIndex > ls.candleIndex && l.candleIndex < hd.candleIndex);
    const rt = lows.filter(l => l.candleIndex > hd.candleIndex && l.candleIndex < rs.candleIndex);
    if (!lt.length || !rt.length) continue;
    const ltr = lt.reduce((a, b) => a.price < b.price ? a : b);
    const rtr = rt.reduce((a, b) => a.price < b.price ? a : b);
    const neckP = (ltr.price + rtr.price) / 2;
    if ((hd.price - neckP) / neckP < 0.03) continue;
    const sym = 1 - Math.abs(ls.price - rs.price) / ls.price / 0.06;
    const conf = Math.min(0.92, 0.52 + 0.32 * Math.max(0, sym) + 0.08);
    const endIdx = Math.min(rs.candleIndex + 8, candles.length - 1);
    out.push({
      type: 'hns', nameKo: '헤드 앤 숄더', signal: 'bearish', confidence: conf,
      points: [ls, ltr, hd, rtr, rs],
      necklinePrice: neckP, necklineStart: ls.time, necklineEnd: candles[endIdx].time,
      description: `헤드앤숄더 감지 (신뢰도 ${(conf * 100).toFixed(0)}%) — 네크라인 ${fmt(neckP)} 이탈 시 강한 하락 전환.`,
      startIndex: ls.candleIndex, endIndex: rs.candleIndex,
    });
  }
  return out;
}

/* ── 역 헤드 앤 숄더 ── */
function invHns(lows: PatternPoint[], highs: PatternPoint[], candles: ChartCandle[]): DetectedPattern[] {
  const out: DetectedPattern[] = [];
  for (let i = 0; i < lows.length - 2; i++) {
    const ls = lows[i], hd = lows[i + 1], rs = lows[i + 2];
    if (hd.price >= ls.price || hd.price >= rs.price) continue;
    if (!near(ls.price, rs.price, 0.06)) continue;
    if (hd.candleIndex - ls.candleIndex < 5 || rs.candleIndex - hd.candleIndex < 5) continue;
    const lp = highs.filter(h => h.candleIndex > ls.candleIndex && h.candleIndex < hd.candleIndex);
    const rp = highs.filter(h => h.candleIndex > hd.candleIndex && h.candleIndex < rs.candleIndex);
    if (!lp.length || !rp.length) continue;
    const lpk = lp.reduce((a, b) => a.price > b.price ? a : b);
    const rpk = rp.reduce((a, b) => a.price > b.price ? a : b);
    const neckP = (lpk.price + rpk.price) / 2;
    if ((neckP - hd.price) / neckP < 0.03) continue;
    const sym = 1 - Math.abs(ls.price - rs.price) / ls.price / 0.06;
    const conf = Math.min(0.92, 0.52 + 0.32 * Math.max(0, sym) + 0.08);
    const endIdx = Math.min(rs.candleIndex + 8, candles.length - 1);
    out.push({
      type: 'inv_hns', nameKo: '역 헤드 앤 숄더', signal: 'bullish', confidence: conf,
      points: [ls, lpk, hd, rpk, rs],
      necklinePrice: neckP, necklineStart: ls.time, necklineEnd: candles[endIdx].time,
      description: `역헤드앤숄더 감지 (신뢰도 ${(conf * 100).toFixed(0)}%) — 네크라인 ${fmt(neckP)} 돌파 시 강한 상승 전환.`,
      startIndex: ls.candleIndex, endIndex: rs.candleIndex,
    });
  }
  return out;
}

/* ── 상승삼각형 ── */
function ascTriangle(highs: PatternPoint[], lows: PatternPoint[], candles: ChartCandle[]): DetectedPattern[] {
  const rh = highs.slice(-5), rl = lows.slice(-6);
  if (rh.length < 2 || rl.length < 3) return [];
  const avgH = rh.reduce((s, h) => s + h.price, 0) / rh.length;
  if (!rh.every(h => near(h.price, avgH, 0.025))) return [];
  for (let i = 1; i < rl.length; i++) if (rl[i].price <= rl[i - 1].price) return [];
  if (rl[rl.length - 1].candleIndex - rl[0].candleIndex < 12) return [];
  return [{
    type: 'asc_tri', nameKo: '상승삼각형', signal: 'bullish', confidence: 0.70,
    points: [rl[0], rh[0], rl[rl.length - 1]],
    necklinePrice: avgH, necklineStart: rh[0].time, necklineEnd: candles[candles.length - 1].time,
    description: `상승삼각형 감지 — 저점 상승 + 저항선 ${fmt(avgH)} 수렴. 돌파 시 매수 신호.`,
    startIndex: rl[0].candleIndex, endIndex: candles.length - 1,
  }];
}

/* ── 하락삼각형 ── */
function descTriangle(highs: PatternPoint[], lows: PatternPoint[], candles: ChartCandle[]): DetectedPattern[] {
  const rh = highs.slice(-6), rl = lows.slice(-5);
  if (rh.length < 3 || rl.length < 2) return [];
  const avgL = rl.reduce((s, l) => s + l.price, 0) / rl.length;
  if (!rl.every(l => near(l.price, avgL, 0.025))) return [];
  for (let i = 1; i < rh.length; i++) if (rh[i].price >= rh[i - 1].price) return [];
  if (rh[rh.length - 1].candleIndex - rh[0].candleIndex < 12) return [];
  return [{
    type: 'desc_tri', nameKo: '하락삼각형', signal: 'bearish', confidence: 0.70,
    points: [rh[0], rl[0], rh[rh.length - 1]],
    necklinePrice: avgL, necklineStart: rl[0].time, necklineEnd: candles[candles.length - 1].time,
    description: `하락삼각형 감지 — 고점 하락 + 지지선 ${fmt(avgL)} 수렴. 이탈 시 매도 신호.`,
    startIndex: rh[0].candleIndex, endIndex: candles.length - 1,
  }];
}

/* ── 패턴 무효화 검증 ──
 * 패턴 형성 이후 가격이 반대 방향으로 크게 움직였으면 이미 실패한 패턴 — 제거.
 * bearish: 패턴 이후 종가가 peak 위로 2% 초과 → 돌파당해 무효
 * bullish: 패턴 이후 종가가 trough 아래로 2% 초과 → 붕괴돼 무효
 */
function isValidPattern(pattern: DetectedPattern, candles: ChartCandle[]): boolean {
  const after = candles.slice(pattern.endIndex + 1);
  if (!after.length) return true;

  if (pattern.signal === 'bearish') {
    const peakPrice = Math.max(...pattern.points.map(p => p.price));
    return !after.some(c => c.close > peakPrice * 1.02);
  }
  if (pattern.signal === 'bullish') {
    const troughPrice = Math.min(...pattern.points.map(p => p.price));
    return !after.some(c => c.close < troughPrice * 0.98);
  }
  return true;
}

/* ── 메인 익스포트 ── */
export function detectPatterns(candles: ChartCandle[]): DetectedPattern[] {
  if (candles.length < 20) return [];
  const ph = pivHigh(candles);
  const pl = pivLow(candles);
  const minIdx = Math.floor(candles.length * 0.20); // 최근 80% 내 패턴만
  return [
    ...dblBottom(pl, ph, candles),
    ...dblTop(ph, pl, candles),
    ...hns(ph, pl, candles),
    ...invHns(pl, ph, candles),
    ...ascTriangle(ph, pl, candles),
    ...descTriangle(ph, pl, candles),
  ]
    .filter(p => p.endIndex >= minIdx && p.confidence >= 0.50)
    .filter(p => isValidPattern(p, candles))
    .sort((a, b) => b.endIndex - a.endIndex || b.confidence - a.confidence)
    .slice(0, 3);
}
