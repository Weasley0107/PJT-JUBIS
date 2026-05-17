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
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  patterns: { nameKo: string; signal: string; confidence: number; description: string }[];
  candlePatterns?: { nameKo: string; signal: string; description: string }[];
  recentSignals?: { time: string; type: 'buy' | 'sell'; reason: string }[];
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
    if (p.currentPrice > p.bbUpper) return `상단 돌파 (과열)`;
    if (p.currentPrice < p.bbLower) return `하단 이탈 (침체)`;
    return `밴드 내 ${pct}% 위치 (중단 ${p.currentPrice > mid ? '위' : '아래'})`;
  })() : 'N/A';

  const macdLabel = (p.macd != null && p.macdSignal != null)
    ? (p.macd > p.macdSignal ? '골든크로스 상태' : '데드크로스 상태')
    : 'N/A';
  const macdHistLabel = p.macdHist != null
    ? (p.macdHist > 0 ? `+${p.macdHist.toFixed(3)} (양전환)` : `${p.macdHist.toFixed(3)} (음전환)`)
    : 'N/A';

  const adxLabel = p.adx != null
    ? (p.adx < 20 ? '추세 없음 (횡보)' : p.adx < 25 ? '추세 형성 초기' : '추세 진행 중')
    : 'N/A';
  const diLabel = (p.plusDI != null && p.minusDI != null)
    ? (p.plusDI > p.minusDI ? '상승 추세 우위' : '하락 추세 우위')
    : 'N/A';

  const recentCandleText = p.recentCandles?.length
    ? p.recentCandles.map(c => `  ${c.date}: O${c.open} H${c.high} L${c.low} C${c.close}`).join('\n')
    : '  데이터 없음';

  const patternText = p.patterns.length
    ? p.patterns.map(pt =>
        `- [${pt.signal === 'bullish' ? '▲상승' : '▼하락'}] ${pt.nameKo} (신뢰도 ${Math.round(pt.confidence * 100)}%): ${pt.description}`
      ).join('\n')
    : '- 감지된 차트 패턴 없음';

  const candlePatText = p.candlePatterns?.length
    ? p.candlePatterns.map(cp =>
        `- [${cp.signal === 'bullish' ? '▲' : cp.signal === 'bearish' ? '▼' : '◆'}] ${cp.nameKo}: ${cp.description}`
      ).join('\n')
    : '- 최근 특이 단봉 패턴 없음';

  const recentSignalText = p.recentSignals?.length
    ? p.recentSignals.map(s =>
        `- [${s.type === 'buy' ? '▲매수' : '▼매도'}] ${s.time} — ${s.reason}`
      ).join('\n')
    : '- 기간 내 명확한 크로스 신호 없음';

  return `당신은 주식 기술적 분석 전문가이자 투자 교육가입니다. 아래 실제 차트 데이터를 분석하고, **주식을 공부하는 학습자**가 이 차트에서 무엇을 배워야 하는지 함께 설명하는 리포트를 작성하세요.

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

## MACD (12-26-9)
- MACD 선: ${p.macd != null ? p.macd.toFixed(3) : 'N/A'} / Signal: ${p.macdSignal != null ? p.macdSignal.toFixed(3) : 'N/A'}
- 히스토그램: ${macdHistLabel}
- 상태: ${macdLabel}

## ADX & DI (14)
- ADX: ${p.adx != null ? p.adx.toFixed(1) : 'N/A'} → ${adxLabel}
- +DI: ${p.plusDI != null ? p.plusDI.toFixed(1) : 'N/A'} / -DI: ${p.minusDI != null ? p.minusDI.toFixed(1) : 'N/A'} → ${diLabel}

## RSI & 볼린저밴드
- RSI(14): ${p.rsi != null ? p.rsi.toFixed(1) : 'N/A'} (${rsiLabel}) ${rsiTrend}
  최근 3일 RSI: ${p.rsiPrev3?.join(' → ') ?? 'N/A'}
- 볼린저밴드(20,2): 상단 ${fmt(p.bbUpper)} / 하단 ${fmt(p.bbLower)}
  위치: ${bbPos}

## 감지된 차트 패턴 (구조적)
${patternText}

## 최근 단봉 캔들 패턴
${candlePatText}

## 기술적 매매 신호 (기간 내 발생 순)
${recentSignalText}

## 거래량
기간 내 평균 대비 2배+ 급등: ${p.volSpikeCount}회

---

아래 **8개 항목**을 한국어로 작성하세요. 각 항목 2~3문장, **구체적인 가격($)** 명시, 서론 없이 바로 시작:

**📊 추세**: 단기(MA5·MA20)와 중기(MA60·MA120) 배열 상태. ADX로 추세 강도 평가. 정배열/역배열 여부와 골든/데드크로스 상황.

**🎯 지지·저항**: 핵심 지지선과 저항선을 **달러 가격**으로 2~3개씩 명시. MA·BB·최근 고저점 기반 근거 포함.

**⚡ 모멘텀**: MACD 상태(골든/데드크로스, 히스토그램 방향). RSI 과열·침체 여부. 볼린저밴드 위치와 스퀴즈/확장 신호.

**📐 패턴**: 구조적 차트 패턴과 단봉 캔들 패턴 모두 언급. 실제 의미와 주목할 가격 수준. (없으면 "특이 패턴 없음 — 횡보/추세 지속")

**📈 시나리오 분기**:
- 🟢 **상승 시나리오**: "만약 $[가격]을 돌파하면..." 형식으로 목표가와 근거 1~2줄
- 🔴 **하락 시나리오**: "만약 $[가격]을 이탈하면..." 형식으로 하락 목표와 손절 기준 1~2줄

**⏰ 매매 타이밍**:
- 📗 **매수 진입**: 위 기술적 신호를 종합한 최적 매수 진입 가격대와 조건. (예: "$X 돌파 + MACD 골든크로스 확인 시 진입")
- 📕 **매도/손절**: 보유 중이라면 수익실현 목표가와 반드시 지켜야 할 손절선. (예: "목표 $Y, $Z 이탈 시 손절")
- ⏳ **대기 조건**: 아직 진입하지 않았다면 확인해야 할 조건 또는 눌림 구간. (예: "RSI 50 이하 눌림 대기")

**🎓 학습 포인트**: 이 차트를 분석하면서 배울 수 있는 기술적 분석 개념 2~3가지. 초보자도 이해할 수 있도록 해당 지표가 **왜 이 상황에서 중요한지** 설명. (예: "ADX가 25 이상이면 추세가 강한 것인데, 이 경우...")

**💡 종합**: 현재 매수/관망/매도 판단 1문장 + 리스크 레벨(낮음/보통/높음) + 핵심 주의 가격대.`;
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
