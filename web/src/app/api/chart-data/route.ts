import { NextRequest, NextResponse } from 'next/server';

// yahoo-finance2 v3 requires instantiation
// eslint-disable-next-line @typescript-eslint/no-require-imports
const YFModule = require('yahoo-finance2');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf: any = new YFModule.default({ suppressNotices: ['ripHistorical'] });

const PERIOD_DAYS: Record<string, number> = {
  '3m': 90, '6m': 180, '1y': 365, '2y': 730, '3y': 1095,
};

function calcMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calcEMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (values.length < period) return new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period - 1; i++) result.push(null);
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function calcMACD(closes: number[]): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);

  const macd: (number | null)[] = ema12.map((v, i) =>
    v !== null && ema26[i] !== null ? +(v - ema26[i]!).toFixed(4) : null
  );

  const firstValid = macd.findIndex(v => v !== null);
  if (firstValid === -1) {
    const empty = new Array(closes.length).fill(null);
    return { macd, signal: empty, histogram: empty };
  }

  // Signal = EMA(9) of MACD values from first valid point
  const macdValues = macd.slice(firstValid).map(v => v ?? 0);
  const signalEMA = calcEMA(macdValues, 9);

  const signal: (number | null)[] = [
    ...new Array(firstValid).fill(null),
    ...signalEMA.map(v => v !== null ? +v.toFixed(4) : null),
  ];

  const histogram: (number | null)[] = macd.map((v, i) =>
    v !== null && signal[i] !== null ? +(v - signal[i]!).toFixed(4) : null
  );

  return { macd, signal, histogram };
}

function calcADX(highs: number[], lows: number[], closes: number[], period = 14): {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
} {
  const n = closes.length;
  const adxArr: (number | null)[] = new Array(n).fill(null);
  const pdiArr: (number | null)[] = new Array(n).fill(null);
  const ndiArr: (number | null)[] = new Array(n).fill(null);

  if (n < period * 2 + 2) return { adx: adxArr, plusDI: pdiArr, minusDI: ndiArr };

  const trs: number[] = [], pdms: number[] = [], ndms: number[] = [];
  for (let i = 1; i < n; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
    const dh = highs[i] - highs[i - 1];
    const dl = lows[i - 1] - lows[i];
    pdms.push(dh > 0 && dh > dl ? dh : 0);
    ndms.push(dl > 0 && dl > dh ? dl : 0);
  }

  // Wilder smoothing — initial sums
  let trS = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let pdS = pdms.slice(0, period).reduce((a, b) => a + b, 0);
  let ndS = ndms.slice(0, period).reduce((a, b) => a + b, 0);

  const dxArr: number[] = [];

  for (let i = period; i < trs.length; i++) {
    trS = trS - trS / period + trs[i];
    pdS = pdS - pdS / period + pdms[i];
    ndS = ndS - ndS / period + ndms[i];

    const pdi = trS > 0 ? (pdS / trS) * 100 : 0;
    const ndi = trS > 0 ? (ndS / trS) * 100 : 0;
    const cidx = i + 1;
    if (cidx < n) {
      pdiArr[cidx] = +pdi.toFixed(2);
      ndiArr[cidx] = +ndi.toFixed(2);
    }
    const dxDenom = pdi + ndi;
    dxArr.push(dxDenom > 0 ? (Math.abs(pdi - ndi) / dxDenom) * 100 : 0);
  }

  // ADX = Wilder smooth of DX
  if (dxArr.length >= period) {
    let adxVal = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const startIdx = period * 2;
    if (startIdx < n) adxArr[startIdx] = +adxVal.toFixed(2);

    for (let i = period; i < dxArr.length; i++) {
      adxVal = (adxVal * (period - 1) + dxArr[i]) / period;
      const cidx = period + i;
      if (cidx < n) adxArr[cidx] = +adxVal.toFixed(2);
    }
  }

  return { adx: adxArr, plusDI: pdiArr, minusDI: ndiArr };
}

