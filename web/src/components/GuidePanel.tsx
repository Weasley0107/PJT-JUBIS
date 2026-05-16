'use client';

interface Props { onClose: () => void; }

/* ── 용어 데이터 ── */
const TERMS = [
  { term: '시가 (Open)',    desc: '장 시작 시 첫 번째 체결 가격' },
  { term: '종가 (Close)',   desc: '장 마감 시 마지막 체결 가격' },
  { term: '고가 (High)',    desc: '해당 기간 중 가장 높은 거래 가격' },
  { term: '저가 (Low)',     desc: '해당 기간 중 가장 낮은 거래 가격' },
  { term: 'MA 5',          desc: '5일 이동평균. 초단기 추세. 데이트레이딩·스캘핑 활용' },
  { term: 'MA 20',         desc: '20일(약 1개월) 이동평균. 단기 추세선. 가장 많이 참조' },
  { term: 'MA 60',         desc: '60일(약 3개월) 이동평균. 중기 추세선' },
  { term: 'MA 120',        desc: '120일(약 6개월) 이동평균. 장기 추세선. 국내 투자자 선호' },
  { term: 'MA 200',        desc: '200일(약 1년) 이동평균. 초장기 추세. 이 위면 강세장, 아래면 약세장으로 판단' },
  { term: '볼린저밴드 (BB)', desc: 'MA20 ± 2×표준편차로 그린 두 밴드. 밴드 폭이 좁아지면 (스퀴즈) 곧 방향성 이탈 예고. 상단 접근 시 과매수, 하단 접근 시 과매도 신호' },
  { term: '골든크로스',      desc: '단기 MA가 장기 MA를 상향 돌파 → 매수 신호' },
  { term: '데드크로스',      desc: '단기 MA가 장기 MA를 하향 돌파 → 매도 신호' },
  { term: '시가총액',        desc: '주가 × 발행 주식 수. 기업의 시장 가치' },
  { term: 'PER',           desc: '주가수익비율. 주가 ÷ EPS. 낮을수록 상대적 저평가' },
  { term: 'PBR',           desc: '주가순자산비율. 주가 ÷ BPS. 1 미만이면 청산가치 이하' },
  { term: 'ROE',           desc: '자기자본이익률. 순이익 ÷ 자기자본 × 100 (%)' },
  { term: 'EPS',           desc: '주당순이익. 당기순이익 ÷ 발행 주식 수' },
  { term: '배당수익률',      desc: '연간 배당 ÷ 주가 × 100 (%). 높을수록 수익 안정' },
  { term: '상한가/하한가',   desc: '당일 허용 최대 상승(+30%) / 하락(-30%) 가격' },
  { term: '공매도',          desc: '주식을 빌려 매도, 하락 후 되사 차익을 얻는 전략' },
  { term: '호가창',          desc: '매수·매도 주문이 쌓인 가격대 목록 (오더북)' },
  { term: '외국인 순매수',   desc: '외국인 매수량 − 매도량. 시장 심리 지표' },
];

/* ── SVG 헬퍼 ── */
const toPath = (pts: number[][]) =>
  pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-[10px] font-mono font-bold text-blue-500">{number}</span>
      <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}

