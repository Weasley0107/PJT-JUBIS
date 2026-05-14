'use client';

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { ChartData } from '@/lib/parseCharts';

interface Props {
  chart: ChartData;
}

export default function RadarChartBlock({ chart }: Props) {
  const max = chart.max ?? Math.max(...chart.data.map((d) => Number(d.value) || 0), 1);

  return (
    <div className="my-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 text-center">
        {chart.title}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={chart.data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, max]}
            tick={{ fontSize: 9, fill: '#9ca3af' }}
            tickCount={max <= 5 ? max + 1 : 6}
          />
          <Radar
            name={chart.title}
            dataKey="value"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Tooltip
            formatter={(value) => [Number(value), chart.title]}
            contentStyle={{
              background: 'var(--tooltip-bg, #fff)',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
