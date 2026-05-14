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

function readCredentials(): { loggedIn: boolean; accessToken: string | null; subscriptionType: string | null } {
  try {
    const raw = readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf-8');
    const creds: Credentials = JSON.parse(raw);
    const oauth = creds?.claudeAiOauth;
    if (!oauth?.accessToken) return { loggedIn: false, accessToken: null, subscriptionType: null };
    const notExpired = !oauth.expiresAt || Date.now() < oauth.expiresAt;
    return {
      loggedIn: notExpired,
      accessToken: notExpired ? oauth.accessToken : null,
      subscriptionType: oauth.subscriptionType ?? null,
    };
  } catch {
    return { loggedIn: false, accessToken: null, subscriptionType: null };
  }
}

async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  const endpoints = [
    'https://claude.ai/api/auth/current_account',
    'https://claude.ai/api/organizations',
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const email = data?.email ?? data?.user?.email
        ?? (Array.isArray(data) ? (data[0]?.email ?? data[0]?.owner_email) : null);
      if (email) return email;
    } catch { /* try next */ }
  }
  return null;
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
  const { loggedIn, accessToken, subscriptionType } = readCredentials();
  const version = await runVersion();

  let email: string | null = null;
  if (loggedIn && accessToken) {
    email = await fetchAccountEmail(accessToken);
  }

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
