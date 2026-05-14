import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { ANALYSES_DIR } from '@/lib/paths';

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');

  if (!filename || !/^[\w.-]+\.md$/.test(filename)) {
    return new Response('Invalid filename', { status: 400 });
  }

  const filepath = path.join(ANALYSES_DIR, filename);

  try {
    const content = await readFile(filepath, 'utf-8');
    return new Response(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response('File not found', { status: 404 });
  }
}
