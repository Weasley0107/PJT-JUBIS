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

// Wilder's smoothing RSI — closes 배열 길이만큼 결과 반환, 첫 period개는 null
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

    // Filter out incomplete quotes and sort ascending
    const quotes = raw
      .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (!quotes.length) return NextResponse.json({ candles: [], maLines: {} });

    const closes: number[] = quotes.map((q) => q.close);
    const ma5   = calcMA(closes, 5);
    const ma20  = calcMA(closes, 20);
    const ma60  = calcMA(closes, 60);
    const ma120 = calcMA(closes, 120);
    const ma200 = calcMA(closes, 200);
    const rsi14 = calcRSI(closes, 14);
    const bb    = calcBB(closes, 20, 2);

    const displayStart = new Date();
    displayStart.setDate(displayStart.getDate() - displayDays);
    const startIdx = quotes.findIndex((q) => new Date(q.date) >= displayStart);
    const from = startIdx === -1 ? 0 : startIdx;

    const toDateStr = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

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
    });
  } catch (err) {
    console.error('[chart-data]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
