'use client';

import { useState, useRef, useEffect } from 'react';
import type { TickerResult } from '@/app/api/search/route';
import { ALL_SECTIONS, DEFAULT_SECTIONS, type TechnicalLevel } from '@/lib/prompt';

export interface AnalysisParams {
  ticker: string;
  period: '3m' | '6m' | '1y' | '2y' | '3y';
  technical: TechnicalLevel;
  compare: string;
  sections: number[];
}

interface Props {
  onSubmit: (params: AnalysisParams) => void;
  isLoading: boolean;
}

/* technical 레벨에 따른 기본 섹션 세트 */
function defaultSectionsFor(t: TechnicalLevel): number[] {
  if (t === 'quick') return [];
  if (t === 'advanced') return ALL_SECTIONS.map(s => s.id);
  return [...DEFAULT_SECTIONS]; // basic / standard: 필수 5개
}

export default function AnalysisForm({ onSubmit, isLoading }: Props) {
  const [ticker, setTicker] = useState('');
  const [period, setPeriod] = useState<AnalysisParams['period']>('6m');
  const [technical, setTechnical] = useState<TechnicalLevel>('standard');
  const [sections, setSections] = useState<number[]>(DEFAULT_SECTIONS);
  const [compare, setCompare] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [peersLoading, setPeersLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  const [suggestions, setSuggestions] = useState<TickerResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleTechnicalChange = (t: TechnicalLevel) => {
    setTechnical(t);
    setSections(defaultSectionsFor(t));
  };

  const toggleSection = (id: number) => {
    setSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

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
        setShowAdvanced(true);
      }
    } catch { /* 무시 */ } finally {
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
    if (technical !== 'quick' && sections.length === 0) return;
    setShowSuggestions(false);
    onSubmit({ ticker: ticker.trim(), period, technical, compare, sections });
  };

  const segBtn = (active: boolean) =>
    `flex-1 py-1.5 text-xs font-medium rounded-md border transition-all disabled:opacity-50 ${
      active
        ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.4)] text-[#00d4ff]'
        : 'bg-gray-100 border-gray-200 text-gray-600 hover:border-gray-400 dark:bg-[rgba(6,13,26,0.6)] dark:border-[rgba(0,212,255,0.1)] dark:text-[#475569] dark:hover:border-[rgba(0,212,255,0.3)] dark:hover:text-[#64748b]'
    }`;

  const isQuick = technical === 'quick';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* 종목 입력 + 자동완성 */}
      <div ref={wrapperRef} className="relative">
        <label className="block text-xs font-medium text-gray-600 dark:text-[#64748b] mb-1">
          종목 티커 / 코드
        </label>
        <div className="flex gap-1.5 items-stretch">
          <input
            type="text"
            value={ticker}
            onChange={handleTickerChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="NVDA, TSLA, NVDL, Apple..."
            autoComplete="off"
            className="flex-1 input-dark bg-white dark:bg-transparent border border-gray-300 dark:border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-[#e2e8f0] placeholder-gray-400 dark:placeholder-[#334155] focus:outline-none focus:border-blue-500 dark:focus:border-[rgba(0,212,255,0.45)] focus:ring-1 focus:ring-blue-500 dark:focus:ring-[rgba(0,212,255,0.08)] text-sm transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !ticker.trim() || (!isQuick && sections.length === 0)}
            className="btn-neon shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-transparent disabled:bg-gray-200 dark:disabled:bg-transparent disabled:opacity-40 disabled:cursor-not-allowed text-white dark:text-[#00d4ff] font-medium rounded-lg transition-all text-sm whitespace-nowrap"
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                분석 중
              </span>
            ) : '분석'}
          </button>
        </div>

        {showSuggestions && (
          <div className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-[#0d1b2a] border border-gray-200 dark:border-[rgba(0,212,255,0.15)] rounded-lg shadow-lg overflow-y-auto max-h-64" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.05)' }}>
            {suggestions.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onMouseDown={() => handleSelect(item)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-100 dark:hover:bg-[rgba(0,212,255,0.05)] transition-colors text-left"
              >
                <div>
                  <span className="font-mono font-semibold text-gray-900 dark:text-[#e2e8f0] text-sm">{item.symbol}</span>
                  <span className="ml-2 text-gray-500 dark:text-[#475569] text-xs truncate max-w-[140px] inline-block align-bottom">{item.name}</span>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-[#334155] shrink-0">{item.exchange}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 기간 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-[#64748b] mb-1">분석 기간</label>
        <div className="flex gap-1">
          {(['3m', '6m', '1y', '2y', '3y'] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} disabled={isLoading} className={segBtn(period === p)}>
              {p === '3m' ? '3개월' : p === '6m' ? '6개월' : p === '1y' ? '1년' : p === '2y' ? '2년' : '3년'}
            </button>
          ))}
        </div>
      </div>

      {/* 분석 모드 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-[#64748b] mb-1">분석 모드</label>
        <div className="flex gap-1">
          {(['quick', 'basic', 'standard', 'advanced'] as const).map((t) => (
            <button key={t} type="button" onClick={() => handleTechnicalChange(t)} disabled={isLoading} className={segBtn(technical === t)}>
              {t === 'quick' ? '빠른' : t === 'basic' ? '기본' : t === 'standard' ? '표준' : '고급'}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          {technical === 'quick'    && <p>핵심 5개 섹션 — 토큰 절약 <span className="text-emerald-400">(~50% 절감)</span></p>}
          {technical === 'basic'    && <p>이동평균선(20/60/120일) · 지지·저항 — 빠른 개요</p>}
          {technical === 'standard' && <p>이동평균 + MACD + RSI(14) — 균형잡힌 분석 <span className="text-blue-400">(권장)</span></p>}
          {technical === 'advanced' && <p>표준 + 볼린저밴드 · 피보나치 · VWAP · 스토캐스틱 — 심층 분석</p>}
        </div>
      </div>

      {/* 섹션 선택 — 빠른 모드 제외 */}
      {!isQuick && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              포함 섹션
              <span className="ml-1.5 text-gray-400 font-normal">({sections.length}/10)</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSections(ALL_SECTIONS.map(s => s.id))}
                disabled={isLoading}
                className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors"
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => setSections(DEFAULT_SECTIONS)}
                disabled={isLoading}
                className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors"
              >
                필수
              </button>
              <button
                type="button"
                onClick={() => setSections([])}
                disabled={isLoading}
                className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
              >
                초기화
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_SECTIONS.map(sec => {
              const on = sections.includes(sec.id);
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => toggleSection(sec.id)}
                  disabled={isLoading}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                    on
                      ? 'bg-[rgba(0,212,255,0.1)] border-[rgba(0,212,255,0.35)] text-[#00d4ff]'
                      : 'bg-gray-100 dark:bg-[rgba(6,13,26,0.5)] border-gray-200 dark:border-[rgba(0,212,255,0.08)] text-gray-500 dark:text-[#475569] hover:border-gray-400 dark:hover:border-[rgba(0,212,255,0.25)]'
                  }`}
                >
                  {sec.id}. {sec.label}
                </button>
              );
            })}
          </div>
          {sections.length === 0 && (
            <p className="mt-1 text-[10px] text-red-400">섹션을 1개 이상 선택하세요.</p>
          )}
        </div>
      )}

      {/* 비교 종목 — 빠른 모드 + 섹션 7 미선택 시 숨김 */}
      {!isQuick && sections.includes(7) && (
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {showAdvanced ? '▲ 접기' : '▼ 비교 종목 추가'}
        </button>
      )}

      {showAdvanced && !isQuick && sections.includes(7) && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-[#64748b] mb-1">
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
          <input
            type="text"
            value={compare}
            onChange={(e) => { setCompare(e.target.value); setAutoFilled(false); }}
            placeholder="AMD, TSM"
            className="input-dark w-full bg-white dark:bg-transparent border border-gray-300 dark:border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-[#e2e8f0] placeholder-gray-400 dark:placeholder-[#334155] focus:outline-none focus:border-blue-500 dark:focus:border-[rgba(0,212,255,0.45)] text-sm transition-all"
            disabled={isLoading}
          />
        </div>
      )}
    </form>
  );
}
