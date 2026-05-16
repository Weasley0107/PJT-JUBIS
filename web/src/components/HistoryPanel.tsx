'use client';

import { useEffect, useState } from 'react';
import type { AnalysisParams } from '@/components/AnalysisForm';

interface HistoryItem {
  id: number;
  ticker: string;
  market: string;
  period: string;
  technical: string;
  compare: string;
  created_at: string;
}

interface Props {
  refreshTrigger: number;
  onSelect: (id: number, createdAt: string) => void;
  onRerun: (params: AnalysisParams) => void;
  selectedId: number | null;
}

const PERIOD_KO: Record<string, string> = {
  '3m': '3개월', '6m': '6개월', '1y': '1년', '2y': '2년', '3y': '3년',
};

const TECHNICAL_KO: Record<string, string> = {
  basic: '기본', standard: '표준', advanced: '고급',
};

export default function HistoryPanel({ refreshTrigger, onSelect, onRerun, selectedId }: Props) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');

  const fetchHistory = async () => {
    const res = await fetch('/api/history');
    if (res.ok) setHistory(await res.json());
  };

  useEffect(() => { fetchHistory(); }, [refreshTrigger]);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
    fetchHistory();
  };

  const handleRerun = (e: React.MouseEvent, item: HistoryItem) => {
    e.stopPropagation();
    if (!window.confirm(`${item.ticker} 재분석을 실행할까요?\n(토큰이 소모됩니다)`)) return;
    onRerun({
      ticker: item.ticker,
      period: item.period as AnalysisParams['period'],
      technical: item.technical as AnalysisParams['technical'],
      compare: item.compare ?? '',
    });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const filtered = search.trim()
    ? history.filter((h) => h.ticker.toLowerCase().includes(search.trim().toLowerCase()))
    : history;

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* 검색 */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="종목 검색..."
        className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-400 transition-colors"
      />

      {/* 리스트 */}
      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 dark:text-gray-600 text-xs py-6">
          {search ? '검색 결과가 없습니다.' : '분석 히스토리가 없습니다.'}
        </div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto flex-1 min-h-0">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect(item.id, item.created_at)}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors
                ${selectedId === item.id
                  ? 'bg-blue-50 dark:bg-blue-600/20 border border-blue-300 dark:border-blue-500/50'
                  : 'bg-gray-100 dark:bg-gray-800/50 border border-transparent hover:bg-gray-200 dark:hover:bg-gray-700/50'
                }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono font-semibold text-gray-900 dark:text-white text-sm">{item.ticker}</span>
                  <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                    item.market === 'US'
                      ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300'
                      : 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300'
                  }`}>
                    {item.market}
                  </span>
                </div>
                <div className="text-gray-400 dark:text-gray-500 text-[11px] mt-0.5">
                  {PERIOD_KO[item.period] ?? item.period} · {TECHNICAL_KO[item.technical] ?? item.technical} · {formatDate(item.created_at)}
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-1">
                <button
                  onClick={(e) => handleRerun(e, item)}
                  className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 text-xs px-1 transition-colors"
                  title="같은 조건으로 재분석"
                >
                  ↺
                </button>
                <button
                  onClick={(e) => handleDelete(e, item.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors text-xs px-1"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
