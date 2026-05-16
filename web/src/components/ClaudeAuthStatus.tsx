'use client';

import { useEffect, useState } from 'react';

type Status = 'checking' | 'not-installed' | 'logged-out' | 'logged-in';

interface AuthInfo {
  available: boolean;
  loggedIn: boolean;
  version?: string | null;
  email?: string | null;
  accountName?: string | null;
  subscriptionType?: string | null;
}

interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  count: number;
  today_count: number;
}

interface Props {
  onStatusChange?: (loggedIn: boolean) => void;
  usageRefreshTrigger?: number;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function UsageBar({ label, used, total, color }: { label: string; used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
        <span>{label}</span>
        <span>{fmtTokens(used)} / {fmtTokens(total)}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ClaudeAuthStatus({ onStatusChange, usageRefreshTrigger }: Props) {
  const [status, setStatus] = useState<Status>('checking');
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/usage');
      if (res.ok) setUsage(await res.json());
    } catch { /* ignore */ }
  };

  const checkStatus = async () => {
    setStatus('checking');
    try {
      const res = await fetch('/api/claude-auth');
      const data: AuthInfo = await res.json();
      setInfo(data);
      if (!data.available) {
        setStatus('not-installed');
        onStatusChange?.(false);
      } else if (data.loggedIn) {
        setStatus('logged-in');
        onStatusChange?.(true);
        fetchUsage();
      } else {
        setStatus('logged-out');
        onStatusChange?.(false);
      }
    } catch {
      setStatus('not-installed');
    }
  };

  useEffect(() => { checkStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (usageRefreshTrigger && status === 'logged-in') fetchUsage();
  }, [usageRefreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMsg('');
    setShowModal(true);
    try {
      const res = await fetch('/api/claude-auth', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) setErrorMsg(data.error ?? '터미널 창 열기 실패');
    } catch (e) {
      setErrorMsg(String(e));
    }
    setIsLoggingIn(false);
  };

  const handleLogout = async () => {
    if (!window.confirm('Claude CLI에서 로그아웃할까요?\n로그아웃 후 분석 기능을 사용할 수 없습니다.')) return;
    setIsLoggingOut(true);
    try {
      await fetch('/api/claude-auth', { method: 'DELETE' });
      await checkStatus();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const closeModal = () => { setShowModal(false); setErrorMsg(''); };

  const dotClass: Record<Status, string> = {
    checking: 'bg-gray-400 animate-pulse',
    'not-installed': 'bg-red-500',
    'logged-out': 'bg-yellow-500',
    'logged-in': 'bg-emerald-500',
  };

  const totalTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
  const SOFT_LIMIT = 1_000_000;

  return (
    <>
      <div className="px-3 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 space-y-2">
        {/* 헤더 행 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass[status]}`} />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 shrink-0">
              Claude CLI
            </span>
            {status === 'checking' && <span className="text-xs text-gray-400">확인 중...</span>}
            {status === 'not-installed' && <span className="text-xs text-red-500">미설치</span>}
            {status === 'logged-out' && <span className="text-xs text-yellow-600 dark:text-yellow-400">로그인 필요</span>}
          </div>
          <button
            onClick={checkStatus}
            className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
            title="새로고침"
          >
            ↺
          </button>
        </div>

        {/* 로그인 상태 */}
        {status === 'logged-in' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                {info?.email ? (
                  <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                    {info.email}
                  </p>
                ) : (
                  <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200">
                    {info?.accountName ?? '계정 확인 중'}
                  </p>
                )}
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  Claude {info?.subscriptionType ?? ''} · OAuth
                </p>
              </div>
              {info?.version && (
                <span className="text-[9px] font-mono text-gray-400 dark:text-gray-500 shrink-0 ml-1">
                  v{info.version.replace(/[^0-9.]/g, '')}
                </span>
              )}
            </div>

            {usage !== null && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
                  <span className="font-medium">30일 사용량</span>
                  <span>분석 {usage.count}회 (오늘 {usage.today_count}회)</span>
                </div>

                <UsageBar
                  label="입력 토큰"
                  used={usage.input_tokens}
                  total={SOFT_LIMIT}
                  color="bg-blue-500"
                />
                <UsageBar
                  label="출력 토큰"
                  used={usage.output_tokens}
                  total={Math.round(SOFT_LIMIT * 0.3)}
                  color="bg-emerald-500"
                />

                <div className="flex justify-between text-[10px] pt-0.5">
                  <span className="text-gray-400">총 토큰</span>
                  <span className="font-medium text-gray-600 dark:text-gray-300">
                    {fmtTokens(totalTokens)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 미설치 안내 */}
        {status === 'not-installed' && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
            설치: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">npm i -g @anthropic-ai/claude-code</code>
          </p>
        )}

        {/* 로그인 버튼 */}
        {status === 'logged-out' && (
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            {isLoggingIn ? '터미널 창 여는 중...' : '로그인'}
          </button>
        )}

        {/* 로그아웃 버튼 */}
        {status === 'logged-in' && (
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-600 dark:text-gray-300 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
          >
            {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
          </button>
        )}
      </div>

      {/* 로그인 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-[440px] max-w-[90vw] p-6 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Claude 로그인</h3>

            {errorMsg ? (
              <p className="text-xs text-red-500">{errorMsg}</p>
            ) : (
              <ol className="text-xs text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside leading-relaxed">
                <li>방금 새 PowerShell 창이 열렸습니다.</li>
                <li>그 창에서 브라우저가 자동으로 열립니다.</li>
                <li>Claude 계정으로 로그인하세요.</li>
                <li>로그인 완료 후 아래 <strong>상태 재확인</strong>을 클릭하세요.</li>
              </ol>
            )}

            <p className="text-[10px] text-gray-400">
              창이 안 열렸다면 터미널에서 직접:&nbsp;
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">claude login</code>
            </p>

            <div className="flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 py-2 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                닫기
              </button>
              <button
                onClick={async () => { await checkStatus(); closeModal(); }}
                className="flex-1 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                상태 재확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
