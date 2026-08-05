/**
 * 리포트를 PDF로 뽑는다 — 크몽 납품용.
 *
 *   pnpm audit:pdf aud_xxx                          로컬 dev 서버에서
 *   pnpm audit:pdf aud_xxx --base-url https://cited.co.kr   프로덕션에서
 *
 * ★ 발송된(sent) 리포트만 뽑는다. 페이지 자체가 sent 아니면 404다.
 * ★ 서버가 떠 있어야 한다. 로컬이면 pnpm dev 먼저.
 *
 * ## 문서 푸터 (유료 전용)
 *
 * 유료 PDF에는 매 장 하단에 발행처 줄과 쪽번호를 찍는다. 납품 문서의
 * 관례다 — 계측기 데이터시트가 표지를 포함한 모든 장에 문서 관리 줄을
 * 두는 것과 같은 이유로, **표지에도 찍는다** (Chromium의 푸터 템플릿은
 * 장별로 켜고 끌 수 없기도 하다 — `@page :first{margin:0}`으로 여백을
 * 없애도 푸터는 페이지 끝에 겹쳐 그려지는 것을 실측으로 확인했다).
 *
 * ★ 푸터 템플릿은 페이지 CSS에 접근하지 못한다 — 서체·크기·색을 전부
 *   인라인으로 적어야 하고, 한글은 시스템 서체(맑은 고딕 등)로 렌더된다.
 *   본문의 IBM Plex를 쓸 수 없으므로 숫자만 Consolas 계열 mono로 지정해
 *   "mono는 계측값" 규칙의 인상을 유지한다.
 *
 * ★ 무료 PDF에는 푸터를 찍지 않는다 — 표지와 같은 원칙이다. 공짜 PDF에
 *   납품 문서의 옷을 입히지 않는다.
 */
import { chromium } from '@playwright/test'
import { parseBaseUrlFlag, reportUrl } from '@/lib/audit/report-url'
import { getAudit } from '@/lib/audit/repository'
import { isPaidTier } from '@/lib/audit/tiers'

const argv = process.argv.slice(2)
const auditId = argv.find((a) => !a.startsWith('--'))
if (!auditId) {
  console.error('사용법: pnpm audit:pdf <auditId> [--base-url https://cited.co.kr]')
  process.exit(1)
}
const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}
if (audit.status !== 'sent') {
  console.error(`발송된 진단만 PDF로 뽑습니다 (status=${audit.status}).`)
  process.exit(1)
}

const base = (parseBaseUrlFlag(argv) ?? 'http://localhost:3000').replace(/\/+$/, '')
const url = reportUrl(base, audit.id)

/**
 * 브랜드명은 사용자 입력이다 — 파일시스템 금지 문자(`/`·`:` 등)가 섞이면
 * `page.pdf`가 경로 오류로 죽는다. 지우지 않고 `-`로 바꾼다(이름 흔적 유지).
 */
function sanitizeForFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '-')
}

// ★ auditId 뒤 6자를 붙인다. 브랜드+날짜만으로는 같은 브랜드를 같은 날 두 번
//   뽑을 때(deluxe·premium 동시 납품 — 리허설에서 실제로 겪음) 앞 파일을
//   덮어쓴다. id 접미사가 건마다 다르므로 충돌이 구조적으로 없다.
const out = `cited-${sanitizeForFilename(audit.brandName)}-${new Date().toISOString().slice(0, 10)}-${audit.id.slice(-6)}.pdf`

/** 브랜드명은 사용자 입력이다 — 템플릿 HTML에 넣기 전에 이스케이프한다. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 매 장 하단의 문서 관리 줄.
 *
 * 좌측 12mm 패딩은 본문 좌측 여백(margin.left)과 같다 — 푸터가 본문
 * 텍스트 기둥과 같은 선에서 시작해야 문서의 일부로 읽힌다.
 * 색(#8a8f98)은 본문 --muted-foreground보다 한 단 옅다 — 푸터는 읽는
 * 대상이 아니라 참조용이다.
 */
const footerTemplate = `
<div style="box-sizing:border-box;width:100%;padding:0 12mm;font-family:'Malgun Gothic','Apple SD Gothic Neo','Segoe UI',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:0.5px solid #d4d7dc;padding-top:5px;">
    <span style="font-size:7px;letter-spacing:0.06em;color:#8a8f98;">CITED&ensp;&middot;&ensp;AI 언급 진단 리포트&ensp;&middot;&ensp;${escapeHtml(audit.brandName)}</span>
    <span style="font-family:Consolas,'Cascadia Mono',monospace;font-size:7px;color:#8a8f98;"><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
</div>`

const paid = isPaidTier(audit.tier)

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const res = await page.goto(url, { waitUntil: 'load' })
  if (!res || res.status() !== 200) {
    throw new Error(`리포트를 열지 못했습니다: ${url} (status=${res?.status() ?? '없음'})`)
  }
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: paid,
    // ★ displayHeaderFooter를 켜면 Chromium 기본 머리글(날짜·제목)이 찍힌다.
    //   머리글은 빈 템플릿으로 지운다 — 위쪽은 본문 여백만 남긴다.
    headerTemplate: '<span></span>',
    footerTemplate,
    // 아래 여백 18mm — 푸터 줄(약 5mm)이 본문과 겹치지 않을 실측 최소값에
    // 여유를 더한 값. 무료(푸터 없음)는 원래의 14mm를 유지한다.
    margin: { top: '14mm', bottom: paid ? '18mm' : '14mm', left: '12mm', right: '12mm' },
  })
} finally {
  await browser.close()
}
console.log(`PDF 생성: ${out}`)
// ★ 크몽 납품물은 PDF 하나뿐이다. 웹 리포트 링크를 크몽 고객에게 보내지
//   않는다 — 사이트의 요금제·구독 화면에 노출되면 직거래 유도 정책 위반
//   소지가 있다(계정 제재 리스크). 아래 URL은 운영자가 발송 전 눈으로
//   확인하는 용도다. 정책은 docs/kmong/context.md "납품 정책" 참고.
console.log('크몽 메시지에 이 PDF만 첨부하세요. 웹 링크는 보내지 않습니다.')
console.log(`  (운영자 확인용) ${url}`)
