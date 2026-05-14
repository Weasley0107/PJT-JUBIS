<#
.SYNOPSIS
    Claude Code 기반 주식 종합 분석 자동화 스크립트

.DESCRIPTION
    /stock-analysis 커맨드를 활용해 주식 분석 리포트를 자동 생성하고 파일로 저장합니다.
    미국(NYSE/NASDAQ) 및 한국(KRX) 종목 모두 지원합니다.

.PARAMETER Ticker
    분석할 종목 티커 또는 종목코드 (필수)
    예: NVDA, AAPL, 005930, 삼성전자

.PARAMETER Compare
    비교 분석할 종목 티커 (선택, 쉼표로 구분하여 복수 입력 가능)
    예: "AAPL,MSFT"

.PARAMETER Period
    분석 기간 설정 (기본값: 6개월)
    옵션: 3m, 6m, 1y, 2y, 3y

.PARAMETER Technical
    기술적 분석 상세 레벨 (기본값: standard)
    옵션: basic, standard, advanced

.PARAMETER Format
    출력 형식 (기본값: markdown)
    옵션: markdown, json, csv

.PARAMETER OutputDir
    분석 리포트 저장 디렉토리 (기본값: 현재 디렉토리 내 reports 폴더)

.PARAMETER NoSave
    파일 저장 없이 터미널 출력만 수행

.EXAMPLE
    # 기본 분석 (NVDA)
    .\analyze_stock.ps1 NVDA

.EXAMPLE
    # 비교 분석 포함 (NVDA vs AMD, TSMC)
    .\analyze_stock.ps1 NVDA -Compare "AMD,TSM"

.EXAMPLE
    # 상세 기술적 분석 + 3년치 데이터
    .\analyze_stock.ps1 005930 -Period 3y -Technical advanced

.EXAMPLE
    # 여러 종목 배치 분석
    .\analyze_stock.ps1 NVDA,AAPL,MSFT

.EXAMPLE
    # JSON 형식으로 출력 디렉토리 지정
    .\analyze_stock.ps1 TSLA -Format json -OutputDir "C:\StockReports"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0, HelpMessage = "종목 티커 (복수 시 쉼표 구분)")]
    [string]$Ticker,

    [Parameter(HelpMessage = "비교 종목 티커 (쉼표 구분)")]
    [string]$Compare = "",

    [Parameter(HelpMessage = "분석 기간: 3m, 6m, 1y, 2y, 3y")]
    [ValidateSet("3m", "6m", "1y", "2y", "3y")]
    [string]$Period = "6m",

    [Parameter(HelpMessage = "기술적 분석 레벨: basic, standard, advanced")]
    [ValidateSet("basic", "standard", "advanced")]
    [string]$Technical = "standard",

    [Parameter(HelpMessage = "출력 형식: markdown, json, csv")]
    [ValidateSet("markdown", "json", "csv")]
    [string]$Format = "markdown",

    [Parameter(HelpMessage = "리포트 저장 디렉토리")]
    [string]$OutputDir = "",

    [Parameter(HelpMessage = "파일 저장 없이 터미널 출력만 수행")]
    [switch]$NoSave
)

# ─────────────────────────────────────────────
# 유틸 함수
# ─────────────────────────────────────────────

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Text)
    Write-Host "  ▶ $Text" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Text)
    Write-Host "  ✔ $Text" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Text)
    Write-Host "  ⚠ $Text" -ForegroundColor DarkYellow
}

function Write-Err {
    param([string]$Text)
    Write-Host "  ✘ $Text" -ForegroundColor Red
}

function Get-MarketType {
    param([string]$TickerSymbol)
    # 6자리 숫자 → 한국 KRX
    if ($TickerSymbol -match '^\d{6}$') { return "KRX" }
    # 한글 포함 → 한국
    if ($TickerSymbol -match '[가-힣]') { return "KRX" }
    # 영문 → 미국
    return "US"
}

function Get-PeriodLabel {
    param([string]$PeriodCode)
    $map = @{ "3m" = "3개월"; "6m" = "6개월"; "1y" = "1년"; "2y" = "2년"; "3y" = "3년" }
    return $map[$PeriodCode]
}