/* ════════════════════════════════════
   Section 01 — 캔들차트
════════════════════════════════════ */
// 양봉/음봉 각주 달린 단일 캔들
function AnnotatedCandle({ color, label, sublabel, isUp }: {
  color: string; label: string; sublabel: string; isUp: boolean;
}) {
  const cx = 52, bh = 8;
  const wt = 14, bt = 42, bb = 118, wb = 148;

  const rows = isUp
    ? [{ y: wt, lbl: '고가', from: cx }, { y: bt, lbl: '종가', from: cx + bh }, { y: bb, lbl: '시가', from: cx + bh }, { y: wb, lbl: '저가', from: cx }]
    : [{ y: wt, lbl: '고가', from: cx }, { y: bt, lbl: '시가', from: cx + bh }, { y: bb, lbl: '종가', from: cx + bh }, { y: wb, lbl: '저가', from: cx }];

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold mb-1" style={{ color }}>{label}</p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">{sublabel}</p>
      <svg viewBox="0 0 160 168" className="w-full max-w-[130px]">
        {/* 위꼬리 */}
        <line x1={cx} y1={wt} x2={cx} y2={bt} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {/* 몸통 */}
        <rect x={cx - bh} y={bt} width={bh * 2} height={bb - bt} fill={color} rx="2" />
        {/* 아래꼬리 */}
        <line x1={cx} y1={bb} x2={cx} y2={wb} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {/* 위꼬리 브래킷 */}
        <line x1={cx - bh - 12} y1={wt} x2={cx - bh - 6} y2={wt} stroke="#9ca3af" strokeWidth="0.8" />
        <line x1={cx - bh - 12} y1={bt} x2={cx - bh - 6} y2={bt} stroke="#9ca3af" strokeWidth="0.8" />
        <line x1={cx - bh - 12} y1={wt} x2={cx - bh - 12} y2={bt} stroke="#9ca3af" strokeWidth="0.8" />
        <text x={cx - bh - 14} y={(wt + bt) / 2 + 3} fontSize="8" textAnchor="end" className="fill-gray-400 dark:fill-gray-500">위꼬리</text>
        {/* 몸통 라벨 */}
        <text x={cx} y={(bt + bb) / 2 + 3} fontSize="9" textAnchor="middle" fill="white" opacity={0.85}>몸통</text>
        {/* 아래꼬리 브래킷 */}
        <line x1={cx - bh - 12} y1={bb} x2={cx - bh - 6} y2={bb} stroke="#9ca3af" strokeWidth="0.8" />
        <line x1={cx - bh - 12} y1={wb} x2={cx - bh - 6} y2={wb} stroke="#9ca3af" strokeWidth="0.8" />
        <line x1={cx - bh - 12} y1={bb} x2={cx - bh - 12} y2={wb} stroke="#9ca3af" strokeWidth="0.8" />
        <text x={cx - bh - 14} y={(bb + wb) / 2 + 3} fontSize="8" textAnchor="end" className="fill-gray-400 dark:fill-gray-500">아래꼬리</text>
        {/* 오른쪽 어노테이션 */}
        {rows.map(({ y, lbl, from }) => (
          <g key={lbl}>
            <line x1={from} y1={y} x2={cx + bh + 22} y2={y} stroke="#9ca3af" strokeWidth="0.7" strokeDasharray="3,2" />
            <text x={cx + bh + 25} y={y + 3} fontSize="9" className="fill-gray-700 dark:fill-gray-300">{lbl}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// 대표 패턴 미니 캔들 데이터
const PATTERN_DATA = [
  { cx:18, wt:6, bt:12, bb:24, wb:33, c:'#ef4444' },
  { cx:51, wt:20, bt:25, bb:38, wb:50, c:'#ef4444' },
  { cx:84, wt:36, bt:44, bb:47, wb:76, c:'#10b981' },  // 해머
  { cx:117, wt:31, bt:34, bb:48, wb:51, c:'#10b981' },
  { cx:150, wt:16, bt:19, bb:30, wb:33, c:'#10b981' },
  { cx:183, wt:6, bt:9, bb:18, wb:20, c:'#10b981' },
  { cx:216, wt:2, bt:14, bb:17, wb:19, c:'#ef4444' },  // 슈팅스타
  { cx:249, wt:13, bt:18, bb:34, wb:40, c:'#ef4444' },
  { cx:282, wt:30, bt:35, bb:49, wb:58, c:'#ef4444' },
  { cx:315, wt:45, bt:49, bb:62, wb:71, c:'#ef4444' },
];
const BW = 8;

function PatternMiniChart() {
  return (
    <Card>
      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-2">실제 차트 패턴 예시</p>
      <svg viewBox="0 0 340 105" className="w-full">
        {/* 배경 그리드 */}
        {[20, 45, 70].map(y => (
          <line key={y} x1={0} y1={y} x2={340} y2={y} className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="0.5" />
        ))}

        {/* 해머/슈팅스타 배경 하이라이트 */}
        <rect x={68} y={0} width={36} height={82} fill="#10b98108" rx="3" />
        <rect x={200} y={0} width={36} height={82} fill="#ef444408" rx="3" />

        {/* 캔들 */}
        {PATTERN_DATA.map(({ cx, wt, bt, bb, wb, c }, i) => (
          <g key={i}>
            <line x1={cx} y1={wt} x2={cx} y2={bt} stroke={c} strokeWidth="1.5" strokeLinecap="round" />
            <rect x={cx - BW} y={bt} width={BW * 2} height={Math.max(2, bb - bt)} fill={c} rx="1" />
            <line x1={cx} y1={bb} x2={cx} y2={wb} stroke={c} strokeWidth="1.5" strokeLinecap="round" />
          </g>
        ))}

        {/* 추세선 */}
        <line x1={10} y1={12} x2={84} y2={50} stroke="#ef4444" strokeWidth="0.8" strokeDasharray="4,2" opacity={0.5} />
        <line x1={84} y1={47} x2={200} y2={9} stroke="#10b981" strokeWidth="0.8" strokeDasharray="4,2" opacity={0.5} />
        <line x1={200} y1={14} x2={320} y2={62} stroke="#ef4444" strokeWidth="0.8" strokeDasharray="4,2" opacity={0.5} />

        {/* 해머 어노테이션 */}
        <line x1={84} y1={76} x2={84} y2={88} stroke="#10b981" strokeWidth="0.8" />
        <text x={84} y={97} fontSize="8" textAnchor="middle" fill="#10b981" fontWeight="600">해머</text>

        {/* 슈팅스타 어노테이션 */}
        <line x1={216} y1={19} x2={216} y2={88} stroke="#ef4444" strokeWidth="0.8" />
        <text x={216} y={97} fontSize="8" textAnchor="middle" fill="#ef4444" fontWeight="600">슈팅스타</text>

        {/* 구간 라벨 */}
        <text x={34} y={79} fontSize="7" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500">하락추세</text>
        <text x={142} y={79} fontSize="7" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500">상승추세</text>
        <text x={282} y={79} fontSize="7" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500">하락추세</text>
      </svg>
      <div className="flex gap-4 mt-2 flex-wrap">
        {[
          { c: '#10b981', label: '해머', desc: '하락 반전 신호 — 아랫꼬리가 몸통의 2배 이상' },
          { c: '#ef4444', label: '슈팅스타', desc: '상승 반전 신호 — 윗꼬리가 몸통의 2배 이상' },
        ].map(({ c, label, desc }) => (
          <div key={label} className="flex items-start gap-1.5">
            <div className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ background: c }} />
            <span className="text-[10px] text-gray-500 dark:text-gray-400"><strong style={{ color: c }}>{label}</strong> — {desc}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CandleSection() {
  return (
    <section className="space-y-4">
      <SectionTitle number="01" title="캔들차트 읽기" />
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        캔들(봉) 하나는 특정 기간의 <strong className="text-gray-900 dark:text-white">시가·고가·저가·종가</strong>를 담습니다.
        몸통이 길수록 매수/매도 압력이 강했음을 의미합니다.
      </p>
      <Card>
        <div className="grid grid-cols-2 gap-4">
          <AnnotatedCandle color="#10b981" label="양봉 (상승)" sublabel="종가 > 시가" isUp={true} />
          <AnnotatedCandle color="#ef4444" label="음봉 (하락)" sublabel="종가 < 시가" isUp={false} />
        </div>
      </Card>
      <PatternMiniChart />
      {/* 주요 패턴 카드 */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { name: '도지 (Doji)', desc: '시가 ≈ 종가. 매수·매도 균형 → 추세 전환 가능성', c: '#9ca3af' },
          { name: '장대양봉',     desc: '몸통이 매우 큰 양봉. 강한 매수세 진입',            c: '#10b981' },
          { name: '잠자리형',     desc: '위꼬리 없음. 아래 긴 꼬리 → 저점 지지 신호',      c: '#10b981' },
          { name: '비석형',       desc: '아래꼬리 없음. 위 긴 꼬리 → 고점 저항 신호',      c: '#ef4444' },
        ].map(({ name, desc, c }) => (
          <div key={name} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
            <p className="text-[11px] font-semibold mb-0.5" style={{ color: c }}>{name}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════
   Section 02 — 이동평균선
════════════════════════════════════ */
// 골든크로스/데드크로스 MA 차트
// SVG y: 낮을수록 고가 (y=10=최고, y=105=최저)
const PRICE_PTS = [[0,72],[35,85],[70,78],[105,90],[140,96],[175,80],[210,62],[245,47],[280,55],[315,68],[350,78],[390,88]];
const MA5_PTS   = [[0,70],[35,83],[70,80],[105,88],[140,94],[175,82],[210,64],[245,44],[280,53],[315,66],[350,76],[390,87]];
const MA20_PTS  = [[0,66],[70,74],[140,88],[175,88],[210,80],[245,62],[280,54],[350,62],[390,74]];
// 골든크로스: x≈188 (ma5 y가 ma20 y보다 낮아지는 지점 = ma5가 ma20 위로)
// 데드크로스는 이 차트에서 보여주지 않음

function MAChartSection() {
  return (
    <section className="space-y-4">
      <SectionTitle number="02" title="이동평균선 (MA)" />
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        일정 기간 종가 평균을 연결한 선. 짧을수록 주가에 민감, 길수록 장기 추세를 반영합니다.
      </p>
      <Card>
        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-2">골든크로스 / 데드크로스 예시</p>
        <svg viewBox="0 0 390 120" className="w-full">
          {/* 그리드 */}
          {[30, 60, 90].map(y => (
            <line key={y} x1={0} y1={y} x2={390} y2={y} className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="0.5" />
          ))}
          {/* 골든크로스 구간 하이라이트 */}
          <rect x={160} y={10} width={60} height={95} fill="#10b98108" />
          {/* 주가 */}
          <path d={toPath(PRICE_PTS)} fill="none" className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="1" />
          {/* MA5 */}
          <path d={toPath(MA5_PTS)} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
          {/* MA20 */}
          <path d={toPath(MA20_PTS)} fill="none" stroke="#f59e0b" strokeWidth="2" />
          {/* 골든크로스 원형 마커 */}
          <circle cx={185} cy={84} r={6} fill="none" stroke="#10b981" strokeWidth="1.5" />
          <line x1={191} y1={80} x2={220} y2={60} className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="0.8" />
          <text x={222} y={58} fontSize="8" fill="#10b981" fontWeight="700">골든크로스</text>
          <text x={222} y={67} fontSize="7" className="fill-gray-400 dark:fill-gray-500">MA5가 MA20 상향 돌파</text>
          {/* 범례 */}
          <g transform="translate(0, 110)">
            <line x1={0} y1={0} x2={12} y2={0} className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="1" />
            <text x={15} y={3} fontSize="8" className="fill-gray-400 dark:fill-gray-500">주가</text>
            <line x1={45} y1={0} x2={57} y2={0} stroke="#3b82f6" strokeWidth="1.5" />
            <text x={60} y={3} fontSize="8" className="fill-gray-400 dark:fill-gray-500">MA5</text>
            <line x1={88} y1={0} x2={100} y2={0} stroke="#f59e0b" strokeWidth="2" />
            <text x={103} y={3} fontSize="8" className="fill-gray-400 dark:fill-gray-500">MA20</text>
          </g>
        </svg>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        {[
          { color: '#3b82f6',  ma: 'MA 5',   period: '5일',         desc: '초단기 / 데이트레이딩' },
          { color: '#f59e0b',  ma: 'MA 20',  period: '20일 (1개월)', desc: '단기 추세 (BB 기준선)' },
          { color: '#a855f7',  ma: 'MA 60',  period: '60일 (3개월)', desc: '중기 추세' },
          { color: '#10b981',  ma: 'MA 120', period: '120일 (6개월)', desc: '장기 추세' },
          { color: '#ef4444',  ma: 'MA 200', period: '200일 (약 1년)', desc: '초장기 / 강세·약세장 기준' },
        ].map(({ color, ma, period, desc }) => (
          <div key={ma} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-6 h-0.5 rounded" style={{ background: color }} />
              <span className="text-[11px] font-bold" style={{ color }}>{ma}</span>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">{period}</p>
            <p className="text-[10px] text-gray-700 dark:text-gray-300">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════
   Section 03 — RSI
════════════════════════════════════ */
// RSI 오실레이터 데이터 (0~100 → SVG y: y=rsiToY(v))
// y = 8 + (100 - rsi) * 0.84
const RSI_VALS = [44,50,58,66,74,70,64,54,46,38,32,26,30,38,46,54,60,67,73,68];
function rsiToY(v: number) { return 8 + (100 - v) * 0.84; }

function RSISection() {
  const rsiPts = RSI_VALS.map((v, i) => [i * 19.5, rsiToY(v)]);
  const y70 = rsiToY(70); // ≈34.4
  const y30 = rsiToY(30); // ≈67.2

  // Overbought fill polygon (above 70 line)
  const overPts = rsiPts.filter(([, y]) => y <= y70);
  // Find entry/exit x-intercepts for RSI=70 line
  const overPath = overPts.length
    ? `M${rsiPts[0][0]},${y70} ${rsiPts.map(([x, y]) => `L${x},${Math.min(y, y70)}`).join(' ')} L${rsiPts[rsiPts.length-1][0]},${y70} Z`
    : '';

  // Oversold fill polygon (below 30 line)
  const underPath = `M${rsiPts[0][0]},${y30} ${rsiPts.map(([x, y]) => `L${x},${Math.max(y, y30)}`).join(' ')} L${rsiPts[rsiPts.length-1][0]},${y30} Z`;

  return (
    <section className="space-y-4">
      <SectionTitle number="03" title="RSI (상대강도지수)" />
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        14일간 상승·하락 폭 비율을 0~100으로 나타낸 지표. 과매수·과매도 구간 판단에 활용합니다.
      </p>
      {/* 오실레이터 차트 */}
      <Card>
        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-2">RSI 오실레이터 예시</p>
        <svg viewBox="0 0 390 100" className="w-full">
          {/* 배경 구간 */}
          <rect x={0} y={8}    width={390} height={y70 - 8}       fill="#ef444408" />
          <rect x={0} y={y70}  width={390} height={y30 - y70}     className="fill-gray-100 dark:fill-gray-800" />
          <rect x={0} y={y30}  width={390} height={92 - y30}      fill="#3b82f608" />
          {/* 구간 경계선 */}
          <line x1={0} y1={y70} x2={390} y2={y70} stroke="#ef4444" strokeWidth="0.6" strokeDasharray="3,2" opacity={0.6} />
          <line x1={0} y1={y30} x2={390} y2={y30} stroke="#3b82f6" strokeWidth="0.6" strokeDasharray="3,2" opacity={0.6} />
          {/* 채움 */}
          <path d={overPath}  fill="#ef444420" />
          <path d={underPath} fill="#3b82f620" />
          {/* RSI 라인 */}
          <path d={toPath(rsiPts)} fill="none" stroke="#a855f7" strokeWidth="1.5" />
          {/* 구간 라벨 */}
          <text x={3} y={y70 - 3}  fontSize="8" fill="#ef4444" opacity={0.8}>과매수 (70)</text>
          <text x={3} y={y30 + 8}  fontSize="8" fill="#3b82f6" opacity={0.8}>과매도 (30)</text>
          {/* 오버바웃 마커 */}
          {RSI_VALS.map((v, i) => v >= 70 && (
            <circle key={i} cx={i * 19.5} cy={rsiToY(v)} r={2.5} fill="#ef4444" opacity={0.7} />
          ))}
          {/* 오버솔드 마커 */}
          {RSI_VALS.map((v, i) => v <= 30 && (
            <circle key={i} cx={i * 19.5} cy={rsiToY(v)} r={2.5} fill="#3b82f6" opacity={0.7} />
          ))}
        </svg>
      </Card>
      {/* 판독 가이드 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { range: '70 이상', color: '#ef4444', label: '과매수', desc: '단기 급등. 차익실현·관망 검토' },
          { range: '30~70',  color: '#9ca3af', label: '중립',   desc: '추세 방향 확인 후 판단' },
          { range: '30 이하', color: '#3b82f6', label: '과매도', desc: '단기 낙폭 과대. 반등 가능성' },
        ].map(({ range, color, label, desc }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">{range}</p>
            <p className="text-[11px] font-bold mb-1" style={{ color }}>{label}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">{desc}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        ※ RSI 단독 판단보다 이동평균선·거래량과 함께 복합적으로 해석하는 것을 권장합니다.
      </p>
    </section>
  );
}

/* ════════════════════════════════════
   Section 04 — 거래량
════════════════════════════════════ */
// 가격 캔들 + 거래량 쌍으로 표시
const VOL_CANDLES = [
  { cx:28,  wt:30, bt:35, bb:55, wb:60, c:'#ef4444', vol:35 },
  { cx:68,  wt:42, bt:47, bb:58, wb:65, c:'#ef4444', vol:28 },
  { cx:108, wt:48, bt:52, bb:60, wb:68, c:'#10b981', vol:32 },
  { cx:148, wt:30, bt:34, bb:50, wb:54, c:'#10b981', vol:88, breakout:true }, // 돌파 고거래량
  { cx:188, wt:15, bt:18, bb:32, wb:35, c:'#10b981', vol:60 },
  { cx:228, wt:8,  bt:11, bb:22, wb:25, c:'#10b981', vol:45 },
  { cx:268, wt:12, bt:18, bb:30, wb:35, c:'#ef4444', vol:20, lowVol:true },   // 약한 조정
  { cx:308, wt:22, bt:26, bb:38, wb:43, c:'#10b981', vol:52 },
];
const CHART_BW = 18;

function VolumeSection() {
  return (
    <section className="space-y-4">
      <SectionTitle number="04" title="거래량 (Volume)" />
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        거래량은 해당 기간 실제 매매된 주식 수입니다. 주가 방향과 함께 보면 추세 신뢰도를 판단할 수 있습니다.
      </p>
      <Card>
        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-2">주가 + 거래량 연동 차트</p>
        <svg viewBox="0 0 340 160" className="w-full">
          {/* 구분선 */}
          <line x1={0} y1={85} x2={340} y2={85} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="0.8" />
          <text x={2} y={10} fontSize="7" className="fill-gray-400 dark:fill-gray-500">주가</text>
          <text x={2} y={96} fontSize="7" className="fill-gray-400 dark:fill-gray-500">거래량</text>

          {/* 캔들 */}
          {VOL_CANDLES.map(({ cx, wt, bt, bb, wb, c }) => (
            <g key={cx}>
              <line x1={cx} y1={wt} x2={cx} y2={bt} stroke={c} strokeWidth="1.5" strokeLinecap="round" />
              <rect x={cx - CHART_BW / 2} y={bt} width={CHART_BW} height={Math.max(2, bb - bt)} fill={c} rx="1" />
              <line x1={cx} y1={bb} x2={cx} y2={wb} stroke={c} strokeWidth="1.5" strokeLinecap="round" />
            </g>
          ))}

          {/* 거래량 바 (y=85부터 아래로) */}
          {VOL_CANDLES.map(({ cx, c, vol, breakout, lowVol }) => (
            <g key={`vol-${cx}`}>
              <rect
                x={cx - CHART_BW / 2} y={85 + (70 - vol)} width={CHART_BW} height={vol}
                fill={c} opacity={breakout ? 0.9 : 0.5} rx="1"
              />
              {breakout && (
                <>
                  <line x1={cx} y1={85 + (70 - vol) - 3} x2={cx} y2={85 + (70 - vol) - 12} stroke={c} strokeWidth="0.8" />
                  <text x={cx + 4} y={85 + (70 - vol) - 13} fontSize="7" fill={c} fontWeight="700">고거래량</text>
                  <text x={cx + 4} y={85 + (70 - vol) - 5}  fontSize="6" className="fill-gray-400 dark:fill-gray-500">돌파 신뢰</text>
                </>
              )}
              {lowVol && (
                <>
                  <line x1={cx} y1={85 + (70 - vol) - 3} x2={cx} y2={85 + (70 - vol) - 12} stroke="#9ca3af" strokeWidth="0.8" />
                  <text x={cx - 32} y={85 + (70 - vol) - 5} fontSize="7" className="fill-gray-400 dark:fill-gray-500">저거래량</text>
                </>
              )}
            </g>
          ))}
        </svg>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: '📈', title: '상승 + 고거래량', desc: '강한 매수세. 추세 신뢰도 높음' },
          { icon: '📉', title: '하락 + 고거래량', desc: '매도 압력 강함. 추가 하락 가능' },
          { icon: '↗',  title: '상승 + 저거래량', desc: '참여자 적음. 지속성 불확실' },
          { icon: '↘',  title: '하락 + 저거래량', desc: '약한 하락. 반등 가능성 존재' },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 flex gap-2 items-start">
            <span className="text-sm">{icon}</span>
            <div>
              <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-200">{title}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════
   Section 05 — 차트 패턴
════════════════════════════════════ */
type PatternEntry = {
  name: string;
  desc: string;
  price: string;
  refs?: string[];
};
type PatternGroup = {
  label: string;
  tag: string;
  tagColor: string;
  lineColor: string;
  patterns: PatternEntry[];
};

const CHART_PATTERN_GROUPS: PatternGroup[] = [
  {
    label: '상승패턴', tag: '지속 ↑',
    tagColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400',
    lineColor: '#10b981',
    patterns: [
      { name: '상승삼각형', desc: '저점이 높아지며 수평 저항에 수렴. 상향 돌파 시 매수',
        price: 'M5,47 L15,18 L24,36 L33,18 L43,30 L52,18 L62,24 L70,18 L77,10',
        refs: ['M5,18 L77,18', 'M5,47 L65,22'] },
      { name: '상승플래그', desc: '급등 후 소폭 하향 채널 형성. 이탈 시 강한 매수 신호',
        price: 'M5,48 L18,14 L26,19 L34,23 L42,18 L50,24 L58,19 L66,12',
        refs: ['M18,14 L58,19', 'M18,22 L58,28'] },
      { name: '상승페넌트', desc: '급등 후 삼각 수렴 형성. 상향 돌파 시 매수',
        price: 'M5,48 L18,12 L26,17 L33,14 L40,17 L47,15 L54,15 L62,9',
        refs: ['M18,12 L54,15', 'M18,20 L54,15'] },
      { name: '컵 앤 핸들', desc: 'U형 바닥 + 소폭 조정 핸들. 핸들 상단 이탈 시 매수',
        price: 'M5,32 L10,28 C18,44 52,44 58,28 L63,31 L68,28 L75,20' },
      { name: '삼각수렴', desc: '상하 추세선 수렴. 거래량 감소 → 이탈 방향 추종',
        price: 'M5,45 L14,12 L24,40 L34,18 L44,36 L54,22 L62,30 L68,27',
        refs: ['M5,45 L68,27', 'M5,12 L68,27'] },
    ],
  },
  {
    label: '상승 반전패턴', tag: '반전 ↑',
    tagColor: 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
    lineColor: '#3b82f6',
    patterns: [
      { name: '쌍바닥 (W)', desc: '두 번의 저점 → 네크라인 돌파. 강한 반등 신호',
        price: 'M5,18 L20,42 L34,28 L50,42 L65,18 L72,12',
        refs: ['M20,28 L65,28'] },
      { name: '3중바닥', desc: '세 번의 저점. 네크라인 돌파 시 강력한 반전',
        price: 'M5,18 L14,42 L22,28 L32,42 L42,28 L52,42 L62,18 L70,10',
        refs: ['M14,28 L62,28'] },
      { name: '하락쐐기 (강세)', desc: '하락 중 수렴 쐐기. 상향 돌파 시 반전 신호',
        price: 'M5,14 L15,28 L25,20 L35,32 L45,26 L55,36 L65,30 L72,22',
        refs: ['M5,14 L65,30', 'M5,24 L65,40'] },
      { name: '역 헤드 앤 숄더', desc: '역전형 H&S. 네크라인 돌파 시 상승 반전',
        price: 'M5,22 L12,32 L18,22 L25,44 L32,22 L40,32 L48,22 L58,10 L72,8',
        refs: ['M12,22 L52,22'] },
      { name: '라운드 바텀', desc: '완만한 U형 바닥. 중장기 반전 신호',
        price: 'M5,20 C22,44 52,44 68,20 L75,12' },
    ],
  },
  {
    label: '하락패턴', tag: '지속 ↓',
    tagColor: 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
    lineColor: '#ef4444',
    patterns: [
      { name: '하락삼각형', desc: '고점이 낮아지며 수평 지지에 수렴. 하향 이탈 시 매도',
        price: 'M5,14 L15,38 L24,26 L34,38 L44,32 L54,38 L64,44',
        refs: ['M5,38 L70,38', 'M5,14 L60,32'] },
      { name: '하락플래그', desc: '급락 후 소폭 상향 채널. 이탈 시 강한 매도 신호',
        price: 'M5,10 L18,44 L26,40 L34,36 L42,40 L50,36 L58,40 L66,48',
        refs: ['M18,44 L58,40', 'M18,36 L58,32'] },
      { name: '하락페넌트', desc: '급락 후 삼각 수렴. 하향 이탈 시 매도',
        price: 'M5,10 L18,44 L26,38 L33,42 L40,38 L47,40 L54,40 L62,48',
        refs: ['M18,44 L54,40', 'M18,36 L54,40'] },
      { name: '상승쐐기 (약세)', desc: '상승 중 수렴 쐐기. 하향 이탈 시 하락 신호',
        price: 'M5,42 L15,28 L25,34 L35,22 L45,28 L55,18 L65,48',
        refs: ['M5,42 L58,20', 'M5,30 L58,14'] },
    ],
  },
  {
    label: '하락 반전패턴', tag: '반전 ↓',
    tagColor: 'text-orange-700 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400',
    lineColor: '#f97316',
    patterns: [
      { name: '더블탑 (M)', desc: '두 번의 고점 → 네크라인 이탈. 강한 하락 신호',
        price: 'M5,40 L18,14 L30,28 L44,14 L56,28 L65,40 L72,48',
        refs: ['M18,28 L60,28'] },
      { name: '트리플탑', desc: '세 번의 고점. 네크라인 이탈 시 강력한 하락 반전',
        price: 'M5,40 L13,14 L22,28 L32,14 L42,28 L52,14 L62,28 L70,40 L75,48',
        refs: ['M13,28 L62,28'] },
      { name: '헤드 앤 숄더', desc: '왼어깨-머리-오른어깨. 네크라인 이탈 시 매도',
        price: 'M5,38 L13,26 L18,34 L26,12 L34,34 L42,26 L50,34 L60,46 L72,50',
        refs: ['M13,34 L52,34'] },
      { name: '라운드탑', desc: '완만한 아치형 고점. 서서히 하락 전환',
        price: 'M5,36 C22,12 55,12 72,36 L78,46' },
      { name: '브로드닝탑', desc: '변동폭 확대. 고저점 폭이 커지며 불안정',
        price: 'M10,28 L20,18 L30,36 L40,12 L50,42 L60,8 L70,46',
        refs: ['M10,28 L70,8', 'M10,28 L70,46'] },
      { name: '다이아몬드탑', desc: '확장 후 수렴. 드문 반전 패턴, 이탈 시 급변',
        price: 'M5,28 L20,10 L35,36 L50,8 L65,36 L75,28 L65,44 L50,46 L35,40 L20,46 L5,28',
        refs: ['M5,28 L50,8', 'M5,28 L50,46', 'M50,8 L75,28', 'M50,46 L75,28'] },
    ],
  },
];

function PatternCard({ pattern, lineColor }: { pattern: PatternEntry; lineColor: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg p-2">
      <svg viewBox="0 0 80 55" className="w-full mb-1">
        {pattern.refs?.map((d, i) => (
          <path key={i} d={d} fill="none"
            className="stroke-gray-300 dark:stroke-gray-600"
            strokeWidth="0.8" strokeDasharray="3,2" />
        ))}
        <path d={pattern.price} fill="none" stroke={lineColor}
          strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 leading-tight">{pattern.name}</p>
      <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{pattern.desc}</p>
    </div>
  );
}

function ChartPatternsSection() {
  return (
    <section className="space-y-5">
      <SectionTitle number="05" title="차트 패턴" />
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        주가의 반복되는 움직임 패턴을 인식해 추세 지속·반전을 예측합니다.
        <strong className="text-gray-900 dark:text-white"> 거래량과 함께</strong> 확인하면 신뢰도가 높아집니다.
      </p>
      {CHART_PATTERN_GROUPS.map(({ label, tag, tagColor, lineColor, patterns }) => (
        <div key={label}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tagColor}`}>{tag}</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {patterns.map((p) => (
              <PatternCard key={p.name} pattern={p} lineColor={lineColor} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ════════════════════════════════════
   Section 06 — 용어
════════════════════════════════════ */
function TermsSection() {
  return (
    <section className="space-y-3">
      <SectionTitle number="06" title="주요 주식 용어" />
      <div className="grid grid-cols-1 gap-2">
        {TERMS.map(({ term, desc }) => (
          <div key={term} className="flex gap-3 p-2.5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg">
            <dt className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0 w-28">{term}</dt>
            <dd className="text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed">{desc}</dd>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════
   Section 07 — 볼린저밴드
════════════════════════════════════ */
const BB_UPPER = [[0,28],[60,32],[120,46],[160,50],[200,50],[240,38],[280,22],[330,10],[380,6]];
const BB_MID   = [[0,55],[60,56],[120,58],[160,57],[200,56],[240,48],[280,38],[330,25],[380,18]];
const BB_LOWER = [[0,82],[60,80],[120,70],[160,65],[200,64],[240,62],[280,54],[330,40],[380,30]];
const BB_PRICE = [[0,52],[40,48],[80,58],[120,55],[160,54],[190,52],[220,46],[250,37],[275,26],[300,14],[330,6],[360,3],[380,3]];

function BBSection() {
  const upperPath = toPath(BB_UPPER);
  const midPath   = toPath(BB_MID);
  const lowerPath = toPath(BB_LOWER);
  const pricePath = toPath(BB_PRICE);
  const fillPath  =
    BB_UPPER.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + ' ' +
    [...BB_LOWER].reverse().map(([x, y]) => `L${x},${y}`).join(' ') + ' Z';

  return (
    <section className="space-y-4">
      <SectionTitle number="07" title="볼린저밴드 (BB)" />
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        주가가 <strong className="text-gray-900 dark:text-white">"정상 범위"를 벗어났는지</strong> 판단하는 변동성 지표입니다.
        MA20을 중심으로 ±2 표준편차 거리에 두 밴드를 그리며,
        통계적으로 주가는 <strong className="text-gray-900 dark:text-white">95% 확률</strong>로 이 밴드 안에 머뭅니다.
      </p>

      {/* 핵심 해석 2가지 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5">
          <p className="text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-1">① 밴드 폭 → 변동성</p>
          <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-snug">
            <span className="font-medium text-gray-800 dark:text-gray-200">좁아질수록 (스퀴즈)</span> → 시장이 조용함 → 곧 큰 움직임 예고<br />
            <span className="font-medium text-gray-800 dark:text-gray-200">넓어질수록</span> → 현재 변동성이 큰 상태
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5">
          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 mb-1">② 가격 위치 → 과열/침체</p>
          <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-snug">
            <span className="font-medium text-gray-800 dark:text-gray-200">상단 터치</span> → "지금 비싼 편" → 과매수 가능성<br />
            <span className="font-medium text-gray-800 dark:text-gray-200">하단 터치</span> → "지금 싼 편" → 과매도 가능성
          </p>
        </div>
      </div>

      <Card>
        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-2">볼린저밴드 구조 예시</p>
        <svg viewBox="0 0 390 108" className="w-full">
          {[30, 57, 82].map(y => (
            <line key={y} x1={0} y1={y} x2={390} y2={y} className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="0.5" />
          ))}
          {/* 스퀴즈 구간 */}
          <rect x={120} y={0} width={90} height={100} fill="#a855f710" rx="2" />
          {/* 채움 */}
          <path d={fillPath} fill="rgba(147,197,253,0.12)" stroke="none" />
          {/* 하단 BB */}
          <path d={lowerPath} fill="none" stroke="#93c5fd" strokeWidth="1.2" strokeDasharray="4,2" />
          {/* 상단 BB */}
          <path d={upperPath} fill="none" stroke="#93c5fd" strokeWidth="1.2" strokeDasharray="4,2" />
          {/* 중단 (MA20) */}
          <path d={midPath} fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity={0.7} />
          {/* 주가 */}
          <path d={pricePath} fill="none" stroke="#6b7280" strokeWidth="1.3" />
          {/* 스퀴즈 라벨 */}
          <text x={165} y={104} fontSize="7" textAnchor="middle" fill="#a855f7" fontWeight="600">스퀴즈</text>
          <line x1={165} y1={47} x2={165} y2={98} stroke="#a855f7" strokeWidth="0.7" strokeDasharray="2,2" />
          {/* 상단 돌파 마커 */}
          <circle cx={300} cy={14} r={4} fill="none" stroke="#ef4444" strokeWidth="1.2" />
          <line x1={304} y1={10} x2={332} y2={2} stroke="#9ca3af" strokeWidth="0.6" />
          <text x={334} y={4} fontSize="7" fill="#ef4444" fontWeight="600">상단 돌파</text>
          {/* 범례 */}
          <g transform="translate(0,100)">
            <line x1={0} y1={0} x2={12} y2={0} stroke="#93c5fd" strokeWidth="1.2" strokeDasharray="4,2" />
            <text x={15} y={3} fontSize="7" className="fill-gray-500 dark:fill-gray-400">상/하단 BB</text>
            <line x1={78} y1={0} x2={90} y2={0} stroke="#f59e0b" strokeWidth="1.2" />
            <text x={93} y={3} fontSize="7" className="fill-gray-500 dark:fill-gray-400">중단(MA20)</text>
            <line x1={158} y1={0} x2={170} y2={0} stroke="#6b7280" strokeWidth="1.2" />
            <text x={173} y={3} fontSize="7" className="fill-gray-500 dark:fill-gray-400">주가</text>
          </g>
        </svg>
      </Card>

      {/* 구성 요소 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { color: '#93c5fd', label: '상단 밴드', formula: 'MA20 + 2σ', desc: '과매수 기준. 접촉 시 저항 가능성' },
          { color: '#f59e0b', label: '중단 밴드', formula: 'MA20',       desc: '기준 이동평균선. 추세 방향 확인' },
          { color: '#93c5fd', label: '하단 밴드', formula: 'MA20 − 2σ', desc: '과매도 기준. 접촉 시 지지 가능성' },
        ].map(({ color, label, formula, desc }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 text-center">
            <div className="w-8 h-0.5 mx-auto mb-1.5 rounded" style={{ background: color }} />
            <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200">{label}</p>
            <p className="text-[10px] font-mono text-blue-500 my-0.5">{formula}</p>
            <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-snug">{desc}</p>
          </div>
        ))}
      </div>

      {/* 신호 해석 */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: '⟺', title: '스퀴즈', color: '#a855f7', desc: '밴드가 좁아짐. 변동성 수축 → 곧 큰 방향성 이탈 예고' },
          { icon: '↔',  title: '밴드 확장', color: '#3b82f6', desc: '밴드가 넓어짐. 현재 추세가 강하게 진행 중' },
          { icon: '▲',  title: '상단 터치/돌파', color: '#ef4444', desc: '과매수 구간. 단기 조정 가능성. 강한 추세면 상단을 타고 상승 지속' },
          { icon: '▼',  title: '하단 터치/돌파', color: '#10b981', desc: '과매도 구간. 단기 반등 가능성. 약한 추세면 하단 따라 하락 지속' },
        ].map(({ icon, title, color, desc }) => (
          <div key={title} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-bold" style={{ color }}>{icon}</span>
              <p className="text-[11px] font-semibold" style={{ color }}>{title}</p>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">{desc}</p>
          </div>
        ))}
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2.5">
        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">주의할 점</p>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
          강한 <strong className="text-gray-700 dark:text-gray-200">상승 추세</strong> 중에는 주가가 상단 밴드를 따라 계속 위로 이동합니다.
          "상단에 닿았으니 떨어지겠지"가 아니라, <strong className="text-gray-700 dark:text-gray-200">추세 방향 확인이 먼저</strong>입니다.
          RSI와 함께 보는 것을 권장합니다.
        </p>
      </div>
    </section>
  );
}

/* ════════════════════════════════════
   Panel Root
════════════════════════════════════ */
const SECTIONS = ['01 캔들차트', '02 이동평균선', '03 RSI', '04 거래량', '05 차트패턴', '06 용어', '07 볼린저밴드'];

export default function GuidePanel({ onClose }: Props) {
  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">📚</span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">주식 가이드</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-medium">용어·차트 읽기</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          aria-label="닫기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 섹션 퀵 네비게이션 */}
      <div className="flex gap-1 px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              const el = document.getElementById(`guide-sec-${s.slice(0, 2)}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="shrink-0 text-[10px] px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {/* 스크롤 콘텐츠 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-10">
          <div id="guide-sec-01"><CandleSection /></div>
          <div id="guide-sec-02"><MAChartSection /></div>
          <div id="guide-sec-03"><RSISection /></div>
          <div id="guide-sec-04"><VolumeSection /></div>
          <div id="guide-sec-05"><ChartPatternsSection /></div>
          <div id="guide-sec-06"><TermsSection /></div>
          <div id="guide-sec-07"><BBSection /></div>
          <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center pb-4">
            투자 판단의 참고 자료이며, 투자 손익의 책임은 본인에게 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
