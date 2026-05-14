import path from 'path';

export const ANALYSES_DIR = path.join(process.cwd(), 'analyses');

export function analysisFilename(ticker: string, createdAt: string): string {
  const date = createdAt.slice(0, 10).replace(/-/g, '');
  return `${ticker}_analysis_${date}.md`;
}
