'use client';
import { useEffect, useRef, useState } from 'react';
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, LineSeries, HistogramSeries,
  type ISeriesApi, type IChartApi, type Time,
} from 'lightweight-charts';
import { detectPatterns, type DetectedPattern } from '@/lib/detectPatterns';

export interface ChartCandle {
  time: string; open: number; high: number; low: number; close: number; volume: number;
}
export interface MAPoint { time: string; value: number; }
export interface ChartDataPayload {
  candles: ChartCandle[];
  maLines: {
    ma5: MAPoint[]; ma20: MAPoint[]; ma60: MAPoint[];
    ma120: MAPoint[]; ma200: MAPoint[];
  };
  rsiLine?: { time: string; value: number }[];
}

const MA_CONFIG = [
  { key: 'ma5'   as const, color: '#3b82f6', label: 'MA5' },
  { key: 'ma20'  as const, color: '#f59e0b', label: 'MA20' },
  { key: 'ma60'  as const, color: '#a855f7', label: 'MA60' },
  { key: 'ma120' as const, color: '#10b981', label: 'MA120' },
  { key: 'ma200' as const, color: '#ef4444', label: 'MA200' },
];

const DEFAULT_ACTIVE_MA = new Set<string>(['ma20', 'ma60', 'ma120']);

const PATTERN_COLOR: Record<string, string> = {
  bullish: '#10b981',
  bearish: '#ef4444',
  neutral: '#f59e0b',
};

function chartColors(dark: boolean) {
  return {
    bg:     dark ? '#111827' : '#ffffff',
    grid:   dark ? '#1f2937' : '#f3f4f6',
    text:   dark ? '#9ca3af' : '#6b7280',
    border: dark ? '#374151' : '#e5e7eb',
  };
}

/* ── SVG path 빌더 — null(화면 밖) 좌표에서 끊김 처리 ── */
function buildPath(coords: ({ x: number; y: number } | null)[]): string {
  let d = '';
  let gap = true;
  for (const c of coords) {
    if (!c) { gap = true; continue; }
    d += gap ? `M${c.x.toFixed(1)},${c.y.toFixed(1)}` : `L${c.x.toFixed(1)},${c.y.toFixed(1)}`;
    gap = false;
  }
  return d;
}

