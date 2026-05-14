import { NextRequest } from 'next/server';

interface YahooQuote {
  symbol: string;
  longname?: string;
  shortname?: string;
  exchange: string;
  quoteType: string;
}

export interface TickerResult {
  symbol: string;
  name: string;
  exchange: string;
}

const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND']);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 1) return Response.json([]);

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&lang=en-US&region=US`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 },
    });

    if (!res.ok) return Response.json([]);

    const data = await res.json();
    const quotes: YahooQuote[] = data.quotes ?? [];

    const results: TickerResult[] = quotes
      .filter((q) => ALLOWED_TYPES.has(q.quoteType))
      .slice(0, 10)
      .map((q) => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        exchange: q.exchange,
      }));

    return Response.json(results);
  } catch {
    return Response.json([]);
  }
}
