/**
 * API 비용 리포트 — Anthropic·OpenAI 최근 30일 일별 비용을 터미널에 찍는다.
 *
 *   pnpm usage
 *
 * ## 준비 (일반 API 키로는 안 된다)
 *
 * - Anthropic: console.anthropic.com → Settings → Admin keys 에서 발급
 *   (`sk-ant-admin-…`) → `.env.local`에 `ANTHROPIC_ADMIN_KEY=` 로 직접 붙여넣기.
 * - OpenAI: platform.openai.com → 조직 Settings → Admin keys 에서 발급하되
 *   **권한을 Usage 읽기 전용으로 제한**해서 만든다 → `OPENAI_ADMIN_KEY=`.
 *
 * ★ admin 키는 조직 관리 권한이 딸려 있다. 이 스크립트 밖에서는 쓰지 말고,
 *   채팅·커밋에 절대 넣지 않는다. 키가 없는 제공사는 건너뛴다.
 *
 * ## Gemini가 없는 이유
 *
 * Gemini API에는 admin 키·비용 조회 엔드포인트가 없다. 비용은 GCP 결제
 * 계정에 BigQuery export를 걸어야 보이고(설정 무겁고 하루 지연), AI Studio
 * 무료 티어는 조회 수단 자체가 없다. Gemini 지출은 우리 CLI가 실행마다 찍는
 * 원가(`수집 X원 · 판정 Y원 …`)와 AI Studio 대시보드로 본다.
 *
 * ## 잔액이 아니라 비용인 이유
 *
 * OpenAI는 선불 크레딧 잔액을 API로 주지 않는다(대시보드 전용). 그래서 이
 * 스크립트는 "얼마 남았나"가 아니라 "얼마 썼나"를 보여준다 — 잔액은
 * 각 대시보드에서 확인.
 */

const DAYS = 30
const USD_KRW = Number(process.env.USD_KRW ?? 1400) // 환율 근사. 정확한 청구는 대시보드.

const now = new Date()
const start = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000)

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)} (약 ${Math.round(n * USD_KRW).toLocaleString('ko-KR')}원)`
}

interface DailyCost {
  date: string
  usd: number
}

function printTable(name: string, days: DailyCost[]): void {
  const total = days.reduce((s, d) => s + d.usd, 0)
  console.log(`\n■ ${name} — 최근 ${DAYS}일 합계 ${fmtUsd(total)}`)
  const nonzero = days.filter((d) => d.usd > 0)
  if (nonzero.length === 0) {
    console.log('  (기간 내 비용 없음)')
    return
  }
  for (const d of nonzero) console.log(`  ${d.date}  ${fmtUsd(d.usd)}`)
}

/** 응답이 예상 모양이 아니면 조용히 0을 내지 말고 원문을 보여준다. */
function unexpected(name: string, body: unknown): never {
  console.error(`\n${name}: 응답 형태가 예상과 다릅니다 — 원문:`)
  console.error(JSON.stringify(body, null, 2).slice(0, 2000))
  process.exit(1)
}

// ─────────────────────────────────────────────────────────────
// Anthropic — GET /v1/organizations/cost_report (admin 키)
// ─────────────────────────────────────────────────────────────

async function anthropicCosts(key: string): Promise<DailyCost[]> {
  const days: DailyCost[] = []
  let page: string | null = null
  do {
    const url = new URL('https://api.anthropic.com/v1/organizations/cost_report')
    url.searchParams.set('starting_at', start.toISOString())
    url.searchParams.set('ending_at', now.toISOString())
    url.searchParams.set('bucket_width', '1d')
    url.searchParams.set('limit', '31')
    if (page) url.searchParams.set('page', page)

    const res = await fetch(url, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    })
    const body: unknown = await res.json()
    if (!res.ok) {
      console.error(`\nAnthropic: HTTP ${res.status} — admin 키(sk-ant-admin-…)인지 확인.`)
      console.error(JSON.stringify(body).slice(0, 500))
      process.exit(1)
    }
    const b = body as {
      data?: { starting_at?: string; results?: { amount?: string | number; currency?: string }[] }[]
      has_more?: boolean
      next_page?: string | null
    }
    if (!Array.isArray(b.data)) unexpected('Anthropic', body)
    for (const bucket of b.data) {
      // ★ amount는 달러가 아니라 **센트**다(최저 화폐 단위). 나누지 않으면
      //   $3.44가 $344로 보인다 — 2026-07-31 실제로 그렇게 보였다.
      const cents = (bucket.results ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
      days.push({ date: (bucket.starting_at ?? '').slice(0, 10), usd: cents / 100 })
    }
    page = b.has_more ? (b.next_page ?? null) : null
  } while (page)
  return days
}

// ─────────────────────────────────────────────────────────────
// OpenAI — GET /v1/organization/costs (admin 키)
// ─────────────────────────────────────────────────────────────

async function openaiCosts(key: string): Promise<DailyCost[]> {
  const days: DailyCost[] = []
  let page: string | null = null
  do {
    const url = new URL('https://api.openai.com/v1/organization/costs')
    url.searchParams.set('start_time', String(Math.floor(start.getTime() / 1000)))
    url.searchParams.set('limit', '31')
    if (page) url.searchParams.set('page', page)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
    const body: unknown = await res.json()
    if (!res.ok) {
      console.error(`\nOpenAI: HTTP ${res.status} — admin 키(Usage 읽기 권한)인지 확인.`)
      console.error(JSON.stringify(body).slice(0, 500))
      process.exit(1)
    }
    const b = body as {
      data?: { start_time?: number; results?: { amount?: { value?: number } }[] }[]
      has_more?: boolean
      next_page?: string | null
    }
    if (!Array.isArray(b.data)) unexpected('OpenAI', body)
    for (const bucket of b.data) {
      // ★ value가 문자열로 올 수 있다. Number 없이 더하면 문자열 이어붙기가
      //   되어 toFixed에서 죽는다 — 2026-07-31 실제로 그랬다. (여긴 달러 단위.)
      const usd = (bucket.results ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0)
      const date = bucket.start_time
        ? new Date(bucket.start_time * 1000).toISOString().slice(0, 10)
        : ''
      days.push({ date, usd })
    }
    page = b.has_more ? (b.next_page ?? null) : null
  } while (page)
  return days
}

// ─────────────────────────────────────────────────────────────

const anthropicKey = process.env.ANTHROPIC_ADMIN_KEY
const openaiKey = process.env.OPENAI_ADMIN_KEY

if (!anthropicKey && !openaiKey) {
  console.error(
    '.env.local에 ANTHROPIC_ADMIN_KEY 또는 OPENAI_ADMIN_KEY가 없습니다.\n' +
      '발급 방법은 이 파일 상단 주석 참고. 키는 파일에 직접 붙여넣으세요.',
  )
  process.exit(1)
}

if (anthropicKey) printTable('Anthropic', await anthropicCosts(anthropicKey))
else console.log('\n■ Anthropic — ANTHROPIC_ADMIN_KEY 없음, 건너뜀')

if (openaiKey) printTable('OpenAI', await openaiCosts(openaiKey))
else console.log('\n■ OpenAI — OPENAI_ADMIN_KEY 없음, 건너뜀')

console.log('\n■ Gemini — API로 조회 불가 (파일 상단 주석 참고). AI Studio 대시보드에서 확인.')
console.log('■ 잔액(선불 크레딧)은 두 제공사 모두 대시보드에서만 보입니다.')