/* ── 단일 패턴 오버레이 ── */
function PatternPath({
  pattern,
  getXY,
  labelOffset,
}: {
  pattern: DetectedPattern;
  getXY: (time: string, price: number) => { x: number; y: number } | null;
  labelOffset: number; // 레이블 y 오프셋 (겹침 방지)
}) {
  const color = PATTERN_COLOR[pattern.signal];

  /* 구조선 좌표 */
  const ptCoords = pattern.points.map(p => getXY(p.time, p.price));
  const pathD = buildPath(ptCoords);
  if (!pathD) return null;

  /* 네크라인 */
  let neckEl: React.ReactNode = null;
  if (pattern.necklinePrice != null && pattern.necklineStart && pattern.necklineEnd) {
    const nL = getXY(pattern.necklineStart, pattern.necklinePrice);
    const nR = getXY(pattern.necklineEnd,   pattern.necklinePrice);
    if (nL && nR) {
      neckEl = (
        <line
          x1={nL.x} y1={nL.y} x2={nR.x} y2={nR.y}
          stroke={color} strokeWidth="1.2" strokeDasharray="5,3" opacity={0.75}
        />
      );
    }
  }

  /* 레이블 위치: 첫 번째 유효한 좌표의 상단 */
  const visibleCoords = ptCoords.filter(Boolean) as { x: number; y: number }[];
  if (!visibleCoords.length) return null;
  const labelX = visibleCoords.reduce((s, c) => s + c.x, 0) / visibleCoords.length;
  const labelY = Math.max(20, Math.min(...visibleCoords.map(c => c.y)) - 12 + labelOffset);

  const arrow  = pattern.signal === 'bullish' ? '▲' : pattern.signal === 'bearish' ? '▼' : '◆';
  const pct    = Math.round(pattern.confidence * 100);
  const label  = `${arrow} ${pattern.nameKo} ${pct}%`;
  const lblW   = label.length * 5.8 + 12;

  /* 피벗 점 */
  const dotEls = ptCoords.map((c, i) =>
    c ? <circle key={i} cx={c.x} cy={c.y} r={3} fill={color} opacity={0.8} /> : null
  );

  return (
    <g>
      {/* 구조선 */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      {/* 피벗 점 */}
      {dotEls}
      {/* 네크라인 */}
      {neckEl}
      {/* 레이블 배경 */}
      <rect
        x={labelX - lblW / 2} y={labelY - 11}
        width={lblW} height={14} rx={3}
        fill={color} opacity={0.92}
      />
      {/* 레이블 텍스트 */}
      <text
        x={labelX} y={labelY}
        textAnchor="middle" fontSize={9}
        fill="white" fontWeight="700" fontFamily="system-ui,sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

interface OhlcTooltip { open: number; high: number; low: number; close: number; change: number; }
interface Props { data: ChartDataPayload; ticker: string; }

export default function CandlestickChart({ data, ticker }: Props) {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef  = useRef<HTMLDivElement>(null);
  const mainChartRef   = useRef<IChartApi | null>(null);
  const rsiChartRef    = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const maSeriesRef    = useRef<Partial<Record<string, ISeriesApi<'Line'>>>>({});

  const [activeMA,        setActiveMA]        = useState<Set<string>>(DEFAULT_ACTIVE_MA);
  const [ohlc,            setOhlc]            = useState<OhlcTooltip | null>(null);
  const [detectedPats,    setDetectedPats]    = useState<DetectedPattern[]>([]);
  const [overlayVersion,  setOverlayVersion]  = useState(0);
  const [showPatterns,    setShowPatterns]    = useState(true);

  /* 패턴 감지 후 RAF 한 프레임 기다려 좌표 재계산 */
  useEffect(() => {
    if (!detectedPats.length) return;
    const raf = requestAnimationFrame(() => setOverlayVersion(v => v + 1));
    return () => cancelAnimationFrame(raf);
  }, [detectedPats]);

  /* 좌표 변환 — 화면 밖이면 null */
  function getXY(time: string, price: number): { x: number; y: number } | null {
    const chart  = mainChartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(time as Time);
    const y = series.priceToCoordinate(price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  const toggleMA = (key: string) => {
    setActiveMA(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  /* MA 가시성 토글 */
  useEffect(() => {
    for (const ma of MA_CONFIG) {
      maSeriesRef.current[ma.key]?.applyOptions({ visible: activeMA.has(ma.key) });
    }
  }, [activeMA]);

  /* 차트 생성/파괴 */
  useEffect(() => {
    const mainEl = mainRef.current;
    const rsiEl  = rsiRef.current;
    if (!mainEl || !rsiEl || !data.candles.length) return;

    const dark = document.documentElement.classList.contains('dark');
    const c = chartColors(dark);

    const mainChart = createChart(mainEl, {
      width: mainEl.clientWidth,
      height: 250,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: false },
    });
    mainChartRef.current = mainChart;

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    candleSeries.setData(data.candles);
    candleSeriesRef.current = candleSeries;

    maSeriesRef.current = {};
    for (const ma of MA_CONFIG) {
      const pts = data.maLines[ma.key];
      if (!pts.length) continue;
      const series = mainChart.addSeries(LineSeries, {
        color: ma.color, lineWidth: 1,
        visible: activeMA.has(ma.key),
        priceLineVisible: false, lastValueVisible: false,
      });
      series.setData(pts);
      maSeriesRef.current[ma.key] = series;
    }

    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.setData(
      data.candles.map(cd => ({
        time: cd.time, value: cd.volume,
        color: cd.close >= cd.open ? '#10b98133' : '#ef444433',
      }))
    );
    mainChart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    mainChart.subscribeCrosshairMove((param) => {
      if (!param.time) { setOhlc(null); return; }
      const cd = param.seriesData.get(candleSeries) as
        { open: number; high: number; low: number; close: number } | undefined;
      if (cd) setOhlc({ open: cd.open, high: cd.high, low: cd.low, close: cd.close,
        change: ((cd.close - cd.open) / cd.open) * 100 });
    });

    const rsiChart = createChart(rsiEl, {
      width: rsiEl.clientWidth,
      height: 80,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: c.border, timeVisible: true },
    });
    rsiChartRef.current = rsiChart;

    const rsiLine = data.rsiLine ?? [];
    if (rsiLine.length > 0) {
      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#818cf8', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: true,
      });
      rsiSeries.setData(rsiLine);
      rsiSeries.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
      rsiSeries.createPriceLine({ price: 50, color: '#4b5563', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      rsiSeries.createPriceLine({ price: 30, color: '#3b82f6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
    }

    mainChart.timeScale().fitContent();
    rsiChart.timeScale().fitContent();

    /* 두 차트 시간축 동기화 */
    let syncing = false;
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || !range) return;
      syncing = true;
      rsiChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
      setOverlayVersion(v => v + 1); // 오버레이 좌표 갱신
    });
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || !range) return;
      syncing = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    });

    /* 패턴 감지 */
    setDetectedPats(detectPatterns(data.candles));

    const onResize = () => {
      if (mainRef.current) mainChart.applyOptions({ width: mainRef.current.clientWidth });
      if (rsiRef.current)  rsiChart.applyOptions({ width: rsiRef.current.clientWidth });
      setOverlayVersion(v => v + 1);
    };
    window.addEventListener('resize', onResize);

    const observer = new MutationObserver(() => {
      const d = document.documentElement.classList.contains('dark');
      const colors = chartColors(d);
      const opts = {
        layout: { background: { type: ColorType.Solid, color: colors.bg }, textColor: colors.text },
        grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
        rightPriceScale: { borderColor: colors.border },
        timeScale: { borderColor: colors.border },
      };
      mainChart.applyOptions(opts);
      rsiChart.applyOptions(opts);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      mainChart.remove();
      rsiChart.remove();
      mainChartRef.current    = null;
      rsiChartRef.current     = null;
      candleSeriesRef.current = null;
      maSeriesRef.current     = {};
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastCandle = data.candles[data.candles.length - 1];
  const displayOhlc: OhlcTooltip | null = ohlc ?? (lastCandle
    ? { open: lastCandle.open, high: lastCandle.high, low: lastCandle.low, close: lastCandle.close,
        change: ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100 }
    : null);

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
      {/* 헤더: 티커 + OHLC + MA 토글 + 패턴 토글 */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">{ticker}</span>
          {displayOhlc && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono whitespace-nowrap">
              <span className="text-gray-400">O</span>
              <span className="text-gray-700 dark:text-gray-200">{displayOhlc.open.toFixed(2)}</span>
              <span className="text-gray-400">H</span>
              <span className="text-green-500">{displayOhlc.high.toFixed(2)}</span>
              <span className="text-gray-400">L</span>
              <span className="text-red-500">{displayOhlc.low.toFixed(2)}</span>
              <span className="text-gray-400">C</span>
              <span className="text-gray-700 dark:text-gray-200">{displayOhlc.close.toFixed(2)}</span>
              <span className={displayOhlc.change >= 0 ? 'text-green-500' : 'text-red-500'}>
                {displayOhlc.change >= 0 ? '+' : ''}{displayOhlc.change.toFixed(2)}%
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* 패턴 감지 토글 */}
          {detectedPats.length > 0 && (
            <button
              onClick={() => setShowPatterns(v => !v)}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                showPatterns
                  ? 'border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 text-gray-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: showPatterns ? '#3b82f6' : '#9ca3af' }} />
              패턴 {detectedPats.length}
            </button>
          )}

          {/* MA 토글 */}
          {MA_CONFIG.map(ma => (
            <button key={ma.key} type="button" onClick={() => toggleMA(ma.key)}
              title={activeMA.has(ma.key) ? `${ma.label} 숨기기` : `${ma.label} 표시`}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-opacity ${
                activeMA.has(ma.key) ? 'opacity-100' : 'opacity-25'
              }`}
            >
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: ma.color }} />
              {ma.label}
            </button>
          ))}
        </div>
      </div>

      {/* 메인 차트 + 패턴 SVG 오버레이 */}
      <div style={{ position: 'relative' }}>
        <div ref={mainRef} className="w-full" />

        {/* 패턴 오버레이 SVG */}
        {showPatterns && detectedPats.length > 0 && mainChartRef.current && (
          <svg
            key={overlayVersion}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: 250,
              pointerEvents: 'none', overflow: 'hidden',
              zIndex: 10,
            }}
          >
            {detectedPats.map((pat, i) => (
              <PatternPath
                key={pat.type + i}
                pattern={pat}
                getXY={getXY}
                labelOffset={i * 18} // 레이블 겹침 방지
              />
            ))}
          </svg>
        )}
      </div>

      {/* 감지된 패턴 요약 배지 + 설명 */}
      {showPatterns && detectedPats.length > 0 && (
        <div className="px-4 pb-2 flex flex-col gap-1">
          {detectedPats.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <span
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5"
                style={{
                  background: PATTERN_COLOR[p.signal] + '18',
                  color: PATTERN_COLOR[p.signal],
                  border: `1px solid ${PATTERN_COLOR[p.signal]}40`,
                }}
              >
                {p.signal === 'bullish' ? '▲' : p.signal === 'bearish' ? '▼' : '◆'}
                {p.nameKo}
                <span className="opacity-60">{Math.round(p.confidence * 100)}%</span>
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight pt-0.5">
                {p.description}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* RSI 패널 */}
      <div className="px-4 pt-1">
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">RSI(14)</span>
      </div>
      <div ref={rsiRef} className="w-full" />
    </div>
  );
}
