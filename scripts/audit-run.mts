/**
 * 진단 1건을 실행하고 리포트를 메일로 보낸다.
 *
 *   pnpm audit:run aud_xxx --base-url https://cited.co.kr   측정 + 발송 한 번에
 *   pnpm audit:run aud_xxx --dry                            측정 + 저장 (발송 없음)
 *
 * ★ --dry를 먼저 써라. 초기에는 리포트를 눈으로 보고 나서 보내야 한다.
 *   자동 공개로 넘어가는 기준이 "손으로 고칠 게 없어진 시점"이다.
 *
 * ★ --dry도 **돈이 든다.** 수집과 판정을 실제로 부른다. 발송만 건너뛴다 —
 *   결과는 저장하므로, 확인이 끝나면 `audit:publish`가 재측정 없이 그대로
 *   보낸다 (0원). --dry 확인 후 --base-url로 재실행하면 측정을 **두 번** 사고
 *   (건당 ≈2,400원 × 2), 고객은 운영자가 확인한 것과 **다른** 측정을 받는다
 *   (2026-07-31 리허설 발견 #1). --base-url 직행은 재측정이 필요할 때만.
 *
 * ★ **발송에는 `--base-url`이 필요하다.** 이 스크립트는 `.env.local`을 읽으므로
 *   `NEXT_PUBLIC_APP_URL`이 개발용 `http://localhost:3000`이다. 2026-07-30 첫
 *   실사용에서 리포트 메일이 실제로 그 링크를 달고 나갔다 — 고객은 못 연다.
 *   같은 변수가 웹 라우트(Vercel 환경변수)에서는 옳고 여기서는 틀리다는 것이
 *   함정이었다. 이제 로컬 주소로 발송하려 하면 **돈을 쓰기 전에** 멈춘다.
 */
import { createAliasGenerator } from '@/lib/audit/aliases'
import { createCostMeter } from '@/lib/audit/cost'
import { executeAudit } from '@/lib/audit/execute'
import { parseBaseUrlFlag, reportUrl, resolveReportBaseUrl } from '@/lib/audit/report-url'
import { getAudit, markFailed, markRunning, markSent, saveResult } from '@/lib/audit/repository'
import { AUDIT_TIERS } from '@/lib/audit/tiers'
import { sendEmail } from '@/lib/email/send'
import { auditReportEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { createClaudeJudge } from '@/lib/judge/claude'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

const [auditId, ...flags] = process.argv.slice(2)
const dry = flags.includes('--dry')

if (!auditId) {
  console.error('사용법: pnpm audit:run <auditId> [--dry] [--base-url https://cited.co.kr]')
  process.exit(1)
}

// ★ **수집을 시작하기 전에** 링크를 검증한다. 뒤에서 하면 235원을 다 쓴 뒤에
//   거부하게 되고, 그러면 운영자는 링크 때문에 돈을 두 번 쓴다.
const resolved = resolveReportBaseUrl(
  parseBaseUrlFlag(flags) ?? env.NEXT_PUBLIC_APP_URL,
  dry ? 'dry' : 'send',
)
if (!resolved.ok) {
  console.error(`실행하지 않았습니다 — ${resolved.reason}`)
  process.exit(1)
}

const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}
if (!audit.emailVerified) {
  // ★ 인증 전에는 절대 실행하지 않는다. 이 게이트가 유일한 방어선이다 —
  //   인증 없이 실행하면 남의 이메일로 신청한 건에 우리 돈을 쓴다.
  console.error(`이메일이 인증되지 않았습니다 (status=${audit.status}). 실행하지 않습니다.`)
  process.exit(1)
}
if (audit.status === 'sent' && !dry) {
  console.error(
    `이미 발송된 진단입니다 (${audit.sentAt?.toISOString() ?? '시각 불명'}).` +
      ' 다시 보내려면 --dry로 확인 후 수동 처리하세요.',
  )
  process.exit(1)
}

console.log(
  `실행: ${audit.brandName} (${audit.category}) · ${AUDIT_TIERS[audit.tier].label}${dry ? ' [dry]' : ''}`,
)
console.log(`경쟁사: ${audit.competitors.join(', ') || '없음'}`)
console.log(`우리 도메인: ${audit.selfDomains.join(', ') || '없음 (소유 판정 생략)'}`)

