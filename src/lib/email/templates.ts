// 발송 메일의 제목·본문을 만드는 순수 모듈. 여기서는 네트워크를 타지 않는다.
// 발송은 './send'가 담당한다.
//
// ★ `./send`를 import하지 않는다. 그러면 Resend SDK와 server-only인
//   `@/lib/env`가 이 모듈에 딸려 들어와 순수성이 깨진다. 마스킹 함수는
//   그래서 './mask'에 따로 있다.
import type { AuditResult } from '@/lib/audit/result'
import { AUDIT_TIERS, type AuditTier } from '@/lib/audit/tiers'
import { engineLabel } from '@/lib/plans'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'
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
<p style="margin:0 0 8px;color:#8a8580;font-size:13px"><strong>이 메일은 회원가입 인증이 아닙니다.</strong> 계정은 만들어지지 않았고, 리포트를 보는 데 로그인도 필요 없습니다. 권한 없이 남의 주소로 신청하는 것을 막기 위한 본인 확인입니다.</p>
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

/**
 * 정기 측정 실패 — 운영자 알림 (스펙 ⑤).
 * attempt=1이면 다음 호출이 자동 재시도하고, 2면 이번 회차를 건너뛴다.
 */
export function measureFailureNotice(params: {
  brandName: string
  brandId: string
  reason: string
  attempt: number
}): EmailContent {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#8a8580;white-space:nowrap">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
  const nextStep =
    params.attempt === 1
      ? '15분 뒤 호출에서 1회 자동 재시도합니다. 재실패하면 다시 알려드립니다.'
      : '이번 회차는 건너뜁니다 — 공백 1회가 잘못된 데이터보다 낫습니다. 다음 스케줄(월·수·금 새벽)에 정상 측정합니다.'
  return {
    subject: `[Cited 운영] 정기 측정 실패 — ${params.brandName} (${params.attempt}번째 시도)`,
    html: layout(
      `<h1 style="margin:0 0 16px;font-size:20px;letter-spacing:-0.02em">정기 측정이 실패했습니다</h1>
<table style="border-collapse:collapse;margin:0 0 20px;font-size:14px">
${row('브랜드', params.brandName)}
${row('브랜드 id', params.brandId)}
${row('시도', `${params.attempt} / 2`)}
${row('사유', params.reason.slice(0, 500))}
</table>
<p style="margin:0;color:#8a8580;font-size:13px">${nextStep}</p>`,
    ),
  }
}

/**
 * 진단 리포트 메일. `tier`를 생략하면 무료 진단으로 취급한다.
 *
 * ★ 리포트의 실질을 **메일 본문에 담는다.** 링크만 보내면 대부분은 안 누른다.
 *   특히 인용 출처는 0% 고객이 유일하게 집행할 수 있는 정보이므로 본문에 넣는다.
 *
 * ★ 신뢰구간을 숨기지 않는다. "33%"만 쓰면 거짓말이다 — 3회 측정 1건의 구간은
 *   [2%, 87%]다. 이 넓이가 곧 유료 전환의 근거이고, 숨기면 첫 유료 리포트에서
 *   숫자가 달라졌을 때 답할 수가 없다.
 */
