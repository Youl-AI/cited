import Link from 'next/link'
import { BUSINESS_INFO as B } from '@/lib/business-info'

/**
 * 저작권 표시 연도.
 *
 * `new Date().getFullYear()`를 쓰면 안 된다 — 이 바닥글은 정적으로 프리렌더되므로
 * 빌드 시각의 연도가 HTML에 그대로 굳는다. 배포가 없는 채로 해가 바뀌면 사이트가
 * 지난해를 계속 보여준다. 저작권 표시는 "이 저작물이 처음 공개된 해"로 충분하다
 * (범위 표기가 필요해지면 `2026–{올해}`로 바꾸되, 그때도 서버 시각이 아니라
 * 명시적인 상수로 둔다).
 */
const COPYRIGHT_YEAR = 2026

/**
 * 전자상거래법상 통신판매업자 표시 의무 항목. `BUSINESS_INFO`에서 아직 채워지지
 * 않은(빈 문자열) 항목은 렌더링하지 않는다 — 사업자 등록 전에는 "문의"만 보이고,
 * 등록이 끝나면 나머지가 자동으로 나타난다.
 */
const BUSINESS_ROWS: [string, string][] = (
  [
    ['상호', B.companyName],
    ['대표', B.representative],
    ['사업자등록번호', B.businessNumber],
    ['통신판매업 신고', B.mailOrderNumber],
    ['주소', B.address],
    ['전화', B.phone],
    ['개인정보 보호책임자', B.privacyOfficer],
    ['문의', B.email],
  ] as [string, string][]
).filter(([, value]) => value !== '')

/**
 * 공개 영역의 바닥글. 서버 컴포넌트라 클라이언트 번들에 실리지 않는다.
 *
 * 개인정보처리방침 링크만 `font-medium`인 것은 표시 의무 관행이다 — 다른
 * 링크보다 눈에 띄어야 "어디서 개인정보 처리 내용을 확인할 수 있는지"가
 * 분명해진다.
 *
 * `/pricing`은 아직 라우트가 없어 링크를 넣지 않는다(요금은 랜딩 페이지에서
 * 확인할 수 있다) — 나중에 요금제 페이지가 생기면 여기 추가한다.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Link
              href="/"
              className="group inline-flex items-baseline gap-px rounded-sm text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Cited
              <span
                aria-hidden="true"
                className="font-mono text-[0.6em] leading-none text-muted-foreground transition-colors group-hover:text-primary"
              >
                [1]
              </span>
            </Link>
            <p className="max-w-md text-sm text-muted-foreground">
              ChatGPT · Gemini · 네이버 AI 브리핑 · Google AI Overviews에서 브랜드 언급을 매주
              자동 추적하는 한국어 GEO 모니터링 도구.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link
              href="/legal/terms"
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              이용약관
            </Link>
            <Link
              href="/legal/privacy"
              className="font-medium text-foreground underline underline-offset-4"
            >
              개인정보처리방침
            </Link>
          </nav>
        </div>

        {BUSINESS_ROWS.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 border-t border-border pt-6 text-xs text-muted-foreground sm:grid-cols-2">
            {BUSINESS_ROWS.map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="shrink-0">{label}</dt>
                <dd className="text-foreground/70">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <p className="font-mono text-xs tracking-wide text-muted-foreground">
          © {COPYRIGHT_YEAR} {B.serviceName}
        </p>
      </div>
    </footer>
  )
}