if (!dry) await markRunning(audit.id)

const started = Date.now()
const judgeErrors: string[] = []

// ★ 원가는 **세 군데**에서 나온다 — 수집(엔진 답변), 판정, 별칭 생성.
//   2026-07-30까지 수집만 세고 있었고, 그래서 실제보다 낮은 원가가 남았다.
//   판정기와 별칭 생성기를 여기서 직접 만드는 이유가 그것이다. 기본 인스턴스
//   (`claudeJudge`·`generateAliases`)는 onUsage가 비어 있어 사용량이 버려진다.
const meter = createCostMeter()
const judge = createClaudeJudge({ onUsage: meter.judge })
const aliasFn = createAliasGenerator({
  onUsage: meter.alias,
  // 별칭 생성 실패는 던지지 않고 빈 별칭으로 이어진다. 아래에서 경고를 찍지만
  // 원인은 여기서만 보인다 — ChatGPT 0%의 진짜 이유가 이 줄에 있을 수 있다.
  onError: (error) => {
    console.warn(`  별칭 생성 실패 — ${error instanceof Error ? error.message : String(error)}`)
  },
})

let result
try {
  result = await executeAudit(
    {
      id: audit.id,
      brandName: audit.brandName,
      category: audit.category,
      competitors: audit.competitors,
      selfDomains: audit.selfDomains,
      tier: audit.tier,
      ...(audit.region ? { region: audit.region } : {}),
      ...(audit.queries ? { frozenQueries: audit.queries } : {}),
    },
    {
      judge,
      aliasFn,
      onProgress: (done, total) => process.stdout.write(`\r  수집 ${done}/${total}`),
      onStats: (s) => {
        meter.collection(s.costMilliKrw)
        console.log(
          `\n  수집 ${(s.costMilliKrw / 1000).toFixed(1)}원 · ` +
            `${(s.durationMs / 1000).toFixed(1)}초 · 답변 ${s.answers}/${s.attempted}`,
        )
      },
      // ★ 미판정 숫자만 남기면 원인을 모른다. rate limit이면 재실행하면 되고
      //   스키마 오류면 코드를 고쳐야 한다 — 그 판단에 필요하다.
      onJudgeError: (error, ids) => {
        const reason = error instanceof Error ? error.message : String(error)
        judgeErrors.push(`${ids.length}건: ${reason}`)
      },
    },
  )
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`\n실패: ${reason}`)
  // ★ 실패해도 이미 쓴 돈은 남는다. 여기서 안 찍으면 그 금액을 알 길이 없다.
  console.error(`쓴 원가: ${meter.format()}`)
  if (!dry) await markFailed(audit.id, reason)
  process.exit(1)
}

console.log(`\n총 소요 ${Math.round((Date.now() - started) / 1000)}초`)
console.log(`원가 ${meter.format()}`)
console.log(`언급률 ${formatPercent(result.citedRate.point)} (${formatInterval(result.citedRate)})`)
console.log(`답변 ${result.totalAnswers}개 · 미판정 ${result.unresolved}건`)
for (const line of judgeErrors) console.warn(`  판정 실패 — ${line}`)

// ★ 별칭을 반드시 출력한다. 빈 별칭으로 돌면 ChatGPT가 0%로 나오는데, 그것을
//   실제 결과로 착각해 발송하면 첫 리포트가 틀린 채로 나간다.
if (result.aliases.length > 0) {
  console.log(`별칭: ${result.aliases.join(', ')}`)
} else {
  console.warn('[경고] 별칭이 비어 있습니다. 별칭 생성이 실패했을 수 있습니다.')
  console.warn('  ChatGPT 언급률이 0%로 나오면 측정 결과가 아니라 이 문제입니다. 재실행하세요.')
}

// ★ 엔진별 언급률을 찍는다. "ChatGPT 0% / Gemini 양수"가 별칭 문제의 지문이다.
console.log('\n엔진별:')
for (const [engineId, ci] of Object.entries(result.byEngine)) {
  console.log(`  ${engineId.padEnd(10)} ${formatPercent(ci.point).padStart(5)} (${formatInterval(ci)})`)
}

