export type PeriodCode = '3m' | '6m' | '1y' | '2y' | '3y';
export type TechnicalLevel = 'quick' | 'basic' | 'standard' | 'advanced';

export interface SectionDef {
  id: number;
  label: string; // UI 표시용 짧은 이름
}

export const ALL_SECTIONS: SectionDef[] = [
  { id: 1,  label: '기본정보'   },
  { id: 2,  label: '주가동향'   },
  { id: 3,  label: '기술적분석' },
  { id: 4,  label: '밸류에이션' },
  { id: 5,  label: '재무제표'   },
  { id: 6,  label: '실적발표'   },
  { id: 7,  label: '산업분석'   },
  { id: 8,  label: '뉴스/애널'  },
  { id: 9,  label: '강점·리스크'},
  { id: 10, label: '투자전략'   },
];

export const DEFAULT_SECTIONS = [1, 3, 8, 9, 10]; // 필수 섹션: 기본정보·기술적분석·뉴스/애널·강점리스크·투자전략

const PERIOD_LABELS: Record<PeriodCode, string> = {
  '3m': '3개월', '6m': '6개월', '1y': '1년', '2y': '2년', '3y': '3년',
};

const TECHNICAL_LABELS: Record<TechnicalLevel, string> = {
  quick:    '빠른 요약 (핵심 5개 섹션)',
  basic:    '기본 (이동평균선+지지저항)',
  standard: '표준 (이동평균+MACD+RSI+ADX)',
  advanced: '고급 (표준+볼린저+피보나치+ADX+ATR)',
};

function buildQuickPrompt(ticker: string): string {
  return `당신은 전문 주식 분석가입니다. ${ticker}에 대한 핵심 요약 분석을 간결하게 작성해주세요.

조건:
- WebSearch로 오늘 기준 현재 주가와 최근 뉴스를 반드시 수집하세요.
- 각 섹션은 3~5줄 이내로 간결하게 작성하세요.
- 취소선(~~텍스트~~) 형식을 절대 사용하지 마세요.

---

# ${ticker} 빠른 분석

## 1. 현재 상태
현재 주가(오늘 기준 최신), 시가총액, 52주 고저가 대비 위치(%)

## 2. 기술적 분석
MA20/60/120 배열 상태, RSI(14) 현재값, MACD 상태, 주요 지지·저항 구간, 현재 국면(박스권/상승/하락 추세)

## 3. 최근 이슈
최근 주요 뉴스 2건(날짜·제목·주가 영향), 애널리스트 컨센서스(매수/중립/매도 비율, 평균 목표가, 상승여력%)

## 4. 강점 & 리스크
Bull Case 2가지 / Bear Case 2가지

## 5. 투자 판단
- **단기(1~3개월)**: 매수/관망/매도, 핵심 근거 1줄, 목표가/손절가
- **장기(1년↑)**: 매수/관망/매도, 핵심 근거 1줄
- **종합 스코어**: /10점, 최종 결론 한 줄

---
※ 본 분석은 정보 제공 목적이며 투자 권유가 아닙니다.`;
}

