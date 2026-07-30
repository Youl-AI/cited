// 발송 메일의 제목·본문을 만드는 순수 모듈. 여기서는 네트워크를 타지 않는다.
// 발송은 './send'가 담당한다.
//
// ★ `./send`를 import하지 않는다. 그러면 Resend SDK와 server-only인
//   `@/lib/env`가 이 모듈에 딸려 들어와 순수성이 깨진다. 마스킹 함수는
//   그래서 './mask'에 따로 있다.
import { maskEmail } from './mask'

export interface EmailContent {
  subject: string
  html: string
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function layout(bodyHtml: string): string {
  return `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Segoe UI',sans-serif;color:#1a1a1a;line-height:1.6">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e6e1;border-radius:12px;padding:32px">
<div style="font-weight:700;font-size:18px;letter-spacing:-0.02em;margin-bottom:24px">Cited</div>
${bodyHtml}
<hr style="border:none;border-top:1px solid #e8e6e1;margin:32px 0 16px">
<p style="font-size:12px;color:#8a8580;margin:0">이 메일은 Cited 서비스 이용에 따라 발송되었습니다.</p>
</div></body></html>`
}

export function verificationEmail(params: { url: string }): EmailContent {
  const url = escapeHtml(params.url)
  return {
    subject: '[Cited] 이메일 주소를 확인해 주세요',
    html: layout(
      `<p>아래 버튼을 눌러 이메일 주소를 확인해 주세요. 링크는 24시간 후 만료됩니다.</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">이메일 확인하기</a></p>
<p style="font-size:13px;color:#8a8580">버튼이 동작하지 않으면 이 주소를 복사해 브라우저에 붙여넣으세요:<br>${url}</p>`,
    ),
  }
}

/**
 * 무료 진단 신청자에게 보내는 인증 메일.
 *
 * ★ 이 메일의 링크를 누르기 전에는 어떤 외부 API도 호출되지 않는다. 그것이
 *   이 단계의 유일한 비용 방어다 — 본문의 "확인하지 않으면 아무것도 실행되지
 *   않습니다"는 마케팅 문구가 아니라 실제 동작이다.
 */
export function auditVerificationEmail(params: { url: string; brandName: string }): EmailContent {
  const url = escapeHtml(params.url)
  const brand = escapeHtml(params.brandName)
  return {
    // 제목은 텍스트로 렌더되므로 이스케이프하지 않은 원문을 쓴다 —
    // 이스케이프하면 `&`가 든 브랜드명이 `&amp;`로 보인다.
    subject: `[Cited] ${params.brandName} 진단 신청을 확인해 주세요`,
    html: layout(
      `<h1 style="margin:0 0 16px;font-size:20px;letter-spacing:-0.02em">진단 신청이 접수됐습니다</h1>
<p style="margin:0 0 16px"><strong>${brand}</strong>이(가) AI 답변에 얼마나 등장하는지 측정합니다. 아래 버튼을 눌러 이메일을 확인해 주세요.</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">이메일 확인하기</a></p>
<p style="margin:0 0 8px;color:#8a8580;font-size:13px">버튼이 동작하지 않으면 이 주소를 복사해 브라우저에 붙여넣으세요:<br>${url}</p>
<p style="margin:16px 0 8px">확인이 끝나면 <strong>영업일 1일 이내</strong>에 진단 리포트를 이 주소로 보내드립니다. 측정은 실제 AI 서비스에 직접 질문해 수행하므로 시간이 걸립니다.</p>
<p style="margin:0;color:#8a8580;font-size:13px">본인이 신청하지 않았다면 이 메일을 무시하셔도 됩니다. 확인하지 않으면 아무것도 실행되지 않습니다.</p>`,
    ),
  }
}

/**
 * 인증이 끝난 신청을 운영자에게 알린다.
 *
 * ★ **이 메일이 유일한 실행 트리거다.** 무료 진단은 자동으로 돌지 않고 운영자가
 *   `pnpm audit:run <id>`를 실행한다. 이 메일이 안 오면 신청은 인증된 상태로
 *   방치되고 "영업일 1일 이내"라는 약속이 조용히 깨진다.
 *
 * ★ 신청자 이메일을 마스킹한다. 운영자 메일함도 유출 경로이고, 실행에 필요한
 *   것은 id지 주소가 아니다.
 */
export function auditRequestedNotice(params: {
  audit: {
    id: string
    brandName: string
    category: string
    competitors: string[]
    email: string
    /** 없으면 인용 출처의 소유 판정을 하지 않는다 — 운영자가 미리 알아야 한다 */
    selfDomains?: string[]
  }
}): EmailContent {
  const { audit } = params
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#8a8580;white-space:nowrap">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`

  return {
    subject: `[Cited 운영] 진단 대기 — ${audit.brandName}`,
    html: layout(
      `<h1 style="margin:0 0 16px;font-size:20px;letter-spacing:-0.02em">진단 신청이 인증됐습니다</h1>
<table style="border-collapse:collapse;margin:0 0 20px;font-size:14px">
${row('브랜드', audit.brandName)}
${row('카테고리', audit.category)}
${row('경쟁사', audit.competitors.length > 0 ? audit.competitors.join(', ') : '없음')}
${row('사이트', audit.selfDomains?.length ? audit.selfDomains.join(', ') : '없음 (출처 소유 판정 생략)')}
${row('신청자', maskEmail(audit.email))}
</table>
<p style="margin:0 0 8px">실행 명령:</p>
<pre style="margin:0 0 16px;padding:12px;background:#faf9f7;border:1px solid #e8e6e1;border-radius:6px;font-size:13px;overflow-x:auto">pnpm audit:run ${escapeHtml(audit.id)}</pre>
<p style="margin:0;color:#8a8580;font-size:13px">영업일 1일 이내 발송을 약속했습니다.</p>`,
    ),
  }
}

export function weeklyReportEmail(params: {
  brandName: string
  citedRate: number
  dashboardUrl: string
  changed: boolean
  direction?: 'up' | 'down'
}): EmailContent {
  const name = escapeHtml(params.brandName)
  const url = escapeHtml(params.dashboardUrl)
  const pct = Math.round(params.citedRate * 100)
  // 설계 ③: 신뢰구간이 겹치면 화살표를 쓰지 않는다.
  const badge = params.changed
    ? `<span style="color:${params.direction === 'up' ? '#1f7a4d' : '#b3261e'}">${params.direction === 'up' ? '▲' : '▼'} 지난주 대비 변화</span>`
    : `<span style="color:#8a8580">— 변화 없음 (측정 범위 내)</span>`

  return {
    subject: `[Cited] ${params.brandName} 이번 주 측정이 완료되었습니다`,
    html: layout(
      `<p>${name}의 이번 주 측정이 완료되었습니다.</p>
<div style="margin:24px 0;padding:20px;background:#faf9f7;border-radius:8px">
  <div style="font-size:13px;color:#8a8580;margin-bottom:4px">Cited Rate</div>
  <div style="font-size:32px;font-weight:700;letter-spacing:-0.03em">${pct}%</div>
  <div style="font-size:13px;margin-top:6px">${badge}</div>
</div>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">대시보드에서 보기</a></p>`,
    ),
  }
}
