import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface Credentials {
  claudeAiOauth?: {
    accessToken?: string;
    expiresAt?: number;
    subscriptionType?: string;
  };
}

function readCredentials(): { loggedIn: boolean; subscriptionType: string | null } {
  try {
    const raw = readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf-8');
    const creds: Credentials = JSON.parse(raw);
    const oauth = creds?.claudeAiOauth;
    if (!oauth?.accessToken) return { loggedIn: false, subscriptionType: null };
    const notExpired = !oauth.expiresAt || Date.now() < oauth.expiresAt;
    return { loggedIn: notExpired, subscriptionType: oauth.subscriptionType ?? null };
  } catch {
    return { loggedIn: false, subscriptionType: null };
  }
}

function runAuthStatus(): Promise<{ email: string | null; subscriptionType: string | null }> {
  const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _c, ...env } = process.env;
  return new Promise((resolve) => {
    const child = spawn('claude', ['auth', 'status', '--json'], { shell: true, env, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', () => {
      try {
        const parsed = JSON.parse(out.trim());
        resolve({ email: parsed.email ?? null, subscriptionType: parsed.subscriptionType ?? null });
      } catch {
        resolve({ email: null, subscriptionType: null });
      }
    });
    child.on('error', () => resolve({ email: null, subscriptionType: null }));
    setTimeout(() => { child.kill(); resolve({ email: null, subscriptionType: null }); }, 5000);
  });
}

function runVersion(): Promise<string | null> {
  const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _c, ...env } = process.env;
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version'], { shell: true, env, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', () => resolve(out.trim() || null));
    child.on('error', () => resolve(null));
    setTimeout(() => { child.kill(); resolve(out.trim() || null); }, 5000);
  });
}

// GET /api/claude-auth — CLI 설치 및 OAuth 로그인 상태 조회
export async function GET() {
  const { loggedIn, subscriptionType: credSubType } = readCredentials();
  const [version, authStatus] = await Promise.all([runVersion(), runAuthStatus()]);

  const email = authStatus.email;
  const subscriptionType = authStatus.subscriptionType ?? credSubType;

  return Response.json({
    available: !!version,
    loggedIn,
    version,
    email,
    accountName: email ?? (subscriptionType ? `Claude ${subscriptionType}` : null),
    subscriptionType,
  });
}

// POST /api/claude-auth — 새 터미널 창에서 claude login 실행
export async function POST() {
  const isWin = process.platform === 'win32';
  try {
    if (isWin) {
      spawn(
        'powershell',
        ['-Command', 'Start-Process powershell -ArgumentList "-NoExit","-Command","claude login"'],
        { shell: false, detached: true, stdio: 'ignore' },
      ).unref();
    } else {
      spawn('open', ['-a', 'Terminal', '--args', 'bash', '-c', 'claude login; read'], {
        detached: true, stdio: 'ignore',
      }).unref();
    }
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/claude-auth — claude logout 실행
export async function DELETE() {
  const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _c, ...env } = process.env;
  return new Promise<Response>((resolve) => {
    const child = spawn('claude', ['logout'], { shell: true, env, windowsHide: true });
    child.on('close', () => resolve(Response.json({ ok: true })));
    child.on('error', (err) => resolve(Response.json({ ok: false, error: String(err) }, { status: 500 })));
    setTimeout(() => { child.kill(); resolve(Response.json({ ok: true })); }, 6000);
  });
}
