'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChartData } from '@/lib/parseCharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b'];
const KEYS = ['매출액', '영업이익', '순이익'];

function formatValue(v: number): string {
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}조`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}천`;
  return String(v);
}

interface Props {
  chart: ChartData;
}

export default function BarChartBlock({ chart }: Props) {
  const keys = KEYS.filter((k) => chart.data.some((d) => k in d));
  const unit = chart.unit ? `(${chart.unit})` : '';

  return (
    <div className="my-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
        {chart.title} {unit}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chart.data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatValue}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            formatter={(value, name) => [
              `${Number(value).toLocaleString()}${chart.unit ? ' ' + chart.unit : ''}`,
              String(name),
            ]}
            contentStyle={{
              background: 'var(--tooltip-bg, #fff)',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {keys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