function Get-TechnicalLabel {
    param([string]$Level)
    $map = @{ "basic" = "기본 (이동평균선)"; "standard" = "표준 (이동평균+MACD+RSI)"; "advanced" = "고급 (표준+볼린저+피보나치+거래량 분석)" }
    return $map[$Level]
}

function Build-Prompt {
    param(
        [string]$TickerSymbol,
        [string]$MarketType,
        [string]$PeriodCode,
        [string]$TechnicalLevel,
        [string]$OutputFormat,
        [string]$CompareList,
        [bool]$SaveFile,
        [string]$SaveDir
    )

    $today = Get-Date -Format "yyyyMMdd"
    $periodLabel = Get-PeriodLabel -PeriodCode $PeriodCode
    $techLabel = Get-TechnicalLabel -Level $TechnicalLevel

    $marketNote = if ($MarketType -eq "KRX") {
        "한국 KRX 상장 종목으로 원화(₩) 단위로 분석해. 한국거래소 기준 재무제표를 사용해."
    } else {
        "미국 NYSE/NASDAQ 상장 종목으로 달러($) 단위로 분석해. SEC 공시 기준 재무제표를 사용해."
    }

    $compareNote = if ($CompareList -ne "") {
        "비교 분석 대상: $CompareList — 섹션 7 산업 분석에서 경쟁사 비교표를 추가해줘."
    } else { "" }

    $advancedTech = if ($TechnicalLevel -eq "advanced") {
        "추가로 피보나치 되돌림 레벨, 거래량 프로파일(VWAP), 스토캐스틱 지표도 포함해줘."
    } elseif ($TechnicalLevel -eq "basic") {
        "기술적 분석은 20일/60일/120일 이동평균선과 지지저항선만 포함해줘."
    } else { "" }

    $saveInstruction = if ($SaveFile) {
        $fileName = "${TickerSymbol}_analysis_${today}.md"
        $filePath = if ($SaveDir -ne "") { Join-Path $SaveDir $fileName } else { $fileName }
        "분석 완료 후 결과를 반드시 '$filePath' 파일로 저장해줘."
    } else {
        "파일 저장 없이 터미널에 출력해줘."
    }

    $prompt = @"
/stock-analysis $TickerSymbol

추가 분석 조건:
- $marketNote
- 분석 기간: $periodLabel
- 기술적 분석 레벨: $techLabel
$advancedTech
$compareNote
- $saveInstruction
"@

    return $prompt.Trim()
}

# ─────────────────────────────────────────────
# 사전 점검
# ─────────────────────────────────────────────

function Test-ClaudeCLI {
    $claudeCmd = Get-Command "claude" -ErrorAction SilentlyContinue
    if ($null -eq $claudeCmd) {
        Write-Err "Claude CLI가 설치되어 있지 않거나 PATH에 등록되지 않았습니다."
        Write-Host "    설치 방법: npm install -g @anthropic-ai/claude-code" -ForegroundColor Gray
        return $false
    }
    return $true
}

function Ensure-OutputDir {
    param([string]$Dir)
    if ($Dir -ne "" -and -not (Test-Path $Dir)) {
        try {
            New-Item -ItemType Directory -Force -Path $Dir | Out-Null
            Write-Success "출력 디렉토리 생성: $Dir"
        } catch {
            Write-Err "디렉토리 생성 실패: $Dir"
            return $false
        }
    }
    return $true
}

# ─────────────────────────────────────────────
# 단일 종목 분석 실행
# ─────────────────────────────────────────────

