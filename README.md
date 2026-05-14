# JUBIS — AI 주식 분석 에이전트

Claude CLI를 백엔드로 사용하는 주식 종합 분석 웹앱 및 슬래시 커맨드.

## 구성

| 경로 | 설명 |
|------|------|
| `web/` | Next.js 웹앱 (분석 요청 · 스트리밍 출력 · 차트 시각화 · 히스토리) |
| `.claude/commands/stock-analysis.md` | Claude Code 슬래시 커맨드 `/stock-analysis` |

## 주요 기능

- 미국 주식 (NYSE/NASDAQ) 10개 섹션 종합 분석
- WebSearch 기반 실시간 데이터 수집 (현재 주가 · 재무 · 뉴스 · 애널리스트 의견)
- 레이더/바 차트 시각화 (밸류에이션 · 재무 실적 · 종합 스코어카드)
- 분석 히스토리 조회 및 `.md` 파일 다운로드
- 기술적 분석 레벨 선택 (기본 / 표준 / 고급)

## 웹앱 실행

```bash
cd web
npm install
npm run dev
```

`http://localhost:3000` 접속 후 종목 티커 입력 → 분석 시작.

> Claude CLI(`claude` 명령)가 설치·로그인되어 있어야 합니다.
> 설치: `npm install -g @anthropic-ai/claude-code` / 로그인: `claude login`

## 슬래시 커맨드

Claude Code에서 아래와 같이 사용:

```
/stock-analysis NVDA
/stock-analysis 005930
```
