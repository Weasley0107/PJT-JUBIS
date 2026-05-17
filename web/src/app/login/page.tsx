'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '로그인에 실패했습니다.');
        return;
      }
      const from = searchParams.get('from') ?? '/';
      router.push(from);
      router.refresh();
    } catch {
      setError('서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.');
    } finally {
      setLoading(false);
    }
  };

  const focusInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,212,255,0.08)';
  };
  const blurInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #060d1a 0%, #0a1628 50%, #060d1a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      }}
    >
      {/* Ambient glow — top */}
      <div style={{
        position: 'absolute', top: '-120px', left: '50%',
        transform: 'translateX(-50%)',
        width: '700px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(0,212,255,0.10) 0%, transparent 65%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />
      {/* Ambient glow — bottom right */}
      <div style={{
        position: 'absolute', bottom: '-80px', right: '20%',
        width: '400px', height: '250px', borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(0,255,136,0.06) 0%, transparent 65%)',
        filter: 'blur(60px)', pointerEvents: 'none',
      }} />
      {/* Subtle grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage:
          'linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: '340px', padding: '0 20px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '11px',
              background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,255,136,0.10))',
              border: '1px solid rgba(0,212,255,0.30)',
              boxShadow: '0 0 24px rgba(0,212,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"
                  stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="16 7 22 7 22 13"
                  stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 style={{
              fontFamily: 'var(--font-space-grotesk), sans-serif',
              fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em',
              color: '#e2e8f0', lineHeight: 1, margin: 0,
            }}>
              JUBIS
            </h1>
          </div>
          <p style={{ color: '#475569', fontSize: '0.8rem', letterSpacing: '0.04em', margin: 0 }}>
            AI 주식 분석 에이전트
          </p>
        </div>

        {/* Glass card — always dark, no .dark class dependency */}
        <div style={{
          background: 'rgba(10, 18, 35, 0.90)',
          border: '1px solid rgba(0, 212, 255, 0.14)',
          borderRadius: '18px',
          padding: '32px 28px',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 0 0 1px rgba(0,212,255,0.05), 0 25px 60px rgba(0,0,0,0.6)',
        }}>
          <p style={{
            color: '#475569', fontSize: '0.65rem', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginTop: 0, marginBottom: '24px',
          }}>
            로그인
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* 아이디 */}
            <div>
              <label style={{
                display: 'block', marginBottom: '7px',
                color: '#64748b', fontSize: '0.75rem', fontWeight: 500,
              }}>
                아이디
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디 입력"
                required
                autoFocus
                autoComplete="username"
                onFocus={focusInput}
                onBlur={blurInput}
                style={{
                  display: 'block', width: '100%', boxSizing: 'border-box',
                  padding: '10px 14px',
                  background: 'rgba(6, 13, 26, 0.80)',
                  border: '1px solid rgba(0,212,255,0.20)',
                  borderRadius: '9px',
                  color: '#e2e8f0', fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
                }}
              />
            </div>

            {/* 비밀번호 */}
            <div>
              <label style={{
                display: 'block', marginBottom: '7px',
                color: '#64748b', fontSize: '0.75rem', fontWeight: 500,
              }}>
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                required
                autoComplete="current-password"
                onFocus={focusInput}
                onBlur={blurInput}
                style={{
                  display: 'block', width: '100%', boxSizing: 'border-box',
                  padding: '10px 14px',
                  background: 'rgba(6, 13, 26, 0.80)',
                  border: '1px solid rgba(0,212,255,0.20)',
                  borderRadius: '9px',
                  color: '#e2e8f0', fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '9px 13px',
                background: 'rgba(239,68,68,0.09)',
                border: '1px solid rgba(239,68,68,0.22)',
                borderRadius: '8px',
                color: '#f87171', fontSize: '0.75rem', lineHeight: 1.4,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '4px',
                width: '100%', padding: '11px',
                background: loading
                  ? 'rgba(0,212,255,0.07)'
                  : 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,255,136,0.12))',
                border: '1px solid rgba(0,212,255,0.40)',
                borderRadius: '9px',
                color: '#00d4ff', fontSize: '0.875rem', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 0 20px rgba(0,212,255,0.14)',
                transition: 'all 0.2s ease',
                opacity: loading ? 0.55 : 1,
              }}
            >
              {loading ? '로그인 중...' : '로그인 →'}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: 'center', marginTop: '22px',
          color: '#1e293b', fontSize: '0.6875rem',
        }}>
          JUBIS · Powered by Claude AI
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
