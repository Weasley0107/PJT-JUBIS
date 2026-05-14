import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { buildPrompt, type PeriodCode, type TechnicalLevel } from '@/lib/prompt';
import { saveAnalysis } from '@/lib/db';
import { ANALYSES_DIR, analysisFilename } from '@/lib/paths';

function detectStderrError(stderr: string): string | null {
  const s = stderr.toLowerCase();
  if (s.includes('credit') || s.includes('balance') || s.includes('billing') || s.includes('payment')) {
    return '**토큰/크레딧이 부족합니다.** Claude 계정의 사용량 또는 결제 정보를 확인하세요.';
  }
  if (s.includes('rate_limit') || s.includes('rate limit') || s.includes('too many request')) {
    return '**요청 한도(Rate Limit)를 초과했습니다.** 잠시 후 다시 시도하세요.';
  }
  if (s.includes('overloaded')) {
    return '**Claude 서버가 과부하 상태입니다.** 잠시 후 다시 시도하세요.';
  }
  if ((s.includes('token') || s.includes('usage')) && (s.includes('limit') || s.includes('exceed') || s.includes('quota'))) {
    return '**토큰 한도를 초과했습니다.** 구독 플랜의 사용량을 확인하세요.';
  }
  if (s.includes('unauthorized') || s.includes('401') || s.includes('not logged in') || s.includes('login')) {
    return '**인증 오류입니다.** `claude login` 명령으로 다시 로그인하세요.';
  }
  return null;
}

