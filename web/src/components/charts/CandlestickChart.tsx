'use client';
import { useEffect, useRef, useState } from 'react';
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, LineSeries, HistogramSeries,
  type ISeriesApi, type IChartApi,
} from 'lightweight-charts';

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

// 기본은 MA20/60/120만 표시 — 5개 전부 켜면 차트가 복잡해 보임
const DEFAULT_ACTIVE_MA = new Set<string>(['ma20', 'ma60', 'ma120']);

function chartColors(dark: boolean) {
  return {
    bg:     dark ? '#111827' : '#ffffff',
    grid:   dark ? '#1f2937' : '#f3f4f6',
    text:   dark ? '#9ca3af' : '#6b7280',
    border: dark ? '#374151' : '#e5e7eb',
  };
}

interface OhlcTooltip { open: number; high: number; low: number; close: number; change: number; }
interface Props { data: ChartDataPayload; ticker: string; }

export default function CandlestickChart({ data, ticker }: Props) {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef  = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef  = useRef<IChartApi | null>(null);
  // MA 시리즈 ref — data 변경 없이 토글만 할 때 차트를 rebuild하지 않기 위해 분리
  const maSeriesRef  = useRef<Partial<Record<string, ISeriesApi<'Line'>>>>({});

  const [activeMA, setActiveMA] = useState<Set<string>>(DEFAULT_ACTIVE_MA);
  const [ohlc, setOhlc] = useState<OhlcTooltip | null>(null);

  const toggleMA = (key: string) => {
    setActiveMA(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // MA 토글은 series.applyOptions만으로 처리 — 차트 rebuild 없음
  useEffect(() => {
    for (const ma of MA_CONFIG) {
      maSeriesRef.current[ma.key]?.applyOptions({ visible: activeMA.has(ma.key) });
    }
  }, [activeMA]);

  // 차트 생성/파괴 — data가 바뀔 때만 실행
  useEffect(() => {
    const mainEl = mainRef.current;
    const rsiEl  = rsiRef.current;
    if (!mainEl || !rsiEl || !data.candles.length) return;

    const dark = document.documentElement.classList.contains('dark');
    const c = chartColors(dark);

    // ─── 메인 차트 (캔들 + MA + 거래량) ───
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

    // 캔들스틱
    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    candleSeries.setData(data.candles);

    // MA 선
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

    // 거래량 히스토그램 — 메인 차트 하단 18% 영역에 겹쳐서 표시
    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.setData(
      data.candles.map(cd => ({
        time:  cd.time,
        value: cd.volume,
        // 양봉/음봉에 따라 색상 구분, 투명도를 줘서 캔들을 가리지 않게
        color: cd.close >= cd.open ? '#10b98133' : '#ef444433',
      }))
    );
    mainChart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // 크로스헤어 이동 시 OHLC 툴팁 업데이트
    mainChart.subscribeCrosshairMove((param) => {
      if (!param.time) { setOhlc(null); return; }
      const cd = param.seriesData.get(candleSeries) as
        { open: number; high: number; low: number; close: number } | undefined;
      if (cd) {
        setOhlc({
          open: cd.open, high: cd.high, low: cd.low, close: cd.close,
          change: ((cd.close - cd.open) / cd.open) * 100,
        });
      }
    });

    // ─── RSI 차트 ───
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
      // 과매수(70) / 과매도(30) / 중립(50) 기준선
      rsiSeries.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
      rsiSeries.createPriceLine({ price: 50, color: '#4b5563', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      rsiSeries.createPriceLine({ price: 30, color: '#3b82f6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
    }

    mainChart.timeScale().fitContent();
    rsiChart.timeScale().fitContent();

    // 두 차트의 시간축 동기화 — 한 쪽 스크롤/줌 시 반대쪽도 따라감
    let syncing = false;
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || !range) return;
      syncing = true;
      rsiChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    });
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || !range) return;
      syncing = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    });

    const onResize = () => {
      if (mainRef.current) mainChart.applyOptions({ width: mainRef.current.clientWidth });
      if (rsiRef.current)  rsiChart.applyOptions({ width: rsiRef.current.clientWidth });
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
      mainChartRef.current = null;
      rsiChartRef.current  = null;
      maSeriesRef.current  = {};
    };
  }, [data]); // activeMA는 별도 effect에서 처리하므로 deps에서 제외

  // 크로스헤어가 없을 때 마지막 봉의 OHLC 표시
  const lastCandle = data.candles[data.candles.length - 1];
  const displayOhlc: OhlcTooltip | null = ohlc ?? (lastCandle
    ? {
        open: lastCandle.open, high: lastCandle.high,
        low: lastCandle.low,   close: lastCandle.close,
        change: ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100,
      }
    : null);

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
      {/* 헤더: 티커 + OHLC 툴팁 + MA 토글 */}
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

        {/* MA 개별 토글 버튼 — 클릭으로 선 ON/OFF */}
        <div className="flex items-center gap-1 shrink-0">
          {MA_CONFIG.map(ma => (
            <button
              key={ma.key}
              type="button"
              onClick={() => toggleMA(ma.key)}
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

      {/* 메인 차트 (캔들 + MA + 거래량 오버레이) */}
      <div ref={mainRef} className="w-full" />

      {/* RSI 패널 라벨 */}
      <div className="px-4 pt-1">
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">RSI(14)</span>
      </div>

      {/* RSI 차트 */}
      <div ref={rsiRef} className="w-full" />
    </div>
  );
}
