'use client';

import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseContentBlocks } from '@/lib/parseCharts';

const BarChartBlock = dynamic(() => import('@/components/charts/BarChartBlock'), { ssr: false });
const RadarChartBlock = dynamic(() => import('@/components/charts/RadarChartBlock'), { ssr: false });

const PROSE =
  'prose prose-sm max-w-none ' +
  'dark:prose-invert ' +
  'prose-headings:text-gray-900 dark:prose-headings:text-white ' +
  'prose-h1:text-xl prose-h1:font-bold prose-h1:border-b prose-h1:border-gray-200 dark:prose-h1:border-gray-700 prose-h1:pb-2 ' +
  'prose-h2:text-base prose-h2:font-semibold prose-h2:text-blue-600 dark:prose-h2:text-blue-400 prose-h2:mt-6 ' +
  'prose-h3:text-sm prose-h3:font-medium prose-h3:text-gray-800 dark:prose-h3:text-gray-200 ' +
  'prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:text-sm prose-p:leading-relaxed ' +
  'prose-strong:text-gray-900 dark:prose-strong:text-white ' +
  'prose-table:text-xs ' +
  'prose-th:text-gray-700 dark:prose-th:text-gray-300 prose-th:bg-gray-100 dark:prose-th:bg-gray-800 ' +
  'prose-td:text-gray-700 dark:prose-td:text-gray-300 prose-td:border-gray-200 dark:prose-td:border-gray-700 ' +
  'prose-blockquote:border-blue-500 prose-blockquote:text-gray-700 dark:prose-blockquote:text-gray-300 ' +
  'prose-code:text-blue-600 dark:prose-code:text-blue-300 prose-code:bg-gray-100 dark:prose-code:bg-gray-800 ' +
  'prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:text-sm';

interface Props {
  content: string;
  isStreaming: boolean;
}

export default function StreamingOutput({ content, isStreaming }: Props) {
  if (!content && !isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 dark:text-gray-600">
        <svg className="w-12 h-12 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-sm">종목 티커를 입력하고 분석을 시작하세요.</p>
        <p className="text-xs opacity-70">NVDA, AAPL, 005930, 삼성전자 등</p>
      </div>
    );
  }

  if (!content && isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 dark:text-gray-500">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 bg-blue-400 dark:bg-blue-500 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <p className="text-sm">Claude가 분석 중입니다...</p>
        <p className="text-xs opacity-60">첫 응답까지 30~60초 소요될 수 있습니다</p>
      </div>
    );
  }

  const blocks = parseContentBlocks(content);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        {blocks.map((block, i) => {
          if (block.kind === 'chart' && block.chart) {
            const chart = block.chart;
            if (chart.type === 'bar') return <BarChartBlock key={i} chart={chart} />;
            if (chart.type === 'radar') return <RadarChartBlock key={i} chart={chart} />;
          }
          const sanitized = block.content.replace(/~~([\s\S]+?)~~/g, '$1');
          return (
            <div key={i} className={PROSE}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sanitized}
              </ReactMarkdown>
              {isStreaming && i === blocks.length - 1 && (
                <span className="inline-block w-2 h-4 bg-blue-500 ml-0.5 animate-pulse" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
