'use client';

import { useState, useRef, useEffect } from 'react';
import type { TickerResult } from '@/app/api/search/route';

export interface AnalysisParams {
  ticker: string;
  period: '3m' | '6m' | '1y' | '2y' | '3y';
  technical: 'basic' | 'standard' | 'advanced';
  // 쉼표로 구분된 비교 종목 티커 문자열 (예: "AMD, TSM"). 비어있으면 비교표 미포함
  compare: string;
}

interface Props {
  onSubmit: (params: AnalysisParams) => void;
  isLoading: boolean;
}

export default function AnalysisForm({ onSubmit, isLoading }: Props) {
  const [ticker, setTicker] = useState('');
  const [period, setPeriod] = useState<AnalysisParams['period']>('6m');
  const [technical, setTechnical] = useState<AnalysisParams['technical']>('standard');
  // 비교 종목은 기본 숨김 — 고급 옵션으로 분류해 폼이 단순해 보이게 함
  const [compare, setCompare] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [peersLoading, setPeersLoading] = useState(false);
  // 자동 추천으로 채워진 상태인지 구분 — 수동 수정 시 뱃지 숨김
  const [autoFilled, setAutoFilled] = useState(false);

  // 자동완성
  const [suggestions, setSuggestions] = useState<TickerResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchTicker = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 1) { setSuggestions([]); setShowSuggestions(false); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
        const data: TickerResult[] = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch { setSuggestions([]); }
    }, 300);
  };

  const handleTickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTicker(val);
    searchTicker(val);
  };

  const fetchPeers = async (symbol: string) => {
    setPeersLoading(true);
    setAutoFilled(false);
    try {
      const res = await fetch(`/api/peers?ticker=${encodeURIComponent(symbol)}`);
      const peers: string[] = await res.json();
      if (peers.length > 0) {
        setCompare(peers.join(', '));
        setAutoFilled(true);
        setShowAdvanced(true); // 자동 추천 시 섹션 자동 열기
      }
    } catch {
      // 실패해도 사용자가 직접 입력할 수 있으므로 무시
    } finally {
      setPeersLoading(false);
    }
  };

  const handleSelect = (item: TickerResult) => {
    setTicker(item.symbol);
    setSuggestions([]);
    setShowSuggestions(false);
    fetchPeers(item.symbol);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    setShowSuggestions(false);
    onSubmit({ ticker: ticker.trim(), period, technical, compare });
  };

  const segBtn = (active: boolean) =>
    `flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 ${
      active
        ? 'bg-blue-600 border-blue-500 text-white'
        : 'bg-gray-100 border-gray-200 text-gray-600 hover:border-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-400'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* 종목 입력 + 자동완성 */}
      <div ref={wrapperRef} className="relative">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
          종목 티커 / 코드
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={ticker}
            onChange={handleTickerChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="NVDA, TSLA, NVDL, Apple..."
            autoComplete="off"
            className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !ticker.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                분석 중
              </span>
            ) : '분석'}
          </button>
        </div>

        {/* 자동완성 드롭다운 */}
        {showSuggestions && (
          <div className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-y-auto max-h-64">
            {suggestions.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onMouseDown={() => handleSelect(item)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <div>
                  <span className="font-mono font-semibold text-gray-900 dark:text-white text-sm">{item.symbol}</span>
                  <span className="ml-2 text-gray-500 dark:text-gray-400 text-xs truncate max-w-[140px] inline-block align-bottom">{item.name}</span>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{item.exchange}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 기간 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">분석 기간</label>
        <div className="flex gap-1">
          {(['3m', '6m', '1y', '2y', '3y'] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} disabled={isLoading} className={segBtn(period === p)}>
              {p === '3m' ? '3개월' : p === '6m' ? '6개월' : p === '1y' ? '1년' : p === '2y' ? '2년' : '3년'}
            </button>
          ))}
        </div>
      </div>

      {/* 기술적 분석 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">기술적 분석</label>
        <div className="flex gap-1">
          {(['basic', 'standard', 'advanced'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTechnical(t)} disabled={isLoading} className={segBtn(technical === t)}>
              {t === 'basic' ? '기본' : t === 'standard' ? '표준' : '고급'}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500 space-y-0.5">
          {technical === 'basic' && (
            <p>이동평균선(20/60/120일) · 지지·저항 — 빠른 개요</p>
          )}
          {technical === 'standard' && (
            <p>이동평균 + MACD + RSI(14) — 균형잡힌 분석 <span className="text-blue-400">(권장)</span></p>
          )}
          {technical === 'advanced' && (
            <p>표준 + 볼린저밴드 · 피보나치 · VWAP · 스토캐스틱 — 심층 분석</p>
          )}
        </div>
      </div>

      {/* 비교 종목 토글 — 입력 시 Claude 프롬프트 섹션 7(산업 분석)에 경쟁사 비교표가 추가됨 */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        {showAdvanced ? '▲ 접기' : '▼ 비교 종목 추가'}
      </button>

      {showAdvanced && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
            비교 종목{' '}
            <span className="text-gray-400">(쉼표 구분)</span>
            {peersLoading && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-blue-400">
                <span className="w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                추천 중...
              </span>
            )}
            {autoFilled && !peersLoading && (
              <span className="ml-1.5 text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                자동 추천
              </span>
            )}
          </label>
          {/* 자동완성 없이 자유 입력 — 여러 종목을 빠르게 넣으려면 검색 UX가 오히려 불편함 */}
          <input
            type="text"
            value={compare}
            onChange={(e) => { setCompare(e.target.value); setAutoFilled(false); }}
            placeholder="AMD, TSM"
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm transition-colors"
            disabled={isLoading}
          />
        </div>
      )}
    </form>
  );
}
