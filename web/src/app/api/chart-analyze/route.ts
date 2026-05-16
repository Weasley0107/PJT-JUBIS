import { spawn } from 'child_process';
import { NextRequest } from 'next/server';

const PERIOD_KO: Record<string, string> = {
  '3m': '3개월', '6m': '6개월', '1y': '1년', '2y': '2년', '3y': '3년',
};

interface RecentCandle { date: string; open: number; high: number; low: number; close: number; }

interface ChartAnalyzePayload {
  ticker: string;
  period: string;
  currentPrice: number;
  periodReturn: number;
  recentCandles?: RecentCandle[];
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma200: number | null;
  rsi: number | null;
  rsiPrev3?: number[];
  bbUpper: number | null;
  bbLower: number | null;
  patterns: { nameKo: string; signal: string; confidence: number; description: string }[];
  volSpikeCount: number;
  sector?: string;
  industry?: string;
}

function buildChartPrompt(p: ChartAnalyzePayload): string {
  const fmt  = (v: number | null) => v != null ? `$${v.toFixed(2)}` : 'N/A';
  const gap  = (v: number | null) => v != null ? `(${((p.currentPrice - v) / v * 100).toFixed(1)}%)` : '';
  const rsiLabel = p.rsi != null
    ? (p.rsi > 70 ? '과매수' : p.rsi < 30 ? '과매도' : '중립')
    : 'N/A';
  const rsiTrend = p.rsiPrev3?.length === 3
    ? (p.rsiPrev3[2] > p.rsiPrev3[0] ? '↑ 상승 중' : p.rsiPrev3[2] < p.rsiPrev3[0] ? '↓ 하락 중' : '→ 횡보')
    : '';

  const bbPos = (p.bbUpper != null && p.bbLower != null) ? (() => {
    const mid = (p.bbUpper + p.bbLower) / 2;
    const pct  = ((p.currentPrice - p.bbLower) / (p.bbUpper - p.bbLower) * 100).toFixed(0);
    if (p.currentPrice > p.bbUpper) return `상단 돌파 (과열) — 밴드 위`;
    if (p.currentPrice < p.bbLower) return `하단 이탈 (침체) — 밴드 아래`;
    return `밴드 내 ${pct}% 위치 (중단 ${p.currentPrice > mid ? '위' : '아래'})`;
  })() : 'N/A';

  const recentCandleText = p.recentCandles?.length
    ? p.recentCandles.map(c => `  ${c.date}: O${c.open} H${c.high} L${c.low} C${c.close}`).join('\n')
    : '  데이터 없음';

  const patternText = p.patterns.length
    ? p.patterns.map(pt =>
        `- [${pt.signal === 'bullish' ? '▲상승' : '▼하락'}] ${pt.nameKo} (신뢰도 ${Math.round(pt.confidence * 100)}%): ${pt.description}`
      ).join('\n')
    : '- 감지된 패턴 없음';

  return `당신은 전문 주식 기술적 분석가입니다. 아래 실제 차트 데이터를 정밀 분석해 구체적인 한국어 기술적 분석 리포트를 작성하세요.

# ${p.ticker} 기술적 분석 | ${PERIOD_KO[p.period] ?? p.period}
섹터: ${p.sector ?? '정보 없음'} / ${p.industry ?? '-'}
기간 수익률: ${p.periodReturn >= 0 ? '+' : ''}${p.periodReturn.toFixed(1)}%

## 최근 10일 캔들 (날짜: OHLC)
${recentCandleText}

## 이동평균선 (현재가 $${p.currentPrice.toFixed(2)} 대비)
- MA5  : ${fmt(p.ma5)}  ${gap(p.ma5)}
- MA20 : ${fmt(p.ma20)} ${gap(p.ma20)}
- MA60 : ${fmt(p.ma60)} ${gap(p.ma60)}
- MA120: ${fmt(p.ma120)} ${gap(p.ma120)}
- MA200: ${fmt(p.ma200)} ${gap(p.ma200)}

## 모멘텀 지표
- RSI(14): ${p.rsi != null ? p.rsi.toFixed(1) : 'N/A'} (${rsiLabel}) ${rsiTrend}
  최근 3일 RSI 추이: ${p.rsiPrev3?.join(' → ') ?? 'N/A'}
- 볼린저밴드(20,2): 상단 ${fmt(p.bbUpper)} / 하단 ${fmt(p.bbLower)}
  위치: ${bbPos}

## 감지된 차트 패턴
${patternText}

## 거래량
기간 내 평균 대비 2배+ 급등: ${p.volSpikeCount}회

---

아래 5개 항목을 **한국어**로 분석하세요. 각 항목 2~3문장, **구체적인 가격($)** 명시, 서론 없이 바로 시작:

**📊 추세**: 단기(MA5·MA20)와 중기(MA60·MA120) 배열 상태, 정배열/역배열 여부, 현재 추세 강도

**🎯 지지·저항**: 핵심 지지선과 저항선을 **구체적인 달러 가격**으로 2~3개씩 명시. MA·BB·최근 고저점 기반으로 설명

**⚡ 모멘텀**: RSI 추세 방향과 과열/침체 여부, 볼린저밴드 내 위치와 스퀴즈/확장 여부

**📐 패턴**: 감지된 패턴의 실제 의미와 주목할 가격 수준 (없으면 "특이 패턴 없음 — 횡보/추세 지속 구간")

**💡 종합**: 현재 매수/관망/매도 판단 근거 1~2문장 + 리스크 수준 (낮음/보통/높음) + 주요 주의 가격대`;
}

export async function POST(request: NextRequest) {
  const payload: ChartAnalyzePayload = await request.json();
  const prompt = buildChartPrompt(payload);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const enq = (t: string) => { if (!closed) controller.enqueue(encoder.encode(t)); };
      const close = () => { if (!closed) { closed = true; controller.close(); } };

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _c, ...env } = process.env;
      const args = [
        '--print', '--verbose',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions',
        '--model', 'claude-haiku-4-5-20251001',
      ];

      const isWin = process.platform === 'win32';
      const child = spawn('claude', args, { env, shell: isWin, windowsHide: true });

      request.signal.addEventListener('abort', () => { if (!child.killed) child.kill('SIGTERM'); });

      child.stdin.write(prompt, 'utf8');
      child.stdin.end();

      let buf = '';
      child.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            const ev = JSON.parse(t);
            if (ev.type === 'assistant' && ev.message?.content) {
              for (const block of ev.message.content) {
                if (block.type === 'text' && block.text) enq(block.text);
              }
            }
          } catch { /* ignore */ }
        }
      });

      child.on('close', close);
      child.on('error', (err: Error) => { enq(`\n> 오류: ${err.message}`); close(); });
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