/* 섹션별 내용 — id로 조회해 선택된 것만 조합 */
function buildSectionContent(
  id: number,
  ticker: string,
  period: PeriodCode,
  technical: TechnicalLevel,
  compareNote: string,
): string {
  const p = PERIOD_LABELS[period];
  switch (id) {
    case 1: return `## 섹션 1. 종목 기본 정보
- 종목명 / 티커 / 거래소 / 업종
- 현재 주가 (오늘 기준 최신 시장가 — 과거 날짜 종가 금지), 시가총액, 52주 고저가, 평균 거래량(20일)`;

    case 2: return `## 섹션 2. 주가 동향 및 수급 분석 (최근 ${p})
- 주가 흐름 요약 (고점, 저점, 전환점)
- 현재 주가의 52주 고저가 대비 위치(%)
- 향후 6개월 주가 촉매 및 리스크`;

    case 3: return `## 섹션 3. 기술적 분석 (${p} 일봉 기준)
- 20일선 / 60일선 / 120일선 현재값, 배열 상태(정배열/역배열)
- MACD: 현재값, Signal 대비 상태, 크로스 여부
- RSI(14일): 현재값, 상태 판단
- 볼린저밴드 위치
- 지지·저항 구간
- ADX(14일): 현재값과 추세 강도 판단
  - ADX < 20: 추세 없음 → **박스권/횡보 구간** (상단·하단 가격 명시)
  - ADX 20~25: 추세 형성 초기
  - ADX > 25: 추세 진행 중 (상승/하락 방향 명시)
- **현재 국면 판단: 박스권 횡보 / 상승 추세 / 하락 추세** — 위 지표 종합 근거 서술
- **기술적 종합 판단: 매수 / 관망 / 매도**${
  technical === 'advanced'
    ? '\n- 피보나치 되돌림, VWAP, 스토캐스틱 포함. ATR로 박스권 변동폭 수치화, 돌파 시나리오(목표가·손절가) 제시.'
    : technical === 'basic'
    ? '\n- 이동평균선(20/60/120일)과 지지·저항선만 포함. ADX 생략 가능.'
    : ''}`;

    case 4: return `## 섹션 4. 밸류에이션 지표
PER(TTM), Forward PER, PBR, ROE, EV/EBITDA, PSR, 배당수익률 — 업종 평균 대비 표로 정리`;

    case 5: return `## 섹션 5. 3개년 재무제표 분석
- 손익계산서: 매출액, 영업이익, 영업이익률, 순이익, EPS (2022·2023·2024)
- 재무상태표: 부채비율, 유동비율, 이자보상배율
- 현금흐름: 영업/투자/재무 현금흐름, FCF
- 수익성/안정성/성장성 별점 평가`;

    case 6: return `## 섹션 6. 최근 분기 실적 발표 분석
- 발표 분기, 주요 수치, 컨센서스 대비(어닝 서프라이즈/미스 %), 경영진 가이던스, 발표 후 주가 반응`;

    case 7: return `## 섹션 7. 산업 분석 및 경쟁 환경
- 글로벌 시장 규모 및 성장률, 경쟁사 비교표${compareNote ? ', 비교 대상 포함' : ''}
- 미국·중국 정책 이슈, AI·반도체 메가트렌드 연관성, 사이클 위치`;

    case 8: return `## 섹션 8. 최신 뉴스 및 애널리스트 의견
- 최근 1개월 주요 뉴스 3건 (날짜·제목·주가 영향)
- 애널리스트 컨센서스: 매수/중립/매도 비율, 평균 목표주가, 상승여력(%)`;

    case 9: return `## 섹션 9. 투자 강점 & 리스크
- Bull Case 3가지 / Bear Case 3가지
- 리스크 레벨: 낮음 / 보통 / 높음`;

    case 10: return `## 섹션 10. 투자 전략별 종합 평가
**장기(1년↑)**: 매력도 ★/5, 핵심 포인트, 목표주가, 판단
**단기(1~3개월)**: 매력도 ★/5, 기술적 근거, 목표가/손절가, 이벤트 일정
**종합 스코어카드**: 재무·성장·밸류·기술·산업·뉴스 각 /5점 → 합계 /30점
**최종 결론**: 한 줄 요약`;

    default: return '';
  }
}

export function buildPrompt(params: {
  ticker: string;
  period: PeriodCode;
  technical: TechnicalLevel;
  compare: string;
  sections?: number[]; // 미지정 시 DEFAULT_SECTIONS
}): string {
  const { ticker, period, technical, compare, sections = DEFAULT_SECTIONS } = params;

  if (technical === 'quick') return buildQuickPrompt(ticker);

  const compareNote = compare.trim()
    ? `비교 분석 대상: ${compare} — 섹션 7 산업 분석에서 경쟁사 비교표를 추가해줘.`
    : '';

  const sorted = [...sections].sort((a, b) => a - b);
  const sectionBlocks = sorted
    .map(id => buildSectionContent(id, ticker, period, technical, compareNote))
    .filter(Boolean)
    .join('\n\n');

  return `당신은 전문 주식 분석가입니다. 다음 조건으로 ${ticker} 종목에 대한 분석 리포트를 작성해주세요.

분석 조건:
- 미국 NYSE/NASDAQ 상장 종목이야. 달러($) 단위로 분석하고, SEC 공시 기준 재무제표를 사용해.
- 분석 기간: ${PERIOD_LABELS[period]}
- 기술적 분석 레벨: ${TECHNICAL_LABELS[technical]}
${compareNote}

출력 형식 제한:
- 취소선(~~텍스트~~) 형식을 절대 사용하지 마세요.
- 현재 주가는 반드시 오늘 날짜 기준 최신 시장가로 수집하세요.

아래 ${sorted.length}개 섹션으로 구성된 리포트를 마크다운 형식으로 작성해주세요. WebSearch로 실시간 데이터를 반드시 수집하세요.

---

# ${ticker} 종합 분석 리포트

${sectionBlocks}

---
※ 본 분석은 정보 제공 목적이며 투자 권유가 아닙니다.`;
}
