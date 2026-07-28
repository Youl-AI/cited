// 발송 메일의 제목·본문을 만드는 순수 모듈. 여기서는 네트워크를 타지 않는다.
// 발송은 './send'가 담당한다.

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