interface StreamEvent {
  type: string;
  subtype?: string;
  result?: string;
  message?: {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens: number; output_tokens: number };
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export async function POST(request: NextRequest) {
  const { ticker, period, technical, compare } = await request.json() as {
    ticker: string;
    period: PeriodCode;
    technical: TechnicalLevel;
    compare: string;
  };

  if (!ticker?.trim()) {
    return new Response(JSON.stringify({ error: '종목 티커를 입력해주세요.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = buildPrompt({ ticker: ticker.trim(), period, technical, compare });

  console.log(`[CLI] ${ticker.trim()} 분석 시작 — 프롬프트 ${prompt.length}자`);

  let fullContent = '';
  let input_tokens = 0;
  let output_tokens = 0;
  let aborted = false;

  // child를 cancel() 콜백에서도 접근하기 위해 외부에 참조 보관
  let childRef: ReturnType<typeof spawn> | null = null;

  const saveResult = () => {
    if (!fullContent) return;
    const createdAt = new Date().toISOString();
    saveAnalysis({
      ticker: ticker.trim(),
      market: 'US',
      period,
      technical,
      compare: compare ?? '',
      mode: 'cli',
      content: fullContent,
      input_tokens,
      output_tokens,
    });
    const filename = analysisFilename(ticker.trim(), createdAt);
    mkdir(ANALYSES_DIR, { recursive: true })
      .then(() => writeFile(path.join(ANALYSES_DIR, filename), fullContent, 'utf-8'))
      .catch((e) => console.error('[CLI] .md 파일 저장 실패:', e));
  };

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const safeEnqueue = (text: string) => { if (!closed) controller.enqueue(encoder.encode(text)); };
      const safeClose = () => { if (!closed) { closed = true; controller.close(); } };

      // OAuth(구독) 모드 강제: API 키 환경변수가 있으면 CLI가 그쪽을 우선 사용하므로 제거.
      // PATH 등 시스템 환경변수는 그대로 보존해야 claude.cmd 위치를 찾을 수 있음.
      const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _c, ...env } = process.env;

      // Claude CLI 호출
      // - --print            : 비대화형(1회성) 출력 모드
      // - --verbose          : stream-json 사용 시 필수
      // - --output-format stream-json : 각 줄이 JSON 이벤트로 스트리밍됨
      // - --dangerously-skip-permissions : WebSearch 등 도구 권한 프롬프트 스킵
      const args = [
        '--print',
        '--verbose',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions',
        '--model', 'claude-sonnet-4-6',
        prompt,
      ];

      // Windows에서 claude는 .cmd/.ps1 래퍼라서 shell:true가 필요.
      // prompt를 인자로 직접 넘기면 따옴표·줄바꿈 이스케이프가 깨지므로 stdin으로 주입한다.
      const isWin = process.platform === 'win32';
      const argsStdin = args.slice(0, -1); // prompt 제외 (stdin으로 전달)

      const child = spawn('claude', argsStdin, {
        env,
        shell: isWin,
        windowsHide: true,
      });
      childRef = child;

      // 클라이언트가 fetch를 abort하면 child process 종료
      request.signal.addEventListener('abort', () => {
        aborted = true;
        console.log(`[CLI] 사용자 중단 요청`);
        if (!child.killed) child.kill('SIGTERM');
      });

      // prompt를 UTF-8로 stdin 주입 (Windows 한글 깨짐 방지)
      child.stdin.write(prompt, 'utf8');
      child.stdin.end();

      let lineBuffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString('utf8');
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event: StreamEvent | null = null;
          try { event = JSON.parse(trimmed); } catch { /* 비-JSON 라인 무시 */ }

          if (!event) continue;

          // assistant 이벤트: 텍스트 청크를 프론트로 스트리밍
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text' && block.text) {
                fullContent += block.text;
                safeEnqueue(block.text);
              }
            }
          }

          // result 이벤트: 최종 토큰 사용량
          if (event.type === 'result' && event.usage) {
            input_tokens = event.usage.input_tokens ?? 0;
            output_tokens = event.usage.output_tokens ?? 0;
            console.log(`[CLI] 토큰 — 입력 ${input_tokens}, 출력 ${output_tokens}`);
          }
        }
      });

      let stderrBuffer = '';
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderrBuffer += text;
        const trimmed = text.trim();
        if (trimmed) console.log(`[CLI stderr] ${trimmed}`);
      });

      child.on('close', (code) => {
        console.log(`[CLI] 종료 — 코드 ${code}, 응답 ${fullContent.length}자, 토큰 in=${input_tokens} out=${output_tokens}, 중단=${aborted}`);

        if (fullContent) {
          // 중단이든 정상 종료든 내용이 있으면 저장
          saveResult();
          if (aborted) {
            safeEnqueue('\n\n---\n> *분석이 중단되었습니다. 여기까지의 내용이 저장됩니다.*');
          }
        } else if (code !== 0 && !aborted) {
          const stderrTail = stderrBuffer.trim().slice(-500);
          const knownError = detectStderrError(stderrTail);
          if (knownError) {
            safeEnqueue(`\n\n> ${knownError}`);
          } else {
            safeEnqueue(
              `\n\n> **오류**: Claude CLI 실행 실패 (exit code ${code}).\n` +
              `> \`claude\` 명령어가 설치·로그인되어 있는지 확인하세요.\n` +
              `> 설치: \`npm install -g @anthropic-ai/claude-code\`\n` +
              `> 로그인: \`claude login\`\n` +
              (stderrTail ? `>\n> **stderr**:\n> \`\`\`\n> ${stderrTail.replace(/\n/g, '\n> ')}\n> \`\`\`` : '')
            );
          }
        }
        safeClose();
      });

      child.on('error', (err) => {
        console.error(`[CLI] 스폰 오류: ${err.message}`);
        safeEnqueue(
          `\n\n> **오류**: Claude CLI를 찾을 수 없습니다.\n` +
          `> 설치: \`npm install -g @anthropic-ai/claude-code\`\n` +
          `> 상세: ${err.message}`
        );
        safeClose();
      });
    },
    cancel() {
      // ReadableStream 자체가 취소될 때(브라우저 탭 닫기 등) child 정리
      if (childRef && !childRef.killed) {
        aborted = true;
        childRef.kill('SIGTERM');
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