export function auditReportEmail(params: {
  result: AuditResult
  url: string
  /** 생략하면 무료. 유료 메일에는 유료 판매 문구를 넣지 않는다 — 이미 산 사람이다. */
  tier?: AuditTier
}): EmailContent {
  const { result, url, tier = 'free' } = params
  const brand = escapeHtml(result.brandName)
  const rate = formatPercent(result.citedRate.point)

  const evidence = result.evidence
    .map(
      (e) => `<div style="margin:0 0 14px;padding:14px;border:1px solid #e8e6e1;border-radius:8px">
  <div style="margin:0 0 6px;font-size:13px;color:#8a8580">
    질문: ${escapeHtml(e.query)} · ${escapeHtml(engineLabel(e.engineId))}
    ${e.mentioned ? '<span style="color:#1f7a4d">· 언급됨</span>' : '<span style="color:#8a8580">· 언급 없음</span>'}
  </div>
  <div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(e.text)}</div>
</div>`,
    )
    .join('')

  const ranking = result.ranking
    .map(
      (r) => `<tr>
  <td style="padding:6px 12px 6px 0">${r.isSelf ? `<strong>${escapeHtml(r.name)}</strong>` : escapeHtml(r.name)}</td>
  <td style="padding:6px 0;color:#8a8580">${r.mentions}회 / ${result.totalAnswers}개 답변</td>
</tr>`,
    )
    .join('')

  // ★ 경쟁사가 없으면 Share of Voice를 통째로 뺀다. n=0은 "측정 없음"이고,
  //   0%로 보이면 거짓 정보가 된다. 경쟁사 목록을 함께 쓰는 것도 필수다 —
  //   경쟁사를 적게 등록할수록 이 숫자가 높아지므로, 숫자만 두면 성과로 읽힌다.
  const sov =
    result.shareOfVoice.n > 0
      ? `<p style="margin:0 0 20px"><strong>Share of Voice ${formatPercent(result.shareOfVoice.point)}</strong> — 등록한 경쟁사(${escapeHtml(result.competitors.join(', '))}) 대비 언급 점유율입니다. 경쟁사를 더 등록하면 이 값은 달라집니다.</p>`
      : ''

  const unresolved =
    result.unresolved > 0
      ? `<p style="margin:0 0 16px;color:#a0651a">${result.unresolved}건은 판정하지 못해 결과에서 제외했습니다.</p>`
      : ''

  const sourceRows = result.sources
    .slice(0, 8)
    .map((s) => {
      const badge =
        s.owner === 'self'
          ? ' <span style="color:#1f7a4d">[우리]</span>'
          : s.owner === 'competitor'
            ? ' <span style="color:#a0651a">[경쟁사]</span>'
            : ''
      return `<tr>
  <td style="padding:6px 12px 6px 0">${escapeHtml(s.domain)}${badge}</td>
  <td style="padding:6px 0;color:#8a8580">${s.answers}개 답변 (${formatPercent(s.share.point)})</td>
</tr>`
    })
    .join('')

  // ★ `hasSelfDomains`가 false면 `selfAnswers === 0`은 "모른다"는 뜻이다.
  //   그것을 "한 번도 인용되지 않았습니다"로 쓰면 근거 없는 단정이 된다.
  //   침묵하지도 않는다 — 왜 그 줄이 없는지 고객이 알 수 없으므로 요청으로 바꾼다.
  const selfLine = !result.hasSelfDomains
    ? `<p style="margin:0 0 14px;color:#8a8580;font-size:14px">사이트 주소를 알려주시면 다음 측정에서 <strong>${brand} 사이트가 인용되는지</strong> 함께 확인해 드립니다.</p>`
    : result.sourceSummary.selfAnswers > 0
      ? `<p style="margin:0 0 14px;color:#1f7a4d;font-size:14px">${brand} 사이트는 ${result.sourceSummary.selfAnswers}개 답변에서 인용됐습니다.</p>`
      : `<p style="margin:0 0 14px;color:#a0651a;font-size:14px"><strong>${brand} 사이트는 한 번도 인용되지 않았습니다.</strong> AI는 아래 사이트들을 읽고 답을 만들고 있습니다.</p>`

  // ★ 0% 고객에게 유일하게 집행 가능한 정보다. 인용이 하나도 없으면 절을 뺀다 —
  //   빈 표를 보여주면 측정이 실패한 것처럼 보인다.
  const sources =
    result.sources.length > 0
      ? `<h2 style="margin:0 0 12px;font-size:17px">AI가 읽는 출처</h2>
<p style="margin:0 0 12px;color:#8a8580;font-size:14px">답변 ${result.sourceSummary.totalAnswers}개 중 ${result.sourceSummary.answersWithCitations}개에 인용이 있었고, 도메인 ${result.sourceSummary.distinctDomains}개가 나왔습니다.</p>
${selfLine}
<table style="border-collapse:collapse;margin:0 0 28px;font-size:14px">${sourceRows}</table>`
      : ''

  // ★ 무료 메일의 이 문단은 유료 전환의 근거이고, 유료 메일에서는 같은 자리가
  //   "왜 이 숫자를 믿어도 되는가"의 근거다. 유료 고객에게 유료 플랜을 팔지 않는다.
  const methodology =
    tier === 'free'
      ? `<p style="margin:0 0 24px;padding:14px;border-left:3px solid #e8e6e1;color:#5a5652;font-size:14px">무료 진단은 <strong>질의 3개를 1회</strong> 측정합니다. 그래서 신뢰구간이 ${formatInterval(result.citedRate)}로 넓습니다 — 이 범위 안 어디든 될 수 있다는 뜻입니다. 유료 플랜은 <strong>주 3회</strong> 측정해 이 구간을 좁히고 주간 변화를 판정합니다. 1회 측정으로는 변화를 알 수 없습니다.</p>`
      : // 반복 횟수는 티어 설정에서 읽는다 — 하드코딩하면 설정을 바꿨을 때
        // 메일이 실제와 다른 횟수를 말하게 된다.
        `<p style="margin:0 0 24px;padding:14px;border-left:3px solid #e8e6e1;color:#5a5652;font-size:14px">이 리포트는 질의 ${result.byQuery.length}개를 각 <strong>${AUDIT_TIERS[tier].samplesPerEngine}회 반복</strong> 측정해 답변 ${result.totalAnswers}개로 만들었습니다. 신뢰구간 ${formatInterval(result.citedRate)}는 반복 측정으로 좁힌 값입니다 — AI 답변은 물을 때마다 바뀌므로, 한 번 물어서 나온 숫자는 믿을 수 없습니다.</p>`

  return {
    // 제목은 평문 헤더다 — 이스케이프하지 않는다 (auditVerificationEmail 참고).
    subject: `[Cited] ${result.brandName} AI 언급률 ${rate} — 진단 리포트`,
    html: layout(
      `<h1 style="margin:0 0 8px;font-size:22px;letter-spacing:-0.02em">${brand} 진단 리포트</h1>
<p style="margin:0 0 24px;color:#8a8580;font-size:14px">${escapeHtml(result.category)} 카테고리 · ${escapeHtml(result.engines.map(engineLabel).join(', '))} · ${escapeHtml(result.measuredAt.slice(0, 10))} 측정</p>

<div style="margin:0 0 20px;padding:20px;background:#faf9f7;border-radius:10px">
  <div style="font-size:34px;font-weight:700;line-height:1.1;letter-spacing:-0.03em">${rate}</div>
  <div style="margin-top:6px;color:#8a8580">답변 ${result.totalAnswers}개 중 ${result.citedRate.k}개에서 언급 · 신뢰구간 ${formatInterval(result.citedRate)}</div>
</div>

${methodology}

${sov}
${unresolved}

<h2 style="margin:0 0 12px;font-size:17px">브랜드별 언급 횟수</h2>
<table style="border-collapse:collapse;margin:0 0 28px;font-size:14px">${ranking}</table>

<h2 style="margin:0 0 12px;font-size:17px">실제 AI 답변</h2>
<p style="margin:0 0 14px;color:#8a8580;font-size:14px">같은 질문을 직접 물어보시면 비슷한 답을 확인하실 수 있습니다.</p>
${evidence}

${sources}

<p style="margin:20px 0 0;color:#8a8580;font-size:12px">측정 표기: ${escapeHtml([result.brandName, ...result.aliases].join(', '))} · 빠진 표기가 있으면 알려주세요. 표기가 빠지면 언급률이 실제보다 낮게 나옵니다.</p>

<p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">전체 리포트 보기</a></p>`,
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
