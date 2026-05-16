'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import AnalysisForm, { type AnalysisParams } from '@/components/AnalysisForm';
import StreamingOutput from '@/components/StreamingOutput';
import HistoryPanel from '@/components/HistoryPanel';
import ThemeToggle from '@/components/ThemeToggle';
import ClaudeAuthStatus from '@/components/ClaudeAuthStatus';
import TokenExhaustedModal from '@/components/TokenExhaustedModal';
import GuidePanel from '@/components/GuidePanel';
import type { ChartDataPayload } from '@/components/charts/CandlestickChart';
import type { DetectedPattern } from '@/lib/detectPatterns';
import { detectPatterns } from '@/lib/detectPatterns';
import ReactMarkdown from 'react-markdown';

const TOKEN_EXHAUSTED_MARKER = '__TOKEN_EXHAUSTED__';

const CandlestickChart = dynamic(() => import('@/components/charts/CandlestickChart'), { ssr: false });

export default function Home() {
  const router = useRouter();
  const [loggedInUser, setLoggedInUser] = useState<string>('');
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentTicker, setCurrentTicker] = useState('');
  const [currentAnalysisDate, setCurrentAnalysisDate] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [usageRefreshTrigger, setUsageRefreshTrigger] = useState(0);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [chartData, setChartData] = useState<ChartDataPayload | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [tokenExhaustedTime, setTokenExhaustedTime] = useState<Date | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [chartPeriod, setChartPeriod] = useState('6m');
  const [chartPatterns, setChartPatterns] = useState<DetectedPattern[]>([]);
  const [chartAnalysis, setChartAnalysis] = useState('');
  const [isChartAnalyzing, setIsChartAnalyzing] = useState(false);
  const streamStartRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chartAnalysisAbortRef = useRef<AbortController | null>(null);
  const chartCacheRef = useRef<Map<string, ChartDataPayload>>(new Map());

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.username) setLoggedInUser(d.username); })
      .catch(() => null);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // ESC 키로 가이드 모달 닫기
  useEffect(() => {
    if (!showGuide) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowGuide(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showGuide]);

  useEffect(() => {
    if (!isStreaming) {
      if (progress > 0) {
        setProgress(100);
        const t = setTimeout(() => setProgress(0), 800);
        return () => clearTimeout(t);
      }
      return;
    }
    streamStartRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - streamStartRef.current) / 1000;
      setElapsedSecs(Math.floor(elapsed));
      const p = Math.min(88, 88 * (1 - Math.exp(-elapsed / 50)));
      setProgress(p);
    }, 500);
    return () => clearInterval(interval);
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // 데이터를 직접 받아서 실행 — 자동 트리거 + 수동 버튼 공통 사용
  const runChartAnalysis = useCallback(async (data: ChartDataPayload, ticker: string, period: string) => {
    chartAnalysisAbortRef.current?.abort();
    const controller = new AbortController();
    chartAnalysisAbortRef.current = controller;

    const pats = detectPatterns(data.candles);
    setChartPatterns(pats);
    setChartAnalysis('');
    setIsChartAnalyzing(true);

    const lastVal = (arr: { value: number }[]) => arr.length ? arr[arr.length - 1].value : null;
    const last  = data.candles[data.candles.length - 1];
    const first = data.candles[0];

    const payload = {
      ticker,
      period,
      currentPrice: last.close,
      periodReturn: ((last.close - first.close) / first.close) * 100,
      recentCandles: data.candles.slice(-10).map(c => ({
        date: c.time, open: +c.open.toFixed(2), high: +c.high.toFixed(2),
        low: +c.low.toFixed(2), close: +c.close.toFixed(2),
      })),
      ma5:   lastVal(data.maLines.ma5),
      ma20:  lastVal(data.maLines.ma20),
      ma60:  lastVal(data.maLines.ma60),
      ma120: lastVal(data.maLines.ma120),
      ma200: lastVal(data.maLines.ma200),
      rsi:   data.rsiLine?.length ? data.rsiLine[data.rsiLine.length - 1].value : null,
      rsiPrev3: data.rsiLine?.slice(-3).map(r => +r.value.toFixed(1)) ?? [],
      bbUpper: data.bbLines ? lastVal(data.bbLines.upper) : null,
      bbLower: data.bbLines ? lastVal(data.bbLines.lower) : null,
      patterns: pats.map(p => ({ nameKo: p.nameKo, signal: p.signal, confidence: p.confidence, description: p.description })),
      volSpikeCount: data.volSpikes?.length ?? 0,
      sector:   data.sector,
      industry: data.industry,
    };

    try {
      const res = await fetch('/api/chart-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error('API 오류');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setChartAnalysis(prev => prev + dec.decode(value, { stream: true }));
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setChartAnalysis(`> 오류: ${err.message}`);
      }
    } finally {
      setIsChartAnalyzing(false);
    }
  }, []); // refs + state setters만 사용 — 안정적

  const handleAnalyze = useCallback(async (params: AnalysisParams) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const todayDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    setContent('');
    setIsStreaming(true);
    setCurrentTicker(params.ticker);
    setCurrentAnalysisDate(todayDate);
    setSelectedHistoryId(null);
    setChartData(null);
    setChartPeriod(params.period);
    setChartAnalysis('');
    setChartPatterns([]);
    setProgress(0);
    setElapsedSecs(0);

    // 차트 데이터 병렬 fetch + 완료되면 자동으로 AI 차트 해석 실행
    const cacheKey = `${params.ticker}:${params.period}`;
    const cached = chartCacheRef.current.get(cacheKey);
    if (cached) {
      setChartData(cached);
      runChartAnalysis(cached, params.ticker, params.period);
    } else {
      fetch(`/api/chart-data?ticker=${encodeURIComponent(params.ticker)}&period=${params.period}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: ChartDataPayload | null) => {
          if (d?.candles?.length) {
            chartCacheRef.current.set(cacheKey, d);
            setChartData(d);
            runChartAnalysis(d, params.ticker, params.period);
          }
        })
        .catch(() => null);
    }

    try {
      const res = await fetch('/api/analyze-cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error('API 응답 오류');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // 토큰 소진 마커 감지
        const markerIdx = buffer.indexOf(TOKEN_EXHAUSTED_MARKER);
        if (markerIdx !== -1) {
          const beforeMarker = buffer.slice(0, markerIdx);
          const afterMarker = buffer.slice(markerIdx + TOKEN_EXHAUSTED_MARKER.length + 1); // +1 for ':'
          if (beforeMarker) setContent((prev) => prev + beforeMarker);

          const resetTime = new Date(afterMarker.trim());
          setTokenExhaustedTime(Number.isNaN(resetTime.getTime()) ? new Date(Date.now() + 5 * 60 * 60 * 1000) : resetTime);
          reader.cancel();
          break;
        }

        setContent((prev) => prev + chunk);
        buffer = '';
      }

      setHistoryRefresh((n) => n + 1);
      setUsageRefreshTrigger((n) => n + 1);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 사용자가 직접 중지 — 에러 표시 없이 히스토리·사용량 갱신
        setHistoryRefresh((n) => n + 1);
        setUsageRefreshTrigger((n) => n + 1);
      } else {
        setContent((prev) => prev + `\n\n> **오류**: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      }
    } finally {
      setIsStreaming(false);
    }
  }, []);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleTokenExhaustedLater = () => {
    setTokenExhaustedTime(null);
    setHistoryRefresh((n) => n + 1);
  };

  const handleTokenExhaustedChangeAccount = async () => {
    setTokenExhaustedTime(null);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleHistorySelect = async (id: number, createdAt: string) => {
    setSelectedHistoryId(id);
    const res = await fetch(`/api/history?id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setContent(data.content);
      setCurrentTicker(data.ticker);
      setCurrentAnalysisDate(createdAt.slice(0, 10).replace(/-/g, ''));
      setChartAnalysis('');
      setChartPatterns([]);
      setChartPeriod('6m');
      setChartData(null);
      const cacheKey = `${data.ticker}:6m`;
      const cached = chartCacheRef.current.get(cacheKey);
      if (cached) {
        setChartData(cached);
      } else {
        fetch(`/api/chart-data?ticker=${encodeURIComponent(data.ticker)}&period=6m`)
          .then(r => r.ok ? r.json() : null)
          .then((d: ChartDataPayload | null) => {
            if (d?.candles?.length) {
              chartCacheRef.current.set(cacheKey, d);
              setChartData(d);
            }
          })
          .catch(() => null);
      }
    }
  };

  const handlePeriodChange = useCallback(async (newPeriod: string) => {
    if (!currentTicker) return;
    setChartPeriod(newPeriod);
    setChartData(null);
    const cacheKey = `${currentTicker}:${newPeriod}`;
    const cached = chartCacheRef.current.get(cacheKey);
    if (cached) {
      setChartData(cached);
      runChartAnalysis(cached, currentTicker, newPeriod);
      return;
    }
    try {
      const r = await fetch(`/api/chart-data?ticker=${encodeURIComponent(currentTicker)}&period=${newPeriod}`);
      if (r.ok) {
        const d: ChartDataPayload = await r.json();
        if (d?.candles?.length) {
          chartCacheRef.current.set(cacheKey, d);
          setChartData(d);
          runChartAnalysis(d, currentTicker, newPeriod);
        }
      }
    } catch { /* ignore */ }
  }, [currentTicker, runChartAnalysis]);

  // 수동 버튼용 래퍼 (현재 상태 기반)
  const handleChartAnalysis = useCallback(() => {
    if (!chartData || !currentTicker) return;
    runChartAnalysis(chartData, currentTicker, chartPeriod);
  }, [chartData, currentTicker, chartPeriod, runChartAnalysis]);

  const mdFilename = currentTicker && currentAnalysisDate
    ? `${currentTicker}_analysis_${currentAnalysisDate}.md`
    : '';

  const handleDownload = () => {
    if (!content || !mdFilename) return;
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = mdFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white overflow-hidden transition-colors">
      {tokenExhaustedTime && (
        <TokenExhaustedModal
          resetTime={tokenExhaustedTime}
          onLater={handleTokenExhaustedLater}
          onChangeAccount={handleTokenExhaustedChangeAccount}
        />
      )}

      {/* 사이드바 */}
      <aside className="w-72 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-colors">

        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-0.5">
            <button
              onClick={() => { setContent(''); setCurrentTicker(''); setSelectedHistoryId(null); setChartData(null); }}
              className="flex items-center gap-2 hover:opacity-75 transition-opacity"
            >
              <span className="text-xl">📈</span>
              <h1 className="font-bold text-gray-900 dark:text-white text-lg">JUBIS</h1>
            </button>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-400 dark:text-gray-500">AI 주식 분석 에이전트</p>
            {loggedInUser && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">{loggedInUser}</span>
                <button
                  onClick={handleLogout}
                  className="text-xs text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                  title="로그아웃"
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 분석 폼 */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <AnalysisForm onSubmit={handleAnalyze} isLoading={isStreaming} />
        </div>

        {/* CLI 로그인 상태 */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-800">
          <ClaudeAuthStatus usageRefreshTrigger={usageRefreshTrigger} />
        </div>

        {/* 가이드 토글 버튼 */}
        <div className="px-4 pb-2">
          <button
            onClick={() => setShowGuide((v) => !v)}
            className={`flex items-center gap-2 w-full px-3 py-2 text-xs rounded-lg transition-colors ${
              showGuide
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            주식 가이드 (용어·차트 읽기)
            {showGuide && <span className="ml-auto text-[9px] px-1 py-0.5 bg-blue-500 text-white rounded">열림</span>}
          </button>
        </div>

        {/* 히스토리 */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-4 gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">히스토리</h2>
            <button
              onClick={() => setHistoryRefresh((n) => n + 1)}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-400 text-xs transition-colors"
            >
              새로고침
            </button>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            <HistoryPanel
              refreshTrigger={historyRefresh}
              onSelect={handleHistorySelect}
              onRerun={handleAnalyze}
              selectedId={selectedHistoryId}
            />
          </div>
        </div>
      </aside>

      {/* 메인 영역 */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* 상단 바 */}
        <div className="relative flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/50 backdrop-blur-sm flex-shrink-0 transition-colors">
          <div className="flex items-center gap-2">
            {currentTicker ? (
              <>
                <span className="font-mono font-bold text-gray-900 dark:text-white">{currentTicker}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300">
                  CLI
                </span>
                {isStreaming && (
                  <>
                    <span className="flex items-center gap-1.5 text-blue-500 dark:text-blue-400 text-xs">
                      <span className="w-1.5 h-1.5 bg-blue-500 dark:bg-blue-400 rounded-full animate-pulse" />
                      분석 중... {elapsedSecs > 0 && <span className="text-gray-400 dark:text-gray-500">{elapsedSecs}s</span>}
                    </span>
                    <button
                      onClick={handleStop}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                    >
                      <span className="w-2 h-2 bg-red-500 rounded-sm inline-block" />
                      중지
                    </button>
                  </>
                )}
              </>
            ) : (
              <span className="text-gray-400 dark:text-gray-600 text-sm">종목을 선택하거나 분석을 시작하세요</span>
            )}
          </div>

          {content && !isStreaming && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              .md 저장
            </button>
          )}

          {/* 프로그레스바 */}
          {progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full bg-blue-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* 캔들차트 */}
        {currentTicker && (
          chartData ? (
            <CandlestickChart
              data={chartData}
              ticker={currentTicker}
              period={chartPeriod}
              onPeriodChange={handlePeriodChange}
              onPatternsDetected={setChartPatterns}
              onAnalyzeChart={handleChartAnalysis}
              isAnalyzingChart={isChartAnalyzing}
            />
          ) : (
            <div className="h-[52px] flex items-center px-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
              <span className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">차트 데이터 로딩 중...</span>
            </div>
          )
        )}

        {/* AI 차트 해석 결과 패널 */}
        {(chartAnalysis || isChartAnalyzing) && (
          <div className="border-b border-gray-200 dark:border-gray-800 bg-indigo-50/40 dark:bg-indigo-950/20 px-5 py-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full bg-indigo-500 ${isChartAnalyzing ? 'animate-pulse' : ''}`} />
                AI 차트 해석
                {isChartAnalyzing && <span className="text-gray-400 dark:text-gray-500 font-normal">분석 중...</span>}
              </span>
              {!isChartAnalyzing && (
                <button
                  onClick={() => setChartAnalysis('')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
                >✕</button>
              )}
            </div>
            <div className="prose prose-xs max-w-none dark:prose-invert prose-p:my-1 prose-p:text-xs prose-strong:text-gray-900 dark:prose-strong:text-white text-gray-700 dark:text-gray-300">
              <ReactMarkdown>{chartAnalysis || ' '}</ReactMarkdown>
              {isChartAnalyzing && (
                <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          </div>
        )}

        {/* 스트리밍 출력 */}
        <div className="flex-1 overflow-hidden bg-white dark:bg-gray-950 transition-colors">
          <StreamingOutput content={content} isStreaming={isStreaming} />
        </div>
      </main>

      {/* 가이드 모달 — 레이아웃 영향 없이 오버레이로 표시 */}
      {showGuide && (
        <>
          {/* 배경 딤 — 클릭 시 닫기 */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowGuide(false)}
          />
          {/* 모달 컨테이너 */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
            <div
              className="w-full max-w-3xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <GuidePanel onClose={() => setShowGuide(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
