'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, createSeriesMarkers, ColorType, CrosshairMode,
  CandlestickSeries, LineSeries, HistogramSeries,
  type ISeriesApi, type IChartApi, type Time,
} from 'lightweight-charts';
import { detectPatterns, detectCandlePatterns, type DetectedPattern, type CandlePattern } from '@/lib/detectPatterns';

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
  macdLines?: {
    macd: MAPoint[];
    signal: MAPoint[];
    histogram: { time: string; value: number; color: string }[];
  };
  adxLines?: {
    adx: MAPoint[];
    plusDI: MAPoint[];
    minusDI: MAPoint[];
  };
  tradeSignals?: { time: string; type: 'buy' | 'sell'; reason: string }[];
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

/* ── SVG path 빌더 — null 좌표에서 끊김 처리 ── */
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
  pattern, getXY, labelOffset,
}: {
  pattern: DetectedPattern;
  getXY: (time: string, price: number) => { x: number; y: number } | null;
  labelOffset: number;
}) {
  const color = PATTERN_COLOR[pattern.signal];
  const ptCoords = pattern.points.map(p => getXY(p.time, p.price));
  const pathD = buildPath(ptCoords);
  if (!pathD) return null;

  let neckEl: React.ReactNode = null;
  if (pattern.necklinePrice != null && pattern.necklineStart && pattern.necklineEnd) {
    const nL = getXY(pattern.necklineStart, pattern.necklinePrice);
    const nR = getXY(pattern.necklineEnd,   pattern.necklinePrice);
    if (nL && nR) {
      neckEl = (
        <line x1={nL.x} y1={nL.y} x2={nR.x} y2={nR.y}
          stroke={color} strokeWidth="1.2" strokeDasharray="5,3" opacity={0.75} />
      );
    }
  }

  const visibleCoords = ptCoords.filter(Boolean) as { x: number; y: number }[];
  if (!visibleCoords.length) return null;
  const labelX = visibleCoords.reduce((s, c) => s + c.x, 0) / visibleCoords.length;
  const labelY = Math.max(20, Math.min(...visibleCoords.map(c => c.y)) - 12 + labelOffset);

  const arrow  = pattern.signal === 'bullish' ? '▲' : pattern.signal === 'bearish' ? '▼' : '◆';
  const pct    = Math.round(pattern.confidence * 100);
  const label  = `${arrow} ${pattern.nameKo} ${pct}%`;
  const lblW   = label.length * 5.8 + 12;

  const dotEls = ptCoords.map((c, i) =>
    c ? <circle key={i} cx={c.x} cy={c.y} r={3} fill={color} opacity={0.8} /> : null
  );

  return (
    <g>
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      {dotEls}
      {neckEl}
      <rect x={labelX - lblW / 2} y={labelY - 11} width={lblW} height={14} rx={3} fill={color} opacity={0.92} />
      <text x={labelX} y={labelY} textAnchor="middle" fontSize={9}
        fill="white" fontWeight="700" fontFamily="system-ui,sans-serif">
        {label}
      </text>
    </g>
  );
}