// Wilder's smoothing RSI
function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (closes.length < period + 1) return new Array(closes.length).fill(null);

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }

  for (let i = 0; i < period; i++) result.push(null);

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  return result;
}

function calcSignals(
  dates: string[],
  ma5: (number | null)[],
  ma20: (number | null)[],
  rsi: (number | null)[],
  macd: (number | null)[],
  macdSignal: (number | null)[],
): { time: string; type: 'buy' | 'sell'; reason: string }[] {
  const raw: { time: string; type: 'buy' | 'sell'; reason: string }[] = [];
  for (let i = 1; i < dates.length; i++) {
    const p5 = ma5[i - 1], c5 = ma5[i], p20 = ma20[i - 1], c20 = ma20[i];
    if (p5 != null && c5 != null && p20 != null && c20 != null) {
      if (p5 <= p20 && c5 > c20) raw.push({ time: dates[i], type: 'buy',  reason: 'MA골든크로스' });
      if (p5 >= p20 && c5 < c20) raw.push({ time: dates[i], type: 'sell', reason: 'MA데드크로스' });
    }
    const pr = rsi[i - 1], cr = rsi[i];
    if (pr != null && cr != null) {
      if (pr < 30 && cr >= 30) raw.push({ time: dates[i], type: 'buy',  reason: 'RSI과매도탈출' });
      if (pr > 70 && cr <= 70) raw.push({ time: dates[i], type: 'sell', reason: 'RSI과매수이탈' });
    }
    const pm = macd[i - 1], cm = macd[i], ps = macdSignal[i - 1], cs = macdSignal[i];
    if (pm != null && cm != null && ps != null && cs != null) {
      if (pm <= ps && cm > cs) raw.push({ time: dates[i], type: 'buy',  reason: 'MACD골든크로스' });
      if (pm >= ps && cm < cs) raw.push({ time: dates[i], type: 'sell', reason: 'MACD데드크로스' });
    }
  }

  // 같은 방향(매수/매도) 신호가 10일 이내 연속이면 첫 번째만 유지
  const daysDiff = (a: string, b: string) =>
    Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
  const out: { time: string; type: 'buy' | 'sell'; reason: string }[] = [];
  let lastBuy = '', lastSell = '';
  for (const s of raw) {
    if (s.type === 'buy') {
      if (lastBuy && daysDiff(s.time, lastBuy) < 10) continue;
      lastBuy = s.time;
    } else {
      if (lastSell && daysDiff(s.time, lastSell) < 10) continue;
      lastSell = s.time;
    }
    out.push(s);
  }
  return out;
}

function calcVolSpikes(volumes: number[], period = 20, mult = 2): boolean[] {
  return volumes.map((v, i) => {
    if (i < period) return false;
    const avg = volumes.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    return avg > 0 && v > avg * mult;
  });
}

