export interface ChartData {
  type: 'bar' | 'radar';
  title: string;
  unit?: string;
  max?: number;
  data: Record<string, string | number>[];
}

export interface ContentBlock {
  kind: 'markdown' | 'chart';
  content: string;
  chart?: ChartData;
}

const CHART_RE = /<!--\s*CHART:([\s\S]*?)-->/g;

export function parseContentBlocks(raw: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let lastIndex = 0;

  for (const match of raw.matchAll(CHART_RE)) {
    const start = match.index!;
    if (start > lastIndex) {
      blocks.push({ kind: 'markdown', content: raw.slice(lastIndex, start) });
    }
    try {
      const chart = JSON.parse(match[1].trim()) as ChartData;
      blocks.push({ kind: 'chart', content: match[0], chart });
    } catch {
      // malformed JSON — render as plain text
      blocks.push({ kind: 'markdown', content: match[0] });
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < raw.length) {
    blocks.push({ kind: 'markdown', content: raw.slice(lastIndex) });
  }

  return blocks;
}