/* ── 볼린저밴드 채움 오버레이 ── */
function BBFill({ upper, lower, getXY }: {
  upper: MAPoint[]; lower: MAPoint[];
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

/* ── 피보나치 레벨 ── */
interface FibLevel { ratio: number; price: number; color: string; label: string; }

function computeFib(candles: ChartCandle[]): FibLevel[] | null {
  if (candles.length < 10) return null;
  const high = Math.max(...candles.map(c => c.high));
  const low  = Math.min(...candles.map(c => c.low));
  const diff = high - low;
  if (diff === 0) return null;
  return [
    { ratio: 0,     price: low,              color: '#ef4444', label: '0%' },
    { ratio: 0.236, price: low + diff * 0.236, color: '#f59e0b', label: '23.6%' },
    { ratio: 0.382, price: low + diff * 0.382, color: '#10b981', label: '38.2%' },
    { ratio: 0.500, price: low + diff * 0.500, color: '#3b82f6', label: '50%' },
    { ratio: 0.618, price: low + diff * 0.618, color: '#8b5cf6', label: '61.8%' },
    { ratio: 0.786, price: low + diff * 0.786, color: '#ec4899', label: '78.6%' },
    { ratio: 1,     price: high,             color: '#ef4444', label: '100%' },
  ];
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
  const supports = [ma60, ma120, ma200, bbLower].filter((v): v is number => v != null && v < price * 0.999);
  const support = supports.length ? Math.max(...supports) : null;
  const recentHigh = data.candles.slice(-20).reduce((m, c) => Math.max(m, c.high), 0);
  const resistances = [bbUpper, recentHigh > price * 1.005 ? recentHigh : null].filter((v): v is number => v != null && v > price * 1.001);
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
  const mainRef   = useRef<HTMLDivElement>(null);
  const rsiRef    = useRef<HTMLDivElement>(null);
  const macdRef   = useRef<HTMLDivElement>(null);
  const mainChartRef    = useRef<IChartApi | null>(null);
  const rsiChartRef     = useRef<IChartApi | null>(null);
  const macdChartRef    = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const maSeriesRef     = useRef<Partial<Record<string, ISeriesApi<'Line'>>>>({});
  const bbUpperRef      = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef      = useRef<ISeriesApi<'Line'> | null>(null);
  const volMarkersRef           = useRef<{ detach: () => void } | null>(null);
  const candlePatMarkersRef     = useRef<{ detach: () => void } | null>(null);
  const tradeSignalMarkersRef   = useRef<{ detach: () => void } | null>(null);
  const tradeSignalMarkersDataRef = useRef<{ time: Time; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string; size: number }[]>([]);
  const srLinesRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([]);
  const onPatsRef = useRef(onPatternsDetected);
  useEffect(() => { onPatsRef.current = onPatternsDetected; }, [onPatternsDetected]);

  const [activeMA,       setActiveMA]       = useState<Set<string>>(DEFAULT_ACTIVE_MA);
  const [showBB,         setShowBB]         = useState(false);
  const [showFib,        setShowFib]        = useState(false);
  const [showCandlePats, setShowCandlePats] = useState(true);
  const [showSignals,    setShowSignals]    = useState(true);
  const [showSR,         setShowSR]         = useState(true);
  const [ohlc,           setOhlc]           = useState<OhlcTooltip | null>(null);
  const [detectedPats,   setDetectedPats]   = useState<DetectedPattern[]>([]);
  const [candlePats,     setCandlePats]     = useState<CandlePattern[]>([]);
  const [overlayVersion, setOverlayVersion] = useState(0);
  const [showPatterns,   setShowPatterns]   = useState(true);
  const [candleTooltip,  setCandleTooltip]  = useState<{
    pat: CandlePattern; rect: DOMRect;
  } | null>(null);
  const [signalTooltip, setSignalTooltip] = useState<{
    sig: { time: string; type: 'buy' | 'sell'; reason: string };
    x: number; y: number;
  } | null>(null);
  const [rsiTooltip,  setRsiTooltip]  = useState<{ value: number; x: number; y: number } | null>(null);
  const [macdTooltip, setMacdTooltip] = useState<{ macd: number; signal: number; hist: number | null; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!detectedPats.length) return;
    const raf = requestAnimationFrame(() => setOverlayVersion(v => v + 1));
    return () => cancelAnimationFrame(raf);
  }, [detectedPats]);

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

  useEffect(() => {
    for (const ma of MA_CONFIG) {
      maSeriesRef.current[ma.key]?.applyOptions({ visible: activeMA.has(ma.key) });
    }
  }, [activeMA]);

  useEffect(() => {
    bbUpperRef.current?.applyOptions({ visible: showBB });
    bbLowerRef.current?.applyOptions({ visible: showBB });
    setOverlayVersion(v => v + 1);
  }, [showBB]);

  /* ── 차트 생성/파괴 ── */
  useEffect(() => {
    const mainEl = mainRef.current;
    const rsiEl  = rsiRef.current;
    const macdEl = macdRef.current;
    if (!mainEl || !rsiEl || !macdEl || !data.candles.length) return;

    const dark = document.documentElement.classList.contains('dark');
    const c = chartColors(dark);

    /* 메인 차트 */
    const mainChart = createChart(mainEl, {
      width: mainEl.clientWidth,
      height: 250,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: false },
      localization: { dateFormat: 'yyyy-MM-dd' },
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
      const bbOpts = {
        color: '#93c5fd', lineWidth: 1 as const, lineStyle: 2,
        visible: false, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      };
      const bbUpper = mainChart.addSeries(LineSeries, bbOpts);
      bbUpper.setData(data.bbLines.upper);
      bbUpperRef.current = bbUpper;
      const bbLower = mainChart.addSeries(LineSeries, bbOpts);
      bbLower.setData(data.bbLines.lower);
      bbLowerRef.current = bbLower;
    }

    const tradeSignalMap = new Map((data.tradeSignals ?? []).map(s => [s.time, s]));

    mainChart.subscribeCrosshairMove((param) => {
      if (!param.time) { setOhlc(null); setSignalTooltip(null); return; }
      const cd = param.seriesData.get(candleSeries) as
        { open: number; high: number; low: number; close: number } | undefined;
      if (cd) setOhlc({ open: cd.open, high: cd.high, low: cd.low, close: cd.close,
        change: ((cd.close - cd.open) / cd.open) * 100 });

      const sig = tradeSignalMap.get(String(param.time));
      if (sig && param.point) {
        setSignalTooltip({ sig, x: param.point.x, y: param.point.y });
      } else {
        setSignalTooltip(null);
      }
    });

    /* RSI 차트 */
    const rsiChart = createChart(rsiEl, {
      width: rsiEl.clientWidth,
      height: 100,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { visible: false },
      localization: { dateFormat: 'yyyy-MM-dd' },
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

    /* RSI crosshair 구독 */
    const rsiDataMap = new Map<string, number>();
    data.rsiLine?.forEach(r => rsiDataMap.set(r.time, r.value));
    rsiChart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) { setRsiTooltip(null); return; }
      const val = rsiDataMap.get(String(param.time));
      if (val !== undefined) setRsiTooltip({ value: val, x: param.point.x, y: param.point.y });
      else setRsiTooltip(null);
    });

    /* MACD 차트 */
    const macdChart = createChart(macdEl, {
      width: macdEl.clientWidth,
      height: 100,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: c.border, timeVisible: true },
      localization: { dateFormat: 'yyyy-MM-dd' },
    });
    macdChartRef.current = macdChart;

    if (data.macdLines) {
      const { macd: macdLine, signal: signalLine, histogram } = data.macdLines;

      if (histogram.length > 0) {
        const histSeries = macdChart.addSeries(HistogramSeries, {
          priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
          priceScaleId: 'right',
          lastValueVisible: false, priceLineVisible: false,
        });
        histSeries.setData(histogram);
      }
      if (macdLine.length > 0) {
        const macdSeries = macdChart.addSeries(LineSeries, {
          color: '#60a5fa', lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        macdSeries.setData(macdLine);
      }
      if (signalLine.length > 0) {
        const signalSeries = macdChart.addSeries(LineSeries, {
          color: '#f97316', lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        signalSeries.setData(signalLine);
        signalSeries.createPriceLine({ price: 0, color: '#4b5563', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      }
    }

    /* MACD crosshair 구독 */
    if (data.macdLines) {
      const macdMap = new Map<string, { macd: number; signal: number; hist: number | null }>();
      const { macd: mLine, signal: sLine, histogram: hLine } = data.macdLines;
      mLine.forEach((m, i) => {
        const s = sLine.find(x => x.time === m.time);
        const h = hLine.find(x => x.time === m.time);
        macdMap.set(m.time, { macd: m.value, signal: s?.value ?? 0, hist: h?.value ?? null });
      });
      macdChart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.point) { setMacdTooltip(null); return; }
        const entry = macdMap.get(String(param.time));
        if (entry) setMacdTooltip({ ...entry, x: param.point.x, y: param.point.y });
        else setMacdTooltip(null);
      });
    }

    mainChart.timeScale().fitContent();
    rsiChart.timeScale().fitContent();
    macdChart.timeScale().fitContent();

    /* 3개 차트 시간축 동기화 */
    let syncing = false;
    let resizing = false;
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || resizing || !range) return;
      syncing = true;
      rsiChart.timeScale().setVisibleLogicalRange(range);
      macdChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
      setOverlayVersion(v => v + 1);
    });
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || resizing || !range) return;
      syncing = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      macdChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    });
    macdChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || resizing || !range) return;
      syncing = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      rsiChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    });

    /* 거래량 급등 마커 */
    if (data.volSpikes?.length) {
      const spikeSet = new Set(data.volSpikes);
      const markers = data.candles
        .filter(cd => spikeSet.has(cd.time))
        .map(cd => ({
          time: cd.time as Time,
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

    /* 단봉 캔들 패턴 마커 */
    const cPats = detectCandlePatterns(data.candles);
    setCandlePats(cPats);
    if (cPats.length) {
      const cpMarkers = cPats
        .map(cp => ({
          time: cp.time as Time,
          position: (cp.signal === 'bullish' ? 'belowBar' : cp.signal === 'bearish' ? 'aboveBar' : 'inBar') as 'belowBar' | 'aboveBar' | 'inBar',
          color: cp.signal === 'bullish' ? '#10b981' : cp.signal === 'bearish' ? '#ef4444' : '#f59e0b',
          shape: (cp.signal === 'bullish' ? 'arrowUp' : cp.signal === 'bearish' ? 'arrowDown' : 'circle') as 'arrowUp' | 'arrowDown' | 'circle',
          text: cp.nameKo,
          size: 0.7,
        }))
        .sort((a, b) => (a.time as string).localeCompare(b.time as string));
      candlePatMarkersRef.current?.detach();
      candlePatMarkersRef.current = createSeriesMarkers(candleSeries, cpMarkers);
    }

    /* 매수/매도 신호 마커 */
    const sigMarkers = (data.tradeSignals ?? [])
      .map(sig => ({
        time: sig.time as Time,
        position: (sig.type === 'buy' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
        color: sig.type === 'buy' ? '#00ff88' : '#ff4466',
        shape: (sig.type === 'buy' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text: '',
        size: 1.0,
      }))
      .sort((a, b) => (a.time as string).localeCompare(b.time as string));
    tradeSignalMarkersDataRef.current = sigMarkers;
    if (sigMarkers.length) {
      tradeSignalMarkersRef.current?.detach();
      tradeSignalMarkersRef.current = createSeriesMarkers(candleSeries, sigMarkers);
    }

    /* 멀티캔들 패턴 감지 */
    const pats = detectPatterns(data.candles);
    setDetectedPats(pats);
    onPatsRef.current?.(pats);

    /* ResizeObserver */
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = mainEl.clientWidth;
        if (w > 0) {
          resizing = true;
          mainChart.applyOptions({ width: w });
          rsiChart.applyOptions({ width: w });
          macdChart.applyOptions({ width: w });
          resizing = false;
          mainChart.timeScale().fitContent();
          rsiChart.timeScale().fitContent();
          macdChart.timeScale().fitContent();
        }
        setOverlayVersion(v => v + 1);
        rafId = null;
      });
    });
    ro.observe(mainEl);

    /* 다크모드 감지 */
    const observer = new MutationObserver(() => {
      const d = document.documentElement.classList.contains('dark');
      const colors = chartColors(d);
      const baseOpts = {
        layout: { background: { type: ColorType.Solid, color: colors.bg }, textColor: colors.text },
        grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
        rightPriceScale: { borderColor: colors.border },
        timeScale: { borderColor: colors.border },
      };
      mainChart.applyOptions({ ...baseOpts, timeScale: { borderColor: colors.border, timeVisible: false } });
      rsiChart.applyOptions({ ...baseOpts, timeScale: { visible: false } });
      macdChart.applyOptions(baseOpts);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      observer.disconnect();
      try { volMarkersRef.current?.detach(); } catch { /* disposed */ }
      try { candlePatMarkersRef.current?.detach(); } catch { /* disposed */ }
      try { tradeSignalMarkersRef.current?.detach(); } catch { /* disposed */ }
      volMarkersRef.current = null;
      candlePatMarkersRef.current = null;
      tradeSignalMarkersRef.current = null;
      mainChart.remove();
      rsiChart.remove();
      macdChart.remove();
      mainChartRef.current    = null;
      rsiChartRef.current     = null;
      macdChartRef.current    = null;
      candleSeriesRef.current = null;
      maSeriesRef.current     = {};
      bbUpperRef.current      = null;
      bbLowerRef.current      = null;
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 캔들 패턴 마커 가시성 토글 */
  useEffect(() => {
    if (!candlePatMarkersRef.current) return;
    setOverlayVersion(v => v + 1);
  }, [showCandlePats]);

  /* 매매 신호 마커 가시성 토글 */
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    if (showSignals) {
      if (tradeSignalMarkersDataRef.current.length) {
        try { tradeSignalMarkersRef.current?.detach(); } catch { /* disposed */ }
        tradeSignalMarkersRef.current = createSeriesMarkers(series, tradeSignalMarkersDataRef.current);
      }
    } else {
      try { tradeSignalMarkersRef.current?.detach(); } catch { /* disposed */ }
      tradeSignalMarkersRef.current = null;
    }
  }, [showSignals]);

  const targets   = useMemo(() => computeTargets(data), [data]);
  const fibLevels = useMemo(() => computeFib(data.candles), [data.candles]);

  /* 지지/저항/손절 수평선 */
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    srLinesRef.current.forEach(l => { try { series.removePriceLine(l); } catch { /* disposed */ } });
    srLinesRef.current = [];
    if (!showSR || !targets) return;
    const dark = document.documentElement.classList.contains('dark');
    const resistColor = dark ? '#ffffff' : '#000000';
    const lines: ReturnType<typeof series.createPriceLine>[] = [];
    if (targets.resistance != null)
      lines.push(series.createPriceLine({ price: targets.resistance, color: resistColor, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '저항' }));
    if (targets.support != null)
      lines.push(series.createPriceLine({ price: targets.support,    color: '#3b82f6',  lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '지지' }));
    if (targets.stopLoss != null)
      lines.push(series.createPriceLine({ price: targets.stopLoss,   color: '#ef4444',  lineWidth: 1, lineStyle: 4, axisLabelVisible: true, title: '손절' }));
    srLinesRef.current = lines;
    return () => {
      lines.forEach(l => { try { series.removePriceLine(l); } catch { /* disposed */ } });
      srLinesRef.current = [];
    };
  }, [targets, showSR]); // eslint-disable-line react-hooks/exhaustive-deps

  /* RSI 현재값 */
  const rsiCurrent = useMemo(() => {
    if (!data.rsiLine?.length) return null;
    return data.rsiLine[data.rsiLine.length - 1].value;
  }, [data.rsiLine]);

  /* MACD 현재값 */
  const macdCurrent = useMemo(() => {
    if (!data.macdLines) return null;
    const { macd, signal: sig, histogram } = data.macdLines;
    const macdVal  = macd.length  ? macd[macd.length - 1].value   : null;
    const sigVal   = sig.length   ? sig[sig.length - 1].value     : null;
    const histVal  = histogram.length ? histogram[histogram.length - 1].value : null;
    if (macdVal === null || sigVal === null) return null;
    return { macd: macdVal, signal: sigVal, hist: histVal };
  }, [data.macdLines]);

  /* ADX 현재값 */
  const adxCurrent = useMemo(() => {
    if (!data.adxLines?.adx.length) return null;
    const last = data.adxLines.adx[data.adxLines.adx.length - 1];
    const pdiLast = data.adxLines.plusDI[data.adxLines.plusDI.length - 1];
    const ndiLast = data.adxLines.minusDI[data.adxLines.minusDI.length - 1];
    return { adx: last.value, plusDI: pdiLast?.value ?? null, minusDI: ndiLast?.value ?? null };
  }, [data.adxLines]);

  const adxLabel = adxCurrent
    ? (adxCurrent.adx < 20 ? '횡보' : adxCurrent.adx < 25 ? '추세형성' : '추세진행')
    : null;

  const lastCandle = data.candles[data.candles.length - 1];
  const displayOhlc: OhlcTooltip | null = ohlc ?? (lastCandle
    ? { open: lastCandle.open, high: lastCandle.high, low: lastCandle.low, close: lastCandle.close,
        change: ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100 }
    : null);

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
      {/* 헤더 Row 1: ticker + buttons */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1 gap-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">{ticker}</span>

        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {/* AI 차트 해석 */}
          {onAnalyzeChart && (
            <button type="button" onClick={onAnalyzeChart} disabled={isAnalyzingChart}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isAnalyzingChart ? <span className="animate-pulse">...</span> : '🤖 AI 해석'}
            </button>
          )}

          {/* 기간 */}
          <div className="flex items-center gap-0.5 border-r border-gray-200 dark:border-gray-700 pr-1.5 mr-0.5">
            {PERIODS.map(p => (
              <button key={p} type="button" onClick={() => onPeriodChange(p)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  period === p
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 font-semibold'
                    : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                {p}
              </button>
            ))}
          </div>

          {/* 피보나치 토글 */}
          {fibLevels && (
            <button type="button" onClick={() => setShowFib(v => !v)}
              title="피보나치 되돌림 레벨"
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                showFib
                  ? 'border-purple-400 text-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-300 dark:border-gray-600 text-gray-400'
              }`}>
              Fib
            </button>
          )}

          {/* 캔들 패턴 토글 */}
          {candlePats.length > 0 && (
            <button type="button" onClick={() => setShowCandlePats(v => !v)}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                showCandlePats
                  ? 'border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-900/20'
                  : 'border-gray-300 dark:border-gray-600 text-gray-400'
              }`}>
              봉 {candlePats.length}
            </button>
          )}

          {/* 매매 신호 토글 */}
          {(data.tradeSignals?.length ?? 0) > 0 && (
            <button type="button" onClick={() => setShowSignals(v => !v)}
              title="매수/매도 신호 표시"
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                showSignals
                  ? 'border-emerald-400 text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-gray-300 dark:border-gray-600 text-gray-400'
              }`}>
              신호 {data.tradeSignals!.length}
            </button>
          )}

          {/* 멀티패턴 토글 */}
          {detectedPats.length > 0 && (
            <button onClick={() => setShowPatterns(v => !v)}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                showPatterns
                  ? 'border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 text-gray-400'
              }`}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: showPatterns ? '#3b82f6' : '#9ca3af' }} />
              패턴 {detectedPats.length}
            </button>
          )}

          {/* 지지/저항선 토글 */}
          {targets && (targets.support != null || targets.resistance != null) && (
            <button type="button" onClick={() => setShowSR(v => !v)}
              title="지지·저항·손절선 표시"
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                showSR
                  ? 'border-slate-400 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40'
                  : 'border-gray-300 dark:border-gray-600 text-gray-400'
              }`}>
              S/R
            </button>
          )}

          {/* BB 토글 */}
          {data.bbLines && (
            <button type="button" onClick={() => setShowBB(v => !v)}
              title={showBB ? '볼린저밴드 숨기기' : '볼린저밴드(20,2) 표시'}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-opacity ${showBB ? 'opacity-100' : 'opacity-25'}`}>
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: '#93c5fd' }} />
              BB
            </button>
          )}

          {/* MA 토글 */}
          {MA_CONFIG.map(ma => (
            <button key={ma.key} type="button" onClick={() => toggleMA(ma.key)}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-opacity ${
                activeMA.has(ma.key) ? 'opacity-100' : 'opacity-25'
              }`}>
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: ma.color }} />
              {ma.label}
            </button>
          ))}
        </div>
      </div>

      {/* 헤더 Row 2: OHLC 데이터 */}
      {displayOhlc && (
        <div className="px-4 pb-1.5 flex items-center gap-1.5 text-[11px] font-mono">
          <span className="text-gray-400">O</span>
          <span className="text-gray-700 dark:text-gray-200">{displayOhlc.open.toFixed(2)}</span>
          <span className="text-gray-400 ml-1">H</span>
          <span className="text-green-500">{displayOhlc.high.toFixed(2)}</span>
          <span className="text-gray-400 ml-1">L</span>
          <span className="text-red-500">{displayOhlc.low.toFixed(2)}</span>
          <span className="text-gray-400 ml-1">C</span>
          <span className="text-gray-700 dark:text-gray-200">{displayOhlc.close.toFixed(2)}</span>
          <span className={`ml-1 ${displayOhlc.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {displayOhlc.change >= 0 ? '+' : ''}{displayOhlc.change.toFixed(2)}%
          </span>
        </div>
      )}

      {/* 지지·저항·손절 + ADX 스트립 */}
      {targets && (
        <div className="px-4 py-1 flex items-center gap-2.5 text-[11px] border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 flex-wrap">
          <span className="text-gray-400 dark:text-gray-500">지지</span>
          <span className="font-mono font-medium text-blue-500">{targets.support != null ? `$${targets.support}` : '—'}</span>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span className="text-gray-400 dark:text-gray-500">저항</span>
          <span className="font-mono font-medium text-amber-500">{targets.resistance != null ? `$${targets.resistance}` : '—'}</span>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span className="text-gray-400 dark:text-gray-500">손절</span>
          <span className="font-mono font-medium text-red-500">{targets.stopLoss != null ? `$${targets.stopLoss}` : '—'}</span>
          {adxCurrent && (
            <>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span className="text-gray-400 dark:text-gray-500">ADX</span>
              <span className={`font-mono font-medium ${
                adxCurrent.adx >= 25 ? 'text-emerald-500' : adxCurrent.adx >= 20 ? 'text-amber-500' : 'text-gray-400'
              }`}>
                {adxCurrent.adx.toFixed(1)}
              </span>
              <span className="text-gray-400 dark:text-gray-500 text-[10px]">{adxLabel}</span>
              {adxCurrent.plusDI != null && adxCurrent.minusDI != null && (
                <span className={`text-[10px] font-medium ${adxCurrent.plusDI > adxCurrent.minusDI ? 'text-emerald-500' : 'text-red-400'}`}>
                  {adxCurrent.plusDI > adxCurrent.minusDI ? '↑상승우위' : '↓하락우위'}
                </span>
              )}
            </>
          )}
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
              <span className="text-gray-400 dark:text-gray-500 truncate max-w-[120px]">{data.sector}</span>
            </>
          )}
        </div>
      )}

      {/* 최근 매매 신호 요약 */}
      {(data.tradeSignals?.length ?? 0) > 0 && (
        <div className="px-4 py-1.5 flex items-center gap-1.5 flex-wrap border-t border-gray-100 dark:border-gray-800">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">최근 신호</span>
          {data.tradeSignals!.slice(-6).map((sig, i) => (
            <span key={i}
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: sig.type === 'buy' ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,102,0.1)',
                color: sig.type === 'buy' ? '#00ff88' : '#ff4466',
                border: `1px solid ${sig.type === 'buy' ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,102,0.3)'}`,
              }}>
              {sig.type === 'buy' ? '▲' : '▼'} {sig.reason} <span style={{ opacity: 0.6 }}>{sig.time}</span>
            </span>
          ))}
        </div>
      )}

      {/* 메인 차트 + 오버레이 */}
      <div style={{ position: 'relative' }}>
        <div ref={mainRef} className="w-full" />

        {/* 피보나치 오버레이 */}
        {showFib && fibLevels && candleSeriesRef.current && (
          <svg
            key={`fib-${overlayVersion}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 250, pointerEvents: 'none', overflow: 'hidden', zIndex: 3 }}
          >
            {fibLevels.map(level => {
              const y = candleSeriesRef.current!.priceToCoordinate(level.price);
              if (y === null) return null;
              const w = mainRef.current?.clientWidth ?? 400;
              return (
                <g key={level.label}>
                  <line x1={0} y1={y} x2={w} y2={y}
                    stroke={level.color} strokeWidth={0.8} strokeDasharray="5,4" opacity={0.55} />
                  <rect x={w - 50} y={y - 7} width={48} height={13} rx={2} fill={level.color} opacity={0.80} />
                  <text x={w - 26} y={y + 3} textAnchor="middle" fontSize={8}
                    fill="white" fontWeight="700" fontFamily="system-ui,sans-serif">
                    {level.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* BB 채움 오버레이 */}
        {showBB && data.bbLines && mainChartRef.current && (
          <svg key={`bb-${overlayVersion}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 250, pointerEvents: 'none', overflow: 'hidden', zIndex: 5 }}>
            <BBFill upper={data.bbLines.upper} lower={data.bbLines.lower} getXY={getXY} />
          </svg>
        )}

        {/* 매매 신호 툴팁 */}
        {signalTooltip && showSignals && (
          <div style={{
            position: 'absolute',
            left: signalTooltip.x,
            top: signalTooltip.y,
            transform: 'translate(-50%, -115%)',
            zIndex: 30,
            pointerEvents: 'none',
            background: 'rgba(10,18,35,0.95)',
            border: `1px solid ${signalTooltip.sig.type === 'buy' ? 'rgba(0,255,136,0.45)' : 'rgba(255,68,102,0.45)'}`,
            borderRadius: '8px',
            padding: '7px 11px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}>
            <div style={{ color: signalTooltip.sig.type === 'buy' ? '#00ff88' : '#ff4466', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>
              {signalTooltip.sig.type === 'buy' ? '▲ 매수 신호' : '▼ 매도 신호'}
            </div>
            <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 600 }}>{signalTooltip.sig.reason}</div>
            <div style={{ color: '#64748b', fontSize: '10px', marginTop: '3px' }}>{signalTooltip.sig.time}</div>
            <div style={{
              position: 'absolute', bottom: '-5px', left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: '8px', height: '8px',
              background: 'rgba(10,18,35,0.95)',
              borderRight: `1px solid ${signalTooltip.sig.type === 'buy' ? 'rgba(0,255,136,0.45)' : 'rgba(255,68,102,0.45)'}`,
              borderBottom: `1px solid ${signalTooltip.sig.type === 'buy' ? 'rgba(0,255,136,0.45)' : 'rgba(255,68,102,0.45)'}`,
            }} />
          </div>
        )}

        {/* 멀티캔들 패턴 오버레이 */}
        {showPatterns && detectedPats.length > 0 && mainChartRef.current && (
          <svg key={overlayVersion}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 250, pointerEvents: 'none', overflow: 'hidden', zIndex: 10 }}>
            {detectedPats.map((pat, i) => (
              <PatternPath key={pat.type + i} pattern={pat} getXY={getXY} labelOffset={i * 18} />
            ))}
          </svg>
        )}
      </div>

      {/* 멀티캔들 패턴 요약 */}
      {showPatterns && detectedPats.length > 0 && (
        <div className="px-4 pb-1.5 flex flex-col gap-1">
          {detectedPats.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5"
                style={{ background: PATTERN_COLOR[p.signal] + '18', color: PATTERN_COLOR[p.signal], border: `1px solid ${PATTERN_COLOR[p.signal]}40` }}>
                {p.signal === 'bullish' ? '▲' : p.signal === 'bearish' ? '▼' : '◆'}
                {p.nameKo}
                <span className="opacity-60">{Math.round(p.confidence * 100)}%</span>
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight pt-0.5">{p.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* 단봉 캔들 패턴 요약 + 커스텀 툴팁 */}
      {showCandlePats && candlePats.length > 0 && (
        <div className="px-4 pt-2 pb-1.5 flex flex-wrap gap-1 relative">
          {candlePats.map((cp, i) => (
            <span key={i}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full cursor-help select-none"
              style={{
                background: PATTERN_COLOR[cp.signal] + '12',
                color: PATTERN_COLOR[cp.signal],
                border: `1px solid ${PATTERN_COLOR[cp.signal]}30`,
              }}
              onMouseEnter={(e) => setCandleTooltip({ pat: cp, rect: e.currentTarget.getBoundingClientRect() })}
              onMouseLeave={() => setCandleTooltip(null)}
            >
              {cp.signal === 'bullish' ? '▲' : cp.signal === 'bearish' ? '▼' : '◆'}
              {cp.nameKo}
            </span>
          ))}

          {/* 커스텀 툴팁 */}
          {candleTooltip && (
            <div
              className="fixed z-50 pointer-events-none"
              style={{
                left: candleTooltip.rect.left + candleTooltip.rect.width / 2,
                top: candleTooltip.rect.top - 8,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div
                className="rounded-lg px-3 py-2 shadow-xl text-left"
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: `1px solid ${PATTERN_COLOR[candleTooltip.pat.signal]}40`,
                  backdropFilter: 'blur(12px)',
                  minWidth: '180px',
                  maxWidth: '240px',
                  boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${PATTERN_COLOR[candleTooltip.pat.signal]}20`,
                }}
              >
                {/* 이름 + 신호 */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[11px] font-bold" style={{ color: PATTERN_COLOR[candleTooltip.pat.signal] }}>
                    {candleTooltip.pat.signal === 'bullish' ? '▲' : candleTooltip.pat.signal === 'bearish' ? '▼' : '◆'}
                    {' '}{candleTooltip.pat.nameKo}
                  </span>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      background: PATTERN_COLOR[candleTooltip.pat.signal] + '20',
                      color: PATTERN_COLOR[candleTooltip.pat.signal],
                      border: `1px solid ${PATTERN_COLOR[candleTooltip.pat.signal]}40`,
                    }}
                  >
                    {candleTooltip.pat.signal === 'bullish' ? '상승 신호' : candleTooltip.pat.signal === 'bearish' ? '하락 신호' : '중립'}
                  </span>
                </div>
                {/* 날짜 */}
                <p className="text-[10px] text-slate-500 mb-1">{candleTooltip.pat.time}</p>
                {/* 설명 */}
                <p className="text-[11px] text-slate-300 leading-relaxed">{candleTooltip.pat.description}</p>
                {/* 꼬리 */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
                  style={{
                    bottom: '-5px',
                    background: 'rgba(15,23,42,0.95)',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: `1px solid ${PATTERN_COLOR[candleTooltip.pat.signal]}40`,
                    borderBottom: `1px solid ${PATTERN_COLOR[candleTooltip.pat.signal]}40`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* RSI 패널 */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-2 flex-wrap border-t-2 border-gray-100 dark:border-gray-800 mt-2">
        <span className="text-[10px] font-mono font-semibold text-gray-400 dark:text-gray-500">RSI(14)</span>
        {rsiCurrent != null && (
          <>
            <span className={`text-[11px] font-bold font-mono ${
              rsiCurrent > 70 ? 'text-red-400' : rsiCurrent < 30 ? 'text-blue-400' : 'text-gray-300 dark:text-gray-300'
            }`}>
              {rsiCurrent.toFixed(1)}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              rsiCurrent > 70
                ? 'bg-red-500/10 text-red-400 border border-red-500/25'
                : rsiCurrent < 30
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/25'
                : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
            }`}>
              {rsiCurrent > 70 ? '과매수 — 조정 주의' : rsiCurrent < 30 ? '과매도 — 반등 가능' : '중립'}
            </span>
          </>
        )}
        <span className="text-[10px] text-gray-500 dark:text-gray-600 hidden sm:inline">
          70 이상 = 과매수 · 30 이하 = 과매도
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={rsiRef} className="w-full" />
        {rsiTooltip && (() => {
          const v = rsiTooltip.value;
          const isOverbought = v > 70, isOversold = v < 30;
          const color = isOverbought ? '#f87171' : isOversold ? '#60a5fa' : '#a78bfa';
          const label = isOverbought ? '과매수' : isOversold ? '과매도' : v >= 50 ? '중립~강세' : '중립~약세';
          const desc  = isOverbought
            ? '단기 급등으로 조정 가능성 ↑ · 매도 또는 관망 권장'
            : isOversold
            ? '단기 급락 후 반등 가능성 ↑ · 매수 기회 탐색'
            : v >= 50 ? '매수 모멘텀 유지 · 추세 지속 여부 확인'
                      : '하락 압력 우세 · 추가 하락 주의';
          return (
            <div style={{ position: 'absolute', left: rsiTooltip.x, top: rsiTooltip.y, transform: 'translate(-50%, -110%)', zIndex: 30, pointerEvents: 'none',
              background: 'rgba(10,18,35,0.95)', border: `1px solid ${color}40`, borderRadius: '8px', padding: '7px 11px', whiteSpace: 'nowrap',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{ color, fontSize: '12px', fontWeight: 700 }}>RSI {v.toFixed(1)}</span>
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '99px', background: color + '20', color, border: `1px solid ${color}40` }}>{label}</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>{desc}</div>
              <div style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: '8px', height: '8px',
                background: 'rgba(10,18,35,0.95)', borderRight: `1px solid ${color}40`, borderBottom: `1px solid ${color}40` }} />
            </div>
          );
        })()}
      </div>

      {/* MACD 패널 */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-2 flex-wrap border-t-2 border-gray-100 dark:border-gray-800 mt-2">
        <span className="text-[10px] font-mono font-semibold text-gray-400 dark:text-gray-500">MACD(12,26,9)</span>
        {macdCurrent && (
          <>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              macdCurrent.macd > macdCurrent.signal
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                : 'bg-red-500/10 text-red-400 border border-red-500/25'
            }`}>
              {macdCurrent.macd > macdCurrent.signal ? '골든크로스 — 상승 모멘텀' : '데드크로스 — 하락 모멘텀'}
            </span>
            {macdCurrent.hist != null && (
              <span className={`text-[10px] font-mono ${macdCurrent.hist > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                히스토그램 {macdCurrent.hist > 0 ? '↑ 양전환' : '↓ 음전환'}
              </span>
            )}
          </>
        )}
        <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-600 ml-auto">
          <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: '#60a5fa' }} />MACD
          <span className="w-3 h-0.5 inline-block rounded ml-1" style={{ backgroundColor: '#f97316' }} />Signal
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={macdRef} className="w-full" />
        {macdTooltip && (() => {
          const isBull = macdTooltip.macd > macdTooltip.signal;
          const color  = isBull ? '#34d399' : '#f87171';
          const state  = isBull ? '골든크로스' : '데드크로스';
          const stateDesc = isBull
            ? 'MACD선이 Signal선 위 → 단기 상승 모멘텀이 장기 추세를 앞서는 상태'
            : 'MACD선이 Signal선 아래 → 단기 하락 압력이 장기 추세보다 강한 상태';
          const histDesc = macdTooltip.hist != null
            ? (macdTooltip.hist > 0
              ? `히스토그램 +${macdTooltip.hist.toFixed(3)} — 격차 확대 (추세 강화)`
              : `히스토그램 ${macdTooltip.hist.toFixed(3)} — 격차 축소 (추세 약화 가능)`)
            : null;
          return (
            <div style={{ position: 'absolute', left: macdTooltip.x, top: macdTooltip.y, transform: 'translate(-50%, -110%)', zIndex: 30, pointerEvents: 'none',
              background: 'rgba(10,18,35,0.95)', border: `1px solid ${color}40`, borderRadius: '8px', padding: '8px 12px', whiteSpace: 'nowrap',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ color, fontSize: '11px', fontWeight: 700 }}>{state}</span>
                <span style={{ color: '#60a5fa', fontSize: '10px', fontFamily: 'monospace' }}>MACD {macdTooltip.macd.toFixed(3)}</span>
                <span style={{ color: '#f97316', fontSize: '10px', fontFamily: 'monospace' }}>Signal {macdTooltip.signal.toFixed(3)}</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: histDesc ? '3px' : 0 }}>{stateDesc}</div>
              {histDesc && <div style={{ color: macdTooltip.hist! > 0 ? '#34d399' : '#f87171', fontSize: '10px', fontFamily: 'monospace' }}>{histDesc}</div>}
              <div style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: '8px', height: '8px',
                background: 'rgba(10,18,35,0.95)', borderRight: `1px solid ${color}40`, borderBottom: `1px solid ${color}40` }} />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