function calcBB(closes: number[], period = 20, k = 2): {
  upper: (number | null)[];
  lower: (number | null)[];
} {
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - avg) ** 2, 0) / period);
    upper.push(avg + k * std);
    lower.push(avg - k * std);
  }
  return { upper, lower };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker')?.toUpperCase() ?? '';
  const period = searchParams.get('period') ?? '6m';

  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  const displayDays = PERIOD_DAYS[period] ?? 180;
  const fetchDays = Math.max(displayDays + 260, 420); // 200MA needs ~280 trading days

  const period1 = new Date();
  period1.setDate(period1.getDate() - fetchDays);

  try {
    const result = await yf.chart(ticker, { period1, interval: '1d' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = result.quotes ?? [];

    const quotes = raw
      .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (!quotes.length) return NextResponse.json({ candles: [], maLines: {} });

    const closes:  number[] = quotes.map((q) => q.close);
    const highs:   number[] = quotes.map((q) => q.high);
    const lows:    number[] = quotes.map((q) => q.low);
    const volumes: number[] = quotes.map((q) => q.volume ?? 0);

    const ma5    = calcMA(closes, 5);
    const ma20   = calcMA(closes, 20);
    const ma60   = calcMA(closes, 60);
    const ma120  = calcMA(closes, 120);
    const ma200  = calcMA(closes, 200);
    const rsi14  = calcRSI(closes, 14);
    const bb     = calcBB(closes, 20, 2);
    const spikes = calcVolSpikes(volumes, 20, 2);
    const macdResult = calcMACD(closes);
    const adxResult  = calcADX(highs, lows, closes, 14);

    const toDateStr = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

    const allDates = quotes.map((q) => toDateStr(q.date));
    const rawSignals = calcSignals(allDates, ma5, ma20, rsi14, macdResult.macd, macdResult.signal);

    const displayStart = new Date();
    displayStart.setDate(displayStart.getDate() - displayDays);
    const startIdx = quotes.findIndex((q) => new Date(q.date) >= displayStart);
    const from = startIdx === -1 ? 0 : startIdx;
    const displayStartStr = toDateStr(displayStart);

    const candles = quotes.slice(from).map((q) => ({
      time:   toDateStr(q.date),
      open:   q.open,
      high:   q.high,
      low:    q.low,
      close:  q.close,
      volume: q.volume ?? 0,
    }));

    const makeMALine = (arr: (number | null)[]) =>
      arr.slice(from)
        .map((v, i) => v !== null
          ? { time: toDateStr(quotes[from + i].date), value: +v.toFixed(4) }
          : null)
        .filter((x): x is { time: string; value: number } => x !== null);

    const rsiLine = rsi14
      .slice(from)
      .map((v, i) => v !== null
        ? { time: toDateStr(quotes[from + i].date), value: +v.toFixed(2) }
        : null)
      .filter((x): x is { time: string; value: number } => x !== null);

    const volSpikes: string[] = spikes
      .slice(from)
      .map((isSpike, i) => isSpike ? toDateStr(quotes[from + i].date) : null)
      .filter((t): t is string => t !== null);

    // MACD lines
    const macdLine   = makeMALine(macdResult.macd);
    const signalLine = makeMALine(macdResult.signal);
    const histLine   = macdResult.histogram
      .slice(from)
      .map((v, i) => v !== null
        ? { time: toDateStr(quotes[from + i].date), value: +v.toFixed(4), color: v >= 0 ? '#10b981' : '#ef4444' }
        : null)
      .filter((x): x is { time: string; value: number; color: string } => x !== null);

    // ADX lines
    const adxLine    = makeMALine(adxResult.adx);
    const plusDILine  = makeMALine(adxResult.plusDI);
    const minusDILine = makeMALine(adxResult.minusDI);

    // Sector / industry — best-effort, non-blocking
    let sector: string | undefined;
    let industry: string | undefined;
    try {
      const qsRes = await fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3000) },
      );
      if (qsRes.ok) {
        const qs = await qsRes.json();
        const profile = qs.quoteSummary?.result?.[0]?.assetProfile;
        if (profile?.sector)   sector   = profile.sector;
        if (profile?.industry) industry = profile.industry;
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      candles,
      maLines: {
        ma5:   makeMALine(ma5),
        ma20:  makeMALine(ma20),
        ma60:  makeMALine(ma60),
        ma120: makeMALine(ma120),
        ma200: makeMALine(ma200),
      },
      rsiLine,
      bbLines: {
        upper: makeMALine(bb.upper),
        lower: makeMALine(bb.lower),
      },
      volSpikes,
      macdLines: { macd: macdLine, signal: signalLine, histogram: histLine },
      adxLines:  { adx: adxLine, plusDI: plusDILine, minusDI: minusDILine },
      tradeSignals: rawSignals.filter((s) => s.time >= displayStartStr),
      ...(sector   && { sector }),
      ...(industry && { industry }),
    });
  } catch (err) {
    console.error('[chart-data]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
