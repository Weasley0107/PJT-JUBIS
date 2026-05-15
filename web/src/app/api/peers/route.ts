import { NextRequest } from 'next/server';

interface RecommendedSymbol {
  symbol: string;
  score: number;
}

interface YahooPeersResult {
  symbol: string;
  recommendedSymbols: RecommendedSymbol[];
}

interface YahooPeersResponse {
  finance: {
    result: YahooPeersResult[] | null;
    error: unknown;
  };
}

// Yahoo Finance 추천 종목 API — 동일 섹터 내 유사 종목을 score 순으로 반환
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')?.trim().toUpperCase();
  if (!ticker) return Response.json([]);

  try {
    const url = `https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(ticker)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 }, // 1시간 캐시 — 경쟁사 구성은 자주 바뀌지 않음
    });

    if (!res.ok) return Response.json([]);

    const data: YahooPeersResponse = await res.json();
    const result = data.finance?.result?.[0];
    if (!result) return Response.json([]);

    // score 높은 순 상위 4개만 반환 (비교표가 너무 길어지지 않도록)
    const peers = result.recommendedSymbols
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((r) => r.symbol);

    return Response.json(peers);
  } catch {
    return Response.json([]);
  }
}