console.log('\n순위:')
for (const r of result.ranking) {
  console.log(`  ${r.isSelf ? '>' : ' '} ${r.name.padEnd(16)} ${r.mentions}회`)
}

console.log('\n증거:')
for (const e of result.evidence) {
  console.log(`  [${e.mentioned ? '언급' : '미언급'}] ${e.query} · ${e.engineId}`)
  console.log(`    ${e.text.slice(0, 120)}…`)
}

console.log(
  `\nAI가 읽는 출처 — 답변 ${result.sourceSummary.totalAnswers}개 중` +
    ` ${result.sourceSummary.answersWithCitations}개에 인용 · 도메인 ${result.sourceSummary.distinctDomains}개`,
)
for (const s of result.sources.slice(0, 8)) {
  const tag = s.owner === 'self' ? ' [우리]' : s.owner === 'competitor' ? ' [경쟁사]' : ''
  console.log(
    `  ${String(s.answers).padStart(2)}개 ${formatPercent(s.share.point).padStart(6)} ${s.domain}${tag}`,
  )
}
// ★ 도메인을 모르는 것과 0회 인용은 다르다. 섞어서 말하지 않는다.
if (result.hasSelfDomains) {
  console.log(
    result.sourceSummary.selfAnswers > 0
      ? `  우리 사이트: ${result.sourceSummary.selfAnswers}개 답변에서 인용됨`
      : '  우리 사이트: 한 번도 인용되지 않음 <- 리포트의 핵심 문장',
  )
} else {
  console.log('  (우리 도메인 미지정 — 소유 판정 없음)')
}

if (dry) {
  // ★ dry 결과를 저장한다 — 확인이 끝나면 `audit:publish`가 이 측정을 그대로
  //   보낸다. 버리면 발송 때 재측정해야 해서 원가가 두 배(≈4,800원)가 되고,
  //   고객은 운영자가 확인한 것과 다른 측정을 받는다 (2026-07-31 리허설
  //   발견 #1). status·sentAt은 건드리지 않으므로 리포트 페이지는 여전히
  //   404다(페이지가 status === 'sent'를 요구) — 미검수 결과가 새지 않는다.
  if (audit.status === 'sent') {
    // 발송된 건의 dry는 참고 측정일 뿐이다. 저장하면 고객이 이미 받은
    // 리포트의 숫자가 바뀐다 — `saveResult`의 가드도 같은 이유로 거부한다.
    console.log('\n--dry 완료. 이미 발송된 건이라 결과를 저장하지 않았습니다.')
  } else {
    await saveResult(audit.id, result)
    console.log('\n--dry 완료. 측정 결과를 저장했습니다 (발송 안 함).')
    console.log('  이 측정을 재측정 없이 그대로 보내려면 (0원):')
    console.log(`    pnpm audit:publish ${audit.id} --base-url https://cited.co.kr`)
    console.log('  다시 측정하려면 --dry를 재실행하세요 — 마지막 측정이 저장됩니다.')
  }
  process.exit(0)
}

const url = reportUrl(resolved.baseUrl, audit.id)
// ★ 측정에 쓴 별칭을 함께 저장한다. 별칭이 언급률을 좌우하므로, 남기지 않으면
//   나중에 "이 숫자가 왜 이렇게 낮았나"에 답할 수 없다.
try {
  await markSent(audit.id, result, result.aliases)
} catch (error) {
  // 위 status 사전 검사로 정상 흐름에서는 오지 않는다 — 이 스크립트와
  // audit:publish가 경합한 경우다. 스택 대신 재발송 안내가 담긴 메시지만 남긴다.
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const sent = await sendEmail({
  to: audit.email,
  content: auditReportEmail({ result, url, tier: audit.tier }),
})
if (!sent.ok) {
  // 결과는 이미 저장됐다. 메일만 실패했으므로 링크를 직접 전달할 수 있다.
  console.error(`\n리포트는 저장했지만 메일 발송에 실패했습니다: ${sent.reason}`)
  console.error(`수동 전달용 링크: ${url}`)
  process.exit(1)
}

console.log(`\n발송 완료 -> ${url}`)
