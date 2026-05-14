'use client';
import { useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, LineSeries,
} from 'lightweight-charts';

export interface ChartCandle { time: string; open: number; high: number; low: number; close: number; }
export interface MAPoint { time: string; value: number; }
export interface ChartDataPayload {
  candles: ChartCandle[];
  maLines: {
    ma5:   MAPoint[];
    ma20:  MAPoint[];
    ma60:  MAPoint[];
    ma120: MAPoint[];
    ma200: MAPoint[];
  };
}

const MA_CONFIG = [
  { key: 'ma5'   as const, color: '#3b82f6', label: 'MA5' },
  { key: 'ma20'  as const, color: '#f59e0b', label: 'MA20' },
  { key: 'ma60'  as const, color: '#a855f7', label: 'MA60' },
  { key: 'ma120' as const, color: '#10b981', label: 'MA120' },
  { key: 'ma200' as const, color: '#ef4444', label: 'MA200' },
];

function chartColors(dark: boolean) {
  return {
    bg:     dark ? '#111827' : '#ffffff',
    grid:   dark ? '#1f2937' : '#f3f4f6',
    text:   dark ? '#9ca3af' : '#6b7280',
    border: dark ? '#374151' : '#e5e7eb',
  };
}

interface Props { data: ChartDataPayload; ticker: string; }

export default function CandlestickChart({ data, ticker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data.candles.length) return;

    const dark = document.documentElement.classList.contains('dark');
    const c = chartColors(dark);

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 280,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    candleSeries.setData(data.candles);

    for (const ma of MA_CONFIG) {
      const pts = data.maLines[ma.key];
      if (pts.length > 0) {
        const series = chart.addSeries(LineSeries, {
          color: ma.color, lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false,
        });
        series.setData(pts);
      }
    }

    chart.timeScale().fitContent();

    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', onResize);

    const observer = new MutationObserver(() => {
      const d = document.documentElement.classList.contains('dark');
      const colors = chartColors(d);
      chart.applyOptions({
        layout: { background: { type: ColorType.Solid, color: colors.bg }, textColor: colors.text },
        grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
        rightPriceScale: { borderColor: colors.border },
        timeScale: { borderColor: colors.border },
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      chart.remove();
    };
  }, [data]);

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {ticker} 캔들차트
        </span>
        <div className="flex items-center gap-3">
          {MA_CONFIG.map(ma => (
            <span key={ma.key} className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
              <span className="w-4 h-0.5 inline-block rounded" style={{ backgroundColor: ma.color }} />
              {ma.label}
            </span>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
