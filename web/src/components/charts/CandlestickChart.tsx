'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, createSeriesMarkers, ColorType, CrosshairMode,
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
  bbLines?: { upper: MAPoint[]; lower: MAPoint[] };
  volSpikes?: string[];
  sector?: string;
  industry?: string;
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

/* ── 볼린저밴드 상/하단 채움 오버레이 ── */
function BBFill({
  upper, lower, getXY,
}: {
  upper: MAPoint[];
  lower: MAPoint[];
  getXY: (time: string, price: number) => { x: number; y: number } | null;
}) {
  const validPairs = upper
    .map((u, i) => ({ u: getXY(u.time, u.value), l: getXY(lower[i]?.time ?? u.time, lower[i]?.value ?? 0) }))
    .filter((p): p is { u: { x: number; y: number }; l: { x: number; y: number } } => p.u !== null && p.l !== null);

  if (!validPairs.length) return null;

  const pathUp   = validPairs.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.u.x.toFixed(1)},${p.u.y.toFixed(1)}`).join(' ');
  const pathDown = [...validPairs].reverse().map(p => `L${p.l.x.toFixed(1)},${p.l.y.toFixed(1)}`).join(' ');

  return <path d={`${pathUp} ${pathDown} Z`} fill="rgba(147,197,253,0.08)" stroke="none" />;
}

const PERIODS = ['3m', '6m', '1y', '2y', '3y'] as const;

function computeTargets(data: ChartDataPayload) {
  const last = data.candles[data.candles.length - 1];
  if (!last) return null;
  const price = last.close;
  const lastVal = (arr: MAPoint[]) => arr.length ? arr[arr.length - 1].value : null;

  const ma60  = lastVal(data.maLines.ma60);
  const ma120 = lastVal(data.maLines.ma120);
  const ma200 = lastVal(data.maLines.ma200);
  const bbUpper = data.bbLines ? lastVal(data.bbLines.upper) : null;
  const bbLower = data.bbLines ? lastVal(data.bbLines.lower) : null;

  const supports = [ma60, ma120, ma200, bbLower]
    .filter((v): v is number => v != null && v < price * 0.999);
  const support = supports.length ? Math.max(...supports) : null;

  const recentHigh = data.candles.slice(-20).reduce((m, c) => Math.max(m, c.high), 0);
  const resistances = [bbUpper, recentHigh > price * 1.005 ? recentHigh : null]
    .filter((v): v is number => v != null && v > price * 1.001);
  const resistance = resistances.length ? Math.min(...resistances) : null;

  const stopLoss = support ? +(support * 0.982).toFixed(2) : null;
  return { support: support ? +support.toFixed(2) : null, resistance: resistance ? +resistance.toFixed(2) : null, stopLoss };
}

interface OhlcTooltip { open: number; high: number; low: number; close: number; change: number; }
interface Props {
  data: ChartDataPayload;
  ticker: string;
  period: string;
  onPeriodChange: (p: string) => void;
  onPatternsDetected?: (patterns: DetectedPattern[]) => void;
  onAnalyzeChart?: () => void;
  isAnalyzingChart?: boolean;
}

export default function CandlestickChart({ data, ticker, period, onPeriodChange, onPatternsDetected, onAnalyzeChart, isAnalyzingChart }: Props) {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef  = useRef<HTMLDivElement>(null);
  const mainChartRef   = useRef<IChartApi | null>(null);
  const rsiChartRef    = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const maSeriesRef    = useRef<Partial<Record<string, ISeriesApi<'Line'>>>>({});

  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volMarkersRef = useRef<{ detach: () => void } | null>(null);
  const onPatsRef = useRef(onPatternsDetected);
  useEffect(() => { onPatsRef.current = onPatternsDetected; }, [onPatternsDetected]);

  const [activeMA,        setActiveMA]        = useState<Set<string>>(DEFAULT_ACTIVE_MA);
  const [showBB,          setShowBB]          = useState(false);
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

  /* BB 가시성 토글 */
  useEffect(() => {
    bbUpperRef.current?.applyOptions({ visible: showBB });
    bbLowerRef.current?.applyOptions({ visible: showBB });
    setOverlayVersion(v => v + 1);
  }, [showBB]);

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

    if (data.bbLines?.upper.length && data.bbLines?.lower.length) {
      const bbColor = '#93c5fd';
      const bbOpts = {
        color: bbColor, lineWidth: 1 as const, lineStyle: 2,
        visible: false,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      };
      const bbUpper = mainChart.addSeries(LineSeries, bbOpts);
      bbUpper.setData(data.bbLines.upper);
      bbUpperRef.current = bbUpper;

      const bbLower = mainChart.addSeries(LineSeries, bbOpts);
      bbLower.setData(data.bbLines.lower);
      bbLowerRef.current = bbLower;
    }

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
    let resizing = false; // 리사이즈 중에는 sync 차단 (뷰포트 좁아짐 방지)
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || resizing || !range) return;
      syncing = true;
      rsiChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
      setOverlayVersion(v => v + 1);
    });
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || resizing || !range) return;
      syncing = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    });

    /* 거래량 급등 마커 */
    if (data.volSpikes?.length) {
      const spikeSet = new Set(data.volSpikes);
      const markers = data.candles
        .filter(c => spikeSet.has(c.time))
        .map(c => ({
          time: c.time as Time,
          position: 'belowBar' as const,
          color: '#f59e0b',
          shape: 'arrowUp' as const,
          text: '',
          size: 0.8,
        }))
        .sort((a, b) => (a.time as string).localeCompare(b.time as string));
      if (markers.length) {
        volMarkersRef.current?.detach();
        volMarkersRef.current = createSeriesMarkers(candleSeries, markers);
      }
    }

    /* 패턴 감지 */
    const pats = detectPatterns(data.candles);
    setDetectedPats(pats);
    onPatsRef.current?.(pats);

    // ResizeObserver로 컨테이너 크기 변화 감지 (가이드 패널, window resize, 4K 등)
    // RAF로 프레임당 1회만 실행, resizing 플래그로 sync 차단, fitContent로 전체 데이터 표시
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = mainEl.clientWidth;
        if (w > 0) {
          resizing = true;
          mainChart.applyOptions({ width: w });
          rsiChart.applyOptions({ width: w });
          resizing = false;
          mainChart.timeScale().fitContent();
          rsiChart.timeScale().fitContent();
        }
        setOverlayVersion(v => v + 1);
        rafId = null;
      });
    });
    ro.observe(mainEl);

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
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      observer.disconnect();
      // detach plugin primitives BEFORE removing the chart to avoid "Object is disposed"
      try { volMarkersRef.current?.detach(); } catch { /* already disposed */ }
      volMarkersRef.current   = null;
      mainChart.remove();
      rsiChart.remove();
      mainChartRef.current    = null;
      rsiChartRef.current     = null;
      candleSeriesRef.current = null;
      maSeriesRef.current     = {};
      bbUpperRef.current      = null;
      bbLowerRef.current      = null;
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const targets = useMemo(() => computeTargets(data), [data]);

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
          {/* AI 차트 해석 버튼 */}
          {onAnalyzeChart && (
            <button
              type="button"
              onClick={onAnalyzeChart}
              disabled={isAnalyzingChart}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzingChart
                ? <span className="animate-pulse">...</span>
                : '🤖 AI 해석'}
            </button>
          )}

          {/* 기간 전환 */}
          <div className="flex items-center gap-0.5 border-r border-gray-200 dark:border-gray-700 pr-1.5 mr-0.5">
            {PERIODS.map(p => (
              <button
                key={p} type="button"
                onClick={() => onPeriodChange(p)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  period === p
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 font-semibold'
                    : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

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

          {/* BB 토글 */}
          {data.bbLines && (
            <button
              type="button"
              onClick={() => setShowBB(v => !v)}
              title={showBB ? '볼린저밴드 숨기기' : '볼린저밴드(20,2) 표시'}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-opacity ${showBB ? 'opacity-100' : 'opacity-25'}`}
            >
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: '#93c5fd', borderTop: '1px dashed #93c5fd' }} />
              BB
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

      {/* 목표주가/손절가 스트립 */}
      {targets && (
        <div className="px-4 py-1 flex items-center gap-2.5 text-[11px] border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40">
          <span className="text-gray-400 dark:text-gray-500">지지</span>
          <span className="font-mono font-medium text-blue-500">{targets.support != null ? `$${targets.support}` : '—'}</span>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span className="text-gray-400 dark:text-gray-500">저항</span>
          <span className="font-mono font-medium text-amber-500">{targets.resistance != null ? `$${targets.resistance}` : '—'}</span>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span className="text-gray-400 dark:text-gray-500">손절</span>
          <span className="font-mono font-medium text-red-500">{targets.stopLoss != null ? `$${targets.stopLoss}` : '—'}</span>
          {data.volSpikes && data.volSpikes.length > 0 && (
            <>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span className="flex items-center gap-1 text-amber-500">
                <span>▲</span>
                <span>거래량 급등 {data.volSpikes.length}회</span>
              </span>
            </>
          )}
          {data.sector && (
            <>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span className="text-gray-400 dark:text-gray-500 truncate max-w-[140px]">{data.sector}</span>
            </>
          )}
        </div>
      )}

      {/* 메인 차트 + 패턴 SVG 오버레이 */}
      <div style={{ position: 'relative' }}>
        <div ref={mainRef} className="w-full" />

        {/* BB 채움 SVG 오버레이 (패턴 아래 레이어) */}
        {showBB && data.bbLines && mainChartRef.current && (
          <svg
            key={`bb-${overlayVersion}`}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: 250,
              pointerEvents: 'none', overflow: 'hidden',
              zIndex: 5,
            }}
          >
            <BBFill upper={data.bbLines.upper} lower={data.bbLines.lower} getXY={getXY} />
          </svg>
        )}

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
