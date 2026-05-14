import { unlink } from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { getHistory, getAnalysisById, deleteAnalysis } from '@/lib/db';
import { ANALYSES_DIR, analysisFilename } from '@/lib/paths';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const analysis = getAnalysisById(Number(id));
    if (!analysis) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
    return Response.json(analysis);
  }

  const history = getHistory(50);
  return Response.json(history);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  }

  const analysis = getAnalysisById(Number(id));
  deleteAnalysis(Number(id));

  if (analysis) {
    const filename = analysisFilename(analysis.ticker, analysis.created_at);
    unlink(path.join(ANALYSES_DIR, filename)).catch(() => { /* 파일 없으면 무시 */ });
  }

  return Response.json({ success: true });
}
