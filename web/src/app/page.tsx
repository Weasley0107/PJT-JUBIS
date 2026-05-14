'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import AnalysisForm, { type AnalysisParams } from '@/components/AnalysisForm';
import StreamingOutput from '@/components/StreamingOutput';
import HistoryPanel from '@/components/HistoryPanel';
import ThemeToggle from '@/components/ThemeToggle';
import ClaudeAuthStatus from '@/components/ClaudeAuthStatus';

export default function Home() {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentTicker, setCurrentTicker] = useState('');
  const [currentAnalysisDate, setCurrentAnalysisDate] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [usageRefreshTrigger, setUsageRefreshTrigger] = useState(0);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const streamStartRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    setProgress(0);
    setElapsedSecs(0);

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setContent((prev) => prev + decoder.decode(value, { stream: true }));
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

  const handleHistorySelect = async (id: number, createdAt: string) => {
    setSelectedHistoryId(id);
    const res = await fetch(`/api/history?id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setContent(data.content);
      setCurrentTicker(data.ticker);
      // 다운로드 파일명을 해당 분석의 날짜로 고정
      setCurrentAnalysisDate(createdAt.slice(0, 10).replace(/-/g, ''));
    }
  };

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

      {/* 사이드바 */}
      <aside className="w-72 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-colors">

        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">📈</span>
              <h1 className="font-bold text-gray-900 dark:text-white text-lg">JUBIS</h1>
            </div>
            <ThemeToggle />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">AI 주식 분석 에이전트</p>
        </div>

        {/* 분석 폼 */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <AnalysisForm onSubmit={handleAnalyze} isLoading={isStreaming} />
        </div>

        {/* CLI 로그인 상태 */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-800">
          <ClaudeAuthStatus usageRefreshTrigger={usageRefreshTrigger} />
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

        {/* 스트리밍 출력 */}
        <div className="flex-1 overflow-hidden bg-white dark:bg-gray-950 transition-colors">
          <StreamingOutput content={content} isStreaming={isStreaming} />
        </div>
      </main>
    </div>
  );
}
