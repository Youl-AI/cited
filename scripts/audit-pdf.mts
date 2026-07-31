/**
 * 리포트를 PDF로 뽑는다 — 크몽 납품용.
 *
 *   pnpm audit:pdf aud_xxx                          로컬 dev 서버에서
 *   pnpm audit:pdf aud_xxx --base-url https://cited.co.kr   프로덕션에서
 *
 * ★ 발송된(sent) 리포트만 뽑는다. 페이지 자체가 sent 아니면 404다.
 * ★ 서버가 떠 있어야 한다. 로컬이면 pnpm dev 먼저.
 */
import { chromium } from '@playwright/test'
import { parseBaseUrlFlag, reportUrl } from '@/lib/audit/report-url'
import { getAudit } from '@/lib/audit/repository'

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
const out = `cited-${audit.brandName}-${new Date().toISOString().slice(0, 10)}.pdf`

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
    margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
  })
} finally {
  await browser.close()
}
console.log(`PDF 생성: ${out}`)
console.log('크몽 메시지에 파일을 첨부하고 웹 링크도 함께 보내세요:')
console.log(`  ${url}`)