function Invoke-StockAnalysis {
    param(
        [string]$TickerSymbol,
        [string]$CompareList,
        [string]$PeriodCode,
        [string]$TechnicalLevel,
        [string]$OutputFormat,
        [bool]$SaveFile,
        [string]$SaveDir
    )

    $market = Get-MarketType -TickerSymbol $TickerSymbol
    $marketIcon = if ($market -eq "KRX") { "🇰🇷" } else { "🇺🇸" }

    Write-Header "$marketIcon $TickerSymbol 종합 분석 시작"
    Write-Step "시장: $market | 기간: $(Get-PeriodLabel $PeriodCode) | 기술 레벨: $(Get-TechnicalLabel $TechnicalLevel)"

    if ($CompareList -ne "") {
        Write-Step "비교 종목: $CompareList"
    }

    $prompt = Build-Prompt `
        -TickerSymbol $TickerSymbol `
        -MarketType $market `
        -PeriodCode $PeriodCode `
        -TechnicalLevel $TechnicalLevel `
        -OutputFormat $OutputFormat `
        -CompareList $CompareList `
        -SaveFile $SaveFile `
        -SaveDir $SaveDir

    Write-Step "Claude CLI 실행 중..."
    Write-Host ""

    # Claude CLI 실행 (--print 모드: 비대화형 출력)
    $claudeArgs = @("--print", "--dangerously-skip-permissions", $prompt)

    try {
        & claude @claudeArgs
        $exitCode = $LASTEXITCODE

        Write-Host ""
        if ($exitCode -eq 0) {
            Write-Success "$TickerSymbol 분석 완료"
            if ($SaveFile) {
                $today = Get-Date -Format "yyyyMMdd"
                $fileName = "${TickerSymbol}_analysis_${today}.md"
                $filePath = if ($SaveDir -ne "") { Join-Path $SaveDir $fileName } else { Join-Path (Get-Location) $fileName }
                if (Test-Path $filePath) {
                    Write-Success "리포트 저장됨: $filePath"
                }
            }
        } else {
            Write-Err "Claude CLI 실행 중 오류 발생 (exit code: $exitCode)"
        }
    } catch {
        Write-Err "실행 오류: $_"
    }
}

# ─────────────────────────────────────────────
# 메인 실행
# ─────────────────────────────────────────────

# Claude CLI 설치 여부 확인
if (-not (Test-ClaudeCLI)) { exit 1 }

# 출력 디렉토리 준비
$resolvedOutputDir = $OutputDir
if (-not $NoSave -and $OutputDir -eq "") {
    $resolvedOutputDir = Join-Path (Get-Location) "reports"
}
if (-not $NoSave) {
    if (-not (Ensure-OutputDir -Dir $resolvedOutputDir)) { exit 1 }
}

# 종목 목록 파싱 (쉼표 구분 다중 종목 지원)
$tickerList = $Ticker -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

if ($tickerList.Count -eq 0) {
    Write-Err "종목 티커를 입력해주세요."
    exit 1
}

if ($tickerList.Count -gt 1) {
    Write-Header "배치 분석 모드: $($tickerList.Count)개 종목"
    Write-Warn "배치 분석 시 각 종목 간 30초 대기합니다."
}

$successCount = 0
$failCount = 0

foreach ($t in $tickerList) {
    Invoke-StockAnalysis `
        -TickerSymbol $t `
        -CompareList $Compare `
        -PeriodCode $Period `
        -TechnicalLevel $Technical `
        -OutputFormat $Format `
        -SaveFile (-not $NoSave) `
        -SaveDir $resolvedOutputDir

    $successCount++

    # 다중 종목 간 대기 (API 부하 방지)
    if ($tickerList.Count -gt 1 -and $t -ne $tickerList[-1]) {
        Write-Step "다음 종목 분석까지 30초 대기..."
        Start-Sleep -Seconds 30
    }
}

# ─────────────────────────────────────────────
# 완료 요약
# ─────────────────────────────────────────────

Write-Header "분석 완료 요약"
Write-Success "총 $successCount개 종목 분석 완료"

if (-not $NoSave) {
    Write-Step "리포트 저장 위치: $resolvedOutputDir"
    $reportFiles = Get-ChildItem -Path $resolvedOutputDir -Filter "*_analysis_*.md" -ErrorAction SilentlyContinue
    if ($reportFiles) {
        Write-Host ""
        Write-Host "  저장된 리포트 파일:" -ForegroundColor Cyan
        foreach ($f in $reportFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 10) {
            Write-Host "    - $($f.Name)  ($($f.LastWriteTime.ToString('yyyy-MM-dd HH:mm')))" -ForegroundColor Gray
        }
    }
}

Write-Host ""
